# Recoup — AI Revenue Recovery (Razorpay Buildathon, Track 3)

> **Headline (100-checkout batch, agent vs blind-retry baseline, identical seeded outcome draws):**
> _Numbers below are from the offline fallback smoke run — will be replaced by the Day 3 LLM batch run and committed before any tuning._
>
> | | agent | baseline |
> |---|---|---|
> | Rs at risk | 4,24,693 | 4,24,693 |
> | Rs recovered (simulated) | 2,52,491 | 1,52,608 |
> | recovery rate (value) | 59.4% | 35.9% |
> | exceptions | 63 | 81 |

Recoup ingests a batch of failed and abandoned Razorpay checkouts, classifies why
each one died, diagnoses a root cause, picks one bounded recovery action from a
fixed menu, executes it against Razorpay test mode, and reports how much money it
won back — with a full audit trail, stopping rules enforced in code, and an
honest exception list.

## What is real vs simulated — read this first

1. **Real:** the Executor makes genuine Razorpay test-mode API calls
   (Payment Links). Raw request/response logged verbatim in the ledger.
2. **Observed:** one recovery is closed end-to-end for real — the agent's link
   paid with a Razorpay test card and observed transitioning to `paid` via the
   API. Flagged `observed: true` in the ledger. _(Day 3 deliverable.)_
3. **Simulated:** batch outcomes are drawn under a stated, seeded model
   ([config/recovery_model.json](config/recovery_model.json)) — assumptions
   published, draws paired across policies so agent-vs-baseline is a fair
   comparison. No batch number is claimed as observed.

Reproduce our number yourself (offline, no keys needed):

```bash
python -m recoup.cli run --policy agent --run-id verify && python -m recoup.cli compare verify baseline-smoke
```

## Scope

Checkout and payment failures only. **Not doing:** subscriptions, mandates,
B2B receivables, voice. Five days solo — one loop closed properly beats four
half-loops.

## Architecture

```
events.json (100 synthetic checkouts, seeded, skewed realistically)
   |
   v
Signal ── deterministic rules, NO LLM (error codes are a lookup problem)
   |
   v
Diagnosis ── the only LLM (Fireworks). Strict JSON contract, 2 retries,
   |          then deterministic fallback recorded as llm_fallback.
   v
Policy gate ── pure functions, unit tested. Max 2 attempts / 30-min
   |            cooldown / no action under Rs 50 / menu enforcement.
   v
Executor ── real Razorpay Payment Links API. --dry-run for offline replay.
   |
   v
Ledger ── append-only SQLite audit log; every hop, verbatim.
```

Where we deliberately did **not** use an LLM: Signal (rules), the policy gate
(code), outcome accounting (seeded model). The LLM makes exactly one kind of
decision — choosing among five pre-approved actions — and its output is
validated, bounded, and gated before anything touches an API.

## The action menu (the LLM picks from this and nothing else)

See [config/actions.json](config/actions.json): retry on alternate instrument,
retry same after cooldown, recovery nudge (Hinglish), offer EMI, escalate to
human (with mandatory reason).

## Stopping rules (in code, not prompts — see recoup/policy.py + tests)

- Max **2** recovery attempts per checkout
- **30-minute** cooldown between attempts
- No action on amounts under **Rs 50**
- Unresolved after 2 attempts -> escalate and stop

## Run it

```bash
pip install -r requirements.txt
python -m recoup.cli run --policy agent            # offline dry-run
python -m recoup.cli run --policy baseline
python -m recoup.cli compare <agent-run> <baseline-run>
pytest tests/                                       # stopping rules + classifier + determinism
```

With keys (`.env` from `.env.example`): add `--no-dry-run` for real
test-mode Payment Links.

Dashboard: `cd dashboard && npm run dev` — reads the exported run JSONs,
renders headline comparison, per-checkout audit trails, exceptions, and the
batch replay.
