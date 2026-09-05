import { ReactNode } from "react";

export function Panel({
  title,
  subtitle,
  right,
  children,
  className = "",
  sim = false,
}: {
  title?: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Everything in this panel is drawn from the seeded model, not an API. */
  sim?: boolean;
}) {
  return (
    <section
      {...(sim ? { "data-sim": "" } : {})}
      className={`panel-depth rounded-xl border border-[var(--line)] bg-[var(--panel)] ${className}`}
    >
      {(title || right) && (
        <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
          <div>
            {title && (
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
                {subtitle}
              </p>
            )}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

/** Every number on this page is either SIMULATED or OBSERVED. Never unlabelled. */
export function Provenance({ kind }: { kind: "simulated" | "observed" | "real" }) {
  const map = {
    simulated: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    observed: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
    real: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  } as const;
  const label = { simulated: "SIMULATED", observed: "OBSERVED", real: "REAL" }[kind];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider ${map[kind]}`}
    >
      {label}
    </span>
  );
}

export function Tile({
  label,
  value,
  sub,
  badge,
  accent = false,
  sim = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  badge?: ReactNode;
  accent?: boolean;
  sim?: boolean;
}) {
  return (
    <div
      {...(sim ? { "data-sim": "" } : {})}
      className={`panel-depth rounded-xl border p-4 ${
        accent
          ? "border-emerald-500/30 bg-emerald-500/[0.07]"
          : "border-[var(--line)] bg-[var(--panel)]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
          {label}
        </span>
        {badge}
      </div>
      <div className="tnum mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="tnum mt-1 text-xs text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "bad" | "warn" | "info";
}) {
  const tones = {
    neutral: "border-[var(--line)] bg-[var(--panel2)] text-[var(--muted)]",
    good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    bad: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    info: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[11px] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
