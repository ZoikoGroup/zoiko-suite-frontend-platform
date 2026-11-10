import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui";
import { PageHeader, CopyableId } from "@/components/admin/shared";
import { RegisterCard, type RegisterRead } from "@/components/admin/my-work/RegisterCard";
import { currentSession, loadRegisters, approvalItems, KIND_LABEL, type ApprovalItem } from "@/lib/authz-inbox";
import { listPendingApprovals, describeWorkflowStatus, type WorkflowInstance } from "@/lib/api/workflow";
import { formatDateTime } from "@/lib/format";
import { humanizeCode } from "@/lib/humanize";

export const metadata: Metadata = {
  title: "Tasks & Approvals | Zoiko Suite",
};

export default async function TasksPage() {
  const current = await currentSession();
  if (!current) redirect("/login");
  const { identity } = current;

  const [workflows, registers] = await Promise.all([
    listPendingApprovals(identity, { limit: 100 }),
    loadRegisters(identity),
  ]);

  // The authorization registers are read in one batch. A refusal of one of them
  // is not a failure of the inbox (the caller may simply not hold that grant),
  // but any other failure means the list may be short, and the card says so.
  const approvals: RegisterRead<ApprovalItem> = registers.problem
    ? { ok: false, error: registers.problem }
    : { ok: true, data: approvalItems(registers, identity.principalId).filter((a) => !a.notYours) };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks & Approvals"
        description="Work waiting on a decision from you, read live from workflow-svc and authorization-svc with your own session."
      />

      <RegisterCard<WorkflowInstance>
        title="Workflow approvals"
        description="PENDING and ESCALATED workflow instances in your tenant."
        service="workflow-svc"
        read={workflows.ok ? { ok: true, data: workflows.data ?? [] } : workflows}
        rowKey={(w) => w.workflow_instance_id}
        emptyLabel="No workflow is waiting on approval"
        link={{ href: "/admin/workflows", label: "Open workflows" }}
        columns={[
          { header: "Workflow", cell: (w) => <CopyableId value={w.workflow_instance_id} /> },
          { header: "Type", cell: (w) => humanizeCode(w.workflow_type) },
          {
            header: "Status",
            cell: (w) => {
              const s = describeWorkflowStatus(w.workflow_status);
              return <Badge tone={s.tone}>{s.label}</Badge>;
            },
          },
          { header: "Stage", cell: (w) => w.current_stage },
          { header: "Subject", cell: (w) => (w.subject_type ? humanizeCode(w.subject_type) : "—") },
          { header: "Due", cell: (w) => (w.due_at ? formatDateTime(w.due_at) : "—") },
        ]}
      />

      <RegisterCard<ApprovalItem>
        title="Access approvals"
        description="Grants, privileged sessions, rules and duty-conflict exceptions awaiting a decision you are allowed to make."
        service="authorization-svc"
        read={approvals}
        rowKey={(a) => a.key}
        emptyLabel="No access request is waiting on you"
        emptyHint="Requests you raised yourself, or that are about you, are decided by someone else and are not listed. Registers your role may not read are left out."
        link={{ href: "/admin/authorization", label: "Open authorization" }}
        columns={[
          { header: "Kind", cell: (a) => <Badge tone="info">{KIND_LABEL[a.kind]}</Badge> },
          { header: "Request", cell: (a) => a.title },
          { header: "Requested by", cell: (a) => a.requestedBy ?? "—" },
          { header: "Requested", cell: (a) => (a.requestedAt ? formatDateTime(a.requestedAt) : "—") },
          { header: "Expires", cell: (a) => (a.expiresAt ? formatDateTime(a.expiresAt) : "—") },
        ]}
      />
    </div>
  );
}
