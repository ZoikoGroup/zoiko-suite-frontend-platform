import type { ReactNode } from "react";
import { DetailDrawer, DrawerFacts, DrawerNote } from "@/components/admin/console";
import { Chip, Mono, short, who, type RegisterSpec } from "@/components/admin/authorization/console/register";
import type { WorkflowInstance, WorkflowStatus } from "@/lib/api/workflow";
import { formatDate, formatDateTime } from "@/lib/format";
import type { WorkflowData, WorkflowCtx } from "./data";
import { WorkflowReadProblem } from "./problem";
import { DecideWorkflowDialog, LifecycleDialog } from "./forms";
import { BASE } from "./shared";
import { WORKFLOW_PIPELINE_ORDER } from "./data";

const STATUS_TEXT: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  PENDING: { label: "Awaiting a decision", tone: "info" },
  ESCALATED: { label: "Escalated", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  INVALIDATED: { label: "Invalidated — subject changed", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

function chipOf(w: WorkflowInstance) {
  return STATUS_TEXT[w.workflow_status] ?? { label: w.workflow_status, tone: "neutral" as const };
}

const OPEN = (w: WorkflowInstance) => w.workflow_status === "PENDING" || w.workflow_status === "ESCALATED";

export function pendingRegister(data: WorkflowData, ctx: WorkflowCtx): RegisterSpec {
  const rows = data.pending.rows;
  const byId = new Map(rows.map((w) => [w.workflow_instance_id, w]));
  return {
    base: BASE,
    problem: (error) => <WorkflowReadProblem error={error} what="pending approvals" />,
    noun: "pending approvals",
    what: "workflows waiting for a decision",
    idColumn: "Workflow",
    columns: [{ label: "Type" }, { label: "Current Stage" }, { label: "Due" }, { label: "State" }],
    searchPlaceholder: "Search type, stage or ID",
    empty: "No workflows awaiting a decision.",
    error: data.pending.error,
    note: data.pending.more ? "The register is longer than this console reads at once." : undefined,
    filters: [
      { name: "state", allLabel: "Any state", options: [["open", "Open"], ["escalated", "Escalated"], ["done", "Decided"]] },
      { name: "status", allLabel: "Any status", options: Object.entries(STATUS_TEXT).map(([k, v]) => [k, v.label] as const) },
    ],
    rows: rows.map((w) => ({
      id: w.workflow_instance_id,
      idLabel: short(w.workflow_instance_id),
      search: [w.workflow_instance_id, w.workflow_type, String(w.current_stage)].join(" "),
      facets: { state: OPEN(w) ? "open" : "done", status: w.workflow_status },
      cells: [
        <span key="t" className="whitespace-nowrap">{w.workflow_type}</span>,
        <span key="s" className="whitespace-nowrap tabular-nums">Stage {w.current_stage}</span>,
        <span key="d" className="whitespace-nowrap tabular-nums">{w.due_at ? formatDate(w.due_at) : "—"}</span>,
        <Chip key="st" {...chipOf(w)} />,
      ],
    })),
    drawer: (id, links) => {
      const w = byId.get(id);
      if (!w) return null;
      const v = w.row_version || 0;
      const isApprover = w.workflow_status === "PENDING" || w.workflow_status === "ESCALATED";
      let actions: ReactNode = null;
      if (isApprover) {
        actions = (
          <>
            <DecideWorkflowDialog workflow={w} version={v} />
            <LifecycleDialog workflow={w} version={v} />
          </>
        );
      }
      return (
        <DetailDrawer
          heading="Workflow"
          closeHref={links.close}
          title={w.workflow_type}
          subtitle={`Stage ${w.current_stage} · Due ${w.due_at ? formatDate(w.due_at) : "—"}`}
          status={chipOf(w)}
          actions={actions}
        >
          <DrawerFacts
            items={[
              { label: "Status", value: <Mono>{w.workflow_status}</Mono> },
              { label: "Type", value: w.workflow_type },
              { label: "Current stage", value: <Mono>{String(w.current_stage)}</Mono> },
              { label: "Review cycle", value: <Mono>{String(w.review_cycle || 1)}</Mono> },
              { label: "Legal entity", value: <Mono>{w.legal_entity_id}</Mono> },
              { label: "Initiated by", value: who(w.initiated_by) },
              { label: "Created", value: w.created_at ? formatDateTime(w.created_at) : "—" },
              { label: "Due", value: w.due_at ? formatDateTime(w.due_at) : "—" },
              { label: "Escalated", value: w.escalated_at ? formatDateTime(w.escalated_at) : "—" },
              { label: "Escalation target", value: w.escalation_target ? who(w.escalation_target) : "—" },
              { label: "Definition", value: w.workflow_definition_id ? <Mono>{w.workflow_definition_id}</Mono> : "—" },
              { label: "Definition version", value: w.workflow_definition_version ? String(w.workflow_definition_version) : "—" },
              { label: "Version", value: `v${v}` },
              { label: "Reference", value: <Mono>{w.workflow_instance_id}</Mono> },
            ]}
          />
          {w.rationale && <DrawerNote>{w.rationale}</DrawerNote>}
          {w.subject_type && w.subject_id && (
            <DrawerNote>Subject: {w.subject_type} {w.subject_id} (v{w.subject_version || 0})</DrawerNote>
          )}
          {w.subject_fingerprint && (
            <DrawerNote>Fingerprint: <Mono>{w.subject_fingerprint}</Mono></DrawerNote>
          )}
          <DrawerNote>
            The initiator never decides. Nobody decides two stages. A service account never decides.
            A workflow past its deadline expires; a stage past its deadline escalates.
          </DrawerNote>
        </DetailDrawer>
      );
    },
  };
}