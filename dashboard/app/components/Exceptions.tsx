"use client";

import { RunSummary } from "@/lib/data";
import { Panel, Pill } from "./ui";

const REASONS: Record<string, { title: string; why: string; tone: "bad" | "warn" | "neutral" }> = {
  execution_failed: {
    title: "Execution failed",
    why: "The API call was made and rejected. Logged verbatim, ₹0 claimed.",
    tone: "bad",
  },
  unclassified: {
    title: "Unclassified",
    why: "Signal did not recognise the error code. Never guessed — routed straight here, never reached the LLM.",
    tone: "warn",
  },
  below_minimum: {
    title: "Below minimum",
    why: "Amount under ₹50. The policy gate refuses to spend an intervention on it.",
    tone: "neutral",
  },
  escalated: {
    title: "Escalated to human",
    why: "The agent judged automation unlikely to help and handed it over with a reason.",
    tone: "warn",
  },
  escalated_after_2: {
    title: "Attempts exhausted",
    why: "Two recovery attempts made, neither converted. The gate stops here — no third try, ever.",
    tone: "neutral",
  },
};

export function Exceptions({
  summary,
  forcedFailure,
}: {
  summary: RunSummary;
  forcedFailure?: string;
}) {
  const entries = Object.entries(summary.exceptions).sort(
    (a, b) => b[1].length - a[1].length,
  );

  return (
    <Panel
      title={`Exceptions — ${summary.exception_count} of ${summary.n_events}`}
      subtitle="Nothing here is claimed as recovered. A checkout the agent could not help is a checkout it reports, not one it hides."
    >
      <div className="divide-y divide-[var(--line)]">
        {entries.map(([reason, ids]) => {
          const meta = REASONS[reason] ?? {
            title: reason,
            why: "",
            tone: "neutral" as const,
          };
          return (
            <div key={reason} className="px-5 py-4">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-medium">{meta.title}</span>
                <Pill tone={meta.tone}>{ids.length}</Pill>
                <code className="font-mono text-[10px] text-[var(--muted)]">{reason}</code>
              </div>
              {meta.why && (
                <p className="mt-1.5 max-w-3xl text-sm text-[var(--muted)]">{meta.why}</p>
              )}
              <div className="mt-2.5 flex flex-wrap gap-1">
                {ids.map((id) => (
                  <span
                    key={id}
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                      id === forcedFailure
                        ? "border-rose-500/50 bg-rose-500/15 text-rose-300"
                        : id.startsWith("obs_")
                          ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
                          : "border-[var(--line)] bg-[var(--panel2)] text-[var(--muted)]"
                    }`}
                  >
                    {id}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
