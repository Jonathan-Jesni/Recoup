"use client";

import { useEffect, useMemo, useState } from "react";
import { buildTrails, DashboardData, loadAll } from "@/lib/data";
import { Headline } from "./components/Headline";
import { CounterfactualPanel } from "./components/Counterfactual";
import { CheckoutTable } from "./components/CheckoutTable";
import { Exceptions } from "./components/Exceptions";
import { FailureCase } from "./components/FailureCase";
import { Replay } from "./components/Replay";
import { Panel } from "./components/ui";

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadAll().then(setData).catch((e) => setErr(String(e)));
  }, []);

  const trails = useMemo(() => {
    if (!data) return [];
    const t = buildTrails(data.agent.audit);
    // fold the observed recovery's reconcile row into its checkout
    if (data.observed) {
      const obsRows = data.observed.audit.filter((r) => r.agent === "reconcile");
      for (const r of obsRows) {
        const target = t.find((x) => x.checkout_id === r.checkout_id);
        if (target) {
          target.rows.push(r);
          target.outcome_label = "OBSERVED";
          target.recovered = true;
        }
      }
    }
    return t;
  }, [data]);

  if (err) {
    return (
      <main className="mx-auto max-w-2xl p-10">
        <Panel title="Could not load run data">
          <pre className="p-5 font-mono text-xs text-rose-300">{err}</pre>
        </Panel>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="font-mono text-sm text-[var(--muted)]">loading ledger…</p>
      </main>
    );
  }

  const a = data.agent.summary;

  return (
    <main className="mx-auto max-w-[1400px] px-6 py-10">
      <header className="mb-8">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Recoup</h1>
          <span className="text-sm text-[var(--muted)]">
            AI Revenue Recovery · Razorpay Buildathon Track 3
          </span>
        </div>
        <p className="mt-3 max-w-4xl text-[15px] leading-relaxed">
          The recovery agent that shows you the one rupee it actually recovered — and the model
          behind every rupee it didn&apos;t.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 font-mono text-[11px] text-[var(--muted)]">
          <span className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1">
            run {a.run_id}
          </span>
          <span className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1">
            {a.n_events} checkouts
          </span>
          <span className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1">
            {a.llm.model.split("/").pop()}
          </span>
          <span className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1">
            {data.agent.audit.length} audit rows
          </span>
        </div>
      </header>

      <div className="space-y-6">
        <Headline data={data} />
        <Replay
          trails={trails}
          atRisk={a.at_risk_inr}
          totalRecovered={a.recovered_inr}
        />
        <CounterfactualPanel cf={data.cf} />
        <CheckoutTable trails={trails} />
        {data.failure && <FailureCase run={data.failure} />}
        <Exceptions
          summary={a}
          forcedFailure={data.failure?.summary.exceptions.execution_failed?.[0]}
        />
      </div>

      <footer className="mt-10 border-t border-[var(--line)] pt-6 text-xs leading-relaxed text-[var(--muted)]">
        <p className="max-w-4xl">
          Batch outcomes are drawn under a published, seeded model
          (<code>config/recovery_model.json</code>) and labelled SIMULATED throughout. Draws are
          paired per checkout across policies. One recovery — {" "}
          {data.observed?.summary.observed_recovery?.checkout_id} — is OBSERVED: a real Razorpay
          payment link created by the agent, paid with a test card, confirmed via the API. Inference
          cost assumes ${a.llm.assumed_usd_per_m_input}/M input and $
          {a.llm.assumed_usd_per_m_output}/M output at ₹{a.llm.assumed_usd_inr}/USD.
        </p>
      </footer>
    </main>
  );
}
