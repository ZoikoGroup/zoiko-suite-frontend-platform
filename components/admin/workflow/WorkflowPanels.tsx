import { GitBranch, Inbox } from "lucide-react";
import { Badge } from "@/components/ui";
import { CopyableId, PanelEmptyState } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { formatDateTime } from "@/lib/format";
import type { ApiResult } from "@/lib/api/client";
import {
  decodeDefinitionStages,
  describeStage,
  describeWorkflowStatus,
  explainWorkflowError,
  type WorkflowDefinition,
  type WorkflowInstance,
} from "@/lib/api/workflow";

/**
 * Unreadable is not empty. The pending list needs WORKFLOW_READ at PLATFORM
 * scope, which most people do not hold — so a refusal here is ordinary, and it
 * must not render as "nothing is waiting".
 */
function ReadFailure({ what, message, status }: { what: string; message: string; status?: number }) {
  return (
    <PanelEmptyState
      icon={Inbox}
      tone="warning"
      label={status === 403 ? `You may not list ${what}` : `${what[0].toUpperCase()}${what.slice(1)} could not be read`}
      hint={explainWorkflowError(message)}
    />
  );
}

export function PendingApprovalsPanel({ result }: { result: ApiResult<WorkflowInstance[]> }) {
  if (!result.ok) {
    return <ReadFailure what="pending workflows" message={result.error.message} status={result.error.status} />;
  }
  const rows = result.data ?? [];
  if (rows.length === 0) {
    return <PanelEmptyState icon={Inbox} label="Nothing is waiting for a decision" hint="Pending and escalated workflows in your tenant appear here." />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
        <thead className="bg-slate-50 dark:bg-slate-900/60">
          <tr>
            <th className={`${HEAD} text-left`}>Type</th>
            <th className={`${HEAD} text-left`}>Status</th>
            <th className={`${HEAD} text-left`}>Stage</th>
            <th className={`${HEAD} text-left`}>Started by</th>
            <th className={`${HEAD} text-left`}>Expires</th>
            <th className={`${HEAD} text-left`}>Workflow ID</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((wf) => {
            const status = describeWorkflowStatus(String(wf.workflow_status));
            return (
              <tr key={wf.workflow_instance_id}>
                <td className={`${CELL} font-mono text-xs`}>{wf.workflow_type}</td>
                <td className={CELL}>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </td>
                <td className={CELL}>{wf.current_stage}</td>
                <td className={CELL}>
                  <CopyableId value={wf.initiated_by} />
                </td>
                <td className={CELL}>{wf.due_at ? formatDateTime(wf.due_at) : "—"}</td>
                <td className={CELL}>
                  <CopyableId value={wf.workflow_instance_id} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DefinitionsPanel({ result }: { result: ApiResult<WorkflowDefinition[]> }) {
  if (!result.ok) {
    return <ReadFailure what="workflow definitions" message={result.error.message} status={result.error.status} />;
  }
  const rows = [...(result.data ?? [])].sort(
    (a, b) => a.workflow_type.localeCompare(b.workflow_type) || b.version - a.version,
  );
  if (rows.length === 0) {
    return (
      <PanelEmptyState
        icon={GitBranch}
        label="No workflow definitions yet"
        hint="Without one, every workflow names its own stages when it starts."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
        <thead className="bg-slate-50 dark:bg-slate-900/60">
          <tr>
            <th className={`${HEAD} text-left`}>Type</th>
            <th className={`${HEAD} text-left`}>Version</th>
            <th className={`${HEAD} text-left`}>State</th>
            <th className={`${HEAD} text-left`}>Route</th>
            <th className={`${HEAD} text-left`}>Definition ID</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((d) => {
            const stages = decodeDefinitionStages(d.stages_json);
            return (
              <tr key={d.workflow_definition_id}>
                <td className={CELL}>
                  <span className="font-mono text-xs">{d.workflow_type}</span>
                  {d.name && <div className="text-xs text-slate-500">{d.name}</div>}
                </td>
                <td className={CELL}>v{d.version}</td>
                <td className={CELL}>
                  {d.superseded_by ? (
                    <Badge tone="neutral">Superseded</Badge>
                  ) : d.is_active ? (
                    <Badge tone="success">Active</Badge>
                  ) : (
                    <Badge tone="neutral">Inactive</Badge>
                  )}
                </td>
                <td className={CELL}>
                  {stages === null ? (
                    <span className="text-xs text-amber-700 dark:text-amber-400">
                      Route cannot be read — starting from it will be refused
                    </span>
                  ) : (
                    <ol className="list-inside list-decimal space-y-0.5 text-xs">
                      {stages.map((s, i) => (
                        <li key={i}>{describeStage(s)}</li>
                      ))}
                    </ol>
                  )}
                </td>
                <td className={CELL}>
                  <CopyableId value={d.workflow_definition_id} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
