"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  approveRecoveryCase,
  applyRecoveryOffset,
  closeRecoveryCase,
  createRecoveryCase,
  escalateRecovery,
  linkSupplierRefund,
  recordRecoveryCommitment,
  writeOffRecovery,
  type RecoveryBasis,
} from "@/lib/api/supplier-recovery";

export type SupplierRecoveryActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  caseId?: string;
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

const EXPIRED: SupplierRecoveryActionState = {
  status: "error",
  message: "Your session has expired — sign in again.",
};

async function identityOrExpired(): Promise<SessionIdentity | SupplierRecoveryActionState> {
  try {
    return await requireIdentity();
  } catch {
    return EXPIRED;
  }
}

export async function createSupplierRecoveryCaseAction(
  _previous: SupplierRecoveryActionState,
  formData: FormData,
): Promise<SupplierRecoveryActionState> {
  const identity = await identityOrExpired();
  if ("status" in identity) return identity;
  const sourcePayableId = String(formData.get("source_payable_id") ?? "").trim();
  const legalEntityId = String(formData.get("legal_entity_id") ?? "").trim();
  const supplierRef = String(formData.get("supplier_ref") ?? "").trim();
  const basis = String(formData.get("recovery_basis") ?? "") as RecoveryBasis;
  const amount = Number(formData.get("total_amount"));
  const currency = String(formData.get("currency") ?? "").trim().toUpperCase();
  const reason = String(formData.get("recovery_reason") ?? "").trim();
  if (!legalEntityId || !sourcePayableId || !supplierRef || !basis || !(amount > 0) || !currency || !reason) {
    return { status: "error", message: "Legal entity, source payable, supplier, basis, positive amount, currency, and reason are required." };
  }
  if (legalEntityId !== identity.legalEntityId) {
    return { status: "error", message: "The legal entity must match the signed-in session." };
  }
  const result = await createRecoveryCase(
    {
      legal_entity_id: identity.legalEntityId,
      supplier_ref: supplierRef,
      recovery_basis: basis,
      source_payable_id: sourcePayableId,
      total_amount: amount,
      currency,
      recovery_reason: reason,
    },
    identity,
  );
  if (!result.ok) return { status: "error", message: result.error.message };
  refresh();
  return { status: "success", caseId: result.data.case_id, message: `Recovery case ${result.data.case_id} created.` };
}

type CaseAction = (caseId: string, identity: SessionIdentity, formData: FormData) => Promise<{ ok: boolean; error?: { message: string } }>;

async function runCaseAction(
  caseId: string,
  action: CaseAction,
  formData: FormData,
): Promise<SupplierRecoveryActionState> {
  const identity = await identityOrExpired();
  if ("status" in identity) return identity;
  const result = await action(caseId, identity, formData);
  if (!result.ok) return { status: "error", caseId, message: result.error?.message ?? "Supplier recovery action failed." };
  refresh();
  return { status: "success", caseId, message: "Supplier recovery action completed." };
}

export async function approveSupplierRecoveryCaseAction(
  _previous: SupplierRecoveryActionState,
  formData: FormData,
): Promise<SupplierRecoveryActionState> {
  return runCaseAction(String(formData.get("case_id") ?? ""), (id, identity) => approveRecoveryCase(id, identity), formData);
}

export async function recordSupplierCommitmentAction(
  _previous: SupplierRecoveryActionState,
  formData: FormData,
): Promise<SupplierRecoveryActionState> {
  return runCaseAction(String(formData.get("case_id") ?? ""), (id, identity, fd) =>
      recordRecoveryCommitment(id, String(fd.get("detail") ?? ""), String(fd.get("expected_method") ?? ""), identity),
    formData);
}

export async function applyRecoveryOffsetAction(
  _previous: SupplierRecoveryActionState,
  formData: FormData,
): Promise<SupplierRecoveryActionState> {
  return runCaseAction(String(formData.get("case_id") ?? ""), (id, identity, fd) =>
      applyRecoveryOffset(id, Number(fd.get("amount")), String(fd.get("recovery_ref") ?? ""), identity),
    formData);
}

export async function linkSupplierRefundAction(
  _previous: SupplierRecoveryActionState,
  formData: FormData,
): Promise<SupplierRecoveryActionState> {
  return runCaseAction(String(formData.get("case_id") ?? ""), (id, identity, fd) =>
      linkSupplierRefund(id, String(fd.get("statement_line_id") ?? ""), identity),
    formData);
}

export async function escalateSupplierRecoveryAction(
  _previous: SupplierRecoveryActionState,
  formData: FormData,
): Promise<SupplierRecoveryActionState> {
  return runCaseAction(String(formData.get("case_id") ?? ""), (id, identity, fd) =>
      escalateRecovery(id, String(fd.get("reason") ?? ""), identity),
    formData);
}

export async function closeSupplierRecoveryCaseAction(
  _previous: SupplierRecoveryActionState,
  formData: FormData,
): Promise<SupplierRecoveryActionState> {
  return runCaseAction(String(formData.get("case_id") ?? ""), (id, identity, fd) =>
      closeRecoveryCase(id, String(fd.get("note") ?? ""), identity),
    formData);
}

export async function writeOffSupplierRecoveryAction(
  _previous: SupplierRecoveryActionState,
  formData: FormData,
): Promise<SupplierRecoveryActionState> {
  return runCaseAction(String(formData.get("case_id") ?? ""), (id, identity, fd) =>
      writeOffRecovery(id, String(fd.get("reason") ?? ""), identity),
    formData);
}
