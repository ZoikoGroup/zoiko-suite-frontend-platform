// The Evidence requests (PBC) register: asking a named person for an artifact
// by a date, and where each request stands. Every manager command is
// conditional on the version on screen (If-Match), so a request someone else
// moved meanwhile is refused rather than overwritten.

import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { DetailDrawer, DrawerFacts, DrawerNote } from "@/components/admin/console";
import { Chip, Mono, short, who, type RegisterSpec } from "@/components/admin/authorization/console/register";
import type { EvidenceRequest, EvidenceRequestStatus } from "@/lib/api/evidence";
import { formatDate, formatDateTime } from "@/lib/format";
import type { EvidenceData } from "./data";
import { EvidenceReadProblem } from "./problem";
import { RequestCommandDialog, ScanResultDialog } from "./forms";
import { BASE, type EvidenceCtx } from "./shared";

const LABEL: Record<EvidenceRequestStatus, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SENT: { label: "Sent", tone: "info" },
  VIEWED: { label: "Viewed", tone: "info" },
  RESPONSE_RECEIVED: { label: "Response in", tone: "warning" },
  UNDER_EVALUATION: { label: "Under review", tone: "warning" },
  CLARIFICATION_REQUIRED: { label: "Clarification asked", tone: "warning" },
  SATISFIED: { label: "Satisfied", tone: "success" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

function chipOf(r: EvidenceRequest) {
  if (r.is_overdue) return { label: "Overdue", tone: "danger" as const };
  return LABEL[r.status] ?? { label: r.status, tone: "neutral" as const };
}

const OPEN = (r: EvidenceRequest) => r.status !== "SATISFIED" && r.status !== "CLOSED";

export function requestsRegister(data: EvidenceData, ctx: EvidenceCtx): RegisterSpec {
  const rows = data.requests.rows;
  const byId = new Map(rows.map((r) => [r.request_id, r]));
  return {
    base: BASE,
    problem: (error) => <EvidenceReadProblem error={error} what="evidence requests" />,
    noun: "evidence requests",
    what: "evidence requests",
    idColumn: "Request",
    columns: [{ label: "Title" }, { label: "Assigned to" }, { label: "Due" }, { label: "State" }],
    searchPlaceholder: "Search title, person or reference",
    empty: "No evidence has been requested. Ask for it with “New request”.",
    error: data.requests.error,
    note: data.requests.more ? "The register is longer than this console reads at once." : undefined,
    filters: [
      { name: "state", allLabel: "Any state", options: [["open", "Open"], ["overdue", "Overdue"], ["done", "Satisfied or closed"]] },
      { name: "status", allLabel: "Any status", options: Object.entries(LABEL).map(([k, v]) => [k, v.label] as const) },
    ],
    rows: rows.map((r) => ({
      id: r.request_id,
      idLabel: short(r.request_id),
      search: [r.request_id, r.title, r.description, r.assigned_to_principal_id, who(r.assigned_to_principal_id)].join(" "),
      facets: { state: r.is_overdue ? "overdue" : OPEN(r) ? "open" : "done", status: r.status },
      cells: [
        <span key="t" className="block min-w-0">
          <span className="block truncate font-medium text-navy-950 dark:text-slate-100">{r.title}</span>
          {r.description && <span className="block truncate text-[11.5px] text-slate-500">{r.description}</span>}
        </span>,
        who(r.assigned_to_principal_id),
        <span key="d" className="whitespace-nowrap tabular-nums">{formatDate(r.due_at)}</span>,
        <Chip key="s" {...chipOf(r)} />,
      ],
    })),
    drawer: (id, links) => {
      const r = byId.get(id);
      if (!r) return null;
      const v = r.record_version;
      const cmd = (command: Parameters<typeof RequestCommandDialog>[0]["command"]) => (
        <RequestCommandDialog key={command} command={command} id={r.request_id} version={v} />
      );
      let actions: ReactNode = null;
      switch (r.status) {
        case "DRAFT":
          actions = (
            <>
              {cmd("reassign")}
              {cmd("close")}
              {cmd("send")}
            </>
          );
          break;
        case "SENT":
        case "VIEWED":
        case "CLARIFICATION_REQUIRED":
          actions = (
            <>
              {cmd("reassign")}
              {cmd("extend-due-date")}
              {cmd("close")}
            </>
          );
          break;
        case "RESPONSE_RECEIVED":
        case "UNDER_EVALUATION":
          actions = (
            <>
              {r.status === "RESPONSE_RECEIVED" && cmd("clarify")}
              {cmd("close")}
              {cmd("mark-satisfied")}
            </>
          );
          break;
        case "SATISFIED":
          actions = cmd("close");
          break;
      }
      return (
        <DetailDrawer
          heading="Evidence request"
          closeHref={links.close}
          icon={Inbox}
          title={r.title}
          subtitle={`For ${who(r.assigned_to_principal_id)} · due ${formatDate(r.due_at)}`}
          status={chipOf(r)}
          actions={actions}
        >
          <DrawerFacts
            items={[
              { label: "Status", value: <Mono>{r.status}</Mono> },
              { label: "Assigned to", value: who(r.assigned_to_principal_id) },
              { label: "Due", value: formatDateTime(r.due_at) },
              { label: "Legal entity", value: <Mono>{r.legal_entity_id}</Mono> },
              { label: "Requirement", value: r.requirement_id ? <Mono>{r.requirement_id}</Mono> : "—" },
              { label: "Requested by", value: who(r.created_by_principal_id) },
              { label: "Requested", value: formatDateTime(r.created_at) },
              { label: "Version", value: `v${v}` },
              { label: "Reference", value: <Mono>{r.request_id}</Mono> },
            ]}
          />
          {r.description && <DrawerNote>{r.description}</DrawerNote>}
          {(r.status === "RESPONSE_RECEIVED" || r.status === "UNDER_EVALUATION") &&
            (ctx.canManageRequests ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-[12.5px] dark:border-slate-700">
                <span className="text-slate-600 dark:text-slate-300">A response must be scanned clean before it can be marked satisfied.</span>
                <ScanResultDialog />
              </div>
            ) : (
              <DrawerNote>A response must be scanned clean by an evidence-request manager before it can be marked satisfied.</DrawerNote>
            ))}
          <DrawerNote>The person who submitted the latest response cannot mark it satisfied; someone else reviews it.</DrawerNote>
        </DetailDrawer>
      );
    },
  };
}
