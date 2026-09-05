"use client";

import { useMemo } from "react";
import { Counterfactual as Cf, fmtINR } from "@/lib/data";
import { Panel, Provenance } from "./ui";

/**
 * Cumulative recovered rupees across the batch, agent vs baseline, in ledger
 * order. Both lines are computed from the same paired draws, so the shaded gap
 * between them is the whole argument of this project in one shape.
 *
 * Inline SVG on purpose — no chart library for two monotonic series.
 */

const W = 1000;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 68 };

export function RecoveryChart({ cf }: { cf: Cf }) {
  const { agentPts, basePts, maxY, n, crossings } = useMemo(() => {
    const ordered = cf.checkouts
      .slice()
      .sort((a, b) => a.checkout_id.localeCompare(b.checkout_id));

    let a = 0;
    let b = 0;
    const ap: [number, number][] = [[0, 0]];
    const bp: [number, number][] = [[0, 0]];
    const cross: { i: number; id: string; amount: number }[] = [];

    ordered.forEach((c, i) => {
      if (c.agent.recovered) a += c.amount_inr;
      if (c.baseline.recovered) b += c.amount_inr;
      ap.push([i + 1, a]);
      bp.push([i + 1, b]);
      if (c.class === "agent_won") cross.push({ i: i + 1, id: c.checkout_id, amount: c.amount_inr });
    });

    return {
      agentPts: ap,
      basePts: bp,
      maxY: Math.max(a, b),
      n: ordered.length,
      crossings: cross,
    };
  }, [cf]);

  const x = (i: number) => PAD.left + (i / n) * (W - PAD.left - PAD.right);
  const y = (v: number) =>
    H - PAD.bottom - (v / maxY) * (H - PAD.top - PAD.bottom);

  const path = (pts: [number, number][]) =>
    pts.map(([i, v], k) => `${k === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  // area between the two lines = the delta, accumulating
  const gap =
    path(agentPts) +
    " " +
    basePts
      .slice()
      .reverse()
      .map(([i, v]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ") +
    " Z";

  const finalAgent = agentPts[agentPts.length - 1][1];
  const finalBase = basePts[basePts.length - 1][1];

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxY * f));

  return (
    <Panel
      title="Cumulative recovery across the batch"
      subtitle="Both policies, same 104 checkouts, same seeded draws, in ledger order. The shaded area is the difference the agent's decisions made."
      right={<Provenance kind="simulated" />}
      sim
    >
      <div className="overflow-x-auto p-5">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[640px]"
          role="img"
          aria-label={`Cumulative recovered rupees: agent ${finalAgent}, baseline ${finalBase}`}
        >
          <defs>
            <linearGradient id="gapfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0.04" />
            </linearGradient>
          </defs>

          {/* gridlines + y axis */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--line)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 10}
                y={y(t) + 4}
                textAnchor="end"
                className="fill-[var(--muted)] font-mono"
                fontSize="11"
              >
                {t === 0 ? "0" : `${Math.round(t / 1000)}k`}
              </text>
            </g>
          ))}

          {/* the delta */}
          <path d={gap} fill="url(#gapfill)" />

          {/* checkouts where the agent won and the baseline did not */}
          {crossings.map((c) => (
            <line
              key={c.id}
              x1={x(c.i)}
              x2={x(c.i)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="rgb(16 185 129)"
              strokeOpacity="0.16"
              strokeWidth="1"
            />
          ))}

          <path d={path(basePts)} fill="none" stroke="rgb(148 163 184)" strokeWidth="2" />
          <path d={path(agentPts)} fill="none" stroke="rgb(52 211 153)" strokeWidth="2.5" />

          {/* end labels */}
          <circle cx={x(n)} cy={y(finalAgent)} r="4" fill="rgb(52 211 153)" />
          <circle cx={x(n)} cy={y(finalBase)} r="3.5" fill="rgb(148 163 184)" />

          <text
            x={PAD.left}
            y={H - 8}
            className="fill-[var(--muted)] font-mono"
            fontSize="11"
          >
            checkout 1
          </text>
          <text
            x={W - PAD.right}
            y={H - 8}
            textAnchor="end"
            className="fill-[var(--muted)] font-mono"
            fontSize="11"
          >
            checkout {n}
          </text>
        </svg>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Legend color="rgb(52 211 153)" label="Agent" value={fmtINR(finalAgent)} />
          <Legend color="rgb(148 163 184)" label="Baseline" value={fmtINR(finalBase)} />
          <span className="text-[var(--muted)]">
            shaded gap ={" "}
            <span className="font-semibold text-emerald-400">
              {fmtINR(finalAgent - finalBase)}
            </span>
          </span>
          <span className="text-[var(--muted)]">
            <span className="mr-1 inline-block h-3 w-px bg-emerald-400/40 align-middle" />
            {crossings.length} vertical marks = checkouts only the agent recovered
          </span>
        </div>
      </div>
    </Panel>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-0.5 w-5 rounded" style={{ background: color }} />
      <span className="text-[var(--muted)]">{label}</span>
      <span className="tnum font-semibold">{value}</span>
    </span>
  );
}
