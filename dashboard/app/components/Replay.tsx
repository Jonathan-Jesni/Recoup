"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckoutTrail, fmtINR } from "@/lib/data";
import { Panel, Provenance } from "./ui";

/**
 * Replays the batch in ledger order. Each checkout walks the five stages, the
 * counter climbs, and its cell in the 104-square grid takes its outcome colour.
 * Driven by the same audit rows the table renders.
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

const BIN_CELL: Record<Bin, string> = {
  recovered: "bg-emerald-400",
  escalated_after_2: "bg-slate-600",
  escalated: "bg-amber-400/80",
  unclassified: "bg-amber-300",
  below_minimum: "bg-slate-700",
};

const STAGES = ["signal", "diagnosis", "policy_gate", "executor", "outcome"] as const;
const TICK_MS = 190; // per checkout at 1x; 104 checkouts ~= 20s

/** Ease a number toward its target so the money counter climbs instead of jumping. */
function useTween(target: number, ms = 150) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = target;
    if (a === b) return;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(a + (b - a) * eased);
      if (t < 1) raf.current = requestAnimationFrame(step);
      else from.current = b;
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      from.current = v;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ms]);
  return v;
}

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
  const [playing, setPlaying] = useState(true); // autoplay: the page opens on motion
  const [speed, setSpeed] = useState(1);
  const [flash, setFlash] = useState(0); // bumped when money lands
  const timer = useRef<number | null>(null);

  // ?replay=0 opts out — handy when grabbing a still of the finished state.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("replay") === "0") {
      setPlaying(false);
    }
  }, []);

  const done = i >= ordered.length;

  const tick = useCallback(() => {
    setI((prev) => {
      if (prev >= ordered.length) {
        setPlaying(false);
        return prev;
      }
      if (ordered[prev]?.recovered) setFlash((f) => f + 1);
      return prev + 1;
    });
  }, [ordered]);

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(tick, TICK_MS / speed);
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
  const shownInr = useTween(recoveredInr, Math.max(120, TICK_MS / speed));
  const segMs = TICK_MS / speed / STAGES.length; // one pipeline stage per slice of a tick

  const reset = () => {
    setPlaying(false);
    setI(0);
  };

  return (
    <Panel
      title="Batch replay"
      subtitle="Ledger order, one checkout at a time."
      right={<Provenance kind="simulated" />}
      sim
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
          <div
            key={flash}
            className="tnum mt-1 text-4xl font-semibold text-emerald-400 tabular-nums"
            style={flash ? { animation: "cashflash 420ms ease-out" } : undefined}
          >
            {fmtINR(shownInr)}
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
                <div key={current?.checkout_id} className="mt-3 flex items-center gap-1">
                  {STAGES.map((s, idx) => (
                    <div
                      key={s}
                      className="h-1.5 flex-1 overflow-hidden rounded bg-[var(--line)]"
                    >
                      <div
                        className="h-full w-full origin-left bg-sky-400"
                        style={{
                          animation: `segfill ${segMs}ms ease-out ${idx * segMs}ms both`,
                        }}
                      />
                    </div>
                  ))}
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

        {/* right: one cell per checkout, filling in ledger order */}
        <div className="bg-[var(--panel)] p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
              Every checkout in the batch
            </span>
            <span className="tnum font-mono text-[11px] text-[var(--muted)]">
              {i} / {ordered.length}
            </span>
          </div>

          <div
            className="mt-3 grid gap-[3px]"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(14px, 1fr))" }}
          >
            {ordered.map((t, idx) => {
              const settled = idx < i;
              const active = idx === i - 1;
              const b = binOf(t);
              return (
                <span
                  key={t.checkout_id}
                  title={`${t.checkout_id} · ${fmtINR(t.amount_inr)} · ${t.outcome_label}`}
                  className={`aspect-square rounded-[2px] transition-colors duration-200 ${
                    settled ? BIN_CELL[b] : "bg-[var(--panel2)]"
                  } ${active ? "ring-2 ring-white/70" : ""}`}
                />
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {(Object.keys(BIN_META) as Bin[]).map((b) => (
              <div key={b} className="flex items-center gap-2 text-[11px]">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-[2px] ${BIN_CELL[b]}`} />
                <span className="min-w-0 flex-1 truncate text-[var(--muted)]">
                  {BIN_META[b].label}
                </span>
                <span className={`tnum font-mono ${BIN_META[b].color}`}>{bins[b]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
