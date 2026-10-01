import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

export type RecoveryStatus =
  | "OPEN"
  | "APPROVED"
  | "IN_RECOVERY"
  | "PARTIALLY_RECOVERED"
  | "RECOVERED"
  | "CLOSED"
  | "ESCALATED"
  | "WRITTEN_OFF";

export type RecoveryBasis =
  | "OVERPAYMENT"
  | "DUPLICATE_PAYMENT"
  | "SUPPLIER_CREDIT"
  | "CONTRACTUAL";

export type SupplierRecoveryCase = {
  case_id: string;
  tenant_id?: string | null;
  legal_entity_id: string;
  supplier_ref: string;
  recovery_basis: RecoveryBasis;
  source_payable_id: string;
  total_amount: number;
  recovered_amount: number;
  currency: string;
  recovery_reason: string;
  status: RecoveryStatus;
  escalation_reason?: string;
  write_off_reason?: string;
  close_note?: string;
  created_by_principal_id: string;
  approved_by_principal_id?: string;
  created_at: string;
  updated_at: string;
};

export type RecoveryExposure = {
  case_id: string;
  total_amount: number;
  recovered_amount: number;
  outstanding_amount: number;
  currency: string;
  status: RecoveryStatus;
};

type ListResponse = { data?: SupplierRecoveryCase[]; count?: number };
type RecoveryPayload = Record<string, unknown>;

function normalizeCase(value: Record<string, unknown>): SupplierRecoveryCase {
  return {
    case_id: String(value.case_id ?? value.CaseID ?? ""),
    tenant_id: (value.tenant_id ?? value.TenantID ?? null) as string | null,
    legal_entity_id: String(value.legal_entity_id ?? value.LegalEntityID ?? ""),
    supplier_ref: String(value.supplier_ref ?? value.SupplierRef ?? ""),
    recovery_basis: String(value.recovery_basis ?? value.RecoveryBasis ?? "OVERPAYMENT") as RecoveryBasis,
    source_payable_id: String(value.source_payable_id ?? value.SourcePayableID ?? ""),
    total_amount: Number(value.total_amount ?? value.TotalAmount ?? 0),
    recovered_amount: Number(value.recovered_amount ?? value.RecoveredAmount ?? 0),
    currency: String(value.currency ?? value.Currency ?? ""),
    recovery_reason: String(value.recovery_reason ?? value.RecoveryReason ?? ""),
    status: String(value.status ?? value.Status ?? "OPEN") as RecoveryStatus,
    escalation_reason: String(value.escalation_reason ?? value.EscalationReason ?? ""),
    write_off_reason: String(value.write_off_reason ?? value.WriteOffReason ?? ""),
    close_note: String(value.close_note ?? value.CloseNote ?? ""),
    created_by_principal_id: String(value.created_by_principal_id ?? value.CreatedByPrincipalID ?? ""),
    approved_by_principal_id: String(value.approved_by_principal_id ?? value.ApprovedByPrincipalID ?? ""),
    created_at: String(value.created_at ?? value.CreatedAt ?? ""),
    updated_at: String(value.updated_at ?? value.UpdatedAt ?? ""),
  };
}

export async function listRecoveryCases(
  legalEntityId: string,
  identity?: Identity,
): Promise<ApiResult<SupplierRecoveryCase[]>> {
  const result = await apiGet<ListResponse>("supplierRecovery", "/ap12/cases/", {
    identity,
    query: { legal_entity_id: legalEntityId },
  });
  if (!result.ok) return result;
  return { ok: true, data: (result.data.data ?? []).map((item) => normalizeCase(item as unknown as Record<string, unknown>)) };
}

export async function getRecoveryCase(
  caseId: string,
  identity?: Identity,
): Promise<ApiResult<SupplierRecoveryCase>> {
  const result = await apiGet<Record<string, unknown>>(
    "supplierRecovery",
    `/ap12/cases/${encodeURIComponent(caseId)}`,
    { identity },
  );
  if (!result.ok) return result;
  return { ok: true, data: normalizeCase(result.data) };
}

export async function getRecoveryExposure(
  caseId: string,
  identity?: Identity,
): Promise<ApiResult<RecoveryExposure>> {
  return apiGet<RecoveryExposure>(
    "supplierRecovery",
    `/ap12/cases/${encodeURIComponent(caseId)}/exposure`,
    { identity },
  );
}

export async function createRecoveryCase(
  input: {
    legal_entity_id: string;
    supplier_ref: string;
    recovery_basis: RecoveryBasis;
    source_payable_id: string;
    total_amount: number;
    currency: string;
    recovery_reason: string;
  },
  identity?: Identity,
): Promise<ApiWriteResult<SupplierRecoveryCase>> {
  const result = await apiPost<Record<string, unknown>>("supplierRecovery", "/ap12/cases/", input, { identity });
  if (!result.ok) return result;
  return { ok: true, status: result.status, data: normalizeCase(result.data) };
}

async function postCaseAction<T>(
  caseId: string,
  action: string,
  body: RecoveryPayload,
  identity?: Identity,
): Promise<ApiWriteResult<T>> {
  return apiPost<T>(
    "supplierRecovery",
    `/ap12/cases/${encodeURIComponent(caseId)}/${action}`,
    body,
    { identity },
  );
}

export function approveRecoveryCase(caseId: string, identity?: Identity) {
  return postCaseAction<SupplierRecoveryCase>(caseId, "approve", {}, identity);
}

export function recordRecoveryCommitment(
  caseId: string,
  detail: string,
  expectedMethod: string,
  identity?: Identity,
) {
  return postCaseAction(caseId, "commitments", { Detail: detail, ExpectedMethod: expectedMethod }, identity);
}

export function applyRecoveryOffset(
  caseId: string,
  amount: number,
  recoveryRef: string,
  identity?: Identity,
) {
  return postCaseAction(caseId, "apply-offset", { Amount: amount, RecoveryRef: recoveryRef }, identity);
}

export function linkSupplierRefund(caseId: string, statementLineId: string, identity?: Identity) {
  return postCaseAction(caseId, "link-refund", { StatementLineID: statementLineId }, identity);
}

export function escalateRecovery(caseId: string, reason: string, identity?: Identity) {
  return postCaseAction(caseId, "escalate", { Reason: reason }, identity);
}

export function closeRecoveryCase(caseId: string, note: string, identity?: Identity) {
  return postCaseAction(caseId, "close", { Note: note }, identity);
}

export function writeOffRecovery(caseId: string, reason: string, identity?: Identity) {
  return postCaseAction(caseId, "write-off", { Reason: reason }, identity);
}
