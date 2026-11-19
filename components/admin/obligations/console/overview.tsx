import type { ObligationSummary } from "@/lib/api/obligations";
import { formatNumber } from "@/lib/format";
import { KpiCard } from "@/components/admin/console";
import { FileText, Clock, AlertTriangle, FileCheck2, Search, GitBranch } from "lucide-react";

/** KPI cards from the summary route. */
export function ObligationsKpis({ summary }: { summary: ObligationSummary | null }) {
  if (!summary) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <KpiCard
        label="Open"
        value={formatNumber(summary.open)}
        icon={FileText}
        tone="navy"
        status="Active obligations not yet closed"
      />
      <KpiCard
        label="Due Soon (7d)"
        value={formatNumber(summary.due_soon)}
        icon={Clock}
        tone="amber"
        status="Clocks entering DUE_SOON window"
      />
      <KpiCard
        label="Overdue"
        value={formatNumber(summary.overdue)}
        icon={AlertTriangle}
        tone="red"
        status="Clocks past computed_deadline without satisfaction"
      />
      <KpiCard
        label="Filings Pending"
        value={formatNumber(summary.filing_pending)}
        icon={FileCheck2}
        tone="navy"
        status="Filing requirements in PENDING or IN_PREPARATION"
      />
      <KpiCard
        label="Unassessed Applicability"
        value={formatNumber(summary.unassessed_applicability)}
        icon={Search}
        tone="amber"
        status="Obligations with no applicability decision recorded"
      />
      <KpiCard
        label="Escalation Steps Due"
        value={formatNumber(summary.escalation_ladder?.reduce((sum, s) => sum + s.overdue_count, 0) ?? 0)}
        icon={GitBranch}
        tone="red"
        status="Overdue clocks with pending escalation actions"
      />
    </div>
  );
}

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui";
import { Chip } from "@/components/admin/authorization/console/register";

/** Panels showing obligation breakdowns. */
export function ObligationsPanels({ summary }: { summary: ObligationSummary | null }) {
  if (!summary) return null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
          <CardDescription>Clocks by state</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(summary.clock_pipeline || {}).map(([state, count]) => (
            <div key={state} className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">{state.replace(/_/g, " ")}</span>
              <Chip label={formatNumber(count)} tone={count > 0 ? "info" : "neutral"} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Escalation Ladder</CardTitle>
          <CardDescription>Pending escalation actions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(summary.escalation_ladder || []).map((step) => (
            <div key={step.step} className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">
                Step {step.step}: {step.role} ({step.overdue_count})
              </span>
              <Chip label={formatNumber(step.overdue_count)} tone={step.overdue_count > 0 ? "danger" : "neutral"} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By Jurisdiction / Clock Class</CardTitle>
          <CardDescription>Top jurisdictions and clock classes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Jurisdictions</p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(summary.obligations_by_jurisdiction || {}).slice(0, 5).map(([jur, count]) => (
                <Chip key={jur} label={`${jur}: ${formatNumber(count)}`} tone="neutral" />
              ))}
            </div>
          </div>
          <div className="mt-3">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Clock Classes</p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(summary.obligations_by_clock_class || {}).map(([cls, count]) => (
                <Chip key={cls} label={`${cls}: ${formatNumber(count)}`} tone="neutral" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}