import { apiGet, apiPost, type ApiResult, type ApiWriteResult } from "./client";
import type { Identity } from "./client";

export type ConsolidationRunStatus = "RUNNING" | "COMPLETED" | "FAILED";

export type BalanceSnapshot = {
  balance_snapshot_id: string;
  tenant_id: string;
  consolidation_run_id: string;
  legal_entity_id: string;
  fiscal_period: string;
  account_code: string;
  consolidated_balance: number;
  currency_code: string;
  snapshot_signature: string;
  generated_at: string;
};

export type BalanceContribution = {
  balance_contribution_id: string;
  tenant_id: string;
  consolidation_run_id: string;
  account_code: string;
  source_legal_entity_id: string;
  gross_amount: number;
  generated_at: string;
};

export type ConsolidationRun = {
  consolidation_run_id: string;
  tenant_id: string;
  group_legal_entity_id: string;
  fiscal_period: string;
  target_currency: string;
  status: ConsolidationRunStatus;
  exception_count: number;
  started_at: string;
  completed_at?: string | null;
  snapshots?: BalanceSnapshot[];
};

export type StartConsolidationRunInput = {
  group_legal_entity_id: string;
  child_legal_entity_ids: string[];
  fiscal_period: string;
  target_currency: string;
};

export type ConsolidationAdjustmentLine = {
  account_code: string;
  debit_amount?: number;
  credit_amount?: number;
};

export type ConsolidationAdjustment = {
  consolidation_adjustment_id: string;
  tenant_id: string;
  group_legal_entity_id: string;
  fiscal_period: string;
  adjustment_type: "ELIMINATION" | "MANUAL";
  description: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "POSTED" | "REVERSED";
  lines: ConsolidationAdjustmentLine[];
  consolidation_book_journal_id?: string | null;
  created_at: string;
  created_by_principal_id: string;
  approved_at?: string | null;
  approved_by_principal_id?: string | null;
  posted_at?: string | null;
  posted_by_principal_id?: string | null;
  reversed_at?: string | null;
  reversed_by_principal_id?: string | null;
  reversal_reason?: string | null;
  superseded_by_adjustment_id?: string | null;
};

export type CreateEliminationProposalInput = {
  group_legal_entity_id: string;
  fiscal_period: string;
  adjustment_type: "ELIMINATION" | "MANUAL";
  description: string;
  lines: ConsolidationAdjustmentLine[];
};

export async function startConsolidationRun(
  input: StartConsolidationRunInput,
  identity: Identity
): Promise<ApiWriteResult<ConsolidationRun>> {
  return apiPost<ConsolidationRun>(
    "consolidation",
    "/v1/consolidation/runs",
    input,
    { identity }
  );
}

export async function getConsolidationRun(
  id: string,
  identity: Identity
): Promise<ApiResult<ConsolidationRun>> {
  return apiGet<ConsolidationRun>(
    "consolidation",
    `/v1/consolidation/runs/${encodeURIComponent(id)}`,
    { identity }
  );
}

export async function listConsolidationSnapshots(
  runId: string,
  identity: Identity
): Promise<ApiResult<BalanceSnapshot[]>> {
  return apiGet<BalanceSnapshot[]>(
    "consolidation",
    `/v1/consolidation/runs/${encodeURIComponent(runId)}/snapshots`,
    { identity }
  );
}

export async function listConsolidationContributions(
  runId: string,
  identity: Identity
): Promise<ApiResult<BalanceContribution[]>> {
  return apiGet<BalanceContribution[]>(
    "consolidation",
    `/v1/consolidation/runs/${encodeURIComponent(runId)}/contributions`,
    { identity }
  );
}

export async function createEliminationProposal(
  input: CreateEliminationProposalInput,
  identity: Identity
): Promise<ApiWriteResult<ConsolidationAdjustment>> {
  return apiPost<ConsolidationAdjustment>(
    "consolidation",
    "/v1/consolidation/adjustments",
    input,
    { identity }
  );
}

export async function approveConsolidationAdjustment(
  id: string,
  identity: Identity
): Promise<ApiWriteResult<ConsolidationAdjustment>> {
  return apiPost<ConsolidationAdjustment>(
    "consolidation",
    `/v1/consolidation/adjustments/${encodeURIComponent(id)}/approve`,
    {},
    { identity }
  );
}

export async function postConsolidationAdjustment(
  id: string,
  identity: Identity
): Promise<ApiWriteResult<ConsolidationAdjustment>> {
  return apiPost<ConsolidationAdjustment>(
    "consolidation",
    `/v1/consolidation/adjustments/${encodeURIComponent(id)}/post`,
    {},
    { identity }
  );
}

export async function reverseConsolidationAdjustment(
  id: string,
  reason: string,
  identity: Identity,
  supersededByAdjustmentId?: string
): Promise<ApiWriteResult<ConsolidationAdjustment>> {
  return apiPost<ConsolidationAdjustment>(
    "consolidation",
    `/v1/consolidation/adjustments/${encodeURIComponent(id)}/reverse`,
    { reason, superseded_by_adjustment_id: supersededByAdjustmentId },
    { identity }
  );
}

export async function getConsolidationAdjustment(
  id: string,
  identity: Identity
): Promise<ApiResult<ConsolidationAdjustment>> {
  return apiGet<ConsolidationAdjustment>(
    "consolidation",
    `/v1/consolidation/adjustments/${encodeURIComponent(id)}`,
    { identity }
  );
}
