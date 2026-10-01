"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createPayableOpenItem,
  placeHold,
  releaseHold,
  applyConfirmedPayment,
  closePayable,
  type PayableSourceType,
} from "@/lib/api/payable-open-items";
import type { PayableOpenItemActionState } from "./payable-open-item-state";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };
}

const EXPIRED: PayableOpenItemActionState = {
  status: "error",
  message: "Your session has expired — sign in again.",
};

export async function createPayableOpenItemAction(
  _previous: PayableOpenItemActionState,
  formData: FormData
): Promise<PayableOpenItemActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const sourceType = String(formData.get("source_type") ?? "") as PayableSourceType;
  const sourceReference = String(formData.get("source_reference") ?? "").trim();
  const payeeRef = String(formData.get("payee_ref") ?? "").trim();
  const originalAmount = Number(formData.get("original_amount"));
  const currency = String(formData.get("currency") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "").trim();

  if (!sourceReference || !payeeRef || !currency || !dueDate || !(originalAmount > 0)) {
    return {
      status: "error",
      message: "Source reference, payee reference, a positive amount, currency, and due date are all required.",
    };
  }

  const res = await createPayableOpenItem(
    {
      legal_entity_id: identity.legalEntityId ?? "",
      source_type: sourceType,
      source_reference: sourceReference,
      payee_ref: payeeRef,
      original_amount: originalAmount,
      currency,
      due_date: new Date(dueDate).toISOString(),
    },
    identity
  );

  if (!res.ok) {
    return { status: "error", message: `payable-open-item-svc rejected the write — ${res.error.message}` };
  }

  refresh();
  return {
    status: "success",
    message: `Payable ${res.data.payable_id} created for ${res.data.payee_ref}, ${res.data.currency} ${res.data.original_amount}.`,
    payableId: res.data.payable_id,
  };
}

export async function holdPayableAction(
  _previous: PayableOpenItemActionState,
  formData: FormData
): Promise<PayableOpenItemActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const payableId = String(formData.get("payable_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) {
    return { status: "error", message: "A hold reason is required." };
  }

  const res = await placeHold(payableId, reason, identity);
  if (!res.ok) {
    return { status: "error", message: `Could not place hold — ${res.error.message}` };
  }
  refresh();
  return { status: "success", message: `Payable ${payableId} is now on hold.`, payableId };
}

export async function releaseHoldPayableAction(
  _previous: PayableOpenItemActionState,
  formData: FormData
): Promise<PayableOpenItemActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const payableId = String(formData.get("payable_id") ?? "");
  const res = await releaseHold(payableId, identity);
  if (!res.ok) {
    return { status: "error", message: `Could not release hold — ${res.error.message}` };
  }
  refresh();
  return { status: "success", message: `Hold released on payable ${payableId}.`, payableId };
}

export async function applyConfirmedPaymentAction(
  _previous: PayableOpenItemActionState,
  formData: FormData
): Promise<PayableOpenItemActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const payableId = String(formData.get("payable_id") ?? "");
  const amount = Number(formData.get("amount"));
  const providerPaymentRef = String(formData.get("provider_payment_ref") ?? "").trim();
  if (!(amount > 0) || !providerPaymentRef) {
    return { status: "error", message: "A positive amount and a provider payment reference are required." };
  }

  const res = await applyConfirmedPayment(payableId, amount, providerPaymentRef, identity);
  if (!res.ok) {
    return { status: "error", message: `Could not apply payment — ${res.error.message}` };
  }
  refresh();
  if (!res.data.applied) {
    return {
      status: "success",
      message: `No new payment applied — ${res.data.note ?? "this reference was already applied"}. Residual is unchanged at ${res.data.payable.residual_amount}.`,
      payableId,
    };
  }
  return {
    status: "success",
    message: `Payment applied. Residual is now ${res.data.payable.residual_amount}, status ${res.data.payable.status}.`,
    payableId,
  };
}

export async function closePayableAction(
  _previous: PayableOpenItemActionState,
  formData: FormData
): Promise<PayableOpenItemActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const payableId = String(formData.get("payable_id") ?? "");
  const res = await closePayable(payableId, identity);
  if (!res.ok) {
    return { status: "error", message: `Could not close payable — ${res.error.message}` };
  }
  refresh();
  return { status: "success", message: `Payable ${payableId} closed.`, payableId };
}
