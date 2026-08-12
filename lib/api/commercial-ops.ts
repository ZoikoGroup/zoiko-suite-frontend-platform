// Server-side API clients for Commercial Ops domain microservices:
// - procurement-workflow-svc (8109)
// - purchase-request-svc (8110)
// - purchase-order-svc (8112)
// - invoice-approval-svc (8134)
// - vendor-due-diligence-svc (8135)
// - spend-controls-svc (8131)

import { type ApiResult, type Identity } from "./client";
import {
  listSpendPolicies,
  listPolicyUsage,
  summarisePolicyUsage,
} from "./spend-controls";
import { listPurchaseOrders as listVerifiedPurchaseOrders } from "./purchase-orders";

// ─── 1. Purchase Orders ──────────────────────────────────────────────────────

// The service only has two statuses — ISSUED and CLOSED. The other three were
// never reachable; they came from the same imagined API as the field names below.
export type PurchaseOrderStatus = "ISSUED" | "CLOSED";

export type PurchaseOrder = {
  po_id: string;
  tenant_id: string;
  legal_entity_id: string;
  po_number: string;
  vendor_name: string;
  total_amount: number;
  currency: string;
  status: PurchaseOrderStatus;
  created_by: string;
  created_at: string;
};

/**
 * Purchase orders for the domain-summary panel, from the live service.
 *
 * This was fabricating unconditionally, and more thoroughly than the spend-limits
 * version. purchase-order-svc returns a **bare array**, but this client expected
 * `{purchase_orders: [...], total}` and read `d.purchase_orders ?? []` — always
 * empty. fetchServiceWithFallback then substitutes its sample whenever the result
 * is empty, so the panel displayed two invented orders ("Acme Cloud Infrastructure
 * Inc.", $450,000, ISSUED) *even with a healthy service returning real ones*. The
 * legacy field names below (`po_id`, `vendor_name`, `status`) match nothing the
 * service sends, which is the clue that they were written against an imagined API.
 *
 * Now delegates to lib/api/purchase-orders.ts — the client that is actually
 * verified against the service — and maps to this display shape. No fallback: a
 * failure is reported as a failure.
 *
 * `vendor_name` has no source. The service stores a `vendor_profile_id` and there
 * is no vendor master anywhere in this platform to resolve it against, so the id is
 * shown rather than a name invented for it.
 */
export async function listPurchaseOrders(identity?: Identity): Promise<ApiResult<PurchaseOrder[]>> {
  if (!identity?.tenantId) {
    return {
      ok: false,
      error: {
        kind: "http",
        status: 401,
        message: "purchase-order-svc requires a tenant scope to read orders",
      },
    };
  }

  const result = await listVerifiedPurchaseOrders({
    identity: { ...identity, tenantId: identity.tenantId },
  });
  if (!result.ok) return result;

  return {
    ok: true,
    data: result.data.map((po) => ({
      po_id: po.purchase_order_id,
      tenant_id: po.tenant_id,
      legal_entity_id: po.legal_entity_id,
      po_number: po.po_number,
      vendor_name: po.vendor_profile_id ?? "—",
      total_amount: po.total_amount,
      currency: po.currency_code,
      status: po.po_status,
      created_by: po.issued_by_principal_id,
      created_at: po.issued_at,
    })),
  };
}

// ─── 2. Spend Controls ───────────────────────────────────────────────────────

export type SpendLimit = {
  limit_id: string;
  tenant_id: string;
  department_name: string;
  budget_cap: number;
  spent_to_date: number;
  remaining_budget: number;
  currency: string;
  status: string;
};

/**
 * Spend limits, derived from the live service.
 *
 * This function used to be the console's worst piece of fiction. It called
 * `${base}/v1/spend-controls/limits` — a route spend-controls-svc has never had;
 * it mounts /v1/spend-policies, /v1/spend-checks and /v1/spend-consumptions — and
 * routed the resulting 404 through fetchServiceWithFallback, which answers
 * `{ok: true}` with hardcoded sample data on any failure. Worse, that helper also
 * substitutes the sample when the real response is merely EMPTY, so even a healthy
 * service with no limits configured displayed two invented departments
 * ("Engineering & Cloud Tech", a $2.5m cap, 58% spent) as though they were live
 * figures. Nothing about the panel disclosed it.
 *
 * It now reads the real routes and derives this shape from them, with no fallback:
 * a failure is reported as a failure. `department_name` carries the policy's
 * category — the service has no notion of a department, and inventing one here is
 * what produced the fiction in the first place.
 *
 * Prefer lib/api/spend-controls.ts directly for new work; this exists to keep the
 * domain-summary panel and the /api/v1 proxy route on real data.
 */
export async function listSpendLimits(identity?: Identity): Promise<ApiResult<SpendLimit[]>> {
  if (!identity?.tenantId) {
    return {
      ok: false,
      error: {
        kind: "http",
        status: 401,
        message: "spend-controls-svc requires a tenant scope to read limits",
      },
    };
  }
  const scoped = { ...identity, tenantId: identity.tenantId };

  const [policies, usageTotals] = await Promise.all([
    listSpendPolicies({ identity: scoped }),
    listPolicyUsage({ identity: scoped }),
  ]);

  if (!policies.ok) return policies;

  // A failed usage read must not silently become "nothing spent" — that would
  // report every budget as untouched. Reported as unavailable instead.
  if (!usageTotals.ok) return usageTotals;

  const usage = summarisePolicyUsage(policies.data, usageTotals.data);

  return {
    ok: true,
    data: usage.map(({ policy, consumed }) => ({
      limit_id: policy.spend_policy_id,
      tenant_id: policy.tenant_id,
      department_name: policy.category,
      budget_cap: policy.threshold_amount,
      spent_to_date: consumed,
      remaining_budget: Math.max(policy.threshold_amount - consumed, 0),
      currency: policy.currency_code,
      // PER_TRANSACTION has no cumulative budget to be within, so it is not
      // claimed to be either within or over one.
      status:
        policy.period === "PER_TRANSACTION"
          ? "PER_TRANSACTION"
          : consumed >= policy.threshold_amount
            ? "EXHAUSTED"
            : "WITHIN_BUDGET",
    })),
  };
}

// The fetchServiceWithFallback helper that used to live here has been deleted
// along with its last caller.
//
// It was the mechanism behind both fabrications in this file, and the reason
// neither was ever noticed: it caught every failure — unreachable service, 404,
// 500, malformed body — and answered `{ok: true}` with hardcoded sample data, so a
// caller could not distinguish live figures from invented ones. It also
// substituted the sample when the real response was merely EMPTY, which is how a
// perfectly healthy service still produced fiction.
//
// Real reads go through lib/api/client.ts, which returns a discriminated
// `ApiResult` so a failure has to be handled rather than silently replaced.
//
// NOTE: the same helper shape still exists in lib/api/{compliance,hr,legal,
// payroll,tax,finance}.ts, with roughly thirty MOCK_ constants behind it. Those
// pages are not yet wired to live services, so the sample data is at least not
// competing with real data — but the same silent substitution is waiting there for
// whoever wires them, and the fallback should be removed as each one is.
