"use server";

import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createPaymentRun,
  validatePaymentRun,
  lockPaymentRun,
  submitPaymentRun,
  pollInstructionStatus,
  reconcilePaymentRunStatus,
  cancelPaymentRun,
  closePaymentRun,
  createAndAuthorizeTestProposal,
  listPaymentRuns,
  getPaymentRun,
  getRunAvailableActions,
  getRunHistory,
  type InstructionStatus,
  type PaymentRun,
  type RunInstruction,
  type RunEvent,
  type AvailableActions,
} from "@/lib/api/payment-run";
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

export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  data?: unknown;
};

export async function createPaymentRunAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let identity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please sign in again." };
  }

  const legalEntityId = String(formData.get("legal_entity_id") || identity.legalEntityId || "").trim();
  const payingBankAccountRef = String(formData.get("paying_bank_account_ref") || "").trim();
  const currency = String(formData.get("currency") || "GBP").trim().toUpperCase();
  const paymentMethod = String(formData.get("payment_method") || "ACH").trim().toUpperCase();
  const valueDateRaw = String(formData.get("value_date") || "").trim();
  const authIdsRaw = String(formData.get("authorization_ids") || "").trim();

  if (!payingBankAccountRef) {
    return { status: "error", message: "Paying bank account reference is required." };
  }
  if (!currency) {
    return { status: "error", message: "Currency is required (e.g. GBP, EUR, USD)." };
  }
  if (!valueDateRaw) {
    return { status: "error", message: "Value date is required." };
  }

  const authorizationIds = authIdsRaw
    .split(/[\n, ]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (authorizationIds.length === 0) {
    return {
      status: "error",
      message: "At least one approved authorization_id is required for a payment run.",
    };
  }

  const parsedValueDate = new Date(valueDateRaw);
  if (Number.isNaN(parsedValueDate.getTime())) {
    return { status: "error", message: "Value date must be a valid date." };
  }
  const valueDate = parsedValueDate.toISOString();

  const res = await createPaymentRun(identity, {
    legal_entity_id: legalEntityId,
    paying_bank_account_ref: payingBankAccountRef,
    currency,
    payment_method: paymentMethod,
    value_date: valueDate,
    authorization_ids: authorizationIds,
  });

  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to create payment run." };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    message: `Payment run created successfully with ${res.data.instructions.length} instruction(s). Status: DRAFT`,
    data: res.data,
  };
}

export async function validatePaymentRunAction(runId: string): Promise<ActionState> {
  let identity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired." };
  }

  const res = await validatePaymentRun(identity, runId);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Validation failed." };
  }

  revalidatePath("/admin/finance");
  return { status: "success", message: `Run ${runId} VALIDATED. Authorizations confirmed intact.` };
}

export async function lockPaymentRunAction(runId: string): Promise<ActionState> {
  let identity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired." };
  }

  const res = await lockPaymentRun(identity, runId);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Locking failed." };
  }

  revalidatePath("/admin/finance");
  return { status: "success", message: `Run ${runId} LOCKED. Authorizations consumed atomically.` };
}

export async function submitPaymentRunAction(runId: string): Promise<ActionState> {
  let identity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired." };
  }

  const idempotencyKey = crypto.randomUUID();
  const res = await submitPaymentRun(identity, runId, idempotencyKey);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Submission failed." };
  }

  revalidatePath("/admin/finance");
  return { status: "success", message: `Run ${runId} SUBMITTED to Banking (BNK-06 / BNK-07).` };
}

export async function pollInstructionStatusAction(instructionId: string): Promise<ActionState> {
  let identity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired." };
  }

  const res = await pollInstructionStatus(identity, instructionId);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Polling failed." };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    message: `Instruction status polled from BNK-07: ${res.data.status}`,
    data: res.data,
  };
}

export async function reconcileInstructionAction(
  instructionId: string,
  externalStatus: InstructionStatus,
  providerEventRef: string,
): Promise<ActionState> {
  let identity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired." };
  }

  const eventRef = providerEventRef.trim() || `EVT-${Date.now()}`;
  const res = await reconcilePaymentRunStatus(identity, instructionId, externalStatus, eventRef);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Reconciliation failed." };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    message: `Instruction reconciled as ${externalStatus}. Run aggregate status updated to ${res.data.run.status}.`,
    data: res.data,
  };
}

export async function cancelPaymentRunAction(runId: string, reason: string): Promise<ActionState> {
  let identity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired." };
  }

  const res = await cancelPaymentRun(identity, runId, reason.trim() || "Manual operator cancellation");
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Cancellation failed." };
  }

  revalidatePath("/admin/finance");
  return { status: "success", message: `Run ${runId} CANCELLED.` };
}

export async function closePaymentRunAction(runId: string, note: string): Promise<ActionState> {
  let identity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired." };
  }

  const res = await closePaymentRun(identity, runId, note.trim() || "Run reconciled and completed");
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Closing failed." };
  }

  revalidatePath("/admin/finance");
  return { status: "success", message: `Run ${runId} CLOSED / COMPLETED.` };
}

export async function createUpstreamAuthorizedInstructionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let identity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired." };
  }

  const legalEntityId = String(formData.get("legal_entity_id") || identity.legalEntityId || "").trim();
  const payingBankAccountRef = String(formData.get("paying_bank_account_ref") || "BARCLAYS-OPERATING-01").trim();
  const currency = String(formData.get("currency") || "GBP").trim().toUpperCase();
  const payeeRef = String(formData.get("payee_ref") || "VND-ACME-UK").trim();
  const netAmount = Number(formData.get("net_amount") || 15000);
  const paymentMethod = String(formData.get("payment_method") || "ACH").trim().toUpperCase();

  const res = await createAndAuthorizeTestProposal(identity, {
    legalEntityId,
    payingBankAccountRef,
    currency,
    payeeRef,
    netAmount,
    paymentMethod,
  });

  if (!res.ok) {
    return { status: "error", message: res.error.message || "Upstream pipeline execution failed." };
  }

  return {
    status: "success",
    message: `Generated Approved Authorization: ${res.data.authorization_id} (Proposal: ${res.data.proposal_id})`,
    data: res.data,
  };
}
