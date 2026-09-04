"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuditRow, CheckoutTrail, fmtINR } from "@/lib/data";
import { Panel, Provenance } from "./ui";

/**
 * Replays the batch in ledger order: every checkout walks Signal → Diagnosis →
 * Gate → Executor → Outcome, the recovered counter climbs, and exceptions drop
 * into their bins. Driven by the same audit rows the table renders — this is a
 * view of the ledger, not an animation with numbers typed into it.
 */

type Bin = "recovered" | "escalated_after_2" | "escalated" | "unclassified" | "below_minimum";

const BIN_META: Record<Bin, { label: string; color: string; ring: string }> = {
  recovered: { label: "Recovered", color: "text-emerald-400", ring: "border-emerald-500/40" },
  escalated_after_2: {
    label: "Attempts exhausted",
    color: "text-slate-300",
    ring: "border-slate-500/40",
  },
  escalated: { label: "Escalated", color: "text-amber-300", ring: "border-amber-500/40" },
  unclassified: { label: "Unclassified", color: "text-amber-400", ring: "border-amber-500/40" },
  below_minimum: { label: "Below ₹50", color: "text-slate-400", ring: "border-slate-600/40" },
};

const STAGES = ["signal", "diagnosis", "policy_gate", "executor", "outcome"] as const;

function binOf(t: CheckoutTrail): Bin {
  if (t.recovered) return "recovered";
  if (t.outcome_label === "escalated") return "escalated";
  if (t.outcome_label === "unclassified") return "unclassified";
  if (t.outcome_label === "below_minimum") return "below_minimum";
  return "escalated_after_2";
}

export function Replay({
  trails,
  atRisk,
  totalRecovered,
}: {
  trails: CheckoutTrail[];
  atRisk: number;
  totalRecovered: number;
}) {
  // ledger order, not sorted by value — this is the batch as it actually ran
  const ordered = useMemo(
    () => trails.slice().sort((a, b) => a.checkout_id.localeCompare(b.checkout_id)),
    [trails],
  );

  const [i, setI] = useState(0); // how many checkouts have been processed
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timer = useRef<number | null>(null);

  const done = i >= ordered.length;

  const tick = useCallback(() => {
    setI((prev) => {
      if (prev >= ordered.length) {
        setPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, [ordered.length]);

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(tick, 190 / speed);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [playing, speed, tick]);

  const processed = ordered.slice(0, i);
  const recoveredInr = processed.reduce((s, t) => s + (t.recovered ? t.amount_inr : 0), 0);
  const recoveredN = processed.filter((t) => t.recovered).length;
  const linksN = processed.reduce((s, t) => s + t.links, 0);

  const bins = processed.reduce<Record<Bin, number>>(
    (acc, t) => {
      acc[binOf(t)] += 1;
      return acc;
    },
    {
      recovered: 0,
      escalated_after_2: 0,
      escalated: 0,
      unclassified: 0,
      below_minimum: 0,
    },
  );

  const current = ordered[Math.min(i, ordered.length - 1)];
  const currentStage = done ? null : stageOf(current);

  const reset = () => {
    setPlaying(false);
    setI(0);
  };

  return (
    <Panel
      title="Batch replay"
      subtitle="Every checkout walking the pipeline in ledger order. The counter climbs as outcomes land; exceptions drop into their bins."
      right={<Provenance kind="simulated" />}
    >
      <div className="border-b border-[var(--line)] px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              if (done) setI(0);
              setPlaying((p) => !p);
            }}
            className="rounded border border-emerald-500/40 bg-emerald-500/15 px-4 py-1.5 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25"
          >
            {playing ? "Pause" : done ? "Replay" : i > 0 ? "Resume" : "Run batch"}
          </button>
          <button
            onClick={reset}
            className="rounded border border-[var(--line)] bg-[var(--panel2)] px-3 py-1.5 text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
          >
            Reset
          </button>
          <div className="flex items-center gap-1">
            {[1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`rounded border px-2 py-1 font-mono text-[11px] transition-colors ${
                  speed === s
                    ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
                    : "border-[var(--line)] bg-[var(--panel2)] text-[var(--muted)]"
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
          <span className="tnum ml-auto font-mono text-xs text-[var(--muted)]">
            {i} / {ordered.length} checkouts
          </span>
        </div>

        <div className="mt-3 h-1 w-full overflow-hidden rounded bg-[var(--panel2)]">
          <div
            className="h-full bg-emerald-500/70 transition-[width] duration-150 ease-linear"
            style={{ width: `${(i / ordered.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="grid gap-px bg-[var(--line)] lg:grid-cols-[1fr_1fr]">
        {/* left: money counter + current checkout walking the pipeline */}
        <div className="bg-[var(--panel)] p-5">
          <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
            Recovered so far
          </div>
          <div className="tnum mt-1 text-4xl font-semibold text-emerald-400 tabular-nums">
            {fmtINR(recoveredInr)}
          </div>
          <div className="tnum mt-1 text-xs text-[var(--muted)]">
            {recoveredN} checkouts · {linksN} links created · of {fmtINR(atRisk)} at risk
            {done && recoveredInr !== totalRecovered && (
              <span className="ml-2 text-amber-400">(final {fmtINR(totalRecovered)})</span>
            )}
          </div>

          <div className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--panel2)] p-4">
            {done ? (
              <p className="text-sm text-[var(--muted)]">
                Batch complete — {ordered.length} checkouts, every hop written to the ledger.
              </p>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-xs">{current?.checkout_id}</span>
                  <span className="tnum text-sm font-medium">
                    {fmtINR(current?.amount_inr ?? 0)}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-1">
                  {STAGES.map((s, idx) => {
                    const reached = currentStage != null && idx <= currentStage;
                    return (
                      <div key={s} className="flex flex-1 items-center gap-1">
                        <div
                          className={`h-1.5 flex-1 rounded transition-colors ${
                            reached ? "bg-sky-400" : "bg-[var(--line)]"
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1.5 flex justify-between font-mono text-[9px] uppercase tracking-wider text-[var(--muted)]">
                  {STAGES.map((s) => (
                    <span key={s}>{s.replace("_", " ")}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* right: exception bins filling up */}
        <div className="bg-[var(--panel)] p-5">
          <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
            Where they land
          </div>
          <div className="mt-3 space-y-2">
            {(Object.keys(BIN_META) as Bin[]).map((b) => {
              const meta = BIN_META[b];
              const n = bins[b];
              const pct = i === 0 ? 0 : (n / i) * 100;
              return (
                <div key={b} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-xs text-[var(--muted)]">{meta.label}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-[var(--panel2)]">
                    <div
                      className={`h-full border-r-2 transition-[width] duration-150 ease-linear ${meta.ring} ${
                        b === "recovered" ? "bg-emerald-500/30" : "bg-slate-500/20"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className={`tnum w-8 text-right font-mono text-sm ${meta.color}`}>{n}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Panel>
  );
}

/** Which pipeline stage the current checkout reached, for the little bar. */
function stageOf(t?: CheckoutTrail): number {
  if (!t) return 0;
  const agents = new Set(t.rows.map((r: AuditRow) => r.agent));
  let n = 0;
  for (const s of STAGES) if (agents.has(s)) n = STAGES.indexOf(s);
  return n;
}
