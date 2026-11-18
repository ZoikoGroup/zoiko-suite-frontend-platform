// The KPI row and the three analytic panels of Policies & Controls, all
// derived from policy-svc's registers (see model.ts). A figure that could
// not be read says so; it is never shown as zero.

import Link from "next/link";
import Form from "next/form";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Clock3, FileText, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui";
import { FilterSelect } from "@/components/admin/console/FilterSelect";
import { cn } from "@/lib/utils";
import {
  DOMAIN_ORDER,
  DOMAIN_SHORT,
  DOMAIN_LABEL,
  STATUS_LABEL,
  STATUS_ORDER,
  delta,
  pct,
  reviewMonths,
  snapshotAt,
  weekPoints,
  type EffKey,
  type Model,
  type StatusKey,
} from "./model";
import { BASE, href, monthsOf, type Console, type Query } from "./data";
import { C, PC_VARS, REVIEW_SERIES } from "./palette";
import { ReviewsChart } from "./ReviewsChart";

const DAY = 86_400_000;

/** A curve through the points: each segment bends through the midpoint. */
function curve(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C${mx.toFixed(1)},${y0.toFixed(1)} ${mx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

/** The card's trend: a filled area that fades downward, as in the v2.0 mock. */
function Sparkline({ id, values, color: wanted }: { id: string; values: number[]; color: string }) {
  // A series that never left zero is drawn grey: a red line under "0 issues" would read as an alarm.
  const color = values.some((v) => v > 0) ? wanted : C.grey;
  const w = 120;
  const h = 36;
  const max = Math.max(1, ...values);
  const min = Math.min(...values, max * 0.5);
  const span = Math.max(1, max - min);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [i * step, h - 3 - ((v - min) / span) * (h - 10)] as [number, number]);
  const line = curve(pts);
  const fill = `pc-spark-${id}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-9 w-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {line && <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${fill})`} stroke="none" />}
      {line && <path d={line} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

/** A small ring for the compliance rate, as on the mock's third card. */
function Ring({ percent, label }: { percent: number | null; label: string }) {
  const r = 15.9155;
  return (
    <svg viewBox="0 0 42 42" className="h-14 w-14 shrink-0" role="img" aria-label={label}>
      <circle cx="21" cy="21" r={r} fill="none" strokeWidth="5" className="stroke-slate-100 dark:stroke-slate-800" />
      {percent !== null && percent > 0 && (
        <circle cx="21" cy="21" r={r} fill="none" strokeWidth="5" stroke={C.green} strokeDasharray={`${percent} ${100 - percent}`} strokeDashoffset="25" strokeLinecap="round" />
      )}
      <text x="21" y="23.5" textAnchor="middle" className="fill-navy-950 text-[8px] font-bold dark:fill-white">
        {percent === null ? "—" : `${percent}%`}
      </text>
    </svg>
  );
}

function Kpi({
  label,
  value,
  icon,
  tile,
  change,
  goodWhen = "up",
  helper,
  hint,
  aside,
  ring,
  link,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tile: string;
  /** Signed % against 30 days ago; null when there was nothing 30 days ago. */
  change?: number | null;
  /** Whether a rise is good news (policies) or bad (issues). */
  goodWhen?: "up" | "down";
  helper: ReactNode;
  hint?: string;
  aside?: ReactNode;
  /** A ring beside the text (the compliance card): the text keeps clear of it. */
  ring?: ReactNode;
  link: string;
}) {
  const up = change !== undefined && change !== null && change > 0;
  const down = change !== undefined && change !== null && change < 0;
  const good = (up && goodWhen === "up") || (down && goodWhen === "down");
  const bad = (up && goodWhen === "down") || (down && goodWhen === "up");
  return (
    <Link href={link} scroll={false} title={hint} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500">
      <Card className="relative h-full overflow-hidden p-3.5 group-hover:border-navy-200 2xl:p-4 dark:group-hover:border-navy-500/40">
        {/* The trend sits level with the figure, so it never runs through the
            change or helper line (as on the Governance Log cards). */}
        {aside && <div className="pointer-events-none absolute right-3 top-9 w-[36%] max-w-36 xl:hidden 2xl:block">{aside}</div>}
        <div className="relative flex items-start gap-2.5 2xl:gap-3">
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl xl:h-9 xl:w-9 2xl:h-11 2xl:w-11", tile)}>{icon}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-navy-950 dark:text-slate-100">{label}</p>
            <p className="mt-1 text-[28px] font-bold leading-none tracking-tight text-navy-950 tabular-nums dark:text-white">{value}</p>
            {ring && <div className="absolute right-0 top-4 xl:hidden 2xl:block">{ring}</div>}
            {change !== undefined && (
              <p
                className={cn(
                  "mt-2.5 flex items-center gap-1 text-[12px] font-semibold tabular-nums",
                  good ? "text-emerald-700 dark:text-emerald-400" : bad ? "text-rose-700 dark:text-rose-400" : "text-slate-500 dark:text-slate-400",
                )}
              >
                {up && <ArrowUp className="h-3.5 w-3.5" aria-label="up" />}
                {down && <ArrowDown className="h-3.5 w-3.5" aria-label="down" />}
                {change === null ? "New this period" : `${change > 0 ? "+" : ""}${change}%`}
              </p>
            )}
            <p className={cn("text-[11.5px] leading-snug text-slate-500 dark:text-slate-400", change === undefined ? "mt-2.5" : "mt-0.5", ring && "2xl:pr-14")}>{helper}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function UnreadKpi({ label, icon, tile, why }: { label: string; icon: ReactNode; tile: string; why: string }) {
  return (
    <Card className="h-full p-3.5 2xl:p-4">
      <div className="flex items-start gap-2.5 2xl:gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl xl:h-9 xl:w-9 2xl:h-11 2xl:w-11", tile)}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-navy-950 dark:text-slate-100">{label}</p>
          <p className="mt-1 text-[28px] font-bold leading-none text-slate-400">—</p>
          <p className="mt-2.5 text-[11.5px] leading-snug text-slate-500 dark:text-slate-400">{why}</p>
        </div>
      </div>
    </Card>
  );
}

const TILE = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  red: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
};

export function PolicyKpis({ data }: { data: Console }) {
  const { model, summary } = data;
  const now = data.asOf;
  const points = weekPoints(now);
  const snaps = points.map((p) => snapshotAt(model, p));
  const cur = snapshotAt(model, now);
  const before = snapshotAt(model, now - 30 * DAY);
  const series = (k: keyof typeof cur) => snaps.map((s) => s[k]);
  const policiesRead = data.families.data !== null && data.versions.data !== null;
  const controlsRead = data.controls.data !== null;
  const unread = (what: string) => `${what} could not be read`;
  const suspensions = summary.data?.suspensions_awaiting_review ?? 0;
  const rate = cur.controls > 0 ? pct(cur.compliant, cur.controls) : null;
  const tested = model.controls.filter((r) => r.eff !== "untested").length;

  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5", PC_VARS)}>
      {policiesRead ? (
        <Kpi
          label="Total Policies"
          value={cur.policies.toLocaleString()}
          icon={<FileText className="h-5 w-5" />}
          tile={TILE.blue}
          change={delta(cur.policies, before.policies)}
          helper="vs. last 30 days"
          hint="Policy families visible to your organisation: its own and the platform's."
          aside={<Sparkline id="policies" values={series("policies")} color={C.navy} />}
          link={href({}, { type: "policy" })}
        />
      ) : (
        <UnreadKpi label="Total Policies" icon={<FileText className="h-5 w-5" />} tile={TILE.blue} why={unread("The policy register")} />
      )}
      {controlsRead ? (
        <Kpi
          label="Total Controls"
          value={cur.controls.toLocaleString()}
          icon={<ShieldCheck className="h-5 w-5" />}
          tile={TILE.amber}
          change={delta(cur.controls, before.controls)}
          helper="vs. last 30 days"
          hint="Control-test definitions: a control with a defined test methodology."
          aside={<Sparkline id="controls" values={series("controls")} color={C.green} />}
          link={href({}, { type: "control" })}
        />
      ) : (
        <UnreadKpi label="Total Controls" icon={<ShieldCheck className="h-5 w-5" />} tile={TILE.amber} why={unread("The control register")} />
      )}
      {controlsRead ? (
        <Kpi
          label="Compliant Controls"
          value={cur.compliant.toLocaleString()}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tile={TILE.green}
          helper={rate === null ? "none defined yet" : `${rate}% compliance rate`}
          hint={`Controls whose latest test result is EFFECTIVE. ${tested} of ${cur.controls} have been tested.`}
          ring={<Ring percent={rate} label={rate === null ? "No compliance rate" : `${rate}% of controls effective`} />}
          link={href({}, { type: "control", eff: "effective" })}
        />
      ) : (
        <UnreadKpi label="Compliant Controls" icon={<CheckCircle2 className="h-5 w-5" />} tile={TILE.green} why={unread("The control register")} />
      )}
      {controlsRead ? (
        <Kpi
          label="Control Issues"
          value={cur.issues.toLocaleString()}
          icon={<AlertTriangle className="h-5 w-5" />}
          tile={TILE.red}
          change={delta(cur.issues, before.issues)}
          goodWhen="down"
          helper="vs. last 30 days"
          hint="Controls whose latest test found them partially effective or ineffective."
          aside={<Sparkline id="issues" values={series("issues")} color={C.red} />}
          link={href({}, { eff: "issues" })}
        />
      ) : (
        <UnreadKpi label="Control Issues" icon={<AlertTriangle className="h-5 w-5" />} tile={TILE.red} why={unread("The control register")} />
      )}
      {policiesRead && controlsRead ? (
        <Kpi
          label="Review Overdue"
          value={cur.overdue.toLocaleString()}
          icon={<Clock3 className="h-5 w-5" />}
          tile={TILE.amber}
          change={delta(cur.overdue, before.overdue)}
          goodWhen="down"
          helper={suspensions > 0 ? `+ ${suspensions} suspension${suspensions === 1 ? "" : "s"} awaiting review` : "vs. last 30 days"}
          hint="Controls past their next test date, and policies whose version in force has passed its end date."
          aside={<Sparkline id="overdue" values={series("overdue")} color={C.amber} />}
          link={href({}, { due: "overdue" })}
        />
      ) : (
        <UnreadKpi label="Review Overdue" icon={<Clock3 className="h-5 w-5" />} tile={TILE.amber} why={unread("A register")} />
      )}
    </div>
  );
}

// ── panels ───────────────────────────────────────────────────────────────────

function Panel({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("flex min-w-0 flex-col p-5", className)}>
      <div className="flex min-h-9 items-start justify-between gap-3">
        <h2 className="pt-1.5 text-[15px] font-semibold tracking-tight text-navy-950 dark:text-slate-100">{title}</h2>
        {action}
      </div>
      <div className="mt-3 flex min-w-0 flex-1 flex-col">{children}</div>
    </Card>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-[12.5px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
      <div>{children}</div>
    </div>
  );
}

function LegendDot({ color, children }: { color: string; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {children}
    </li>
  );
}

const EFF_SEGMENTS: { key: EffKey; label: string; color: string }[] = [
  { key: "effective", label: "Effective", color: C.green },
  { key: "partial", label: "Partially Effective", color: C.amber },
  { key: "ineffective", label: "Ineffective", color: C.red },
  { key: "untested", label: "Not Tested", color: C.grey },
];

/** Stacked 100% columns per domain: the share of its controls in each state. */
function EffectivenessByDomain({ model }: { model: Model }) {
  const domains = DOMAIN_ORDER.filter((d) => model.controls.some((r) => r.domain === d));
  const untested = model.controls.some((r) => r.eff === "untested");
  const segments = EFF_SEGMENTS.filter((s) => s.key !== "untested" || untested);
  return (
    <>
      <div className="flex min-h-48 flex-1 gap-2">
        <div className="flex w-6 flex-col justify-between text-right text-[10.5px] tabular-nums text-slate-500 dark:text-slate-400" aria-hidden>
          {[100, 75, 50, 25, 0].map((n) => (
            <span key={n} className="leading-none">
              {n}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 justify-around gap-1.5 border-b border-slate-200 dark:border-slate-700">
          {domains.map((d) => {
            const rows = model.controls.filter((r) => r.domain === d);
            const count = (k: EffKey) => rows.filter((r) => r.eff === k).length;
            return (
              <Link
                key={d}
                href={href({}, { type: "control", domain: d })}
                scroll={false}
                title={`${DOMAIN_LABEL[d]}: ${segments.map((s) => `${s.label} ${count(s.key)}`).join(", ")}`}
                className="group flex min-w-0 max-w-14 flex-1 flex-col"
              >
                <span className="relative flex flex-1 flex-col-reverse overflow-hidden">
                  {segments.map((s) => {
                    const share = (count(s.key) / rows.length) * 100;
                    return share > 0 ? <span key={s.key} style={{ height: `${share}%`, background: s.color }} className="mx-auto w-[70%] group-hover:opacity-85" /> : null;
                  })}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
      <div className="ml-8 flex justify-around gap-1.5" aria-hidden>
        {domains.map((d) => (
          <span key={d} className="min-w-0 max-w-14 flex-1 pt-1.5 text-center text-[10px] leading-tight text-slate-500 dark:text-slate-400">
            {DOMAIN_SHORT[d][0]}
            {DOMAIN_SHORT[d][1] && <span className="block">{DOMAIN_SHORT[d][1]}</span>}
          </span>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11.5px] text-slate-600 dark:text-slate-300">
        {segments.map((s) => (
          <LegendDot key={s.key} color={s.color}>
            {s.label}
          </LegendDot>
        ))}
      </ul>
    </>
  );
}

const STATUS_COLOR: Record<StatusKey, string> = {
  active: C.green,
  review: C.amber,
  draft: C.blue,
  suspended: C.red,
  retired: C.grey,
};

/** Donut of the policies by derived status, with a labelled legend. */
function PoliciesByStatus({ model }: { model: Model }) {
  const total = model.policies.length;
  const count = (k: StatusKey) => model.policies.filter((r) => r.status === k).length;
  const keys = STATUS_ORDER.filter((k) => k !== "suspended" && k !== "retired" ? true : count(k) > 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  const gap = total > 1 ? 2 : 0;
  const lens = keys.map((k) => (total ? (count(k) / total) * c : 0));
  return (
    <div className="flex flex-1 flex-col items-center gap-4 sm:flex-row">
      <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0 -rotate-90 2xl:h-28 2xl:w-28" role="img" aria-label="Policies by status">
        <circle cx="70" cy="70" r={r} fill="none" strokeWidth="18" className="stroke-slate-100 dark:stroke-slate-800" />
        {keys.map((k, i) =>
          lens[i] > 0 ? (
            <circle
              key={k}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={STATUS_COLOR[k]}
              strokeWidth="18"
              strokeDasharray={`${Math.max(0.5, lens[i] - gap)} ${c}`}
              strokeDashoffset={-lens.slice(0, i).reduce((a, b) => a + b, 0)}
            >
              <title>{`${STATUS_LABEL[k]}: ${count(k)}`}</title>
            </circle>
          ) : null,
        )}
        <g className="rotate-90" style={{ transformOrigin: "70px 70px" }}>
          <text x="70" y="70" textAnchor="middle" className="fill-navy-950 text-[24px] font-bold dark:fill-white">
            {total.toLocaleString()}
          </text>
          <text x="70" y="88" textAnchor="middle" className="fill-slate-500 text-[11px] dark:fill-slate-400">
            Policies
          </text>
        </g>
      </svg>
      <ul className="w-full space-y-2">
        {keys.map((k) => (
          <li key={k}>
            <Link
              href={href({}, { type: "policy", status: k })}
              scroll={false}
              className="grid grid-cols-[minmax(0,1fr)_1.6rem_2.5rem] items-center gap-1.5 rounded-md px-1 py-0.5 text-[11.5px] hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <span className="flex min-w-0 items-center gap-2 whitespace-nowrap text-navy-950 dark:text-slate-200">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[k] }} />
                {STATUS_LABEL[k]}
              </span>
              <span className="text-right font-semibold tabular-nums text-navy-950 dark:text-slate-100">{count(k).toLocaleString()}</span>
              <span className="text-right tabular-nums text-slate-500 dark:text-slate-400">({pct(count(k), total)}%)</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The Control Reviews window selector: a GET form that keeps every other parameter. */
function MonthsSelect({ query }: { query: Query }) {
  return (
    <Form action={BASE} scroll={false}>
      {Object.entries(query).map(([k, v]) => (k !== "months" && v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <FilterSelect
        name="months"
        aria-label="Review window"
        defaultValue={String(monthsOf(query))}
        options={[
          ["12", "Last 12 months"],
          ["6", "Last 6 months"],
        ]}
        className="min-w-36"
      />
    </Form>
  );
}

export function PolicyPanels({ data, query }: { data: Console; query: Query }) {
  const { model } = data;
  const months = reviewMonths(model, monthsOf(query), data.asOf);
  const noControls = data.controls.data !== null && model.controls.length === 0;
  const defineControl = (
    <Link href={href(query, { new: "control" })} scroll={false} className="mt-1 inline-block font-semibold text-navy-600 hover:underline dark:text-navy-300">
      Define a control test
    </Link>
  );
  return (
    <div className={cn("grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-[1.15fr_1fr_1.1fr]", PC_VARS)}>
      <Panel
        title="Control Effectiveness by Domain"
        action={
          <Link href={href({}, { type: "control" })} scroll={false} className="whitespace-nowrap pt-1.5 text-[12px] font-semibold text-navy-600 hover:text-navy-800 dark:text-navy-300">
            All controls →
          </Link>
        }
      >
        {data.controls.data === null ? (
          <Empty>The control register could not be read.</Empty>
        ) : noControls ? (
          <Empty>
            No control test is defined yet, so no control effectiveness can be shown.
            <br />
            {defineControl}
          </Empty>
        ) : (
          <EffectivenessByDomain model={model} />
        )}
      </Panel>
      <Panel title="Policies by Status">
        {data.families.data === null || data.versions.data === null ? (
          <Empty>The policy register could not be read.</Empty>
        ) : model.policies.length === 0 ? (
          <Empty>No policy is visible to your organisation yet.</Empty>
        ) : (
          <PoliciesByStatus model={model} />
        )}
      </Panel>
      <Panel title="Control Reviews" action={<MonthsSelect query={query} />} className="lg:col-span-2 2xl:col-span-1">
        {data.controls.data === null ? (
          <Empty>The control register could not be read.</Empty>
        ) : noControls ? (
          <Empty>
            Reviews are recorded as control test runs. None can exist until a control test is defined.
            <br />
            {defineControl}
          </Empty>
        ) : (
          <>
            <ReviewsChart data={months.map(({ label, completed, inProgress, overdue }) => ({ label, completed, inProgress, overdue }))} />
            <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11.5px] text-slate-600 dark:text-slate-300">
              {REVIEW_SERIES.map((s) => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <svg width="16" height="8" aria-hidden>
                    <line x1="1.5" y1="4" x2="14.5" y2="4" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash} strokeLinecap="round" />
                  </svg>
                  {s.label}
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}
