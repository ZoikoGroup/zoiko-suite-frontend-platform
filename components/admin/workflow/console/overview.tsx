import type { WorkflowInstance } from "@/lib/api/workflow";
import { formatNumber } from "@/lib/format";
import { KpiCard } from "@/components/admin/console";

/** KPI cards from the pending/instances data. */
export function WorkflowKpis({ pending, instances }: { pending: WorkflowInstance[]; instances: WorkflowInstance[] }) {
  const pendingCount = pending.length;
  const escalatedCount = pending.filter((w) => w.workflow_status === "ESCALATED").length;
  const myPendingCount = 0; // would need principal filter
  const expiringCount = pending.filter((w) => w.due_at && new Date(w.due_at).getTime() - Date.now() < 24 * 60 * 60 * 1000).length;
  const activeDefinitions = 0; // would need separate fetch

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <KpiCard
        label="Pending My Approval"
        value={formatNumber(myPendingCount)}
        tone="info"
        detail="Workflows awaiting my decision"
      />
      <KpiCard
        label="Active Instances"
        value={formatNumber(instances.length)}
        tone="info"
        detail="All non-terminal workflows in tenant"
      />
      <KpiCard
        label="Escalated"
        value={formatNumber(escalatedCount)}
        tone="warning"
        detail="Escalated to a named owner"
      />
      <KpiCard
        label="Expiring in 24h"
        value={formatNumber(expiringCount)}
        tone="danger"
        detail="Past deadline, not yet escalated"
      />
      <KpiCard
        label="Active Definitions"
        value={formatNumber(activeDefinitions)}
        tone="neutral"
        detail="Workflow definitions marked active"
      />
      <KpiCard
        label="Pipeline Velocity"
        value={formatNumber(0)}
        tone="info"
        detail="Avg time to decision (placeholder)"
      />
    </div>
  );
}

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui";
import { Chip } from "@/components/admin/authorization/console/register";

/** Panels showing workflow breakdowns. */
export function WorkflowPanels({ pending, instances }: { pending: WorkflowInstance[]; instances: WorkflowInstance[] }) {
  const byStatus = (arr: WorkflowInstance[]) => {
    const counts: Record<string, number> = {};
    for (const w of arr) {
      counts[w.workflow_status] = (counts[w.workflow_status] || 0) + 1;
    }
    return counts;
  };

  const pendingByStatus = byStatus(pending);
  const instanceByStatus = byStatus(instances);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
          <CardDescription>Pending workflows by status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {["PENDING", "ESCALATED", "APPROVED", "REJECTED", "CANCELLED", "INVALIDATED", "EXPIRED"].map((status) => (
            <div key={status} className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">{status}</span>
              <Chip label={formatNumber(pendingByStatus[status] || 0)} tone={status === "ESCALATED" ? "warning" : status === "PENDING" ? "info" : status === "APPROVED" ? "success" : "neutral"} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stages of Selected Definition</CardTitle>
          <CardDescription>Approver rule chips (placeholder)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-1">
            <Chip label="Stage 1: Alice (Finance)" tone="info" size="sm" />
            <Chip label="Stage 2: Bob (Legal)" tone="info" size="sm" />
            <Chip label="Stage 3: Carol (Compliance)" tone="info" size="sm" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Instances by Type</CardTitle>
          <CardDescription>Workflow types in tenant</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-1">
            <Chip label="PURCHASE_APPROVAL: 12" tone="neutral" size="sm" />
            <Chip label="INVOICE_APPROVAL: 8" tone="neutral" size="sm" />
            <Chip label="EXPENSE_REVIEW: 5" tone="neutral" size="sm" />
            <Chip label="QUORUM_TEST: 3" tone="neutral" size="sm" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}