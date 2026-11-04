import { Badge } from "@/components/ui";
import { CopyableId, DetailList, StoredAs } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { formatDateTime } from "@/lib/format";
import { humanizeCode } from "@/lib/humanize";
import { describeStage, describeWorkflowStatus } from "@/lib/api/workflow";
import type { WorkflowRecord } from "@/app/admin/workflows/state";

/**
 * One workflow, as an operator reads it: where it stands, who each stage waits
 * on, and the trail of who did what on whose authority.
 *
 * The version is shown on purpose. Invalidating a workflow needs it (the
 * service refuses an invalidation that does not name the version the operator
 * last read), and this is the only place the console shows it.
 */
export function WorkflowSummary({ record }: { record: WorkflowRecord }) {
  const wf = record.workflow;
  const status = describeWorkflowStatus(String(wf.workflow_status));
  const stages = [...(wf.stages ?? [])].sort((a, b) => a.stage_order - b.stage_order);

  return (
    <div className="space-y-5">
      <DetailList
        items={[
          {
            label: "Status",
            value: <Badge tone={status.tone}>{status.label}</Badge>,
            hint: `Recorded as ${wf.workflow_status}`,
          },
          { label: "Workflow type", value: wf.workflow_type },
          { label: "Workflow ID", value: <CopyableId value={wf.workflow_instance_id} /> },
          { label: "Version", value: wf.row_version !== undefined ? String(wf.row_version) : undefined, hint: "Needed to invalidate" },
          { label: "Waiting on stage", value: ["PENDING", "ESCALATED"].includes(String(wf.workflow_status)) ? String(wf.current_stage) : undefined },
          { label: "Review cycle", value: wf.review_cycle ? String(wf.review_cycle) : undefined },
          { label: "Started by", value: <CopyableId value={wf.initiated_by} /> },
          { label: "Legal entity", value: <CopyableId value={wf.legal_entity_id} /> },
          {
            label: "Subject",
            value: wf.subject_type && wf.subject_id ? `${wf.subject_type} ${wf.subject_id}` : undefined,
            hint: wf.subject_fingerprint ?? undefined,
          },
          { label: "Expires", value: wf.due_at ? formatDateTime(wf.due_at) : undefined },
          { label: "Escalated to", value: wf.escalation_target ? <CopyableId value={wf.escalation_target} /> : undefined },
          {
            label: "Definition",
            value: wf.workflow_definition_id ? <CopyableId value={wf.workflow_definition_id} /> : "None — route given at start",
            hint: wf.workflow_definition_version ? `Pinned to version ${wf.workflow_definition_version}` : undefined,
          },
        ]}
      />

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Stages
        </h4>
        {stages.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">The service returned no stages.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-900/60">
                <tr>
                  <th className={`${HEAD} text-left`}>#</th>
                  <th className={`${HEAD} text-left`}>Who decides</th>
                  <th className={`${HEAD} text-left`}>State</th>
                  <th className={`${HEAD} text-left`}>Decided by</th>
                  <th className={`${HEAD} text-left`}>Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {stages.map((st) => (
                  <tr key={st.workflow_stage_id}>
                    <td className={CELL}>{st.stage_order}</td>
                    <td className={CELL}>
                      {describeStage({
                        stage_type: st.stage_type as "SINGLE",
                        approver_principal_id: st.approver_principal_id ?? undefined,
                        approver_role: st.approver_role ?? undefined,
                        required_approvals: st.required_approvals ?? undefined,
                        quorum_approvers: st.quorum_approvers ?? undefined,
                      })}
                      {st.approver_principal_id && (
                        <div className="mt-0.5">
                          <CopyableId value={st.approver_principal_id} />
                        </div>
                      )}
                      {st.due_at && (
                        <div className="mt-0.5 text-xs text-slate-400">Due {formatDateTime(st.due_at)}</div>
                      )}
                    </td>
                    <td className={CELL}>
                      {humanizeCode(st.stage_status)}
                      <StoredAs code={st.stage_status} />
                    </td>
                    <td className={CELL}>
                      {st.acted_by ? <CopyableId value={st.acted_by} /> : "—"}
                      {st.acted_at && <div className="text-xs text-slate-400">{formatDateTime(st.acted_at)}</div>}
                    </td>
                    <td className={CELL}>{st.rationale || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Approval trail
        </h4>
        {record.transitions === null ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            The trail could not be read: {record.transitionsError}
          </p>
        ) : record.transitions.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No transitions recorded yet.</p>
        ) : (
          <ol className="space-y-2">
            {record.transitions.map((t, i) => (
              <li
                key={`${t.acted_at}-${i}`}
                className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {humanizeCode(t.from_state || "NEW")} → {humanizeCode(t.to_state)}
                    {t.stage_order ? <span className="font-normal text-slate-500"> · stage {t.stage_order}</span> : null}
                  </span>
                  <span className="text-xs text-slate-400">{t.acted_at ? formatDateTime(t.acted_at) : ""}</span>
                </div>
                <DetailList
                  className="mt-2"
                  items={[
                    { label: "By", value: <CopyableId value={t.acted_by} /> },
                    { label: "Reason", value: t.rationale ?? undefined },
                    {
                      label: "On whose authority",
                      value: t.authority_basis ? humanizeCode(t.authority_basis) : undefined,
                      hint: t.delegation_id ? `Delegation ${t.delegation_id}` : undefined,
                    },
                    { label: "Governance record", value: t.decision_id ? <CopyableId value={t.decision_id} /> : undefined },
                    { label: "Access decision", value: t.access_decision_id ? <CopyableId value={t.access_decision_id} /> : undefined },
                  ]}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
