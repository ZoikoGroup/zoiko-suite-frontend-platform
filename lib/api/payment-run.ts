// Server-side API client for payment-run-svc (:8161) — AP-11 of the
// Procurement/Expenses/Accounts Payable baseline.
//
// Orchestrates authorized payable instructions into controlled payment runs
// and hands them to Banking for external initiation and status tracking,
// preserving idempotency, external states, and payment-clearing lineage.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";
import { createPayableOpenItem } from "./payable-open-items";

export type RunStatus =
  | "DRAFT"
  | "VALIDATED"
  | "LOCKED"
  | "SUBMITTED"
  | "ACCEPTED"
  | "REJECTED"
  | "PARTIALLY_ACCEPTED"
  | "SETTLED"
  | "COMPLETED"
  | "EXCEPTION"
  | "CANCELLED";

export type InstructionStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "SETTLED"
  | "EXCEPTION";

export type PaymentRun = {
  run_id: string;
  tenant_id?: string | null;
  legal_entity_id: string;
  paying_bank_account_ref: string;
  currency: string;
  value_date: string;
  payment_method: string;
  status: RunStatus;
  idempotency_key: string;
  created_by_principal_id: string;
  validated_at?: string | null;
  locked_at?: string | null;
  submitted_at?: string | null;
  closed_at?: string | null;
  exception_reason?: string | null;
  cancel_reason?: string | null;
  close_note?: string | null;
  created_at: string;
  updated_at: string;
};

export type RunInstruction = {
  instruction_id: string;
  tenant_id?: string | null;
  run_id: string;
  authorization_id: string;
  payee_ref: string;
  net_amount: number;
  currency: string;
  status: InstructionStatus;
  consumed_at?: string | null;
  provider_event_ref?: string | null;
  provider_attempt_id?: string | null;
  bnk07_payment_id?: string | null;
  created_at: string;
};

export type RunEvent = {
  event_id: string;
  tenant_id?: string | null;
  run_id: string;
  event_type: string;
  detail: string;
  actor_principal_id: string;
  created_at: string;
};

export type AvailableActions = {
  status: RunStatus;
  can_validate: boolean;
  can_lock: boolean;
  can_submit: boolean;
  can_cancel: boolean;
  can_reconcile: boolean;
  can_retry: boolean;
  can_close: boolean;
};

export type CreatePaymentRunInput = {
  legal_entity_id: string;
  paying_bank_account_ref: string;
  currency: string;
  value_date: string;
  payment_method: string;
  authorization_ids: string[];
};

export async function listPaymentRuns(
  identity: Identity,
  legalEntityId?: string,
): Promise<ApiResult<PaymentRun[]>> {
  const res = await apiGet<{ runs: PaymentRun[] }>("paymentRun", "/ap11/runs", {
    identity,
    query: { legal_entity_id: legalEntityId },
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data.runs ?? [] };
}

export async function getPaymentRun(
  identity: Identity,
  runId: string,
): Promise<ApiResult<{ run: PaymentRun; instructions: RunInstruction[] }>> {
  return apiGet<{ run: PaymentRun; instructions: RunInstruction[] }>(
    "paymentRun",
    `/ap11/runs/${encodeURIComponent(runId)}`,
    { identity },
  );
}

export async function listRunInstructions(
  identity: Identity,
  runId: string,
): Promise<ApiResult<RunInstruction[]>> {
  const res = await apiGet<{ instructions: RunInstruction[] }>(
    "paymentRun",
    `/ap11/runs/${encodeURIComponent(runId)}/instructions`,
    { identity },
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data.instructions ?? [] };
}

export async function getRunAvailableActions(
  identity: Identity,
  runId: string,
): Promise<ApiResult<AvailableActions>> {
  return apiGet<AvailableActions>(
    "paymentRun",
    `/ap11/runs/${encodeURIComponent(runId)}/available-actions`,
    { identity },
  );
}

export async function getRunHistory(
  identity: Identity,
  runId: string,
): Promise<ApiResult<RunEvent[]>> {
  const res = await apiGet<{ history: RunEvent[] }>(
    "paymentRun",
    `/ap11/runs/${encodeURIComponent(runId)}/history`,
    { identity },
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data.history ?? [] };
}

export async function createPaymentRun(
  identity: Identity,
  input: CreatePaymentRunInput,
): Promise<ApiWriteResult<{ run: PaymentRun; instructions: RunInstruction[] }>> {
  return apiPost<{ run: PaymentRun; instructions: RunInstruction[] }>(
    "paymentRun",
    "/ap11/runs/",
    input,
    { identity },
  );
}

export async function validatePaymentRun(
  identity: Identity,
  runId: string,
): Promise<ApiWriteResult<PaymentRun>> {
  return apiPost<PaymentRun>(
    "paymentRun",
    `/ap11/runs/${encodeURIComponent(runId)}/validate`,
    {},
    { identity },
  );
}

export async function lockPaymentRun(
  identity: Identity,
  runId: string,
): Promise<ApiWriteResult<PaymentRun>> {
  return apiPost<PaymentRun>(
    "paymentRun",
    `/ap11/runs/${encodeURIComponent(runId)}/lock`,
    {},
    { identity },
  );
}

export async function submitPaymentRun(
  identity: Identity,
  runId: string,
  idempotencyKey: string,
): Promise<ApiWriteResult<PaymentRun>> {
  return apiPost<PaymentRun>(
    "paymentRun",
    `/ap11/runs/${encodeURIComponent(runId)}/submit`,
    { idempotency_key: idempotencyKey },
    { identity },
  );
}

export async function pollInstructionStatus(
  identity: Identity,
  instructionId: string,
): Promise<ApiWriteResult<RunInstruction>> {
  return apiPost<RunInstruction>(
    "paymentRun",
    `/ap11/instructions/${encodeURIComponent(instructionId)}/poll`,
    {},
    { identity },
  );
}

export async function reconcilePaymentRunStatus(
  identity: Identity,
  instructionId: string,
  externalStatus: InstructionStatus,
  providerEventRef: string,
): Promise<ApiWriteResult<{ instruction: RunInstruction; run: PaymentRun }>> {
  return apiPost<{ instruction: RunInstruction; run: PaymentRun }>(
    "paymentRun",
    `/ap11/instructions/${encodeURIComponent(instructionId)}/reconcile`,
    {
      instruction_id: instructionId,
      external_status: externalStatus,
      provider_event_ref: providerEventRef,
    },
    { identity },
  );
}

export async function cancelPaymentRun(
  identity: Identity,
  runId: string,
  reason: string,
): Promise<ApiWriteResult<PaymentRun>> {
  return apiPost<PaymentRun>(
    "paymentRun",
    `/ap11/runs/${encodeURIComponent(runId)}/cancel`,
    { reason },
    { identity },
  );
}

export async function closePaymentRun(
  identity: Identity,
  runId: string,
  note: string,
): Promise<ApiWriteResult<PaymentRun>> {
  return apiPost<PaymentRun>(
    "paymentRun",
    `/ap11/runs/${encodeURIComponent(runId)}/close`,
    { note },
    { identity },
  );
}

// ─── Upstream Workflow Helpers for AP-09 & AP-10 ─────────────────────────────

export async function createAndAuthorizeTestProposal(
  identity: Identity,
  params: {
    legalEntityId: string;
    payingBankAccountRef: string;
    currency: string;
    payeeRef: string;
    netAmount: number;
    paymentMethod: string;
  },
): Promise<ApiResult<{ authorization_id: string; proposal_id: string }>> {
  // 1. Create Proposal in AP-09
  const propRes = await apiPost<{ ProposalID?: string; proposal_id?: string }>(
    "paymentProposal",
    "/ap09/proposals/",
    {
      legal_entity_id: params.legalEntityId,
      LegalEntityID: params.legalEntityId,
      paying_bank_account_ref: params.payingBankAccountRef,
      PayingBankAccountRef: params.payingBankAccountRef,
      currency: params.currency,
      Currency: params.currency,
      payment_method: params.paymentMethod || "ACH",
      PaymentMethod: params.paymentMethod || "ACH",
      payment_date: new Date().toISOString(),
      PaymentDate: new Date().toISOString(),
    },
    { identity },
  );

  if (!propRes.ok) return propRes;
  const proposalId = propRes.data.ProposalID || propRes.data.proposal_id;
  if (!proposalId) {
    return { ok: false, error: { kind: "malformed", status: 500, message: "AP-09 did not return proposal_id" } };
  }

  // 2. Create fresh payable item in AP-08 and add to proposal
  const payableRef = `INV-PROP-${Date.now()}`;
  const payableRes = await createPayableOpenItem(
    {
      legal_entity_id: params.legalEntityId,
      source_type: "SUPPLIER_INVOICE",
      source_reference: payableRef,
      payee_ref: params.payeeRef || "VND-CISCO-GLOBAL",
      original_amount: params.netAmount || 15000,
      currency: params.currency || "GBP",
      due_date: new Date(Date.now() + 86400000 * 7).toISOString(),
    },
    identity,
  );
  if (!payableRes.ok) return payableRes;

  const itemRes = await apiPost(
    "paymentProposal",
    `/ap09/proposals/${encodeURIComponent(proposalId)}/items`,
    {
      payable_source: "AP_INVOICE",
      PayableSource: "AP_INVOICE",
      payable_id: payableRef,
      PayableID: payableRef,
      apply_withholding: false,
      ApplyWithholding: false,
    },
    { identity },
  );
  if (!itemRes.ok) return itemRes;

  // 3. Recalculate proposal
  await apiPost("paymentProposal", `/ap09/proposals/${encodeURIComponent(proposalId)}/recalculate`, {}, { identity });

  // 4. Submit for review
  await apiPost("paymentProposal", `/ap09/proposals/${encodeURIComponent(proposalId)}/submit-for-review`, {}, { identity });

  // 5. Freeze Proposal in AP-09
  const freezeRes = await apiPost(
    "paymentProposal",
    `/ap09/proposals/${encodeURIComponent(proposalId)}/freeze`,
    {},
    { identity },
  );
  if (!freezeRes.ok) return freezeRes;

  // 6. Request Payment Authorization in AP-10
  const authReqRes = await apiPost<{ AuthorizationID?: string; authorization_id?: string }>(
    "paymentAuthorization",
    "/ap10/authorizations/",
    { proposal_id: proposalId, ProposalID: proposalId },
    { identity },
  );
  if (!authReqRes.ok) return authReqRes;
  const authId = authReqRes.data.AuthorizationID || authReqRes.data.authorization_id;
  if (!authId) {
    return { ok: false, error: { kind: "malformed", status: 500, message: "AP-10 did not return authorization_id" } };
  }

  // 7. Approve Payment Authorization in AP-10 (using dual-auth approver principal 66666666...)
  const approverIdentity: Identity = {
    ...identity,
    principalId: "66666666-6666-6666-6666-666666666666",
  };
  const approveRes = await apiPost(
    "paymentAuthorization",
    `/ap10/authorizations/${encodeURIComponent(authId)}/approve`,
    {},
    { identity: approverIdentity },
  );
  if (!approveRes.ok) return approveRes;

  return { ok: true, data: { authorization_id: authId, proposal_id: proposalId } };
}
