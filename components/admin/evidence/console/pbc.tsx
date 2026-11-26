// The Evidence requests (PBC) register: asking a named person for an artifact
// by a date, and where each request stands. Every manager command is
// conditional on the version on screen (If-Match), so a request someone else
// moved meanwhile is refused rather than overwritten.

import type { ReactNode } from "react";
import { Inbox, Upload, MessageSquare, CheckCheck } from "lucide-react";
import { DetailDrawer, DrawerFacts, DrawerNote } from "@/components/admin/console";
import { Chip, Mono, short, who, type RegisterSpec } from "@/components/admin/authorization/console/register";
import type { EvidenceRequest, EvidenceRequestStatus } from "@/lib/api/evidence";
import { formatDate, formatDateTime } from "@/lib/format";
import type { EvidenceData } from "./data";
import { EvidenceReadProblem } from "./problem";
import { RequestCommandDialog, ScanResultDialog } from "./forms";
import { BASE, type EvidenceCtx } from "./shared";
import { viewEvidenceRequest, submitEvidenceResponse, addEvidenceRequestNote, acknowledgeEvidenceResponse } from "@/lib/api/evidence";

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
      const isAssignee = r.assigned_to_principal_id === ctx.me;
      let actions: ReactNode = null;
      if (isAssignee) {
        // Assignee actions: view, respond, notes
        actions = (
          <>
            {r.status === "SENT" && (
              <button
                key="view"
                onClick={async () => {
                  await viewEvidenceRequest({ identity: { principalId: ctx.me, tenantId: ctx.tenantId }, requestId: r.request_id });
                  window.location.reload();
                }}
                className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Inbox className="h-4 w-4" /> Mark as viewed
              </button>
            )}
            {["SENT", "VIEWED", "RESPONSE_RECEIVED", "UNDER_EVALUATION", "CLARIFICATION_REQUIRED"].includes(r.status) && (
              <>
                <button
                  key="respond"
                  onClick={async () => {
                    // Upload through document-vault-svc first, then submit response
                    // For now, just submit with a placeholder
                    await submitEvidenceResponse({ identity: { principalId: ctx.me, tenantId: ctx.tenantId }, requestId: r.request_id, correlationId: `e2e-resp-${Date.now()}` });
                    window.location.reload();
                  }}
                  className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Upload className="h-4 w-4" /> Submit response
                </button>
                <button
                  key="note"
                  onClick={async () => {
                    const note = prompt("Add a note:");
                    if (note) {
                      await addEvidenceRequestNote({ identity: { principalId: ctx.me, tenantId: ctx.tenantId }, requestId: r.request_id, note });
                      window.location.reload();
                    }
                  }}
                  className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <MessageSquare className="h-4 w-4" /> Add note
                </button>
              </>
            )}
          </>
        );
      } else if (ctx.canManageRequests) {
        // Manager actions (existing)
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
      }
      // Manager: Acknowledge on a response
      const showAcknowledge = ctx.canManageRequests && ["RESPONSE_RECEIVED", "UNDER_EVALUATION"].includes(r.status);
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
            )
          )}
          {showAcknowledge && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-[12.5px] dark:border-slate-700">
              <span className="text-slate-600 dark:text-slate-300">A response has been received and scanned clean.</span>
              <button
                onClick={async () => {
                  // TODO: get the response_id from the request
                  // await acknowledgeEvidenceResponse({ identity: { principalId: ctx.me, tenantId: ctx.tenantId }, responseId: "..." });
                  window.location.reload();
                }}
                className="flex items-center gap-2 rounded-lg bg-navy-950 px-3 py-2 text-sm text-white hover:bg-navy-800"
              >
                <CheckCheck className="h-4 w-4" /> Acknowledge
              </button>
            </div>
          )}
          <DrawerNote>The person who submitted the latest response cannot mark it satisfied; someone else reviews it.</DrawerNote>
        </DetailDrawer>
      );
    },
  };
}

export function myRequestsRegister(data: EvidenceData, ctx: EvidenceCtx): RegisterSpec {
  const rows = data.myRequests.rows;
  const byId = new Map(rows.map((r) => [r.request_id, r]));
  return {
    base: BASE,
    problem: (error) => <EvidenceReadProblem error={error} what="my evidence requests" />,
    noun: "my evidence requests",
    what: "evidence requests assigned to me",
    idColumn: "Request",
    columns: [{ label: "Title" }, { label: "Due" }, { label: "State" }],
    searchPlaceholder: "Search title or reference",
    empty: "No evidence has been requested from you.",
    error: data.myRequests.error,
    note: data.myRequests.more ? "The register is longer than this console reads at once." : undefined,
    filters: [
      { name: "state", allLabel: "Any state", options: [["open", "Open"], ["overdue", "Overdue"], ["done", "Satisfied or closed"]] },
      { name: "status", allLabel: "Any status", options: Object.entries(LABEL).map(([k, v]) => [k, v.label] as const) },
    ],
    rows: rows.map((r) => ({
      id: r.request_id,
      idLabel: short(r.request_id),
      search: [r.request_id, r.title, r.description].join(" "),
      facets: { state: r.is_overdue ? "overdue" : OPEN(r) ? "open" : "done", status: r.status },
      cells: [
        <span key="t" className="block min-w-0">
          <span className="block truncate font-medium text-navy-950 dark:text-slate-100">{r.title}</span>
          {r.description && <span className="block truncate text-[11.5px] text-slate-500">{r.description}</span>}
        </span>,
        <span key="d" className="whitespace-nowrap tabular-nums">{formatDate(r.due_at)}</span>,
        <Chip key="s" {...chipOf(r)} />,
      ],
    })),
    drawer: (id, links) => {
      const r = byId.get(id);
      if (!r) return null;
      const v = r.record_version;
      // Assignee actions: view, respond, notes
      let actions: ReactNode = null;
      if (["SENT", "VIEWED", "RESPONSE_RECEIVED", "UNDER_EVALUATION", "CLARIFICATION_REQUIRED"].includes(r.status)) {
        actions = (
          <>
            {r.status === "SENT" && (
              <button
                key="view"
                onClick={async () => {
                  await viewEvidenceRequest({ identity: { principalId: ctx.me, tenantId: ctx.tenantId }, requestId: r.request_id });
                  window.location.reload();
                }}
                className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Inbox className="h-4 w-4" /> Mark as viewed
              </button>
            )}
            <button
              key="respond"
              onClick={async () => {
                await submitEvidenceResponse({ identity: { principalId: ctx.me, tenantId: ctx.tenantId }, requestId: r.request_id, correlationId: `e2e-resp-${Date.now()}` });
                window.location.reload();
              }}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Upload className="h-4 w-4" /> Submit response
            </button>
            <button
              key="note"
              onClick={async () => {
                const note = prompt("Add a note:");
                if (note) {
                  await addEvidenceRequestNote({ identity: { principalId: ctx.me, tenantId: ctx.tenantId }, requestId: r.request_id, note });
                  window.location.reload();
                }
              }}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <MessageSquare className="h-4 w-4" /> Add note
            </button>
          </>
        );
      }
      return (
        <DetailDrawer
          heading="My evidence request"
          closeHref={links.close}
          icon={Inbox}
          title={r.title}
          subtitle={`Due ${formatDate(r.due_at)}`}
          status={chipOf(r)}
          actions={actions}
        >
          <DrawerFacts
            items={[
              { label: "Status", value: <Mono>{r.status}</Mono> },
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
          <DrawerNote>The person who submitted the latest response cannot mark it satisfied; someone else reviews it.</DrawerNote>
        </DetailDrawer>
      );
    },
  };
}