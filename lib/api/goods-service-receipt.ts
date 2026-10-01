// goods-service-receipt-svc (:8157, /goods-service-receipt-svc through gateway) —
// AP-04 of the Procurement/Expenses/Accounts Payable baseline.
//
// Authoritative receipt basis for 3-way matching between purchase-order-svc (AP-03)
// and invoice-approval-svc (AP-05/06). Supports GOODS delivery and SERVICE milestone
// acceptance, evidence attachments, confirmation with tolerance check, GRNI journal
// posting to general-ledger-svc (:8098), and partial/full reversals.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

export type ReceiptType = "GOODS" | "SERVICE";

export type ReceiptStatus =
  | "DRAFT"
  | "PENDING_CONFIRMATION"
  | "CONFIRMED"
  | "REJECTED"
  | "PARTIALLY_REVERSED"
  | "FULLY_REVERSED";

export type GoodsServiceReceipt = {
  receipt_id: string;
  tenant_id?: string | null;
  legal_entity_id: string;
  purchase_order_id: string;
  receipt_type: ReceiptType;
  quantity: number;
  unit_of_measure: string;
  amount: number;
  currency_code: string;
  receipt_date: string;
  location: string;
  inspection_result: string;
  requires_independent_acceptance: boolean;
  tolerance_exception_ref: string;
  status: ReceiptStatus;
  rejection_reason: string;
  reversed_amount: number;
  receiver_principal_id: string;
  created_by_principal_id: string;
  confirmed_by_principal_id?: string | null;
  confirmed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type ReceiptEvidence = {
  evidence_id: string;
  tenant_id?: string | null;
  receipt_id: string;
  evidence_ref: string;
  description: string;
  recorded_by_principal_id: string;
  created_at: string;
};

export type ReceiptReversal = {
  reversal_id: string;
  tenant_id?: string | null;
  receipt_id: string;
  reversed_amount: number;
  reason: string;
  reversed_by_principal_id: string;
  created_at: string;
};

export type ReceiptAccountingEvent = {
  event_id: string;
  tenant_id?: string | null;
  receipt_id: string;
  status: "POSTED" | "EXCEPTION";
  journal_id?: string | null;
  failure_reason: string;
  created_at: string;
};

export type ReceivedToDateSummary = {
  purchase_order_id: string;
  po_total_amount: number;
  net_confirmed_amount: number;
  receipt_count: number;
};

export type CreateReceiptInput = {
  legal_entity_id: string;
  purchase_order_id: string;
  receipt_type: ReceiptType;
  quantity: number;
  unit_of_measure: string;
  amount: number;
  currency_code: string;
  receipt_date: string;
  location: string;
  inspection_result: string;
  requires_independent_acceptance?: boolean;
  tolerance_exception_ref?: string;
};

export type AmendReceiptDraftInput = {
  quantity?: number;
  unit_of_measure?: string;
  amount?: number;
  location?: string;
  inspection_result?: string;
  reason: string;
};

/**
 * Create a new Goods/Service Receipt draft against an open Purchase Order.
 */
export async function createReceipt(
  input: CreateReceiptInput,
  identity: Identity & { tenantId: string },
): Promise<ApiWriteResult<GoodsServiceReceipt>> {
  return apiPost<GoodsServiceReceipt>(
    "goodsServiceReceipt",
    "/ap04/receipts",
    {
      legal_entity_id: input.legal_entity_id,
      purchase_order_id: input.purchase_order_id,
      receipt_type: input.receipt_type,
      quantity: input.quantity,
      unit_of_measure: input.unit_of_measure,
      amount: input.amount,
      currency_code: input.currency_code,
      receipt_date: input.receipt_date,
      location: input.location,
      inspection_result: input.inspection_result,
      requires_independent_acceptance: Boolean(input.requires_independent_acceptance),
      tolerance_exception_ref: input.tolerance_exception_ref || "",
    },
    { identity },
  );
}

/**
 * Fetch a receipt by ID.
 */
export async function getReceipt(
  receiptId: string,
  identity: Identity & { tenantId: string },
): Promise<ApiResult<GoodsServiceReceipt>> {
  return apiGet<GoodsServiceReceipt>("goodsServiceReceipt", `/ap04/receipts/${receiptId}`, {
    identity,
  });
}

/**
 * Amend a draft receipt.
 */
export async function amendReceiptDraft(
  receiptId: string,
  input: AmendReceiptDraftInput,
  identity: Identity & { tenantId: string },
): Promise<ApiWriteResult<GoodsServiceReceipt>> {
  return apiPost<GoodsServiceReceipt>(
    "goodsServiceReceipt",
    `/ap04/receipts/${receiptId}/amend`,
    input,
    { identity },
  );
}

/**
 * Attach physical/digital evidence (e.g. Bill of Lading, Delivery Slip) to a receipt.
 * Moves receipt from DRAFT to PENDING_CONFIRMATION.
 */
export async function attachReceiptEvidence(
  receiptId: string,
  input: { evidence_ref: string; description: string },
  identity: Identity & { tenantId: string },
): Promise<ApiWriteResult<ReceiptEvidence>> {
  return apiPost<ReceiptEvidence>(
    "goodsServiceReceipt",
    `/ap04/receipts/${receiptId}/evidence`,
    input,
    { identity },
  );
}

/**
 * List evidence attachments for a receipt.
 */
export async function listReceiptEvidence(
  receiptId: string,
  identity: Identity & { tenantId: string },
): Promise<ApiResult<ReceiptEvidence[]>> {
  return apiGet<ReceiptEvidence[]>("goodsServiceReceipt", `/ap04/receipts/${receiptId}/evidence`, {
    identity,
  });
}

/**
 * Record service acceptance milestone for a SERVICE receipt.
 * Moves receipt from DRAFT to PENDING_CONFIRMATION.
 */
export async function recordServiceAcceptance(
  receiptId: string,
  input: { evidence_ref: string; notes: string },
  identity: Identity & { tenantId: string },
): Promise<ApiWriteResult<GoodsServiceReceipt>> {
  return apiPost<GoodsServiceReceipt>(
    "goodsServiceReceipt",
    `/ap04/receipts/${receiptId}/service-acceptance`,
    input,
    { identity },
  );
}

/**
 * Confirm receipt. Enforces PO open status and tolerance aggregate check.
 * Posts GRNI journal entry to general-ledger-svc (:8098).
 */
export async function confirmReceipt(
  receiptId: string,
  identity: Identity & { tenantId: string },
): Promise<ApiWriteResult<{ receipt: GoodsServiceReceipt; accounting_event?: ReceiptAccountingEvent }>> {
  return apiPost<{ receipt: GoodsServiceReceipt; accounting_event?: ReceiptAccountingEvent }>(
    "goodsServiceReceipt",
    `/ap04/receipts/${receiptId}/confirm`,
    {},
    { identity },
  );
}

/**
 * Reject a draft or pending receipt. Terminal transition.
 */
export async function rejectReceipt(
  receiptId: string,
  reason: string,
  identity: Identity & { tenantId: string },
): Promise<ApiWriteResult<GoodsServiceReceipt>> {
  return apiPost<GoodsServiceReceipt>(
    "goodsServiceReceipt",
    `/ap04/receipts/${receiptId}/reject`,
    { reason },
    { identity },
  );
}

/**
 * Reverse a confirmed receipt (partial or full).
 */
export async function reverseReceipt(
  receiptId: string,
  input: { reversed_amount: number; reason: string },
  identity: Identity & { tenantId: string },
): Promise<ApiWriteResult<GoodsServiceReceipt>> {
  return apiPost<GoodsServiceReceipt>(
    "goodsServiceReceipt",
    `/ap04/receipts/${receiptId}/reverse`,
    input,
    { identity },
  );
}

/**
 * Read the latest GRNI accounting status and journal ID for a receipt.
 */
export async function getReceiptAccountingStatus(
  receiptId: string,
  identity: Identity & { tenantId: string },
): Promise<ApiResult<ReceiptAccountingEvent>> {
  return apiGet<ReceiptAccountingEvent>(
    "goodsServiceReceipt",
    `/ap04/receipts/${receiptId}/accounting-status`,
    { identity },
  );
}

/**
 * List all receipts recorded against a purchase order.
 */
export async function listReceiptsForPO(
  purchaseOrderId: string,
  identity: Identity & { tenantId: string },
): Promise<ApiResult<GoodsServiceReceipt[]>> {
  const res = await apiGet<{ data: GoodsServiceReceipt[]; count: number }>(
    "goodsServiceReceipt",
    `/ap04/purchase-orders/${purchaseOrderId}/receipts`,
    { identity },
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data?.data ?? [] };
}

/**
 * Read the received-to-date aggregate for a purchase order.
 */
export async function getReceivedToDate(
  purchaseOrderId: string,
  identity: Identity & { tenantId: string },
): Promise<ApiResult<ReceivedToDateSummary>> {
  return apiGet<ReceivedToDateSummary>(
    "goodsServiceReceipt",
    `/ap04/purchase-orders/${purchaseOrderId}/received-to-date`,
    { identity },
  );
}
