"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  recordPaymentStatus,
  pollPaymentStatus,
  linkStatement,
  resolveConflict,
  recordReturn,
  cancelPayment,
  sendProviderWebhookCallback,
  getStatusHistory,
  getFinalityEvidence,
  getPaymentStatus,
  type ExecutionStatus,
  type PaymentExecutionState,
  type StatusEvent,
  type FinalityEvidence,
} from "@/lib/api/payment-status";

export type PaymentStatusActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  paymentId?: string;
  payment?: PaymentExecutionState;
};

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.principalId || !session.tenantId || !session.legalEntityId) {
    throw new Error("Unauthorized");
  }
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };
}

const EXPIRED: PaymentStatusActionState = {
  status: "error",
  message: "Your session has expired — sign in again.",
};

async function identityOrExpired(): Promise<SessionIdentity | PaymentStatusActionState> {
  try {
    return await requireIdentity();
  } catch {
    return EXPIRED;
  }
}

export async function recordPaymentStatusAction(
  _previous: PaymentStatusActionState,
  formData: FormData
): Promise<PaymentStatusActionState> {
  const identity = await identityOrExpired();
  if ("status" in identity) return identity;

  const legalEntityId = String(formData.get("legal_entity_id") ?? identity.legalEntityId).trim();
  const providerRequestId = String(formData.get("provider_request_id") ?? "").trim();
  const sourceReference = String(formData.get("source_reference") ?? "").trim();

  if (!legalEntityId) {
    return { status: "error", message: "Legal Entity ID is required." };
  }

  const res = await recordPaymentStatus(identity, {
    legal_entity_id: legalEntityId,
    provider_request_id: providerRequestId,
    source_reference: sourceReference,
  });

  if (!res.ok) {
    return { status: "error", message: res.error.message };
  }

  refresh();
  return {
    status: "success",
    message: `Payment execution state registered (ID: ${res.data.payment_id})`,
    paymentId: res.data.payment_id,
    payment: res.data,
  };
}

export async function pollPaymentStatusAction(
  _previous: PaymentStatusActionState,
  formData: FormData
): Promise<PaymentStatusActionState> {
  const identity = await identityOrExpired();
  if ("status" in identity) return identity;

  const paymentId = String(formData.get("payment_id") ?? "").trim();
  const reportedStatus = String(formData.get("reported_status") ?? "").trim() as ExecutionStatus;
  const providerEventRef = String(formData.get("provider_event_ref") ?? "").trim();
  const mappingVersion = String(formData.get("mapping_version") ?? "iso20022-camt054").trim();

  if (!paymentId) return { status: "error", message: "Payment ID is required." };
  if (!reportedStatus) return { status: "error", message: "Reported status is required." };

  const res = await pollPaymentStatus(identity, paymentId, {
    reported_status: reportedStatus,
    provider_event_ref: providerEventRef,
    mapping_version: mappingVersion,
  });

  if (!res.ok) {
    return { status: "error", message: res.error.message };
  }

  refresh();
  return {
    status: "success",
    message: res.data.applied
      ? `Payment ${paymentId} updated to ${res.data.payment.status} via poll`
      : `Poll processed (no transition applied / duplicate ignored)`,
    paymentId,
    payment: res.data.payment,
  };
}

export async function linkStatementAction(
  _previous: PaymentStatusActionState,
  formData: FormData
): Promise<PaymentStatusActionState> {
  const identity = await identityOrExpired();
  if ("status" in identity) return identity;

  const paymentId = String(formData.get("payment_id") ?? "").trim();
  const statementReference = String(formData.get("statement_reference") ?? "").trim();
  const reportedStatus = String(formData.get("reported_status") ?? "").trim() as ExecutionStatus;

  if (!paymentId) return { status: "error", message: "Payment ID is required." };
  if (!statementReference) return { status: "error", message: "Statement reference is required." };
  if (!reportedStatus) return { status: "error", message: "Reported status is required." };

  const res = await linkStatement(identity, paymentId, {
    statement_reference: statementReference,
    reported_status: reportedStatus,
  });

  if (!res.ok) {
    return { status: "error", message: res.error.message };
  }

  refresh();
  const conflictMsg = res.data.conflict_raised
    ? ` ⚠️ STATUS CONFLICT DETECTED: Bank statement reported ${reportedStatus} while canonical status was ${res.data.payment.status}. Conflict raised for investigation.`
    : ` Statement confirmation linked successfully.`;

  return {
    status: "success",
    message: `Payment ${paymentId}: ${conflictMsg}`,
    paymentId,
    payment: res.data.payment,
  };
}

export async function resolveConflictAction(
  _previous: PaymentStatusActionState,
  formData: FormData
): Promise<PaymentStatusActionState> {
  const identity = await identityOrExpired();
  if ("status" in identity) return identity;

  const paymentId = String(formData.get("payment_id") ?? "").trim();
  const finalStatus = String(formData.get("final_status") ?? "").trim() as ExecutionStatus;
  const reason = String(formData.get("reason") ?? "").trim();

  if (!paymentId) return { status: "error", message: "Payment ID is required." };
  if (!finalStatus) return { status: "error", message: "Final status is required." };
  if (!reason) return { status: "error", message: "Reason for exceptional override is required." };

  const res = await resolveConflict(identity, paymentId, {
    final_status: finalStatus,
    reason,
  });

  if (!res.ok) {
    return { status: "error", message: res.error.message };
  }

  refresh();
  return {
    status: "success",
    message: `Conflict resolved for payment ${paymentId}. Status set to ${res.data.status} by manual override.`,
    paymentId,
    payment: res.data,
  };
}

export async function recordReturnAction(
  _previous: PaymentStatusActionState,
  formData: FormData
): Promise<PaymentStatusActionState> {
  const identity = await identityOrExpired();
  if ("status" in identity) return identity;

  const paymentId = String(formData.get("payment_id") ?? "").trim();
  const providerEventRef = String(formData.get("provider_event_ref") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!paymentId) return { status: "error", message: "Payment ID is required." };
  if (!reason) return { status: "error", message: "Reason for return is required." };

  const res = await recordReturn(identity, paymentId, {
    provider_event_ref: providerEventRef,
    reason,
  });

  if (!res.ok) {
    return { status: "error", message: res.error.message };
  }

  refresh();
  return {
    status: "success",
    message: `Payment ${paymentId} successfully returned. Status is now RETURNED.`,
    paymentId,
    payment: res.data,
  };
}

export async function cancelPaymentAction(
  _previous: PaymentStatusActionState,
  formData: FormData
): Promise<PaymentStatusActionState> {
  const identity = await identityOrExpired();
  if ("status" in identity) return identity;

  const paymentId = String(formData.get("payment_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "Cancelled by operator").trim();

  if (!paymentId) return { status: "error", message: "Payment ID is required." };

  const res = await cancelPayment(identity, paymentId, { reason });

  if (!res.ok) {
    return { status: "error", message: res.error.message };
  }

  refresh();
  return {
    status: "success",
    message: `Payment ${paymentId} cancelled successfully.`,
    paymentId,
    payment: res.data,
  };
}

export async function sendProviderWebhookCallbackAction(
  _previous: PaymentStatusActionState,
  formData: FormData
): Promise<PaymentStatusActionState> {
  const paymentId = String(formData.get("payment_id") ?? "").trim();
  const providerEventRef = String(formData.get("provider_event_ref") ?? "").trim();
  const reportedStatus = String(formData.get("reported_status") ?? "").trim() as ExecutionStatus;
  const mappingVersion = String(formData.get("mapping_version") ?? "iso20022-camt054").trim();
  const invalidSignature = formData.get("invalid_signature") === "true";

  if (!paymentId) return { status: "error", message: "Payment ID is required." };
  if (!providerEventRef) return { status: "error", message: "Provider Event Ref is required." };
  if (!reportedStatus) return { status: "error", message: "Reported Status is required." };

  const res = await sendProviderWebhookCallback({
    payment_id: paymentId,
    provider_event_ref: providerEventRef,
    reported_status: reportedStatus,
    mapping_version: mappingVersion,
    invalid_signature: invalidSignature,
  });

  if (!res.ok) {
    return { status: "error", message: res.error.message };
  }

  refresh();
  return {
    status: "success",
    message: res.data.applied
      ? `Webhook accepted with valid HMAC-SHA256 signature! Status updated to ${res.data.payment.status}.`
      : `Webhook received with valid HMAC-SHA256 signature: event acknowledged (applied=false, regression/duplicate prevented).`,
    paymentId,
    payment: res.data.payment,
  };
}

export async function fetchPaymentHistoryAction(paymentId: string): Promise<StatusEvent[]> {
  const identity = await requireIdentity();
  const res = await getStatusHistory(identity, paymentId);
  if (!res.ok) return [];
  return res.data;
}

export async function fetchFinalityEvidenceAction(paymentId: string): Promise<FinalityEvidence | null> {
  const identity = await requireIdentity();
  const res = await getFinalityEvidence(identity, paymentId);
  if (!res.ok) return null;
  return res.data;
}

export async function fetchPaymentDetailsAction(paymentId: string): Promise<PaymentExecutionState | null> {
  const identity = await requireIdentity();
  const res = await getPaymentStatus(identity, paymentId);
  if (!res.ok) return null;
  return res.data;
}
