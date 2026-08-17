import {
  Gavel,
  AlertTriangle,
  ClipboardList,
  ShieldCheck,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui";
import { getDecisionStats } from "@/lib/api/governance";
import { cookies } from "next/headers";
import { getObligationStats } from "@/lib/api/obligations";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Kpi = {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Only set when a real prior-period comparison exists. */
  delta?: {
    text: string;
    direction: "up" | "down" | "flat";
    tone: "positive" | "negative" | "neutral";
  };
  helper: string;
};

const TONE_STYLES = {
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-rose-600 dark:text-rose-400",
  neutral: "text-slate-500 dark:text-slate-400",
} as const;

/**
 * Overview KPIs, all derived from live backend reads.
 *
 * Deliberately NOT shown: "Active Legal Entities" needs a tenant id because
 * tenant-entity-registry-svc has no list-all-entities endpoint, and "Pending
 * Approvals" is impossible today because workflow-svc exposes no list endpoint
 * (GET /v1/workflows returns 405). Both were mock values before — a real number
 * beats an invented one.
 */
export async function KpiCardGrid() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  const identity = {
    principalId: session?.principalId,
    tenantId: session?.tenantId,
    legalEntityId: session?.legalEntityId,
  };

  const [decisions, obligations] = await Promise.all([
    getDecisionStats(),
    getObligationStats(identity),
  ]);

  const kpis: Kpi[] = [
    {
      label: "Governed Decisions",
      value: decisions.ok ? String(decisions.data.total) : "—",
      icon: Gavel,
      helper: decisions.ok ? "recorded in the evidence log" : "governance log unreachable",
    },
    {
      label: "Governance Exceptions",
      value: decisions.ok ? String(decisions.data.exceptions) : "—",
      icon: AlertTriangle,
      delta: decisions.ok ? exceptionDelta(decisions.data.exceptionDelta) : undefined,
      helper: "escalated or denied",
    },
    {
      label: "Open Obligations",
      value: obligations.ok ? String(obligations.data.open) : "—",
      icon: ClipboardList,
      helper: obligations.ok
        ? `${obligations.data.dueWithin7Days} due within 7 days`
        : "obligations service unreachable",
    },
    {
      label: "Obligations On Track",
      value:
        obligations.ok && obligations.data.onTrackPercent !== null
          ? `${obligations.data.onTrackPercent}%`
          : "—",
      icon: ShieldCheck,
      helper: obligations.ok
        ? obligations.data.overdue === 0
          ? "none overdue"
          : `${obligations.data.overdue} overdue`
        : "obligations service unreachable",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi, i) => {
        const DeltaIcon =
          kpi.delta?.direction === "up"
            ? ArrowUpRight
            : kpi.delta?.direction === "down"
              ? ArrowDownRight
              : Minus;
        return (
          <Card
            key={kpi.label}
            className="animate-fade-up p-5 hover:-translate-y-0.5"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {kpi.label}
              </p>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 dark:bg-navy-500/10">
                <kpi.icon className="h-4.5 w-4.5 text-navy-700 dark:text-navy-300" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {kpi.value}
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-medium">
              {kpi.delta && (
                <span className={cn("flex items-center gap-1", TONE_STYLES[kpi.delta.tone])}>
                  <DeltaIcon className="h-3.5 w-3.5" />
                  {kpi.delta.text}
                </span>
              )}
              <span className="font-normal text-slate-400 dark:text-slate-500">{kpi.helper}</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/** Fewer exceptions week-on-week is good news, so a negative delta reads positive. */
function exceptionDelta(delta: number): Kpi["delta"] {
  if (delta === 0) return { text: "no change", direction: "flat", tone: "neutral" };
  return {
    text: `${delta > 0 ? "+" : ""}${delta} vs. prior week`,
    direction: delta > 0 ? "up" : "down",
    tone: delta > 0 ? "negative" : "positive",
  };
}
