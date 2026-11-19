import type { ReactNode } from "react";
import { DetailDrawer, DrawerFacts, DrawerNote } from "@/components/admin/console";
import { Chip, Mono, short, who, type RegisterSpec } from "@/components/admin/authorization/console/register";
import type { Obligation, ObligationStatus } from "@/lib/api/obligations";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ObligationsData } from "./data";
import type { ObligationsCtx } from "./shared";
import { ObligationsReadProblem } from "./problem";
import { TransitionObligationDialog, LinkWorkflowDialog } from "./forms";
import { BASE, OBLIGATION_STATUS_LABEL } from "./shared";
import { FileText } from "lucide-react";

const LABEL = OBLIGATION_STATUS_LABEL;

function chipOf(o: Obligation) {
  return LABEL[o.obligation_status as ObligationStatus] ?? { label: o.obligation_status, tone: "neutral" as const };
}

const OPEN = (o: Obligation) => o.obligation_status !== "CLOSED";

export function obligationsRegister(data: ObligationsData, ctx: ObligationsCtx): RegisterSpec {
  const rows = data.obligations.rows;
  const byId = new Map(rows.map((o) => [o.obligation_id, o]));
  return {
    base: BASE,
    problem: (error) => <ObligationsReadProblem error={error} what="obligations" />,
    noun: "obligations",
    what: "statutory and regulatory obligations",
    idColumn: "Obligation",
    columns: [{ label: "Code" }, { label: "Type" }, { label: "Due" }, { label: "State" }],
    searchPlaceholder: "Search code, type, jurisdiction or reference",
    empty: "No obligations recorded. Create one with “New obligation”.",
    error: data.obligations.error,
    note: data.obligations.more ? "The register is longer than this console reads at once." : undefined,
    filters: [
      { name: "state", allLabel: "Any state", options: [["open", "Open"], ["overdue", "Overdue"], ["done", "Closed"]] },
      { name: "status", allLabel: "Any status", options: Object.entries(LABEL).map(([k, v]) => [k, v.label] as const) },
    ],
    rows: rows.map((o) => ({
      id: o.obligation_id,
      idLabel: short(o.obligation_id),
      search: [o.obligation_id, o.obligation_code, o.obligation_type, o.jurisdiction_id, o.source_reference].join(" "),
      facets: { state: OPEN(o) ? "open" : "done", status: o.obligation_status },
      cells: [
        <span key="c" className="block min-w-0">
          <span className="block truncate font-medium text-navy-950 dark:text-slate-100">{o.obligation_code || o.obligation_type}</span>
          <span className="block truncate text-[11.5px] text-slate-500">{o.source_reference}</span>
        </span>,
        <span key="t" className="whitespace-nowrap">{o.obligation_type}</span>,
        <span key="d" className="whitespace-nowrap tabular-nums">{formatDate(o.due_date)}</span>,
        <Chip key="s" {...chipOf(o)} />,
      ],
    })),
    drawer: (id, links) => {
      const o = byId.get(id);
      if (!o) return null;
      const v = o.updated_at ? new Date(o.updated_at).getTime() : 0; // approximate version
      return (
        <DetailDrawer
          closeHref={links.close}
          icon={FileText}
          title={o.obligation_code || o.obligation_type}
          subtitle={`Due ${formatDate(o.due_date)} · {o.jurisdiction_id}`}
          status={chipOf(o)}
          actions={
            <>
              <TransitionObligationDialog obligationId={o.obligation_id} currentStatus={o.obligation_status} />
              <LinkWorkflowDialog obligationId={o.obligation_id} />
            </>
          }
        >
          <DrawerFacts
            items={[
              { label: "Status", value: <Mono>{o.obligation_status}</Mono> },
              { label: "Code", value: <Mono>{o.obligation_code}</Mono> },
              { label: "Type", value: o.obligation_type },
              { label: "Due", value: formatDateTime(o.due_date) },
              { label: "Severity", value: o.severity_level },
              { label: "Function", value: o.responsible_function },
              { label: "Jurisdiction", value: <Mono>{o.jurisdiction_id}</Mono> },
              { label: "Legal entity", value: <Mono>{o.legal_entity_id}</Mono> },
              { label: "Source", value: <Mono>{`${o.obligation_source_type}:${o.obligation_source_id}`}</Mono> },
              { label: "Reference", value: <Mono>{o.source_reference}</Mono> },
              { label: "Created by", value: who(o.created_by_principal_id) },
              { label: "Created", value: formatDateTime(o.created_at) },
              { label: "Closed", value: o.closed_at ? formatDateTime(o.closed_at) : "—" },
              { label: "Reference", value: <Mono>{o.obligation_id}</Mono> },
            ]}
          />
          <DrawerNote>An obligation is raised against a legal entity and jurisdiction. CLOSED is terminal — no further transitions are permitted. All transitions require If-Match header.</DrawerNote>
        </DetailDrawer>
      );
    },
  };
}