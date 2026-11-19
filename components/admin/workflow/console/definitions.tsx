import type { ReactNode } from "react";
import { DetailDrawer, DrawerFacts, DrawerNote } from "@/components/admin/console";
import { Chip, Mono, short, who, type RegisterSpec } from "@/components/admin/authorization/console/register";
import type { WorkflowDefinition } from "@/lib/api/workflow";
import { formatDate, formatDateTime } from "@/lib/format";
import type { WorkflowData, WorkflowCtx } from "./data";
import { WorkflowReadProblem } from "./problem";
import { BASE } from "./shared";

const ACTIVE_LABEL = {
  true: { label: "Active", tone: "success" as const },
  false: { label: "Inactive", tone: "neutral" as const },
};

function chipOf(d: WorkflowDefinition) {
  return ACTIVE_LABEL[d.is_active === true ? "true" : "false"];
}

export function definitionsRegister(data: WorkflowData, ctx: WorkflowCtx): RegisterSpec {
  const rows = data.definitions.rows;
  const byId = new Map(rows.map((d) => [d.workflow_definition_id, d]));
  return {
    base: BASE,
    problem: (error) => <WorkflowReadProblem error={error} what="workflow definitions" />,
    noun: "workflow definitions",
    what: "versioned approval routes",
    idColumn: "Definition",
    columns: [{ label: "Type" }, { label: "Version" }, { label: "Status" }, { label: "Created" }],
    searchPlaceholder: "Search type or version",
    empty: "No workflow definitions recorded.",
    error: data.definitions.error,
    note: data.definitions.more ? "The register is longer than this console reads at once." : undefined,
    filters: [
      { name: "status", allLabel: "Any status", options: [["active", "Active"], ["inactive", "Inactive"]] },
    ],
    rows: rows.map((d) => ({
      id: d.workflow_definition_id,
      idLabel: short(d.workflow_definition_id),
      search: [d.workflow_definition_id, d.workflow_type, String(d.version), d.name || ""].join(" "),
      facets: { status: d.is_active ? "active" : "inactive" },
      cells: [
        <span key="t" className="whitespace-nowrap">{d.workflow_type}</span>,
        <span key="v" className="whitespace-nowrap tabular-nums">v{d.version}</span>,
        <Chip key="s" {...chipOf(d)} />,
        <span key="c" className="whitespace-nowrap tabular-nums">{d.created_at ? formatDate(d.created_at) : "—"}</span>,
      ],
    })),
    drawer: (id, links) => {
      const d = byId.get(id);
      if (!d) return null;
      return (
        <DetailDrawer
          heading="Workflow Definition"
          closeHref={links.close}
          title={d.workflow_type}
          subtitle={`v${d.version} · ${d.is_active ? "Active" : "Inactive"}`}
          status={chipOf(d)}
          actions={null}
        >
          <DrawerFacts
            items={[
              { label: "Type", value: d.workflow_type },
              { label: "Version", value: <Mono>{String(d.version)}</Mono> },
              { label: "Status", value: <Chip {...chipOf(d)} /> },
              { label: "Name", value: d.name || "—" },
              { label: "Description", value: d.description || "—" },
              { label: "Created by", value: who(d.created_by || "") },
              { label: "Created", value: d.created_at ? formatDateTime(d.created_at) : "—" },
              { label: "Expiry", value: d.expiry_hours ? `${d.expiry_hours}h` : "—" },
              { label: "Escalation target", value: d.escalation_target ? who(d.escalation_target) : "—" },
              { label: "Superseded by", value: d.superseded_by ? <Mono>{d.superseded_by}</Mono> : "—" },
              { label: "Reference", value: <Mono>{d.workflow_definition_id}</Mono> },
            ]}
          />
          <DrawerNote>
            A definition is active the moment it is created. A running workflow keeps the route it started with.
            Changing a definition never changes a decision already in progress.
          </DrawerNote>
        </DetailDrawer>
      );
    },
  };
}