"use client";

import { AuditRow, fmtINR, RunExport } from "@/lib/data";
import { Panel, Pill, Provenance } from "./ui";

/**
 * The deliberately-broken checkout. This is the panel that answers "what does
 * it do when the API says no?" — the executor sent an invalid amount, Razorpay
 * rejected it for real, and the pipeline claimed nothing.
 */
export function FailureCase({ run }: { run: RunExport }) {
  const s = run.summary;
  const cid = s.exceptions.execution_failed?.[0];
  const rows = run.audit;
  const diag = rows.find((r) => r.agent === "diagnosis");
  const failed = rows.find((r) => r.event === "execution_failed");
  const gate = rows.find((r) => r.agent === "policy_gate");

  if (!cid || !failed) return null;

  return (
    <Panel
      title="When execution fails"
      subtitle="One checkout was deliberately forced to fail. Razorpay rejected the call for real — this is their error text, verbatim from the ledger."
      right={<Provenance kind="real" />}
    >
      <div className="grid gap-px bg-[var(--line)] lg:grid-cols-[1fr_auto]">
        <div className="space-y-4 bg-[var(--panel)] p-5">
          <Step
            n={1}
            agent="signal"
            title="Classified"
            body={<Pill tone="info">{rows[0]?.payload.failure_type}</Pill>}
          />
          <Step
            n={2}
            agent="diagnosis"
            title="Diagnosed"
            body={
              <div className="space-y-1">
                <Pill>{diag?.payload.action_id}</Pill>
                <p className="text-xs leading-relaxed text-[var(--muted)]">
                  {diag?.payload.root_cause}
                </p>
              </div>
            }
          />
          <Step
            n={3}
            agent="policy_gate"
            title="Allowed"
            body={<Pill tone="good">{gate?.payload.reason}</Pill>}
          />
          <Step
            n={4}
            agent="executor"
            title="Rejected by Razorpay"
            body={
              <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-mono text-[11px] leading-relaxed text-rose-300">
                {(failed.payload as { error: string }).error}
              </div>
            }
            last
          />
        </div>

        <div className="flex flex-col justify-center gap-4 bg-[var(--panel)] p-6 lg:w-64">
          <div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
              Checkout
            </div>
            <div className="mt-1 font-mono text-sm text-rose-300">{cid}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
              At risk
            </div>
            <div className="tnum mt-1 text-lg">{fmtINR(s.at_risk_inr)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
              Claimed as recovered
            </div>
            <div className="tnum mt-1 text-3xl font-semibold text-rose-400">
              {fmtINR(s.recovered_inr)}
            </div>
          </div>
          <p className="text-xs leading-relaxed text-[var(--muted)]">
            The failure is on the record. It is not a gap in the batch, and it is not counted
            as a win.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function Step({
  n,
  agent,
  title,
  body,
  last,
}: {
  n: number;
  agent: AuditRow["agent"];
  title: string;
  body: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel2)] font-mono text-[10px] text-[var(--muted)]">
          {n}
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-[var(--line)]" />}
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{title}</span>
          <code className="font-mono text-[10px] text-[var(--muted)]">{agent}</code>
        </div>
        <div className="mt-1.5">{body}</div>
      </div>
    </div>
  );
}
