// Types mirror the JSON that recoup.cli export / counterfactual write.
// Nothing here reshapes the data — the dashboard renders the ledger, it does
// not reconstruct it.

export type AgentName =
  | "signal"
  | "diagnosis"
  | "policy_gate"
  | "executor"
  | "outcome"
  | "reconcile";

export interface AuditRow {
  ts: number;
  checkout_id: string;
  agent: AgentName;
  event: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
}

export interface LlmUsage {
  model: string;
  calls: number;
  cache_hits: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost_inr: number;
  assumed_usd_per_m_input: number;
  assumed_usd_per_m_output: number;
  assumed_usd_inr: number;
}

export interface ObservedRecovery {
  observed: boolean;
  checkout_id: string;
  plink_id: string;
  amount_inr: number;
  amount_paid_inr: number;
  paid_at: number;
  reference_id: string;
  note: string;
}

export interface RunSummary {
  run_id: string;
  policy: "agent" | "baseline";
  dry_run: boolean;
  n_events: number;
  at_risk_inr: number;
  recovered_inr: number;
  recovery_rate_count: number;
  recovery_rate_value: number;
  recovered_count: number;
  links_created: number;
  llm_fallbacks: number;
  exception_count: number;
  exceptions: Record<string, string[]>;
  simulated_outcomes: boolean;
  llm: LlmUsage;
  inference_cost_per_100_inr_recovered: number | null;
  observed_recovery?: ObservedRecovery;
}

export interface RunExport {
  summary: RunSummary;
  audit: AuditRow[];
}

export type CfClass = "agent_won" | "baseline_won" | "both" | "neither";

export interface CfCheckout {
  checkout_id: string;
  failure_type: string;
  amount_inr: number;
  class: CfClass;
  agent: { actions: string[]; recovered: boolean; final: string | null };
  baseline: { actions: string[]; recovered: boolean; final: string | null };
}

export interface Counterfactual {
  agent_run: string;
  baseline_run: string;
  classes: Record<CfClass, number>;
  net_delta_inr: number;
  paired_draws: boolean;
  checkouts: CfCheckout[];
}

// ---------------------------------------------------------------- formatting

// Indian grouping: 4,25,629 not 425,629.
const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtINR = (n: number) => `₹${inr.format(Math.round(n))}`;
export const fmtINR2 = (n: number) => `₹${inr2.format(n)}`;
export const fmtNum = (n: number) => inr.format(n);
export const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

export const fmtTime = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "medium",
  });

// ------------------------------------------------------------------ loading

export interface DashboardData {
  agent: RunExport;
  baseline: RunExport;
  cf: Counterfactual;
  observed: RunExport | null;
  failure: RunExport | null;
}

const optional = (url: string) =>
  fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

export async function loadAll(): Promise<DashboardData> {
  const [agent, baseline, cf, observed, failure] = await Promise.all([
    fetch("/data/run-agent.json").then((r) => r.json()),
    fetch("/data/run-baseline.json").then((r) => r.json()),
    fetch("/data/counterfactual.json").then((r) => r.json()),
    optional("/data/observed.json"),
    optional("/data/failure.json"),
  ]);
  return { agent, baseline, cf, observed, failure };
}

// ------------------------------------------------------- per-checkout shaping

export interface CheckoutTrail {
  checkout_id: string;
  failure_type: string;
  amount_inr: number;
  method: string;
  error_source: string | null;
  error_reason: string | null;
  source: string;
  actions: string[];
  /** Payment links actually created — executor rows, NOT diagnosis choices.
      A gated checkout has a diagnosis but never reaches the API. */
  links: number;
  recovered: boolean;
  outcome_label: string;
  rows: AuditRow[];
}

/** Collapse an audit log into one record per checkout, preserving row order. */
export function buildTrails(audit: AuditRow[]): CheckoutTrail[] {
  const byId = new Map<string, CheckoutTrail>();
  for (const r of audit) {
    let t = byId.get(r.checkout_id);
    if (!t) {
      t = {
        checkout_id: r.checkout_id,
        failure_type: "—",
        amount_inr: 0,
        method: "—",
        error_source: null,
        error_reason: null,
        source: "synthetic",
        actions: [],
        links: 0,
        recovered: false,
        outcome_label: "not recovered",
        rows: [],
      };
      byId.set(r.checkout_id, t);
    }
    t.rows.push(r);

    if (r.agent === "signal") {
      t.failure_type = r.payload.failure_type;
      const ev = r.payload.event ?? {};
      t.amount_inr = (ev.amount_paise ?? 0) / 100;
      t.method = ev.method ?? "—";
      t.error_source = ev.error_source ?? null;
      t.error_reason = ev.error_reason ?? null;
      t.source = ev.source ?? "synthetic";
    } else if (r.agent === "diagnosis") {
      t.actions.push(r.payload.action_id);
    } else if (r.agent === "outcome" && r.event === "recovered") {
      t.recovered = true;
      t.outcome_label = "recovered";
    } else if (r.agent === "reconcile" && r.event === "observed_recovered") {
      t.recovered = true;
      t.outcome_label = "OBSERVED";
    } else if (r.agent === "policy_gate" && r.event === "denied") {
      t.outcome_label = r.payload.reason;
    } else if (r.agent === "executor" && r.event === "executed") {
      t.links += 1;
    } else if (r.agent === "executor" && r.event === "execution_failed") {
      t.outcome_label = "execution_failed";
    } else if (r.agent === "executor" && r.event === "escalated") {
      t.outcome_label = "escalated";
    }
  }
  return [...byId.values()];
}

export const AGENT_COLORS: Record<AgentName, string> = {
  signal: "text-sky-300 border-sky-500/30 bg-sky-500/10",
  diagnosis: "text-violet-300 border-violet-500/30 bg-violet-500/10",
  policy_gate: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  executor: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  outcome: "text-rose-300 border-rose-500/30 bg-rose-500/10",
  reconcile: "text-cyan-300 border-cyan-500/30 bg-cyan-500/10",
};
