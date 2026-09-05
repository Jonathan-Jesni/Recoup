"use client";

import { useState } from "react";
import { CfCheckout, CfClass, Counterfactual as Cf, fmtINR } from "@/lib/data";
import { Panel, Pill, Provenance } from "./ui";

const CLASS_META: Record<CfClass, { label: string; tone: string; dot: string }> = {
  agent_won: {
    label: "Agent won",
    tone: "text-emerald-300",
    dot: "bg-emerald-400",
  },
  baseline_won: { label: "Baseline won", tone: "text-rose-300", dot: "bg-rose-400" },
  both: { label: "Both recovered", tone: "text-sky-300", dot: "bg-sky-400" },
  neither: { label: "Neither", tone: "text-[var(--muted)]", dot: "bg-slate-600" },
};

export function CounterfactualPanel({ cf }: { cf: Cf }) {
  const [filter, setFilter] = useState<CfClass>("agent_won");
  const [showAll, setShowAll] = useState(false);
  const PREVIEW = 20;
  const rows = cf.checkouts.filter((c) => c.class === filter);
  const total = cf.checkouts.length;

  return (
    <Panel
      title="Counterfactual — where the decision was the difference"
      subtitle="Same draws for both policies, so the difference is the decision."
      right={<Provenance kind="simulated" />}
      sim
    >
      <div className="grid gap-px bg-[var(--line)] sm:grid-cols-4">
        {(Object.keys(CLASS_META) as CfClass[]).map((k) => {
          const meta = CLASS_META[k];
          const n = cf.classes[k] ?? 0;
          const active = filter === k;
          return (
            <button
              key={k}
              onClick={() => { setFilter(k); setShowAll(false); }}
              className={`group bg-[var(--panel)] p-4 text-left transition-colors ${
                active ? "bg-[var(--panel2)]" : "hover:bg-[var(--panel2)]"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                  {meta.label}
                </span>
              </div>
              <div className={`tnum mt-2 text-3xl font-semibold ${active ? meta.tone : ""}`}>
                {n}
              </div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">
                {((n / total) * 100).toFixed(0)}% of {total}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[var(--line)] bg-[var(--panel2)] px-5 py-3">
        <p className="text-sm">
          <span className="font-semibold">{cf.classes.agent_won}</span> checkouts the agent recovered
          and the baseline lost.{" "}
          <span className="font-semibold">{cf.classes.baseline_won}</span> the other way.
        </p>
        <p className="tnum text-sm">
          net{" "}
          <span className="font-semibold text-emerald-400">+{fmtINR(cf.net_delta_inr)}</span>
        </p>
      </div>

      <div>
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-[var(--muted)]">No checkouts in this class.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--panel)] text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
              <tr className="border-b border-[var(--line)]">
                <th className="px-5 py-2.5 font-medium">Checkout</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="px-3 py-2.5 font-medium">Failure</th>
                <th className="px-3 py-2.5 font-medium">Agent did</th>
                <th className="px-5 py-2.5 font-medium">Baseline did</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .slice()
                .sort((x, y) => y.amount_inr - x.amount_inr)
                .slice(0, showAll ? undefined : PREVIEW)
                .map((c) => (
                  <CfRow key={c.checkout_id} c={c} />
                ))}
            </tbody>
          </table>
        )}
        {rows.length > PREVIEW && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="w-full border-t border-[var(--line)] bg-[var(--panel2)] px-5 py-3 text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
          >
            {showAll ? `Show first ${PREVIEW}` : `Show all ${rows.length}`}
          </button>
        )}
      </div>
    </Panel>
  );
}

function CfRow({ c }: { c: CfCheckout }) {
  return (
    <tr className="border-b border-[var(--line)]/60 last:border-0 hover:bg-[var(--panel2)]">
      <td className="px-5 py-2.5 font-mono text-xs">{c.checkout_id}</td>
      <td className="tnum px-3 py-2.5 text-right font-medium">{fmtINR(c.amount_inr)}</td>
      <td className="px-3 py-2.5">
        <Pill>{c.failure_type}</Pill>
      </td>
      <td className="px-3 py-2.5">
        <ActionList actions={c.agent.actions} recovered={c.agent.recovered} />
      </td>
      <td className="px-5 py-2.5">
        <ActionList actions={c.baseline.actions} recovered={c.baseline.recovered} />
      </td>
    </tr>
  );
}

function ActionList({ actions, recovered }: { actions: string[]; recovered: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {actions.length === 0 && <span className="text-xs text-[var(--muted)]">—</span>}
      {actions.map((a, i) => (
        <Pill key={i} tone={recovered && i === actions.length - 1 ? "good" : "neutral"}>
          {a}
        </Pill>
      ))}
      {recovered && <span className="text-xs text-emerald-400">✓</span>}
    </div>
  );
}
