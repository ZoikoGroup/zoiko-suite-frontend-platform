// purchase-order-svc (:8129, /purchase-order-svc through the gateway) — the
// procurement order register behind the Commercial Ops domain.
//
// Lifecycle is linear and non-destructive: ISSUED -> CLOSED. Amending does NOT
// change status; it bumps `version` and appends an immutable amendment row, so
// the money on an order is always traceable to who changed it and why.
//
// Every mutation is checked against authorization-svc before it is applied, and
// the check fails closed — an unreachable authorization-svc rejects the write
// rather than allowing it. That is why the write helpers below distinguish
// "you may not do this" (403) from "we could not determine whether you may"
// (503): collapsing them would report a governance failure as a permission
// problem.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

/** Wire shape. Field names match the Go json tags exactly. */
export type PurchaseOrder = {
  purchase_order_id: string;
  tenant_id: string;
  legal_entity_id: string;
  purchase_request_id?: string | null;
  vendor_profile_id?: string | null;
  po_number: string;
  po_status: "ISSUED" | "CLOSED";
  total_amount: number;
  currency_code: string;
  version: number;
  issued_by_principal_id: string;
  closed_by_principal_id?: string | null;
  correlation_id: string;
  created_at: string;
  issued_at: string;
  closed_at?: string | null;
};

export type OrderStatusFilter = "ISSUED" | "CLOSED";

export type ListOrdersInput = {
  identity: Identity & { tenantId: string };
  legalEntityId?: string;
  status?: OrderStatusFilter;
};

/**
 * List purchase orders for the caller's tenant, newest first.
 *
 * `tenant_id` is a required query parameter — the service answers 400 without
 * it — and it must be a UUID, because it is compared against a uuid column. A
 * non-UUID value fails inside the driver and surfaces as 503, not 400.
 *
 * The backend returns JSON `null` rather than `[]` for an empty result, so the
 * null case is normalised here instead of at every call site.
 */
export async function listPurchaseOrders(
  input: ListOrdersInput,
): Promise<ApiResult<PurchaseOrder[]>> {
  const result = await apiGet<PurchaseOrder[] | null>("purchaseOrder", "/v1/purchase-orders", {
    query: {
      tenant_id: input.identity.tenantId,
      legal_entity_id: input.legalEntityId,
      status: input.status,
    },
    identity: input.identity,
  });

  if (!result.ok) return result;
  if (result.data === null) return { ok: true, data: [] };

  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: { kind: "malformed", message: "purchase-order-svc returned a non-array order list" },
    };
  }

  const orders = [...result.data].sort(
    (a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime(),
  );
  return { ok: true, data: orders };
}

/**
 * Fetch one order.
 *
 * The tenant identity is load-bearing, not decorative: the store scopes the
 * lookup by the X-Tenant-Id header and returns "not found" when it is absent,
 * so a call without identity is indistinguishable from a bad id.
 */
export async function getPurchaseOrder(
  orderId: string,
  identity: Identity & { tenantId: string },
): Promise<ApiResult<PurchaseOrder>> {
  return apiGet<PurchaseOrder>("purchaseOrder", `/v1/purchase-orders/${orderId}`, { identity });
}

export type IssueOrderInput = {
  identity: Identity & { principalId: string; tenantId: string; legalEntityId: string };
  totalAmount: number;
  currencyCode: string;
  /** Optional. When set, the service verifies it is an APPROVED request owned
   *  by the same tenant and legal entity before issuing. */
  purchaseRequestId?: string;
  vendorProfileId?: string;
};

/**
 * Issue a new purchase order.
 *
 * 201 means an order was created; 200 means the request replayed an existing
 * one and nothing new was written. Both are success, and the caller is told
 * which so a retried submit does not report a second order that doesn't exist.
 */
export async function issuePurchaseOrder(
  input: IssueOrderInput,
): Promise<ApiWriteResult<PurchaseOrder>> {
  return apiPost<PurchaseOrder>(
    "purchaseOrder",
    "/v1/purchase-orders",
    {
      tenant_id: input.identity.tenantId,
      legal_entity_id: input.identity.legalEntityId,
      total_amount: input.totalAmount,
      currency_code: input.currencyCode,
      correlation_id: crypto.randomUUID(),
      ...(input.purchaseRequestId ? { purchase_request_id: input.purchaseRequestId } : {}),
      ...(input.vendorProfileId ? { vendor_profile_id: input.vendorProfileId } : {}),
    },
    { identity: input.identity },
  );
}

export type AmendOrderInput = {
  orderId: string;
  identity: Identity & { principalId: string; tenantId: string };
  newTotalAmount: number;
  /** Required by the service — an amendment with no stated reason is rejected,
   *  because the reason is the audit record. */
  reason: string;
};

/** Restate an order's total. Legal only while ISSUED; bumps `version`. */
export async function amendPurchaseOrder(
  input: AmendOrderInput,
): Promise<ApiWriteResult<PurchaseOrder>> {
  return apiPost<PurchaseOrder>(
    "purchaseOrder",
    `/v1/purchase-orders/${input.orderId}/amend`,
    { new_total_amount: input.newTotalAmount, reason: input.reason },
    { identity: input.identity },
  );
}

/** Close an order. Terminal — a CLOSED order cannot be amended or reopened. */
export async function closePurchaseOrder(
  orderId: string,
  identity: Identity & { principalId: string; tenantId: string },
): Promise<ApiWriteResult<PurchaseOrder>> {
  return apiPost<PurchaseOrder>(
    "purchaseOrder",
    `/v1/purchase-orders/${orderId}/close`,
    {},
    { identity },
  );
}

export type OrderStats = {
  issued: number;
  closed: number;
  /** Committed spend still open, by currency — orders in different currencies
   *  are never summed together. */
  openCommitmentByCurrency: Record<string, number>;
};

/** Roll up a list the caller already has. Pure — no second round trip. */
export function summarise(orders: PurchaseOrder[]): OrderStats {
  const openCommitmentByCurrency: Record<string, number> = {};
  let issued = 0;
  let closed = 0;

  for (const order of orders) {
    if (order.po_status === "CLOSED") {
      closed += 1;
      continue;
    }
    issued += 1;
    openCommitmentByCurrency[order.currency_code] =
      (openCommitmentByCurrency[order.currency_code] ?? 0) + order.total_amount;
  }

  return { issued, closed, openCommitmentByCurrency };
}

/**
 * Turn a backend failure into something a procurement user can act on.
 *
 * The raw messages name services and status codes, which is right for a log and
 * wrong for a page — but the distinction between denied and undeterminable is
 * preserved, because they call for different responses from the reader.
 */
export function explainWriteError(message: string): string {
  if (message.includes("authorization_denied")) {
    return "Authorization denied — this principal does not hold the required permission on this legal entity.";
  }
  if (message.includes("authorization_service_unavailable")) {
    return "Could not verify authorization, so the action was refused. authorization-svc is unreachable — this is a fail-closed refusal, not a denial.";
  }
  if (message.includes("identity_missing")) {
    return "No caller identity reached the service. Sign in again.";
  }
  if (message.includes("invalid_transition")) {
    return "That transition is not legal for this order — a CLOSED order cannot be amended or closed again.";
  }
  if (message.includes("order_not_found")) {
    return "That purchase order no longer exists for this tenant.";
  }
  if (message.includes("purchase_request_not_approved")) {
    return "The referenced purchase request is not APPROVED, so no order can be issued against it.";
  }
  if (message.includes("purchase_request_not_found")) {
    return "The referenced purchase request does not exist.";
  }
  if (message.includes("purchase_request_mismatch")) {
    return "The referenced purchase request belongs to a different tenant or legal entity.";
  }
  if (message.includes("purchase_request_service_unavailable")) {
    return "Could not verify the referenced purchase request, so the order was refused. purchase-request-svc is unreachable.";
  }
  if (message.includes("store_unavailable")) {
    return "purchase-order-svc could not reach its database. Nothing was written.";
  }
  return message;
}
