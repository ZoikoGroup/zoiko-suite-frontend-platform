// purchase-request-svc (:8100, /purchase-request-svc through the gateway) — the
// requisition register that sits UPSTREAM of the purchase-order register.
//
// Lifecycle is one hop and terminal on both branches: PENDING -> APPROVED or
// PENDING -> REJECTED. There is no route back. Attempting a second transition
// answers 422 `invalid_transition` rather than silently re-stamping the record,
// so who approved a request and when cannot be overwritten.
//
// Why the console cares: purchase-order-svc will only issue an order against a
// purchase request that is APPROVED and owned by the same tenant and legal
// entity. Before this client existed the Commercial Ops page let an operator
// type a `purchase_request_id` it had no way to look up or create, and mapped
// three errors (`purchase_request_not_approved`, `_not_found`, `_mismatch`) whose
// subject was invisible in the UI.
//
// Every mutation is authorization-checked before it is applied and fails closed,
// so 403 ("you may not") and 503 ("we could not determine whether you may") are
// kept apart — collapsing them would report a governance failure as a
// permissions problem.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";

/** Wire shape. Field names match the Go json tags exactly. */
export type PurchaseRequest = {
  request_id: string;
  tenant_id: string;
  legal_entity_id: string;
  requested_by_principal_id: string;
  description: string;
  amount: number;
  currency_code: string;
  status: RequestStatus;
  approved_by_principal_id?: string | null;
  rejected_by_principal_id?: string | null;
  rejection_reason?: string | null;
  correlation_id: string;
  created_at: string;
  approved_at?: string | null;
  rejected_at?: string | null;
};

export type ListRequestsInput = {
  identity: Identity & { tenantId: string };
  legalEntityId?: string;
  status?: RequestStatus;
};

/**
 * List purchase requests for the caller's tenant, newest first.
 *
 * `tenant_id` is a required query parameter — the service answers 400 without
 * it — and must be a UUID, since it is compared against a uuid column. A
 * non-UUID fails inside the driver and surfaces as 503, not 400.
 *
 * Normalises a JSON `null` result to `[]` so call sites do not each repeat it.
 */
export async function listPurchaseRequests(
  input: ListRequestsInput,
): Promise<ApiResult<PurchaseRequest[]>> {
  const result = await apiGet<PurchaseRequest[] | null>(
    "purchaseRequest",
    "/v1/purchase-requests",
    {
      query: {
        tenant_id: input.identity.tenantId,
        legal_entity_id: input.legalEntityId,
        status: input.status,
      },
      identity: input.identity,
    },
  );

  if (!result.ok) return result;
  if (result.data === null) return { ok: true, data: [] };

  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "purchase-request-svc returned a non-array request list",
      },
    };
  }

  const requests = [...result.data].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return { ok: true, data: requests };
}

/**
 * Fetch one request.
 *
 * Tenant scope comes from the X-Tenant-Id header, and the store returns "not
 * found" when it is absent — so a call without identity is indistinguishable
 * from a bad id, exactly as in purchase-order-svc.
 */
export async function getPurchaseRequest(
  requestId: string,
  identity: Identity & { tenantId: string },
): Promise<ApiResult<PurchaseRequest>> {
  return apiGet<PurchaseRequest>(
    "purchaseRequest",
    `/v1/purchase-requests/${requestId}`,
    { identity },
  );
}

export type CreateRequestInput = {
  identity: Identity & { principalId: string; tenantId: string; legalEntityId: string };
  description: string;
  amount: number;
  currencyCode: string;
};

/**
 * Raise a new purchase request. It lands PENDING and grants nothing.
 *
 * 201 means a request was created; 200 means this replayed an existing one and
 * nothing new was written — the service holds a partial unique index on
 * (tenant_id, correlation_id), so a retried submit resolves to the ORIGINAL
 * record instead of duplicating it. Both are success, and the caller is told
 * which so a retry does not report a second request that does not exist.
 */
export async function createPurchaseRequest(
  input: CreateRequestInput,
): Promise<ApiWriteResult<PurchaseRequest>> {
  return apiPost<PurchaseRequest>(
    "purchaseRequest",
    "/v1/purchase-requests",
    {
      tenant_id: input.identity.tenantId,
      legal_entity_id: input.identity.legalEntityId,
      description: input.description,
      amount: input.amount,
      currency_code: input.currencyCode,
      correlation_id: crypto.randomUUID(),
    },
    { identity: input.identity },
  );
}

/** Approve a PENDING request. Terminal — a second call answers 422. */
export async function approvePurchaseRequest(
  requestId: string,
  identity: Identity & { principalId: string; tenantId: string },
): Promise<ApiWriteResult<PurchaseRequest>> {
  return apiPost<PurchaseRequest>(
    "purchaseRequest",
    `/v1/purchase-requests/${requestId}/approve`,
    { correlation_id: crypto.randomUUID() },
    { identity },
  );
}

/**
 * Reject a PENDING request. Terminal — a second call answers 422.
 *
 * `reason` is required by the service (400 `missing_field` without it): the
 * reason IS the audit record for a refusal, so an unexplained rejection is not
 * accepted.
 */
export async function rejectPurchaseRequest(
  requestId: string,
  reason: string,
  identity: Identity & { principalId: string; tenantId: string },
): Promise<ApiWriteResult<PurchaseRequest>> {
  return apiPost<PurchaseRequest>(
    "purchaseRequest",
    `/v1/purchase-requests/${requestId}/reject`,
    { reason, correlation_id: crypto.randomUUID() },
    { identity },
  );
}

// ─── Derived views ───────────────────────────────────────────────────────────

export type RequestStats = {
  pending: number;
  approved: number;
  rejected: number;
  /** Value awaiting a decision, by currency. Requests in different currencies
   *  are never summed together — a single total would be a fiction. */
  pendingValueByCurrency: Record<string, number>;
};

export function summariseRequests(requests: PurchaseRequest[]): RequestStats {
  const stats: RequestStats = {
    pending: 0,
    approved: 0,
    rejected: 0,
    pendingValueByCurrency: {},
  };

  for (const r of requests) {
    if (r.status === "APPROVED") stats.approved += 1;
    else if (r.status === "REJECTED") stats.rejected += 1;
    else {
      stats.pending += 1;
      stats.pendingValueByCurrency[r.currency_code] =
        (stats.pendingValueByCurrency[r.currency_code] ?? 0) + r.amount;
    }
  }

  return stats;
}

/** True when this request can still be issued against by purchase-order-svc. */
export function isIssuable(request: PurchaseRequest): boolean {
  return request.status === "APPROVED";
}

/** Turn a backend failure into something an operator can act on. */
export function explainRequestError(message: string): string {
  if (message.includes("authorization_denied")) {
    return "Authorization denied — this principal does not hold the required permission on this legal entity. Raising, approving, and rejecting are three separate grants, so holding one does not imply the others.";
  }
  if (message.includes("authorization_service_unavailable")) {
    return "Could not verify authorization, so the action was refused. authorization-svc is unreachable — this is a fail-closed refusal, not a denial.";
  }
  if (message.includes("identity_missing")) {
    return "No caller identity reached the service, so it failed closed. Sign in again.";
  }
  if (message.includes("invalid_transition")) {
    return "This request has already been decided. PENDING → APPROVED and PENDING → REJECTED are both terminal, so a second decision is refused rather than overwriting who decided it first.";
  }
  if (message.includes("request_not_found")) {
    return "No purchase request with that id exists for this tenant. Another tenant's request reads as absent in exactly the same way.";
  }
  if (message.includes("missing_field")) {
    return `A required field was empty: ${message.split("missing_field").pop()?.replace(/[^a-z_ ]/gi, " ").trim() || "check the form"}.`;
  }
  if (message.includes("invalid_field")) {
    return `That value was rejected: ${message.split("invalid_field").pop()?.replace(/["{}:,]/g, " ").trim() || "check the form"}.`;
  }
  if (message.includes("invalid_json")) {
    return "The service could not parse the request body.";
  }
  if (message.includes("store_unavailable")) {
    return "purchase-request-svc could not reach its database. Nothing was written.";
  }
  return message;
}
