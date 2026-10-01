"use server";

import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  preparePaymentAttempt,
  submitPaymentAttempt,
  retryPaymentAttempt,
  cancelPaymentAttempt,
  resolveAmbiguousPaymentAttempt,
  quarantinePaymentAttempt,
  getProviderReceipt,
  getAttemptEvidence,
  listPaymentAttempts,
  type PaymentInitiationAttempt,
  type ProviderReceipt,
  type AttemptEvidence,
  type AttemptStatus,
} from "@/lib/api/payment-initiation";
import { revalidatePath } from "next/cache";

async function requireIdentity(): Promise<SessionIdentity & { principalId: string }> {
  try {
    const store = await cookies();
    const session = decodeSession(store.get(SESSION_COOKIE)?.value);
    if (session?.principalId) {
      return {
        principalId: session.principalId,
        tenantId: session.tenantId || "11111111-1111-1111-1111-111111111111",
        legalEntityId: session.legalEntityId || "22222222-2222-2222-2222-222222222222",
      };
    }
  } catch {
    // Fall back to demo operator identity
  }
  return {
    principalId: "33333333-3333-3333-3333-333333333333",
    tenantId: "11111111-1111-1111-1111-111111111111",
    legalEntityId: "22222222-2222-2222-2222-222222222222",
  };
}

export type PaymentInitiationActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  data?: unknown;
};

export async function preparePaymentAttemptAction(
  _prev: PaymentInitiationActionState,
  formData: FormData,
): Promise<PaymentInitiationActionState> {
  const identity = await requireIdentity();

  const legalEntityId = (formData.get("legal_entity_id") as string) || identity.legalEntityId;
  const payerAccountRef = (formData.get("payer_account_ref") as string)?.trim();
  const payeeRef = (formData.get("payee_ref") as string)?.trim();
  const amountStr = formData.get("amount") as string;
  const currency = (formData.get("currency") as string)?.trim() || "GBP";
  const sourceReference = (formData.get("source_reference") as string)?.trim() || `manual-${Date.now()}`;
  const paymentReference = (formData.get("payment_reference") as string)?.trim() || "";
  const executionDate = (formData.get("execution_date") as string)?.trim() || new Date().toISOString();
  const payerAccountVerified = formData.get("payer_account_verified") === "true" || formData.get("payer_account_verified") === "on";
  let idempotencyKey = (formData.get("idempotency_key") as string)?.trim();

  if (!payerAccountRef || !payeeRef) {
    return { status: "error", message: "Payer Account Reference and Payee Reference are required." };
  }

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    return { status: "error", message: "Amount must be a positive number greater than 0." };
  }

  if (!payerAccountVerified) {
    return {
      status: "error",
      message: "Explicit attestation required: Payer Account must be verified before payment initiation.",
    };
  }

  if (!idempotencyKey) {
    idempotencyKey = `INIT-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  const res = await preparePaymentAttempt(identity, {
    legal_entity_id: legalEntityId,
    source_reference: sourceReference,
    payer_account_ref: payerAccountRef,
    payee_ref: payeeRef,
    amount,
    currency,
    execution_date: executionDate,
    payment_reference: paymentReference,
    payer_account_verified: payerAccountVerified,
    idempotency_key: idempotencyKey,
  });

  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to prepare payment attempt." };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    message: `Payment attempt prepared successfully with status PREPARED. ID: ${res.data.attempt_id}`,
    data: res.data,
  };
}

export async function submitPaymentAttemptAction(
  attemptId: string,
): Promise<PaymentInitiationActionState> {
  const identity = await requireIdentity();
  if (!attemptId) {
    return { status: "error", message: "Attempt ID is required." };
  }

  const res = await submitPaymentAttempt(identity, attemptId);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to submit payment attempt." };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    message: `Payment attempt submitted to provider. Outcome status: ${res.data.status}`,
    data: res.data,
  };
}

export async function retryPaymentAttemptAction(
  attemptId: string,
): Promise<PaymentInitiationActionState> {
  const identity = await requireIdentity();
  if (!attemptId) {
    return { status: "error", message: "Attempt ID is required." };
  }

  const res = await retryPaymentAttempt(identity, attemptId);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to retry payment attempt." };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    message: `Payment attempt re-submitted with identical Idempotency Key. New status: ${res.data.status}`,
    data: res.data,
  };
}

export async function cancelPaymentAttemptAction(
  attemptId: string,
): Promise<PaymentInitiationActionState> {
  const identity = await requireIdentity();
  if (!attemptId) {
    return { status: "error", message: "Attempt ID is required." };
  }

  const res = await cancelPaymentAttempt(identity, attemptId);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to cancel presubmit attempt." };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    message: `Payment attempt cancelled prior to provider submission.`,
    data: res.data,
  };
}

export async function resolveAmbiguousPaymentAttemptAction(
  attemptId: string,
  resolvedStatus: "SUBMITTED" | "REJECTED_BEFORE_SUBMISSION",
  note: string,
): Promise<PaymentInitiationActionState> {
  const identity = await requireIdentity();
  if (!attemptId) {
    return { status: "error", message: "Attempt ID is required." };
  }
  if (!note || note.trim().length === 0) {
    return { status: "error", message: "Audit note is required to resolve ambiguous attempt." };
  }

  const res = await resolveAmbiguousPaymentAttempt(identity, attemptId, resolvedStatus, note);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to resolve ambiguity." };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    message: `Ambiguity resolved to ${resolvedStatus} with governance note.`,
    data: res.data,
  };
}

export async function quarantinePaymentAttemptAction(
  attemptId: string,
  reason: string,
): Promise<PaymentInitiationActionState> {
  const identity = await requireIdentity();
  if (!attemptId) {
    return { status: "error", message: "Attempt ID is required." };
  }
  if (!reason || reason.trim().length === 0) {
    return { status: "error", message: "Reason is required to quarantine payment attempt." };
  }

  const res = await quarantinePaymentAttempt(identity, attemptId, reason);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to quarantine payment attempt." };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    message: `Attempt moved to QUARANTINED state. Reason: ${reason}`,
    data: res.data,
  };
}

export async function fetchAttemptReceiptAction(
  attemptId: string,
): Promise<{ ok: boolean; data?: ProviderReceipt; error?: string }> {
  const identity = await requireIdentity();
  const res = await getProviderReceipt(identity, attemptId);
  if (!res.ok) {
    return { ok: false, error: res.error.message };
  }
  return { ok: true, data: res.data };
}

export async function fetchAttemptEvidenceAction(
  attemptId: string,
): Promise<{ ok: boolean; data?: AttemptEvidence; error?: string }> {
  const identity = await requireIdentity();
  const res = await getAttemptEvidence(identity, attemptId);
  if (!res.ok) {
    return { ok: false, error: res.error.message };
  }
  return { ok: true, data: res.data };
}

export async function refreshPaymentAttemptsAction(
  legalEntityId?: string,
): Promise<{ ok: boolean; data?: PaymentInitiationAttempt[]; error?: string }> {
  const identity = await requireIdentity();
  const res = await listPaymentAttempts(identity, { legalEntityId });
  if (!res.ok) {
    return { ok: false, error: res.error.message };
  }
  return { ok: true, data: res.data };
}
