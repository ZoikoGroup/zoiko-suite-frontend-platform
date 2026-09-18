import { cookies } from "next/headers";
import { CloudOff, GitBranch, ShieldAlert, CheckCircle, Clock, XCircle, Ban } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listProcurementWorkflows, type ProcurementWorkflow } from "@/lib/api/commercial-ops";

const STATUS_ICONS: Record<string, React.ElementType> = {
  IN_PROGRESS: Clock,
  APPROVED: CheckCircle,
  REJECTED: XCircle,
  CANCELLED: Ban,
};

const STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  APPROVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  CANCELLED: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
};

export async function ProcurementWorkflowPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in to view procurement workflows."
      />
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const res = await listProcurementWorkflows(identity);

  if (!res.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Procurement workflows unavailable"
        hint={res.error.message}
      />
    );
  }

  const workflows = res.data;

  if (workflows.length === 0) {
    return (
      <PanelEmptyState
        icon={GitBranch}
        tone="neutral"
        label="No active workflows"
        hint="All procurement workflows have been finalized or none have been initiated."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Showing {workflows.length} procurement lifecycle workflows</span>
        <span className="font-mono text-[11px]">procurement-workflow-svc :8134</span>
      </div>

      <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {workflows.map((wf) => {
          const StatusIcon = STATUS_ICONS[wf.status] || Clock;
          const statusClass = STATUS_COLORS[wf.status] || STATUS_COLORS.IN_PROGRESS;
          const progressPercent = wf.total_steps > 0 ? Math.round((wf.steps_completed / wf.total_steps) * 100) : 0;

          return (
            <div key={wf.workflow_id} className="p-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {wf.workflow_id}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>
                      <StatusIcon className="h-3 w-3" />
                      {wf.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Type: <span className="font-medium text-slate-800 dark:text-slate-200">{wf.workflow_type}</span> • Initiated by: <span className="font-mono">{wf.initiated_by}</span>
                  </p>
                </div>

                <div className="sm:text-right">
                  <div className="flex items-center gap-2 sm:justify-end">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Step {wf.steps_completed} of {wf.total_steps}
                    </span>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{progressPercent}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full sm:w-28 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
