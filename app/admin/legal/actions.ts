"use server";

// Server Actions that WRITE to contract-lifecycle-svc (:8119).
//
// Server Actions are reachable by direct POST, not only through this UI, so the
// session is verified inside every action rather than relying on the proxy's
// /admin matcher.
//
// Unlike the purchase-order actions, these are the ONLY permission check in the
// path. contract-lifecycle-svc builds an authorization client and never calls
// it, so no backend will refuse a caller the console admits. That makes the
// session lookup here load-bearing rather than merely informational — and it is
// still not a substitute for authorization, because it establishes who is asking
// without ever asking whether they may. Wiring authorization-svc into the
// service is the fix; a check added here would only be advisory, since the
// service's own HTTP surface remains open.
//
// Validation that duplicates the service is deliberate where the service's
// answer would be unhelpful: it rejects a missing title with prose, accepts a
// nonsensical date range without comment, and treats a zero as "field omitted".

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  draftContract as draftContractCall,
  reviseContract as reviseContractCall,
  submitContractForApproval,
  activateContract as activateContractCall,
  terminateContract as terminateContractCall,
  explainContractError,
  CONTRACT_TYPES,
  type ContractType,
} from "@/lib/api/contracts";
import type { ContractActionState } from "./state";

const REGISTER_PATH = "/admin/legal";

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

const EXPIRED: ContractActionState = {
  status: "error",
  message: "Your session has expired — sign in again.",
};

/** Refresh the register and the contract's own page. Both are revalidated on
 *  every write because a lifecycle action is initiated from either one. */
function revalidateContract(contractId: string): void {
  revalidatePath(REGISTER_PATH);
  revalidatePath(`${REGISTER_PATH}/${contractId}`);
}

/**
 * Draft a new contract.
 *
 * Always lands in DRAFT at v1 with an "Initial draft" snapshot — the service
 * ignores any status supplied by the caller, so there is no way to create a
 * contract that is already in force.
 */
export async function draftContract(
  _previous: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const title = String(formData.get("title") ?? "").trim();
  const contractType = String(formData.get("contract_type") ?? "").trim();
  const counterpartyId = String(formData.get("counterparty_id") ?? "").trim();
  const counterpartyName = String(formData.get("counterparty_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();
  const effectiveTo = String(formData.get("effective_to") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim();
  const valueRaw = String(formData.get("total_value") ?? "").trim();

  if (!title) return fail("A contract title is required.");
  if (!counterpartyId) return fail("A counterparty ID is required.");
  if (!isContractType(contractType)) return fail("Select a contract type.");
  if (!currency) return fail("Currency is required.");

  const dateError = validateDateRange(effectiveFrom, effectiveTo);
  if (dateError) return fail(dateError);

  // The service treats total_value: 0 as "not supplied" on revision, so a
  // zero-value contract cannot later be revised upward from zero in one step.
  // Rejecting it here keeps the register free of records that behave oddly.
  const totalValue = Number(valueRaw);
  if (valueRaw === "" || !Number.isFinite(totalValue) || totalValue <= 0) {
    return fail("Contract value must be a number greater than zero.");
  }

  const result = await draftContractCall({
    identity,
    contractType,
    title,
    description: description || undefined,
    counterpartyId,
    counterpartyName: counterpartyName || undefined,
    effectiveFrom,
    effectiveTo: effectiveTo || undefined,
    currency,
    totalValue,
  });

  if (!result.ok) return fail(explainContractError(result.error.message));

  revalidateContract(result.data.contract_id);

  return {
    status: "drafted",
    title: result.data.title,
    contractId: result.data.contract_id,
    message: `“${result.data.title}” drafted at v${result.data.version}. It is not in force until it is activated.`,
  };
}

/**
 * Revise a DRAFT or PENDING_APPROVAL contract's terms.
 *
 * Only fields the user actually filled in are sent. The service merges
 * field-by-field and reads an empty string or a zero as "leave unchanged", so
 * sending blanks for untouched fields would work by accident rather than by
 * intent — and would silently stop working if the service ever started
 * honouring them.
 */
export async function reviseContract(
  _previous: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const contractId = String(formData.get("contract_id") ?? "").trim();
  const changeSummary = String(formData.get("change_summary") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const counterpartyName = String(formData.get("counterparty_name") ?? "").trim();
  const effectiveTo = String(formData.get("effective_to") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim();
  const valueRaw = String(formData.get("total_value") ?? "").trim();

  if (!contractId) return fail("Missing contract ID.");
  // The service defaults change_summary to "" and stores it. An unexplained
  // restatement of contractual terms is exactly what the version history exists
  // to prevent, so the console requires the reason even though the service
  // does not.
  if (!changeSummary) return fail("A change summary is required — it is the audit record.");

  if (effectiveTo && !isDate(effectiveTo)) {
    return fail("Effective-to must be a valid date.");
  }

  let totalValue: number | undefined;
  if (valueRaw !== "") {
    totalValue = Number(valueRaw);
    if (!Number.isFinite(totalValue) || totalValue <= 0) {
      return fail("Revised value must be a number greater than zero.");
    }
  }

  const result = await reviseContractCall({
    contractId,
    identity,
    changeSummary,
    title: title || undefined,
    counterpartyName: counterpartyName || undefined,
    effectiveTo: effectiveTo || undefined,
    currency: currency || undefined,
    totalValue,
  });

  if (!result.ok) return fail(explainContractError(result.error.message));

  revalidateContract(contractId);

  return {
    status: "revised",
    title: result.data.title,
    contractId,
    message: `“${result.data.title}” revised — now at v${result.data.version}. The previous terms are preserved in the version history.`,
  };
}

/**
 * Submit a DRAFT for approval.
 *
 * Records no actor and appends no version row — the service ignores the request
 * body and does not snapshot on this transition. The success message says so,
 * because a reader who expects the submission in the history will not find it.
 */
export async function submitContract(
  _previous: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const contractId = String(formData.get("contract_id") ?? "").trim();
  if (!contractId) return fail("Missing contract ID.");

  const result = await submitContractForApproval(contractId, identity);
  if (!result.ok) return fail(explainContractError(result.error.message));

  revalidateContract(contractId);

  return {
    status: "submitted",
    title: result.data.title,
    contractId,
    message: `“${result.data.title}” is now PENDING_APPROVAL. This step is not versioned — it leaves no row in the contract's history.`,
  };
}

/**
 * Activate a contract, recording who signed it and when.
 *
 * `signed_at` is stamped here rather than left to the service: it parses the
 * field into a time.Time and stores whatever it parses, so an omitted value
 * would be written as the zero time — 0001-01-01 — instead of now.
 */
export async function activateContract(
  _previous: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const contractId = String(formData.get("contract_id") ?? "").trim();
  const signedBy = String(formData.get("signed_by") ?? "").trim();
  const documentVaultId = String(formData.get("document_vault_id") ?? "").trim();

  if (!contractId) return fail("Missing contract ID.");
  if (!signedBy) return fail("Name the signatory — activation is attributed to them.");

  const result = await activateContractCall({
    contractId,
    identity,
    signedBy,
    signedAt: new Date().toISOString(),
    documentVaultId: documentVaultId || undefined,
  });

  if (!result.ok) return fail(explainContractError(result.error.message));

  revalidateContract(contractId);

  return {
    status: "activated",
    title: result.data.title,
    contractId,
    message: `“${result.data.title}” is ACTIVE at v${result.data.version}, signed by ${signedBy}.`,
  };
}

/**
 * Terminate a contract.
 *
 * The service also sets `effective_to` to today, so the agreement's term is
 * closed off at the moment of termination rather than left running.
 */
export async function terminateContract(
  _previous: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const contractId = String(formData.get("contract_id") ?? "").trim();
  const terminationNote = String(formData.get("termination_note") ?? "").trim();

  if (!contractId) return fail("Missing contract ID.");
  // The service accepts an empty note. Terminating an agreement without a
  // recorded reason is not something an audit trail can be reconstructed from.
  if (!terminationNote) return fail("A termination reason is required — it is recorded permanently.");

  const result = await terminateContractCall({ contractId, identity, terminationNote });
  if (!result.ok) return fail(explainContractError(result.error.message));

  revalidateContract(contractId);

  return {
    status: "terminated",
    title: result.data.title,
    contractId,
    message: `“${result.data.title}” terminated at v${result.data.version}. Its term was closed off as of today.`,
  };
}

function fail(message: string): ContractActionState {
  return { status: "error", message };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The column is a DATE, so the wire format is a plain calendar date. A
 *  timestamp would be rejected by Postgres, not by the handler. */
function isDate(value: string): boolean {
  return DATE_RE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

/** The service validates neither date, and never compares them — a contract
 *  that expires before it starts is accepted and stored. */
function validateDateRange(from: string, to: string): string | null {
  if (!from) return "An effective-from date is required.";
  if (!isDate(from)) return "Effective-from must be a valid date.";
  if (!to) return null;
  if (!isDate(to)) return "Effective-to must be a valid date.";
  if (to < from) return "Effective-to cannot fall before effective-from.";
  return null;
}

function isContractType(value: string): value is ContractType {
  return (CONTRACT_TYPES as readonly string[]).includes(value);
}
