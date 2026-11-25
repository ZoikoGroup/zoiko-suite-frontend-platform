import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight, ChevronRight, Info, Lock } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

// The three analytic panels under the KPI row: a stage pipeline, an ordered
// model, and a bar list. Every console page fills the same three shapes with
// its own records, so a reader learns where to look once.

export function ConsolePanel({
  title,
  description,
  link,
  children,
  className,
}: {
  title: string;
  description?: string;
  /** The "See all →" in the corner. */
  link?: { label: string; href: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex min-w-0 flex-col p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-navy-950 dark:text-slate-100">{title}</h2>
          {description && <p className="mt-0.5 text-[12px] leading-snug text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
        {link && (
          <Link
            href={link.href}
            scroll={false}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[12px] font-semibold text-navy-600 transition-colors hover:text-navy-800 dark:text-navy-300 dark:hover:text-navy-200"
          >
            {link.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <div className="mt-4 flex min-w-0 flex-1 flex-col">{children}</div>
    </Card>
  );
}

export function PanelGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">{children}</div>;
}

// ── pipeline ─────────────────────────────────────────────────────────────────

export type PipelineStage = {
  label: string;
  value: ReactNode;
  caption: string;
  href?: string;
};

/** Stages left to right; the last one is where a record should end up, in green. */
export function Pipeline({ stages, note }: { stages: PipelineStage[]; note?: ReactNode }) {
  return (
    <>
      <ol className="flex items-stretch gap-1">
        {stages.map((s, i) => {
          const last = i === stages.length - 1;
          const box = (
            <div
              className={cn(
                "flex h-full flex-col rounded-lg border px-2.5 py-3 transition-colors",
                last
                  ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                  : "border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/40",
                s.href && (last ? "hover:border-emerald-300" : "hover:border-navy-200 dark:hover:border-navy-500/40"),
              )}
            >
              <span className="text-[11.5px] font-medium leading-tight text-slate-600 dark:text-slate-300">{s.label}</span>
              <span
                className={cn(
                  "mt-2 text-[24px] font-bold leading-none tabular-nums",
                  last ? "text-emerald-700 dark:text-emerald-300" : "text-navy-950 dark:text-white",
                )}
              >
                {s.value}
              </span>
              <span className="mt-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{s.caption}</span>
            </div>
          );
          return (
            <li key={s.label} className="flex min-w-0 flex-1 items-stretch gap-1">
              {s.href ? (
                <Link href={s.href} scroll={false} className="block min-w-0 flex-1">
                  {box}
                </Link>
              ) : (
                <div className="min-w-0 flex-1">{box}</div>
              )}
              {!last && (
                <span aria-hidden className="flex shrink-0 items-center text-slate-300 dark:text-slate-600">
                  <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {note && (
        <p className="mt-4 flex items-start gap-2 text-[12px] leading-snug text-slate-500 dark:text-slate-400">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{note}</span>
        </p>
      )}
    </>
  );
}

// ── ordered model ────────────────────────────────────────────────────────────

const CHIP = {
  navy: "bg-navy-50 text-navy-700 ring-navy-100 dark:bg-navy-500/15 dark:text-navy-200 dark:ring-navy-500/30",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
  amber: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
  red: "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
} as const;

export type ModelStep = {
  title: string;
  caption: ReactNode;
  chip: string;
  tone?: keyof typeof CHIP;
};

/** A numbered order — precedence, evaluation, escalation — with a chip naming each step's role. */
export function OrderedModel({ steps }: { steps: ModelStep[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li
          key={s.title}
          className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/40"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-[12px] font-bold text-navy-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold text-navy-950 dark:text-slate-100">{s.title}</p>
            <p className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">{s.caption}</p>
          </div>
          <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1", CHIP[s.tone ?? "navy"])}>{s.chip}</span>
        </li>
      ))}
    </ol>
  );
}

// ── bar list ─────────────────────────────────────────────────────────────────

export type Bar = {
  label: string;
  /** 0–100. */
  percent: number;
  /** Shown on the right; defaults to the rounded percentage. */
  display?: string;
  /** Below this the bar turns amber. */
  warnBelow?: number;
  title?: string;
};

export function BarList({ bars }: { bars: Bar[] }) {
  return (
    <ul className="space-y-3.5">
      {bars.map((b) => {
        const pct = Math.max(0, Math.min(100, b.percent));
        const warn = b.warnBelow !== undefined && pct < b.warnBelow;
        return (
          <li key={b.label} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_2.75rem] items-center gap-3" title={b.title}>
            <span className="truncate text-[12.5px] font-medium text-navy-950 dark:text-slate-200">{b.label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <span
                className={cn("block h-full rounded-full", warn ? "bg-gold-500" : "bg-navy-600 dark:bg-navy-400")}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="text-right text-[12px] font-medium text-slate-600 tabular-nums dark:text-slate-300">
              {b.display ?? `${Math.round(pct)}%`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The one-line warning (or reassurance) at the foot of a panel. */
export function PanelCallout({ tone = "warning", children }: { tone?: "warning" | "info"; children: ReactNode }) {
  const Icon = tone === "warning" ? AlertTriangle : Info;
  return (
    <div
      className={cn(
        "mt-auto flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12px] leading-snug",
        tone === "warning"
          ? "border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
          : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300",
      )}
    >
      <Icon className={cn("mt-px h-4 w-4 shrink-0", tone === "warning" ? "text-amber-600 dark:text-amber-400" : "text-slate-400")} />
      <span>{children}</span>
    </div>
  );
}

/** A panel whose records could not be read, or that has none yet. */
export function PanelNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-[12.5px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {children}
    </p>
  );
}
