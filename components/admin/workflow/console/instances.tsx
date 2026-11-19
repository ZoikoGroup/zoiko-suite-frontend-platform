import type { ReactNode } from "react";
import { DetailDrawer, DrawerFacts, DrawerNote } from "@/components/admin/console";
import { Chip, Mono, short, who, type RegisterSpec } from "@/components/admin/authorization/console/register";
import type { WorkflowInstance } from "@/lib/api/workflow";
import { formatDate, formatDateTime } from "@/lib/format";
import type { WorkflowData, WorkflowCtx } from "./data";
import { WorkflowReadProblem } from "./problem";
import { BASE } from "./shared";
import { STATUS_TEXT } from "./pending";

function chipOf(w: WorkflowInstance) {
  return STATUS_TEXT[w.workflow_status] ?? { label: w.workflow_status, tone: "neutral" as const };
}

export function instancesRegister(data: WorkflowData, ctx: WorkflowCtx): RegisterSpec {
  const rows = data.instances.rows;
  const byId = new Map(rows.map((w) => [w.workflow_instance_id, w]));
  return {
    base: BASE,
    problem: (error) => <WorkflowReadProblem error={error} what="workflow instances" />,
    noun: "workflow instances",
    what: "all workflow instances in the tenant",
    idColumn: "Workflow",
    columns: [{ label: "Type" }, { label: "Status" }, { label: "Stage" }, { label: "Due" }],
    searchPlaceholder: "Search type, status or ID",
    empty: "No workflow instances recorded.",
    error: data.instances.error,
    note: data.instances.more ? "The register is longer than this console reads at once." : undefined,
    filters: [
      { name: "status", allLabel: "Any status", options: Object.entries(STATUS_TEXT).map(([k, v]) => [k, v.label] as const) },
    ],
    rows: rows.map((w) => ({
      id: w.workflow_instance_id,
      idLabel: short(w.workflow_instance_id),
      search: [w.workflow_instance_id, w.workflow_type, w.workflow_status, String(w.current_stage)].join(" "),
      facets: { status: w.workflow_status },
      cells: [
        <span key="t" className="whitespace-nowrap">{w.workflow_type}</span>,
        <Chip key="s" {...chipOf(w)} />,
        <span key="st" className="whitespace-nowrap tabular-nums">Stage {w.current_stage}</span>,
        <span key="d" className="whitespace-nowrap tabular-nums">{w.due_at ? formatDate(w.due_at) : "—"}</span>,
      ],
    })),
    drawer: (id, links) => {
      const w = byId.get(id);
      if (!w) return null;
      const v = w.row_version || 0;
      return (
        <DetailDrawer
          heading="Workflow Instance"
          closeHref={links.close}
          title={w.workflow_type}
          subtitle={`Stage ${w.current_stage} · {w.workflow_status}`}
          status={chipOf(w)}
          actions={null}
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
        </DetailDrawer>
      );
    },
  };
}