"use client";

import { ObservedRecovery, fmtINR } from "@/lib/data";
import { Pill } from "./ui";

/**
 * Deliberately NOT a Panel. Every other block on this page is a simulation
 * rendered in the same chrome; this one is the single number an API actually
 * returned, and it should not look like its neighbours.
 */
export function ObservedBand({ obs }: { obs: ObservedRecovery }) {
  const paidOn = new Date(obs.paid_at * 1000).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-emerald-500/40"
      style={{
        background:
          "linear-gradient(135deg, rgba(16,185,129,0.14) 0%, rgba(16,185,129,0.05) 42%, rgba(8,9,12,0) 78%)",
        animation: "observedpulse 4.5s ease-in-out infinite",
      }}
    >
      {/* left rail: the visual tell that this row is different */}
      <span className="absolute inset-y-0 left-0 w-1 bg-emerald-400" />

      <div className="flex flex-col gap-6 px-7 py-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center rounded border border-emerald-400/60 bg-emerald-400/20 px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.18em] text-emerald-200">
              OBSERVED
            </span>
            <span className="font-mono text-[11px] text-emerald-300/70">
              paid {paidOn} · confirmed via GET /v1/payment_links
            </span>
          </div>

          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
            One recovery in this repo is real.
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            The agent created this payment link. We paid it with a test card and polled until
            Razorpay reported <code className="text-emerald-300">paid</code>. Flagged{" "}
            <code className="text-emerald-300">observed: true</code> in the ledger.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Pill tone="good">{obs.checkout_id}</Pill>
            <Pill>{obs.plink_id}</Pill>
            <Pill>ref {obs.reference_id}</Pill>
          </div>
        </div>

        <div className="shrink-0 lg:border-l lg:border-emerald-500/20 lg:pl-8">
          <div className="tnum text-5xl font-semibold leading-none text-emerald-400 lg:text-6xl">
            {fmtINR(obs.amount_paid_inr)}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-emerald-300/70">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            paid in full
          </div>
        </div>
      </div>
    </section>
  );
}
