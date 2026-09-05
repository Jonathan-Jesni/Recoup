"use client";

import { DashboardData, fmtINR, fmtINR2, fmtNum, fmtPct } from "@/lib/data";
import { Panel, Pill, Provenance, Tile } from "./ui";

export function Headline({ data }: { data: DashboardData }) {
  const a = data.agent.summary;
  const b = data.baseline.summary;

  const delta = a.recovered_inr - b.recovered_inr;
  const aPerLink = a.links_created / Math.max(a.recovered_count, 1);
  const bPerLink = b.links_created / Math.max(b.recovered_count, 1);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="At risk"
          value={fmtINR(a.at_risk_inr)}
          sub={`${a.n_events} failed / abandoned checkouts`}
          badge={<Provenance kind="real" />}
        />
        <Tile
          label="Recovered — agent"
          value={fmtINR(a.recovered_inr)}
          sub={`${a.recovered_count} checkouts · ${fmtPct(a.recovery_rate_value)} of value`}
          badge={<Provenance kind="simulated" />}
          accent
          sim
        />
        <Tile
          label="Recovered — baseline"
          value={fmtINR(b.recovered_inr)}
          sub={`${b.recovered_count} checkouts · ${fmtPct(b.recovery_rate_value)} of value`}
          badge={<Provenance kind="simulated" />}
          sim
        />
        <Tile
          label="Inference cost"
          value={fmtINR2(a.llm.cost_inr)}
          sub={`₹${a.inference_cost_per_100_inr_recovered} per ₹100 recovered`}
          badge={<Provenance kind="real" />}
        />
      </div>

      {/* The finding that is not in the rupee delta: fewer interventions, more
          recoveries. Every link is a real API call and a real customer contact. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" sim>
          <div className="grid gap-px overflow-hidden rounded-xl bg-[var(--line)] sm:grid-cols-3">
            <Efficiency
              label="Payment links created"
              agent={fmtNum(a.links_created)}
              baseline={fmtNum(b.links_created)}
              betterIsLower
              agentN={a.links_created}
              baselineN={b.links_created}
            />
            <Efficiency
              label="Checkouts recovered"
              agent={fmtNum(a.recovered_count)}
              baseline={fmtNum(b.recovered_count)}
              agentN={a.recovered_count}
              baselineN={b.recovered_count}
            />
            <Efficiency
              label="Links per recovery"
              agent={aPerLink.toFixed(1)}
              baseline={bPerLink.toFixed(1)}
              betterIsLower
              agentN={aPerLink}
              baselineN={bPerLink}
            />
          </div>
          <p className="border-t border-[var(--line)] px-5 py-3 text-sm text-[var(--muted)]">
            The agent created{" "}
            <span className="font-semibold text-[var(--foreground)]">
              {b.links_created - a.links_created} fewer
            </span>{" "}
            payment links and recovered{" "}
            <span className="font-semibold text-[var(--foreground)]">
              {a.recovered_count - b.recovered_count} more
            </span>{" "}
            checkouts. Every link is a real API call and a real message to a customer.
          </p>
        </Panel>

        <Panel sim>
          <div className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                Delta
              </span>
              <Provenance kind="simulated" />
            </div>
            <div className="tnum mt-2 text-2xl font-semibold text-emerald-400">
              +{fmtINR(delta)}
            </div>
            <div className="mt-4 space-y-2 text-xs">
              <Row label="LLM fallbacks" value={`${a.llm_fallbacks} of ${a.llm.calls + a.llm.cache_hits} calls`} />
              <Row label="Exceptions" value={`${a.exception_count} agent · ${b.exception_count} baseline`} />
              <Row label="Model" value={a.llm.model.split("/").pop() ?? ""} />
            </div>
          </div>
        </Panel>
      </div>

    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="tnum font-mono text-[11px]">{value}</span>
    </div>
  );
}

function Efficiency({
  label,
  agent,
  baseline,
  agentN,
  baselineN,
  betterIsLower = false,
}: {
  label: string;
  agent: string;
  baseline: string;
  agentN: number;
  baselineN: number;
  betterIsLower?: boolean;
}) {
  const agentWins = betterIsLower ? agentN < baselineN : agentN > baselineN;
  return (
    <div className="bg-[var(--panel)] p-5">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </div>
      <div className="mt-3 flex items-baseline gap-3">
        <span
          className={`tnum text-2xl font-semibold ${
            agentWins ? "text-emerald-400" : "text-[var(--foreground)]"
          }`}
        >
          {agent}
        </span>
        <span className="text-xs text-[var(--muted)]">agent</span>
      </div>
      <div className="mt-1 flex items-baseline gap-3">
        <span className="tnum text-lg text-[var(--muted)]">{baseline}</span>
        <span className="text-xs text-[var(--muted)]">baseline</span>
      </div>
    </div>
  );
}
