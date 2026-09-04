"use client";

import { Fragment, useMemo, useState } from "react";
import {
  AGENT_COLORS,
  AuditRow,
  CheckoutTrail,
  fmtINR,
  fmtTime,
} from "@/lib/data";
import { Panel, Pill, Provenance } from "./ui";

const OUTCOME_TONE: Record<string, "good" | "bad" | "warn" | "neutral"> = {
  recovered: "good",
  OBSERVED: "good",
  execution_failed: "bad",
  unclassified: "warn",
  below_minimum: "warn",
  escalated: "warn",
  escalate_and_stop: "neutral",
  "not recovered": "neutral",
};

export function CheckoutTable({ trails }: { trails: CheckoutTrail[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [onlyObserved, setOnlyObserved] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return trails
      .filter((t) => (onlyObserved ? t.source === "observed" : true))
      .filter(
        (t) =>
          !needle ||
          t.checkout_id.toLowerCase().includes(needle) ||
          t.failure_type.includes(needle) ||
          t.actions.some((a) => a.includes(needle)),
      )
      .sort((a, b) => b.amount_inr - a.amount_inr);
  }, [trails, q, onlyObserved]);

  const observedCount = trails.filter((t) => t.source === "observed").length;

  return (
    <Panel
      title="Every checkout, every hop"
      subtitle="The audit trail IS the ledger table — nothing here is reconstructed after the fact. Click a row to expand the verbatim payloads."
      right={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOnlyObserved((v) => !v)}
            className={`rounded border px-2 py-1 font-mono text-[11px] transition-colors ${
              onlyObserved
                ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
                : "border-[var(--line)] bg-[var(--panel2)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            real failures ({observedCount})
          </button>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="filter…"
            className="w-40 rounded border border-[var(--line)] bg-[var(--panel2)] px-2 py-1 font-mono text-[11px] outline-none placeholder:text-[var(--muted)] focus:border-sky-500/50"
          />
        </div>
      }
    >
      <div className="max-h-[34rem] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--panel)] text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
            <tr className="border-b border-[var(--line)]">
              <th className="px-5 py-2.5 font-medium">Checkout</th>
              <th className="px-3 py-2.5 text-right font-medium">Amount</th>
              <th className="px-3 py-2.5 font-medium">Failure type</th>
              <th className="px-3 py-2.5 font-medium">Actions taken</th>
              <th className="px-5 py-2.5 font-medium">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const isOpen = open === t.checkout_id;
              return (
                <Fragment key={t.checkout_id}>
                  <tr
                    onClick={() => setOpen(isOpen ? null : t.checkout_id)}
                    className={`cursor-pointer border-b border-[var(--line)]/60 hover:bg-[var(--panel2)] ${
                      isOpen ? "bg-[var(--panel2)]" : ""
                    }`}
                  >
                    <td className="px-5 py-2.5 font-mono text-xs">
                      <span className="mr-2 inline-block w-2 text-[var(--muted)]">
                        {isOpen ? "▾" : "▸"}
                      </span>
                      {t.checkout_id}
                      {t.source === "observed" && (
                        <span className="ml-2 text-[10px] text-sky-400">real</span>
                      )}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right font-medium">
                      {fmtINR(t.amount_inr)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Pill tone={t.failure_type === "unclassified" ? "warn" : "neutral"}>
                        {t.failure_type}
                      </Pill>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {t.actions.length === 0 ? (
                          <span className="text-xs text-[var(--muted)]">none</span>
                        ) : (
                          t.actions.map((a, i) => <Pill key={i}>{a}</Pill>)
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-2.5">
                      <Pill tone={OUTCOME_TONE[t.outcome_label] ?? "neutral"}>
                        {t.outcome_label}
                      </Pill>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-[var(--line)]">
                      <td colSpan={5} className="bg-[#06070a] p-0">
                        <Trail rows={t.rows} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-6 text-sm text-[var(--muted)]">No checkouts match.</p>
        )}
      </div>
    </Panel>
  );
}

function Trail({ rows }: { rows: AuditRow[] }) {
  return (
    <div className="divide-y divide-[var(--line)]/60">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-4 px-5 py-3">
          <div className="w-40 shrink-0">
            <span
              className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium ${AGENT_COLORS[r.agent]}`}
            >
              {r.agent}
            </span>
            <div className="mt-1 font-mono text-[10px] text-[var(--muted)]">{r.event}</div>
            <div className="mt-0.5 font-mono text-[10px] text-[var(--muted)]/60">
              {fmtTime(r.ts)}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <Payload agent={r.agent} payload={r.payload} />
          </div>
        </div>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Payload({ agent, payload }: { agent: string; payload: any }) {
  if (agent === "diagnosis") {
    return (
      <div className="space-y-1.5">
        <Field label="root_cause" value={payload.root_cause} />
        <Field label="action_id" value={payload.action_id} mono />
        <Field label="justification" value={payload.justification} />
        <div className="flex gap-3 pt-0.5">
          <Pill tone={payload.llm_fallback ? "bad" : "good"}>
            {payload.llm_fallback ? "LLM FALLBACK" : "from model"}
          </Pill>
          <Pill>confidence {payload.confidence}</Pill>
        </div>
      </div>
    );
  }
  if (agent === "outcome") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Provenance kind="simulated" />
        <Pill>p = {payload.p}</Pill>
        <Pill>draw = {payload.draw}</Pill>
        {payload.repeated_action && <Pill tone="warn">repeated action</Pill>}
        {payload.decay_applied != null && <Pill>decay ×{payload.decay_applied}</Pill>}
      </div>
    );
  }
  if (agent === "reconcile") {
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Provenance kind="observed" />
          <Pill tone="good">paid</Pill>
          <Pill>{payload.plink_id}</Pill>
        </div>
        <Field label="note" value={payload.note} />
      </div>
    );
  }
  if (agent === "executor") {
    const req = payload.request;
    const res = payload.response;
    return (
      <div className="space-y-2">
        {payload.error && (
          <div className="rounded border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 font-mono text-[11px] text-rose-300">
            {payload.error}
          </div>
        )}
        {req && (
          <div className="flex flex-wrap items-center gap-2">
            <Provenance kind={payload.dry_run ? "simulated" : "real"} />
            <Pill>{payload.dry_run ? "dry run" : "live API call"}</Pill>
            {res?.short_url && <Pill tone="info">{res.short_url}</Pill>}
          </div>
        )}
        {req?.description && <Field label="customer sees" value={req.description} />}
        {req && (
          <details className="group">
            <summary className="cursor-pointer font-mono text-[10px] text-[var(--muted)] hover:text-[var(--foreground)]">
              verbatim request / response
            </summary>
            <pre className="mt-1.5 max-h-56 overflow-auto rounded bg-black/40 p-2.5 font-mono text-[10px] leading-relaxed text-[var(--muted)]">
              {JSON.stringify({ request: req, response: res }, null, 2)}
            </pre>
          </details>
        )}
      </div>
    );
  }
  if (agent === "signal") {
    const ev = payload.event ?? {};
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={payload.failure_type === "unclassified" ? "warn" : "info"}>
          {payload.failure_type}
        </Pill>
        <Pill>{ev.method}</Pill>
        {ev.error_source && (
          <Pill>
            {ev.error_source} / {ev.error_reason}
          </Pill>
        )}
        {ev.source === "observed" && <Provenance kind="real" />}
        {ev.razorpay_order_id && <Pill>{ev.razorpay_order_id}</Pill>}
      </div>
    );
  }
  // policy_gate and anything else
  return (
    <div className="flex flex-wrap items-center gap-2">
      {Object.entries(payload).map(([k, v]) => (
        <Pill key={k}>
          {k} = {String(v)}
        </Pill>
      ))}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-24 shrink-0 font-mono text-[10px] text-[var(--muted)]">{label}</span>
      <span className={`min-w-0 flex-1 ${mono ? "font-mono text-[11px]" : "leading-relaxed"}`}>
        {value}
      </span>
    </div>
  );
}
