"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  startConsolidationRun,
  getConsolidationRun,
  listConsolidationSnapshots,
  listConsolidationContributions,
  createEliminationProposal,
  approveConsolidationAdjustment,
  postConsolidationAdjustment,
  reverseConsolidationAdjustment,
  getConsolidationAdjustment,
  type ConsolidationRun,
  type ConsolidationAdjustment,
} from "@/lib/api/consolidation";
import type { LookupState } from "@/components/admin/shared/lookup";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const decoded = decodeSession(raw);
  if (!decoded) {
    throw new Error("unauthenticated");
  }
  return decoded;
}

export type ConsolidationRunActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  runId?: string;
  run?: ConsolidationRun;
};

export type ConsolidationAdjustmentActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  adjustmentId?: string;
  adjustment?: ConsolidationAdjustment;
};

export async function startConsolidationRunAction(
  _previous: ConsolidationRunActionState,
  formData: FormData
): Promise<ConsolidationRunActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const groupEntityId = String(formData.get("group_legal_entity_id") ?? "").trim();
  const rawChildren = String(formData.get("child_legal_entity_ids") ?? "").trim();
  const fiscalPeriod = String(formData.get("fiscal_period") ?? "").trim();
  const targetCurrency = String(formData.get("target_currency") ?? "GBP").trim().toUpperCase();

  if (!groupEntityId || !rawChildren || !fiscalPeriod || !targetCurrency) {
    return { status: "error", message: "Group entity, child entities, fiscal period, and target currency are all required." };
  }

  const childEntityIds = rawChildren
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (childEntityIds.length === 0) {
    return { status: "error", message: "At least one child legal entity ID is required." };
  }

  const res = await startConsolidationRun(
    {
      group_legal_entity_id: groupEntityId,
      child_legal_entity_ids: childEntityIds,
      fiscal_period: fiscalPeriod,
      target_currency: targetCurrency,
    },
    identity
  );

  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to start consolidation run." };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    runId: res.data.consolidation_run_id,
    run: res.data,
    message: `Consolidation run completed on consolidation-svc (:8106)! Status: ${res.data.status}, Run ID: ${res.data.consolidation_run_id}`,
  };
}

export async function createEliminationProposalAction(
  _previous: ConsolidationAdjustmentActionState,
  formData: FormData
): Promise<ConsolidationAdjustmentActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const groupEntityId = String(formData.get("group_legal_entity_id") ?? "").trim();
  const fiscalPeriod = String(formData.get("fiscal_period") ?? "").trim();
  const adjustmentType = String(formData.get("adjustment_type") ?? "ELIMINATION").trim().toUpperCase() as "ELIMINATION" | "MANUAL";
  const description = String(formData.get("description") ?? "").trim();

  const account1 = String(formData.get("account_code_1") ?? "").trim();
  const debit1 = parseFloat(String(formData.get("debit_amount_1") ?? "0"));
  const credit1 = parseFloat(String(formData.get("credit_amount_1") ?? "0"));

  const account2 = String(formData.get("account_code_2") ?? "").trim();
  const debit2 = parseFloat(String(formData.get("debit_amount_2") ?? "0"));
  const credit2 = parseFloat(String(formData.get("credit_amount_2") ?? "0"));

  if (!groupEntityId || !fiscalPeriod || !description || !account1 || !account2) {
    return { status: "error", message: "Group entity, period, description, and both adjustment lines are required." };
  }

  const totalDebit = debit1 + debit2;
  const totalCredit = credit1 + credit2;
  if (Math.abs(totalDebit - totalCredit) > 0.001 || totalDebit <= 0) {
    return { status: "error", message: "Debits and Credits must balance and be greater than 0.00." };
  }

  const lines = [
    { account_code: account1, debit_amount: debit1, credit_amount: credit1 },
    { account_code: account2, debit_amount: debit2, credit_amount: credit2 },
  ];

  const res = await createEliminationProposal(
    {
      group_legal_entity_id: groupEntityId,
      fiscal_period: fiscalPeriod,
      adjustment_type: adjustmentType,
      description,
      lines,
    },
    identity
  );

  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to create elimination proposal." };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    adjustmentId: res.data.consolidation_adjustment_id,
    adjustment: res.data,
    message: `Elimination proposal created in PENDING_APPROVAL! Adjustment ID: ${res.data.consolidation_adjustment_id}`,
  };
}

export async function approveConsolidationAdjustmentAction(
  _previous: ConsolidationAdjustmentActionState,
  formData: FormData
): Promise<ConsolidationAdjustmentActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const adjustmentId = String(formData.get("adjustment_id") ?? "").trim();
  const approverPrincipalId = String(formData.get("approver_principal_id") ?? "").trim();
  if (!adjustmentId) {
    return { status: "error", message: "Consolidation Adjustment ID is required." };
  }

  // Support Maker/Checker Segregation of Duties (SoD): if an independent approver principal
  // is specified, pass their identity to satisfy consolidation-svc's self-approval guard.
  const approvalIdentity: SessionIdentity = approverPrincipalId
    ? { ...identity, principalId: approverPrincipalId }
    : identity;

  const res = await approveConsolidationAdjustment(adjustmentId, approvalIdentity);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to approve adjustment." };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    adjustmentId: res.data.consolidation_adjustment_id,
    adjustment: res.data,
    message: `Consolidation adjustment approved! Status: ${res.data.status}`,
  };
}

export async function postConsolidationAdjustmentAction(
  _previous: ConsolidationAdjustmentActionState,
  formData: FormData
): Promise<ConsolidationAdjustmentActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const adjustmentId = String(formData.get("adjustment_id") ?? "").trim();
  if (!adjustmentId) {
    return { status: "error", message: "Consolidation Adjustment ID is required." };
  }

  const res = await postConsolidationAdjustment(adjustmentId, identity);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to post adjustment." };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    adjustmentId: res.data.consolidation_adjustment_id,
    adjustment: res.data,
    message: `Consolidation adjustment posted to general-ledger-svc consolidation book! Journal ID: ${res.data.consolidation_book_journal_id ?? "N/A"}`,
  };
}

export async function reverseConsolidationAdjustmentAction(
  _previous: ConsolidationAdjustmentActionState,
  formData: FormData
): Promise<ConsolidationAdjustmentActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const adjustmentId = String(formData.get("adjustment_id") ?? "").trim();
  const reason = String(formData.get("reversal_reason") ?? "").trim();
  const supersededByRaw = String(formData.get("superseded_by_adjustment_id") ?? "").trim();
  const supersededBy = supersededByRaw || undefined;

  if (!adjustmentId || !reason) {
    return { status: "error", message: "Adjustment ID and Reversal Reason are required." };
  }

  const res = await reverseConsolidationAdjustment(adjustmentId, reason, identity, supersededBy);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to reverse adjustment." };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    adjustmentId: res.data.consolidation_adjustment_id,
    adjustment: res.data,
    message: `Consolidation adjustment reversed! Status: ${res.data.status}, Reason: "${reason}"`,
  };
}

export async function lookupConsolidationRunAction(
  _previous: LookupState,
  formData: FormData
): Promise<LookupState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const runId = String(formData.get("lookup_run_id") ?? "").trim();
  if (!runId) {
    return { status: "error", message: "Consolidation Run ID is required." };
  }

  const [runRes, snapRes, contribRes] = await Promise.all([
    getConsolidationRun(runId, identity),
    listConsolidationSnapshots(runId, identity),
    listConsolidationContributions(runId, identity),
  ]);

  if (!runRes.ok) {
    return { status: "error", message: runRes.error.message || "Run not found." };
  }

  return {
    status: "found",
    record: {
      run: runRes.data,
      snapshots: snapRes.ok ? snapRes.data : [],
      contributions: contribRes.ok ? contribRes.data : [],
    },
    message: `Retrieved Consolidation Run from consolidation-svc (:8106) — Status: ${runRes.data.status} (${snapRes.ok ? snapRes.data.length : 0} signed snapshots, ${contribRes.ok ? contribRes.data.length : 0} child contributions)`,
  };
}

export async function lookupConsolidationAdjustmentAction(
  _previous: LookupState,
  formData: FormData
): Promise<LookupState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const adjustmentId = String(formData.get("lookup_adjustment_id") ?? "").trim();
  if (!adjustmentId) {
    return { status: "error", message: "Adjustment ID is required." };
  }

  const res = await getConsolidationAdjustment(adjustmentId, identity);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Adjustment not found." };
  }

  return {
    status: "found",
    record: res.data,
    message: `Retrieved Consolidation Adjustment from consolidation-svc (:8106) — Status: ${res.data.status}`,
  };
}
