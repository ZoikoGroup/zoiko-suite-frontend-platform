"use server";

// Server Actions for workflow-history-svc (:8097).
//
// This service has no write HTTP surface at all — it is a pure Kafka
// consumer + two read routes. Both actions below are reads, exposed as
// Server Actions only because the calling components are client components
// that need identity resolved from the session cookie first.

import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import { explainHistoryError, getInstanceHistory, searchWorkflowHistory } from "@/lib/api/workflow-history";
import type { InstanceHistoryState, SearchHistoryState } from "./state";

async function requireIdentity(): Promise<SessionIdentity & { principalId: string }> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };
}

const EXPIRED = "Your session has expired — sign in again.";

export async function lookupInstanceHistoryAction(workflowInstanceId: string): Promise<InstanceHistoryState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "unauthorized", message: EXPIRED };
  }

  const trimmed = workflowInstanceId.trim();
  if (!trimmed) return { status: "error", message: "A workflow instance ID is required." };

  const result = await getInstanceHistory({ identity, workflowInstanceId: trimmed });

  if (!result.ok) {
    const { status, message } = result.error;
    const explained = explainHistoryError(message);
    if (status === 401) return { status: "unauthorized", message: explained };
    if (status === 403) return { status: "refused", message: explained };
    if (status === 404) return { status: "not_found", message: explained };
    return { status: "error", message: explained };
  }

  return { status: "found", workflowInstanceId: trimmed, events: result.data };
}

export async function searchWorkflowHistoryAction(
  _prev: SearchHistoryState,
  formData: FormData,
): Promise<SearchHistoryState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "unauthorized", message: EXPIRED };
  }

  const legalEntityId = String(formData.get("legal_entity_id") ?? "").trim() || identity.legalEntityId;
  const fromDate = String(formData.get("from") ?? "").trim();
  const toDate = String(formData.get("to") ?? "").trim();

  if (!legalEntityId) {
    return { status: "error", message: "A legal entity is required — history is authorized per entity." };
  }
  if (!fromDate || !toDate) {
    return { status: "error", message: "Both a start and end date are required." };
  }

  const result = await searchWorkflowHistory({
    identity,
    legalEntityId,
    from: `${fromDate}T00:00:00Z`,
    to: `${toDate}T23:59:59Z`,
  });

  if (!result.ok) {
    const { status, message } = result.error;
    const explained = explainHistoryError(message);
    if (status === 401) return { status: "unauthorized", message: explained };
    if (status === 403) return { status: "refused", message: explained };
    return { status: "error", message: explained };
  }

  return { status: "found", events: result.data };
}
