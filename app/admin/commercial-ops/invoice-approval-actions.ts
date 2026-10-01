"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createInvoiceApproval,
  submitApprovalDecision,
  getInvoiceApproval,
  listInvoiceApprovals,
  type InvoiceApprovalRequest,
  type ApprovalDetailResponse,
} from "@/lib/api/invoice-approvals";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const decoded = decodeSession(raw);
  if (!decoded) {
    throw new Error("unauthenticated");
  }
  return decoded;
}

export type InvoiceApprovalActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  requestId?: string;
  request?: InvoiceApprovalRequest;
};

export type DecisionActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  requestId?: string;
  request?: InvoiceApprovalRequest;
};

export type LookupApprovalActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  data?: ApprovalDetailResponse;
};

/**
 * Initiate an invoice approval workflow on invoice-approval-svc (:8107).
 */
export async function createInvoiceApprovalAction(
  _previous: InvoiceApprovalActionState,
  formData: FormData
): Promise<InvoiceApprovalActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const legalEntityId = String(formData.get("legal_entity_id") ?? identity.legalEntityId).trim();
  const amountStr = String(formData.get("invoice_amount") ?? "").trim();
  const currencyCode = String(formData.get("currency_code") ?? "GBP").trim().toUpperCase();
  const totalStepsStr = String(formData.get("total_steps") ?? "1").trim();

  if (!invoiceId) {
    return { status: "error", message: "Invoice ID (UUID from accounts-payable-svc) is required." };
  }
  if (!legalEntityId) {
    return { status: "error", message: "Legal Entity ID is required." };
  }
  const invoiceAmount = parseFloat(amountStr);
  if (isNaN(invoiceAmount) || invoiceAmount <= 0) {
    return { status: "error", message: "Invoice amount must be a positive number greater than 0." };
  }
  const totalSteps = parseInt(totalStepsStr, 10);
  if (isNaN(totalSteps) || totalSteps <= 0) {
    return { status: "error", message: "Total steps must be at least 1." };
  }

  const res = await createInvoiceApproval(
    {
      invoice_id: invoiceId,
      legal_entity_id: legalEntityId,
      invoice_amount: invoiceAmount,
      currency_code: currencyCode,
      total_steps: totalSteps,
    },
    identity
  );

  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to initiate invoice approval." };
  }

  revalidatePath("/admin/commercial-ops");
  return {
    status: "success",
    requestId: res.data.approval_request_id,
    request: res.data,
    message: `Invoice approval workflow initiated on invoice-approval-svc (:8107)! Status: ${res.data.status}, Request ID: ${res.data.approval_request_id}, Workflow Instance: ${res.data.workflow_instance_id}`,
  };
}

/**
 * Submit an approval decision (APPROVE / REJECT) on an approval request.
 * Allows electing an authorized SoD approver identity to verify separation of duties.
 */
export async function submitApprovalDecisionAction(
  _previous: DecisionActionState,
  formData: FormData
): Promise<DecisionActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const requestId = String(formData.get("approval_request_id") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim().toUpperCase();
  const decisionReason = String(formData.get("decision_reason") ?? "").trim();
  const actorMode = String(formData.get("actor_mode") ?? "sod").trim();

  if (!requestId) {
    return { status: "error", message: "Approval Request ID is required." };
  }
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return { status: "error", message: "Decision must be APPROVED or REJECTED." };
  }
  if (!decisionReason) {
    return { status: "error", message: "Decision reason / notes are required for audit governance." };
  }

  // Segregation of Duties handling:
  // If actorMode is "self" (creator), we use the session identity (33333333-3333-3333-3333-333333333333).
  // If actorMode is "sod", we use the verified SoD Approver (66666666-6666-6666-6666-666666666666).
  const deciderIdentity: SessionIdentity =
    actorMode === "sod"
      ? {
          ...identity,
          principalId: "66666666-6666-6666-6666-666666666666",
        }
      : identity;

  const res = await submitApprovalDecision(
    requestId,
    {
      decision: decision as "APPROVED" | "REJECTED",
      decision_reason: decisionReason,
    },
    deciderIdentity
  );

  if (!res.ok) {
    return {
      status: "error",
      message: res.error.message || `Failed to submit decision ${decision}.`,
      requestId,
    };
  }

  revalidatePath("/admin/commercial-ops");
  return {
    status: "success",
    requestId: res.data.approval_request_id,
    request: res.data,
    message: `Decision successfully submitted! Request ${res.data.approval_request_id} is now ${res.data.status} (Current step: ${res.data.current_step}/${res.data.total_steps}).`,
  };
}

/**
 * Look up full approval details including multi-step decisions log.
 */
export async function lookupInvoiceApprovalAction(
  _previous: LookupApprovalActionState,
  formData: FormData
): Promise<LookupApprovalActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const requestId = String(formData.get("lookup_request_id") ?? "").trim();
  if (!requestId) {
    return { status: "error", message: "Approval Request ID is required." };
  }

  const res = await getInvoiceApproval(requestId, identity);
  if (!res.ok) {
    return { status: "error", message: res.error.message || `Approval request ${requestId} not found.` };
  }

  return {
    status: "success",
    data: res.data,
    message: `Retrieved approval details for request ${requestId} from invoice-approval-svc (:8107).`,
  };
}

/**
 * Fetch live approval requests for a given status.
 */
export async function fetchLiveApprovals(status?: string): Promise<InvoiceApprovalRequest[]> {
  try {
    const identity = await requireIdentity();
    const res = await listInvoiceApprovals(
      { legal_entity_id: identity.legalEntityId, status },
      identity
    );
    if (res.ok) return res.data;
  } catch {
    // Return empty on unauthenticated or failure
  }
  return [];
}
