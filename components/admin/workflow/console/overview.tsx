// The KPI row and the Approval Trend panel of the Workflows & Approvals
// console. Live figures only: when a list cannot be read, the card says so
// instead of showing a number.

import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, Clock3, TriangleAlert, UserRound, Zap } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { approvalTrend, href, type Query, type Row } from "./data";
import { TrendChart } from "./TrendChart";

/** Approved green, light and dark, set once on a wrapper (see TrendChart). */
export const WF_VARS = "[--wf-approved:#16a34a] dark:[--wf-approved:#22a35a]";

function Kpi({
  label,
  value,
  icon,
  tile,
  helper,
  link,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tile: string;
  helper?: ReactNode;
  link: string;
}) {
  return (
    <Link href={link} scroll={false} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500">
      <Card className="flex h-full items-center gap-3 p-3.5 group-hover:border-navy-200 dark:group-hover:border-navy-500/40">
        <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", tile)}>{icon}</span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold leading-tight text-navy-950 dark:text-slate-100">{label}</p>
          <p className="mt-1 text-[28px] font-bold leading-none tracking-tight text-navy-950 tabular-nums dark:text-white">{value}</p>
          {helper && <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{helper}</p>}
        </div>
      </Card>
    </Link>
  );
}

export function WorkflowKpis({ rows, readable, query }: { rows: Row[]; readable: boolean; query: Query }) {
  const open = rows.filter((r) => r.open);
  const mine = open.filter((r) => r.mine);
  const soon = open.filter((r) => r.deadline === "soon");
  const overdue = open.filter((r) => r.deadline === "overdue");
  const escalated = open.filter((r) => r.wf.workflow_status === "ESCALATED");
  const roleRouted = open.filter((r) => r.roleRouted).length;
  const n = (v: number) => (readable ? v.toLocaleString() : "—");
  const yours = (list: Row[]) => list.filter((r) => r.mine).length;
  const keep = { size: query.size };
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        label="My Approvals"
        value={n(mine.length)}
        icon={<UserRound className="h-6 w-6" />}
        tile="bg-navy-50 text-navy-600 dark:bg-navy-500/15 dark:text-navy-300"
        helper={
          !readable
            ? "Workflows could not be read"
            : roleRouted
              ? `${roleRouted} more routed to a role`
              : mine.length
                ? "Waiting on your decision"
                : "Nothing waiting on you"
        }
        link={href(keep, { tab: "mine" })}
      />
      <Kpi
        label="Due Soon"
        value={n(soon.length)}
        icon={<Clock3 className="h-6 w-6" />}
        tile="bg-amber-50 text-amber-500 dark:bg-amber-500/15 dark:text-amber-300"
        helper={readable ? `Within 48 hours · ${yours(soon)} yours` : undefined}
        link={href(keep, { tab: "all", deadline: "soon" })}
      />
      <Kpi
        label="Overdue"
        value={n(overdue.length)}
        icon={<TriangleAlert className="h-6 w-6" />}
        tile="bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
        helper={readable ? `Past deadline · ${yours(overdue)} yours` : undefined}
        link={href(keep, { tab: "all", deadline: "overdue" })}
      />
      <Kpi
        label="Active Workflows"
        value={n(open.length)}
        icon={<Zap className="h-6 w-6" />}
        tile="bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300"
        helper={readable ? `${escalated.length} escalated` : undefined}
        link={href(keep, { tab: "all" })}
      />
    </div>
  );
}

export function ApprovalTrendPanel({ rows, truncated, readable }: { rows: Row[]; truncated: boolean; readable: boolean }) {
  const data = approvalTrend(rows, 30);
  const total = data.reduce((a, p) => a + p.approved, 0);
  return (
    <Card className={cn("p-5", WF_VARS)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-bold tracking-tight text-navy-950 dark:text-slate-100">
            Approval Trend <span className="font-medium text-slate-600 dark:text-slate-300">(Last 30 Days)</span>
          </h2>
          {truncated && (
            <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">Counted from the latest 200 workflows workflow-svc returns.</p>
          )}
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-navy-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <CheckCircle2 className="h-4 w-4 text-[var(--wf-approved)]" />
          Approved: <span className="font-bold tabular-nums">{readable ? total.toLocaleString() : "—"}</span>
        </span>
      </div>
      <div className="mt-3">
        {readable ? (
          total === 0 ? (
            <p className="flex h-44 items-center justify-center rounded-lg border border-dashed border-slate-200 text-[12.5px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No workflow was approved in the last 30 days.
            </p>
          ) : (
            <TrendChart data={data} />
          )
        ) : (
          <p className="flex h-44 items-center justify-center rounded-lg border border-dashed border-slate-200 text-[12.5px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
            The trend needs the workflow list, which could not be read.
          </p>
        )}
      </div>
    </Card>
  );
}
