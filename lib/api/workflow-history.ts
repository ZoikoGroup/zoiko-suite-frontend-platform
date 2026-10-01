// workflow-history-svc (:8097) — the durable, append-only history of every
// workflow instance on the platform, built entirely from Kafka events
// (zoiko.workflow.events) produced by workflow-svc.
//
// Three properties shape this page:
//
//  1. THIS IS A GENERIC EVENT LOG, NOT A WORKFLOW-TYPE-SPECIFIC ONE. A history
//     entry is one of exactly five event types (workflow.started,
//     approval.granted, approval.rejected, workflow.escalated,
//     workflow.completed) for ANY workflow instance on the platform — invoice
//     approvals, purchase orders, anything. The workflow's own "type" (e.g.
//     "invoice_approval") is not a top-level field on the response; it lives
//     inside the workflow.started event's own payload, so this client reads
//     it out from there rather than pretending the API returns it directly.
//
//  2. THE TWO READ ROUTES DISAGREE ON PURPOSE ABOUT WHAT "NOTHING FOUND"
//     MEANS. Looking up one instance's history that has zero events answers
//     404 — deliberately indistinguishable from "that instance belongs to a
//     different tenant", so a caller cannot use this endpoint to enumerate
//     instance IDs that exist elsewhere. The cross-workflow search, by
//     contrast, answers 200 with an empty array when nothing matches a time
//     window — an empty result there is an ordinary answer, not something to
//     hide. This client keeps the two outcomes distinct rather than folding
//     both into one generic "empty" state.
//
//  3. THIS PAGE IS THE FIRST REAL CALLER OF THE CROSS-WORKFLOW SEARCH ROUTE
//     (GET /v1/workflows/history). It has existed, tested and indexed for,
//     since the service was built, but evidence-manifest-svc — the only
//     other real caller of this service — only ever calls the per-instance
//     route. Both are wired here because both are real, working endpoints.

import { apiGet, type ApiResult, type Identity } from "./client";

export const EVENT_TYPES = [
  "workflow.started",
  "approval.granted",
  "approval.rejected",
  "workflow.escalated",
  "workflow.completed",
] as const;
export type WorkflowEventType = (typeof EVENT_TYPES)[number];

/** Wire shape. Field names match the Go json tags exactly. */
export type WorkflowHistoryEvent = {
  event_id: string;
  workflow_instance_id: string;
  event_type: WorkflowEventType;
  correlation_id: string;
  tenant_id: string;
  legal_entity_id: string;
  /** Raw payload — shape varies by event_type. See extractWorkflowType/summarizeEvent. */
  payload: Record<string, unknown>;
  recorded_at: string;
};

/**
 * One workflow instance's full history, earliest first.
 *
 * A 404 here means zero events for that instance in the caller's tenant —
 * treated as a real, distinct outcome (`not_found`), never folded into a
 * generic error, and never shown as if the array were merely empty.
 */
export async function getInstanceHistory(params: {
  identity: Identity;
  workflowInstanceId: string;
}): Promise<ApiResult<WorkflowHistoryEvent[]>> {
  return apiGet<WorkflowHistoryEvent[]>(
    "workflowHistory",
    `/v1/workflows/${encodeURIComponent(params.workflowInstanceId)}/history`,
    { identity: params.identity },
  );
}

/**
 * Every history event for a legal entity within a time window, across every
 * workflow instance — the cross-workflow search route. Always answers with
 * an array (empty when nothing matches), never a 404.
 */
export async function searchWorkflowHistory(params: {
  identity: Identity;
  legalEntityId: string;
  from: string;
  to: string;
}): Promise<ApiResult<WorkflowHistoryEvent[]>> {
  return apiGet<WorkflowHistoryEvent[]>("workflowHistory", "/v1/workflows/history", {
    identity: params.identity,
    query: {
      legal_entity_id: params.legalEntityId,
      from: params.from,
      to: params.to,
    },
  });
}

/**
 * The workflow_type declared in an instance's workflow.started event, if
 * that event is present in the given list. Not a field the API returns
 * directly — only workflow.started's own payload carries it.
 */
export function extractWorkflowType(events: WorkflowHistoryEvent[]): string | null {
  const started = events.find((e) => e.event_type === "workflow.started");
  const type = started?.payload?.workflow_type;
  return typeof type === "string" ? type : null;
}

/** A one-line, plain-English summary of one event, read from its own payload shape. */
export function summarizeEvent(event: WorkflowHistoryEvent): string {
  const p = event.payload ?? {};
  switch (event.event_type) {
    case "workflow.started":
      return `Started${typeof p.workflow_type === "string" ? ` (${p.workflow_type})` : ""}${
        typeof p.initiated_by === "string" ? ` by ${p.initiated_by}` : ""
      }`;
    case "approval.granted":
      return `Approved at stage ${String(p.stage_order ?? "?")}${
        typeof p.approver_principal_id === "string" ? ` by ${p.approver_principal_id}` : ""
      }`;
    case "approval.rejected":
      return `Rejected at stage ${String(p.stage_order ?? "?")}${
        typeof p.approver_principal_id === "string" ? ` by ${p.approver_principal_id}` : ""
      }`;
    case "workflow.escalated":
      return `Escalated at stage ${String(p.current_stage ?? "?")}`;
    case "workflow.completed":
      return `Completed${typeof p.workflow_status === "string" ? ` as ${p.workflow_status}` : ""}`;
    default:
      return event.event_type;
  }
}

/** Human-readable reason for a refused or failed call. */
export function explainHistoryError(message: string): string {
  if (message.includes("X-Tenant-Id") || message.includes("tenant context missing")) {
    return "The request carried no verified tenant. Sign in again.";
  }
  if (message.includes("X-Principal-Id") || message.includes("caller identity missing")) {
    return "The service could not tell who was asking. Sign in again.";
  }
  if (message.includes("not authorized")) {
    return "authorization-svc refused this. Reading workflow history needs WORKFLOW_HISTORY_READ on the legal entity the history belongs to.";
  }
  if (message.includes("authorization service unavailable")) {
    return "authorization-svc could not be reached, so nothing could be checked. This service fails closed rather than guessing.";
  }
  if (message.includes("workflow_instance_id is required")) {
    return "A workflow instance ID is required.";
  }
  if (message.includes("legal_entity_id is required")) {
    return "A legal entity is required for a cross-workflow search — history is authorized per entity.";
  }
  if (message.includes("from is required") || message.includes("must be a valid RFC3339")) {
    return "Provide a valid start date.";
  }
  if (message.includes("to must be after from")) {
    return "The end date must be after the start date.";
  }
  return message;
}
