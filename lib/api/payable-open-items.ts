// Server-side API client for payable-open-item-svc (:8164) — AP-08 of the
// Procurement/Expenses/Accounts Payable baseline. The authoritative ledger of
// supplier/expense open-item liabilities: residual amounts, due dates,
// holds/disputes, supplier credits, and settlement applications (payments,
// credits, recoveries).
//
// Field names and routes mirror the real service's domain.PayableOpenItem /
// domain.SettlementApplication exactly (services/payable-open-item-svc/
// internal/domain/types.go) — that struct had no `json:"..."` tags at all
// until this was verified against the running service (every field
// PascalCase, e.g. `LegalEntityID` instead of `legal_entity_id`), which is
// the opposite convention from every other service this console talks to.
// The backend was fixed to snake_case tags; this module assumes that fix.
//
// This service has no envelope/purposeContext contract at all (no
// internal/envelope package exists in it) — only X-Tenant-Id (silently
// optional, degrades to untenanted rows rather than rejecting) and
// X-Principal-Id (required on every write, checked directly by the
// handler). apiGet/apiPost already send both from Identity, so no special
// envelope handling is needed here.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

export type PayableSourceType = "EXPENSE_CLAIM" | "SUPPLIER_INVOICE" | "AUTHORIZED_ADJUSTMENT";
export type PayableStatus = "OPEN" | "PARTIALLY_SETTLED" | "SETTLED";

export type PayableOpenItem = {
  payable_id: string;
  tenant_id?: string | null;
  legal_entity_id: string;
  source_type: PayableSourceType;
  source_reference: string;
  payee_ref: string;

  original_amount: number;
  residual_amount: number;
  currency: string;
  due_date: string;

  status: PayableStatus;

  is_held: boolean;
  hold_reason: string;

  is_disputed: boolean;
  dispute_reason: string;
  dispute_opened_at?: string | null;

  closed_at?: string | null;

  created_by_principal_id: string;
  created_at: string;
  updated_at: string;
};

export type SettlementApplication = {
  application_id: string;
  tenant_id?: string | null;
  payable_id: string;
  application_type: "PAYMENT" | "SUPPLIER_CREDIT" | "RECOVERY";
  amount: number;
  idempotency_ref: string;
  detail: string;
  actor_principal_id: string;
  created_at: string;
};

type ListResponse = { data?: PayableOpenItem[]; count?: number };

export async function listPayableOpenItems(
  legalEntityId: string,
  identity?: Identity
): Promise<ApiResult<PayableOpenItem[]>> {
  const res = await apiGet<ListResponse>("payableOpenItem", "/ap08/payables/", {
    identity,
    query: { legal_entity_id: legalEntityId },
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data.data ?? [] };
}

export async function getPayableOpenItem(
  payableId: string,
  identity?: Identity
): Promise<ApiResult<PayableOpenItem>> {
  return apiGet<PayableOpenItem>("payableOpenItem", `/ap08/payables/${encodeURIComponent(payableId)}`, {
    identity,
  });
}

export async function listPayableHistory(
  payableId: string,
  identity?: Identity
): Promise<ApiResult<SettlementApplication[]>> {
  const res = await apiGet<{ data?: SettlementApplication[] }>(
    "payableOpenItem",
    `/ap08/payables/${encodeURIComponent(payableId)}/history`,
    { identity }
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data.data ?? [] };
}

export type CreatePayableInput = {
  legal_entity_id: string;
  source_type: PayableSourceType;
  source_reference: string;
  payee_ref: string;
  original_amount: number;
  currency: string;
  due_date: string;
};

export async function createPayableOpenItem(
  input: CreatePayableInput,
  identity?: Identity
): Promise<ApiWriteResult<PayableOpenItem>> {
  return apiPost<PayableOpenItem>("payableOpenItem", "/ap08/payables/", input, { identity });
}

export async function placeHold(
  payableId: string,
  reason: string,
  identity?: Identity
): Promise<ApiWriteResult<PayableOpenItem>> {
  return apiPost<PayableOpenItem>(
    "payableOpenItem",
    `/ap08/payables/${encodeURIComponent(payableId)}/hold`,
    { reason },
    { identity }
  );
}

export async function releaseHold(
  payableId: string,
  identity?: Identity
): Promise<ApiWriteResult<PayableOpenItem>> {
  return apiPost<PayableOpenItem>(
    "payableOpenItem",
    `/ap08/payables/${encodeURIComponent(payableId)}/release-hold`,
    {},
    { identity }
  );
}

export type ApplyConfirmedPaymentResult = { applied: boolean; note?: string; payable: PayableOpenItem };

export async function applyConfirmedPayment(
  payableId: string,
  amount: number,
  providerPaymentRef: string,
  identity?: Identity
): Promise<ApiWriteResult<ApplyConfirmedPaymentResult>> {
  return apiPost<ApplyConfirmedPaymentResult>(
    "payableOpenItem",
    `/ap08/payables/${encodeURIComponent(payableId)}/apply-confirmed-payment`,
    { amount, provider_payment_ref: providerPaymentRef },
    { identity }
  );
}

export async function closePayable(
  payableId: string,
  identity?: Identity
): Promise<ApiWriteResult<PayableOpenItem>> {
  return apiPost<PayableOpenItem>(
    "payableOpenItem",
    `/ap08/payables/${encodeURIComponent(payableId)}/close`,
    {},
    { identity }
  );
}
