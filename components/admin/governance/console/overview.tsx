// The KPI row and the three analytic panels of the Governance Log, drawn from
// GET /v1/decisions/summary. Live figures only: when the summary cannot be
// read, each says so instead of showing a number.

import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Clock3, FileText, MinusCircle } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { DecisionSummary } from "@/lib/api/governance";
import { href, type Query } from "./data";
import { STATUS_COLOR, STATUS_DASH, STATUS_LABEL, STATUS_ORDER, STATUS_VARS, type StatusKey } from "./palette";
import { TrendChart, type TrendRow } from "./TrendChart";

const CATEGORY: Record<StatusKey, string> = {
  approved: "APPROVED",
  pending: "PENDING",
  escalated: "ESCALATED",
  denied: "DENIED",
};

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** Change against the previous window, as a signed whole percentage. */
function delta(now: number, before: number): number | null {
  if (before === 0) return now === 0 ? 0 : null;
  return Math.round(((now - before) / before) * 100);
}

/** The card's trend: a filled area that fades downward, as in the v2.0 mock. */
function Sparkline({ id, values, color, dash }: { id: string; values: number[]; color: string; dash?: string }) {
  const w = 120;
  const h = 44;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 8)).toFixed(1)}`).join(" ");
  const fill = `gd-spark-${id}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-11 w-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${fill})`} stroke="none" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.75} strokeDasharray={dash} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Kpi({
  label,
  value,
  icon,
  tile,
  change,
  helper,
  spark,
  link,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tile: string;
  change: number | null;
  helper: string;
  spark?: ReactNode;
  link: string;
}) {
  const up = change !== null && change > 0;
  const down = change !== null && change < 0;
  return (
    <Link href={link} scroll={false} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500">
      {/* v2.0 mock: icon tile; label, figure, change and helper stacked in
          one column; the trend area fills the card's lower right. */}
      <Card className="relative h-full overflow-hidden p-4 group-hover:border-navy-200 dark:group-hover:border-navy-500/40">
        <div className="relative z-10 flex items-start gap-3">
          <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", tile)}>{icon}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-navy-950 dark:text-slate-100">{label}</p>
            <p className="mt-1 text-[28px] font-bold leading-none tracking-tight text-navy-950 tabular-nums dark:text-white">{value}</p>
            <p
              className={cn(
                "mt-2 flex items-center gap-1 text-[12px] font-semibold tabular-nums",
                up ? "text-emerald-700 dark:text-emerald-400" : down ? "text-rose-700 dark:text-rose-400" : "text-slate-500 dark:text-slate-400",
              )}
            >
              {up && <ArrowUp className="h-3.5 w-3.5" aria-label="up" />}
              {down && <ArrowDown className="h-3.5 w-3.5" aria-label="down" />}
              {change === null ? "New this period" : `${change > 0 ? "+" : ""}${change}%`}
            </p>
            <p className="max-w-[62%] text-[11.5px] leading-snug text-slate-500 dark:text-slate-400">{helper}</p>
          </div>
        </div>
        {spark && <div className="pointer-events-none absolute bottom-3 right-3 w-[46%]">{spark}</div>}
      </Card>
    </Link>
  );
}

export function GovernanceKpis({ summary, days, query }: { summary: DecisionSummary; days: number; query: Query }) {
  const t = summary.totals;
  const p = summary.previous_totals;
  const series = (k: StatusKey | "total") => summary.trend.map((d) => (k === "total" ? d.total : d[k]));
  const to = (status?: string) => href({ days: query.days }, { tab: "decisions", status });
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5", STATUS_VARS)}>
      <Kpi
        label="Total Decisions"
        value={t.total.toLocaleString()}
        icon={<FileText className="h-5 w-5" />}
        tile="bg-navy-50 text-navy-600 dark:bg-navy-500/15 dark:text-navy-300"
        change={delta(t.total, p.total)}
        helper={`vs. previous ${days} days`}
        spark={<Sparkline id="total" values={series("total")} color="var(--color-navy-600)" />}
        link={to()}
      />
      <Kpi
        label="Approved"
        value={t.approved.toLocaleString()}
        icon={<CheckCircle2 className="h-5 w-5" />}
        tile="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
        change={delta(t.approved, p.approved)}
        helper={`${pct(t.approved, t.total)}% of total`}
        spark={<Sparkline id="approved" values={series("approved")} color={STATUS_COLOR.approved} />}
        link={to("APPROVED")}
      />
      <Kpi
        label="Pending"
        value={t.pending.toLocaleString()}
        icon={<Clock3 className="h-5 w-5" />}
        tile="bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
        change={delta(t.pending, p.pending)}
        helper={`${pct(t.pending, t.total)}% of total · ${summary.open_pending} open`}
        spark={<Sparkline id="pending" values={series("pending")} color={STATUS_COLOR.pending} dash={STATUS_DASH.pending} />}
        link={to("PENDING")}
      />
      <Kpi
        label="Escalated"
        value={t.escalated.toLocaleString()}
        icon={<AlertTriangle className="h-5 w-5" />}
        tile="bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
        change={delta(t.escalated, p.escalated)}
        helper={`${pct(t.escalated, t.total)}% of total · ${summary.open_escalated} open`}
        spark={<Sparkline id="escalated" values={series("escalated")} color={STATUS_COLOR.escalated} />}
        link={to("ESCALATED")}
      />
      <Kpi
        label="Denied"
        value={t.denied.toLocaleString()}
        icon={<MinusCircle className="h-5 w-5" />}
        tile="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
        change={delta(t.denied, p.denied)}
        helper={`${pct(t.denied, t.total)}% of total`}
        spark={<Sparkline id="denied" values={series("denied")} color={STATUS_COLOR.denied} dash={STATUS_DASH.denied} />}
        link={to("DENIED")}
      />
    </div>
  );
}

function Panel({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("flex min-w-0 flex-col p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-navy-950 dark:text-slate-100">{title}</h2>
        {action}
      </div>
      <div className="mt-4 flex min-w-0 flex-1 flex-col">{children}</div>
    </Card>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-[12.5px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {children}
    </p>
  );
}

/** Donut of the window's decisions by status, with a labelled legend. */
function StatusDonut({ summary, query }: { summary: DecisionSummary; query: Query }) {
  const t = summary.totals;
  const r = 52;
  const c = 2 * Math.PI * r;
  const gap = t.total > 1 ? 2 : 0;
  const lens = STATUS_ORDER.map((k) => (t.total ? (t[k] / t.total) * c : 0));
  const arcs = STATUS_ORDER.map((k, i) => ({ k, len: lens[i], offset: lens.slice(0, i).reduce((a, b) => a + b, 0) }));
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-label="Decisions by status">
        <circle cx="70" cy="70" r={r} fill="none" strokeWidth="18" className="stroke-slate-100 dark:stroke-slate-800" />
        {arcs.map((a) =>
          a.len > 0 ? (
            <circle
              key={a.k}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={STATUS_COLOR[a.k]}
              strokeWidth="18"
              strokeDasharray={`${Math.max(0, a.len - gap)} ${c}`}
              strokeDashoffset={-a.offset}
            >
              <title>{`${STATUS_LABEL[a.k]}: ${t[a.k]}`}</title>
            </circle>
          ) : null,
        )}
        <g className="rotate-90" style={{ transformOrigin: "70px 70px" }}>
          <text x="70" y="68" textAnchor="middle" className="fill-navy-950 text-[22px] font-bold dark:fill-white">
            {t.total.toLocaleString()}
          </text>
          <text x="70" y="86" textAnchor="middle" className="fill-slate-500 text-[11px] dark:fill-slate-400">
            Total
          </text>
        </g>
      </svg>
      <ul className="w-full space-y-2.5">
        {STATUS_ORDER.map((k) => (
          <li key={k}>
            <Link
              href={href({ days: query.days }, { tab: "decisions", status: CATEGORY[k] })}
              scroll={false}
              className="grid grid-cols-[1fr_auto_3.2rem] items-center gap-3 rounded-md px-1 py-0.5 text-[12.5px] hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <span className="flex items-center gap-2 text-navy-950 dark:text-slate-200">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[k] }} />
                {STATUS_LABEL[k]}
              </span>
              <span className="font-semibold tabular-nums text-navy-950 dark:text-slate-100">{t[k].toLocaleString()}</span>
              <span className="text-right tabular-nums text-slate-500 dark:text-slate-400">({pct(t[k], t.total)}%)</span>
            </Link>
          </li>
        ))}
        {t.other > 0 && (
          <li className="px-1 text-[11.5px] text-slate-500 dark:text-slate-400">
            {t.other} with an outcome no status category lists — filter by Other to see them.
          </li>
        )}
      </ul>
    </div>
  );
}

/** Bar shade by rank, darkest for the busiest domain (the v2.0 mock). One hue:
 *  the bars are one measure, so the shade only reinforces the order. */
const DOMAIN_SHADE = ["bg-navy-800 dark:bg-navy-300", "bg-navy-700 dark:bg-navy-400", "bg-navy-600 dark:bg-navy-400", "bg-blue-500 dark:bg-blue-400", "bg-blue-400 dark:bg-blue-500"];

function DomainBars({ summary, query }: { summary: DecisionSummary; query: Query }) {
  const max = Math.max(1, ...summary.by_domain.map((d) => d.count));
  return (
    <ul className="space-y-2.5">
      {summary.by_domain.map((d, i) => (
        <li key={d.key}>
          <Link
            href={href({ days: query.days }, { tab: "decisions", domain: d.key })}
            scroll={false}
            title={`${d.label}: ${d.count}`}
            className="grid grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)_2.5rem] items-center gap-3 rounded-md px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          >
            <span className="truncate text-[12.5px] text-navy-950 dark:text-slate-200">{d.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <span className={cn("block h-full rounded-full", DOMAIN_SHADE[Math.min(i, DOMAIN_SHADE.length - 1)])} style={{ width: `${(d.count / max) * 100}%` }} />
            </span>
            <span className="text-right text-[12px] font-semibold tabular-nums text-navy-950 dark:text-slate-100">{d.count}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function trendRows(summary: DecisionSummary): TrendRow[] {
  return summary.trend.map((p) => ({
    date: p.date,
    label: new Date(p.date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
    approved: p.approved,
    pending: p.pending,
    escalated: p.escalated,
    denied: p.denied,
  }));
}

export function GovernancePanels({
  summary,
  periodControl,
  query,
}: {
  summary: DecisionSummary;
  periodControl: ReactNode;
  query: Query;
}) {
  const empty = summary.totals.total === 0;
  return (
    <div className={cn("grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3", STATUS_VARS)}>
      <Panel title="Decisions by Status">
        {empty ? <Empty>No decision was made in this period.</Empty> : <StatusDonut summary={summary} query={query} />}
      </Panel>
      <Panel title="Decisions by Domain">
        {empty ? <Empty>No decision was made in this period.</Empty> : <DomainBars summary={summary} query={query} />}
      </Panel>
      <Panel title="Trend Over Time" action={periodControl} className="lg:col-span-2 2xl:col-span-1">
        <TrendChart data={trendRows(summary)} />
        <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12px] text-slate-600 dark:text-slate-300">
          {STATUS_ORDER.map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[k] }} aria-hidden />
              <svg width="14" height="6" aria-hidden>
                <line x1="1" y1="3" x2="13" y2="3" stroke={STATUS_COLOR[k]} strokeWidth="2" strokeDasharray={STATUS_DASH[k]} strokeLinecap="round" />
              </svg>
              {STATUS_LABEL[k]}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
