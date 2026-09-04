"""Recoup CLI: generate | run | export | compare.

`run` drives the whole loop for a batch under one policy:
  Signal -> Diagnosis (agent policy only) -> Policy gate -> Executor -> Outcome -> Ledger
Baseline policy skips Diagnosis and always picks retry_same_cooldown.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

import typer

from recoup import outcome as outcome_mod
from recoup.diagnosis import diagnose
from recoup.executor import ExecutionError, execute
from recoup.ledger import Ledger
from recoup.llm import LLMClient
from recoup.policy import evaluate
from recoup.schemas import CheckoutEvent, Diagnosis
from recoup.signal import classify

app = typer.Typer(add_completion=False)
ROOT = Path(__file__).resolve().parent.parent


@app.command()
def generate(n: int = 100, out: str = "data/events.json"):
    from recoup.generator import main as gen
    gen(out=out, n=n)


def _load_events(path: str, limit: int | None) -> list[CheckoutEvent]:
    with open(path, encoding="utf-8") as f:
        events = [CheckoutEvent(**e) for e in json.load(f)]
    return events[:limit] if limit else events


@app.command()
def run(
    policy: str = typer.Option("agent", help="agent | baseline"),
    events_path: str = "data/events.json",
    limit: int = typer.Option(0, help="0 = full batch"),
    dry_run: bool = typer.Option(True, help="--no-dry-run makes real Razorpay calls"),
    force_fail_checkout: str = typer.Option("", help="checkout_id whose execution is forced to fail (the demo failure case)"),
    run_id: str = typer.Option("", help="defaults to <policy>-<date>"),
):
    assert policy in ("agent", "baseline")
    run_id = run_id or f"{policy}-{datetime.now():%Y%m%d}"
    run_dir = ROOT / "runs" / run_id
    ledger = Ledger(run_dir / "ledger.db", run_id)
    # Cache lives OUTSIDE the run dir and is committed to the repo. The key is
    # sha256(model|system|user|attempt) — run-independent by construction — so a
    # judge can replay every diagnosis in this repo offline, with no API key,
    # and get byte-identical numbers and inference cost.
    llm = LLMClient(ROOT / ".llm_cache")
    events = _load_events(events_path, limit or None)

    stats = dict(at_risk_paise=0, recovered_paise=0, recovered_count=0,
                 attempted=0, llm_fallbacks=0)
    exceptions: dict[str, list[str]] = {}

    def exc(reason: str, cid: str):
        exceptions.setdefault(reason, []).append(cid)

    for ev in events:
        cid = ev.checkout_id
        stats["at_risk_paise"] += ev.amount_paise
        now = datetime.fromisoformat(ev.failed_at) + timedelta(hours=1)

        ftype = classify(ev)
        ledger.log(cid, "signal", "classified",
                   {"failure_type": ftype, "event": ev.model_dump()})
        if ftype == "unclassified":
            ledger.log(cid, "policy_gate", "denied", {"reason": "unclassified"})
            exc("unclassified", cid)
            continue

        attempts, recovered, last_attempt = 0, False, None
        history: list[dict] = []  # what we already tried on this checkout
        max_loop = 2  # hard structural bound, matches policy.max_attempts
        for _ in range(max_loop):
            if policy == "agent":
                diag, fallback = diagnose(ev, ftype, attempts, llm,
                                          previous_attempts=history)
                if fallback:
                    stats["llm_fallbacks"] += 1
                ledger.log(cid, "diagnosis", "diagnosed",
                           {**diag.model_dump(), "llm_fallback": fallback})
            else:
                diag = Diagnosis(root_cause=f"baseline policy: no diagnosis ({ftype})",
                                 action_id="retry_same_cooldown",
                                 justification="baseline always blind-retries same instrument",
                                 confidence=0.0)
                ledger.log(cid, "diagnosis", "diagnosed",
                           {**diag.model_dump(), "llm_fallback": False})

            gate = evaluate(amount_paise=ev.amount_paise, action_id=diag.action_id,
                            attempts_so_far=attempts, last_attempt_at=last_attempt, now=now)
            ledger.log(cid, "policy_gate", "allowed" if gate.allowed else "denied",
                       {"reason": gate.reason, "attempts_so_far": attempts})
            if not gate.allowed:
                if gate.reason in ("below_minimum", "escalate_and_stop"):
                    exc(gate.reason, cid)
                break
            if diag.action_id == "escalate_human":
                res = execute(ev, diag, dry_run=dry_run)
                ledger.log(cid, "executor", "escalated", res)
                exc("escalated", cid)
                break

            try:
                res = execute(ev, diag, dry_run=dry_run,
                              force_fail=(cid == force_fail_checkout))
                ledger.log(cid, "executor", "executed", res)
            except ExecutionError as e:
                ledger.log(cid, "executor", "execution_failed", {"error": str(e)})
                exc("execution_failed", cid)
                break

            attempts += 1
            stats["attempted"] += 1
            last_attempt = now
            now += timedelta(minutes=35)  # simulated clock respects cooldown

            sim = outcome_mod.simulate(
                checkout_id=cid, failure_type=ftype, action_id=diag.action_id,
                attempt_no=attempts,
                previous_action_id=history[-1]["action_id"] if history else None)
            ledger.log(cid, "outcome", "recovered" if sim["recovered"] else "not_recovered", sim)
            history.append({"attempt_no": attempts, "action_id": diag.action_id,
                            "outcome": "recovered" if sim["recovered"] else "not_recovered"})
            if sim["recovered"]:
                recovered = True
                stats["recovered_paise"] += ev.amount_paise
                stats["recovered_count"] += 1
                break

        if not recovered and attempts >= max_loop:
            ledger.log(cid, "policy_gate", "denied", {"reason": "escalate_and_stop",
                                                      "attempts_so_far": attempts})
            exc("escalated_after_2", cid)

    summary = {
        "run_id": run_id, "policy": policy, "dry_run": dry_run,
        "n_events": len(events),
        "at_risk_inr": round(stats["at_risk_paise"] / 100, 2),
        "recovered_inr": round(stats["recovered_paise"] / 100, 2),
        "recovery_rate_count": round(stats["recovered_count"] / len(events), 4),
        "recovery_rate_value": round(stats["recovered_paise"] / stats["at_risk_paise"], 4),
        "recovered_count": stats["recovered_count"],
        "links_created": stats["attempted"],
        "llm_fallbacks": stats["llm_fallbacks"],
        "exception_count": sum(len(v) for v in exceptions.values()),
        "exceptions": {k: sorted(v) for k, v in sorted(exceptions.items())},
        "simulated_outcomes": True,
        "llm": llm.usage(),
        "inference_cost_per_100_inr_recovered": (
            round(llm.cost_inr() / (stats["recovered_paise"] / 100) * 100, 4)
            if stats["recovered_paise"] else None),
    }
    (run_dir / "run.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    ledger.close()
    print(json.dumps(summary, indent=2))


@app.command()
def export(run_id: str, out: str = ""):
    """Export a run's summary + full audit trail for the dashboard."""
    run_dir = ROOT / "runs" / run_id
    summary = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    ledger = Ledger(run_dir / "ledger.db", run_id)
    payload = {"summary": summary, "audit": ledger.rows()}
    ledger.close()
    out = out or str(ROOT / "dashboard" / "public" / "data" / f"run-{summary['policy']}.json")
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(payload, indent=1), encoding="utf-8")
    print(f"exported {len(payload['audit'])} audit rows -> {out}")


@app.command()
def compare(agent_run: str, baseline_run: str):
    a = json.loads((ROOT / "runs" / agent_run / "run.json").read_text(encoding="utf-8"))
    b = json.loads((ROOT / "runs" / baseline_run / "run.json").read_text(encoding="utf-8"))
    print(f"{'':24} {'agent':>12} {'baseline':>12}")
    for k in ("at_risk_inr", "recovered_inr", "recovery_rate_value",
              "recovered_count", "exception_count", "llm_fallbacks"):
        print(f"{k:24} {a[k]:>12} {b[k]:>12}")
    print(f"{'delta_recovered_inr':24} {round(a['recovered_inr'] - b['recovered_inr'], 2):>12}")


def _per_checkout(run_id: str) -> dict[str, dict]:
    """Collapse a run's audit log into one record per checkout."""
    ledger = Ledger(ROOT / "runs" / run_id / "ledger.db", run_id)
    out: dict[str, dict] = {}
    for r in ledger.rows():
        rec = out.setdefault(r["checkout_id"], {
            "failure_type": None, "amount_paise": None, "actions": [],
            "recovered": False, "final": None})
        p = r["payload"]
        if r["agent"] == "signal":
            rec["failure_type"] = p["failure_type"]
            rec["amount_paise"] = p["event"]["amount_paise"]
        elif r["agent"] == "diagnosis":
            rec["actions"].append(p["action_id"])
        elif r["agent"] == "outcome" and r["event"] == "recovered":
            rec["recovered"] = True
        elif r["agent"] == "policy_gate" and r["event"] == "denied":
            rec["final"] = p["reason"]
        elif r["agent"] == "executor" and r["event"] in ("escalated", "execution_failed"):
            rec["final"] = r["event"]
    ledger.close()
    return out


@app.command()
def counterfactual(agent_run: str, baseline_run: str, out: str = ""):
    """Per-checkout agent-vs-baseline outcomes. Only meaningful because outcome
    draws are paired per (checkout_id, attempt_no): each checkout has a defined
    result under BOTH policies, so the delta is attributable to the decision."""
    a, b = _per_checkout(agent_run), _per_checkout(baseline_run)
    rows, classes = [], {"agent_won": 0, "baseline_won": 0, "both": 0, "neither": 0}
    delta_paise = 0
    for cid in sorted(set(a) | set(b)):
        ra, rb = a.get(cid, {}), b.get(cid, {})
        ar, br = bool(ra.get("recovered")), bool(rb.get("recovered"))
        cls = ("both" if ar and br else "agent_won" if ar else
               "baseline_won" if br else "neither")
        classes[cls] += 1
        amt = ra.get("amount_paise") or rb.get("amount_paise") or 0
        if cls == "agent_won":
            delta_paise += amt
        elif cls == "baseline_won":
            delta_paise -= amt
        rows.append({
            "checkout_id": cid, "failure_type": ra.get("failure_type") or rb.get("failure_type"),
            "amount_inr": round(amt / 100, 2), "class": cls,
            "agent": {"actions": ra.get("actions", []), "recovered": ar, "final": ra.get("final")},
            "baseline": {"actions": rb.get("actions", []), "recovered": br, "final": rb.get("final")},
        })
    payload = {"agent_run": agent_run, "baseline_run": baseline_run,
               "classes": classes, "net_delta_inr": round(delta_paise / 100, 2),
               "paired_draws": True, "checkouts": rows}
    out = out or str(ROOT / "dashboard" / "public" / "data" / "counterfactual.json")
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(payload, indent=1), encoding="utf-8")
    print(json.dumps({"classes": classes, "net_delta_inr": payload["net_delta_inr"]}, indent=2))
    print(f"-> {out}")


if __name__ == "__main__":
    app()
