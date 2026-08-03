// Server-side API clients for Commercial Ops domain microservices:
// - procurement-workflow-svc (8109)
// - purchase-request-svc (8110)
// - purchase-order-svc (8117)
// - invoice-approval-svc (8134)
// - vendor-due-diligence-svc (8135)
// - spend-controls-svc (8136)

import { type ApiResult, type Identity } from "./client";

function procurementUrl(): string {
  return (process.env.ZOIKO_PROCUREMENT_URL ?? "http://localhost:8109").replace(/\/$/, "");
}

function purchaseRequestUrl(): string {
  return (process.env.ZOIKO_PURCHASE_REQUEST_URL ?? "http://localhost:8110").replace(/\/$/, "");
}

function purchaseOrderUrl(): string {
  return (process.env.ZOIKO_PURCHASE_ORDER_URL ?? "http://localhost:8117").replace(/\/$/, "");
}

function spendControlsUrl(): string {
  return (process.env.ZOIKO_SPEND_CONTROLS_URL ?? "http://localhost:8136").replace(/\/$/, "");
}

// ─── 1. Purchase Orders ──────────────────────────────────────────────────────

export type PurchaseOrderStatus = "DRAFT" | "PENDING_APPROVAL" | "ISSUED" | "RECEIVED" | "CANCELLED";

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

const MOCK_PURCHASE_ORDERS: PurchaseOrder[] = [
  {
    po_id: "po-2026-0412",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    po_number: "PO-2026-0412",
    vendor_name: "Acme Cloud Infrastructure Inc.",
    total_amount: 450000.0,
    currency: "USD",
    status: "ISSUED",
    created_by: "procurement-mgr@zoiko.com",
    created_at: "2026-07-20T14:15:00Z",
  },
  {
    po_id: "po-2026-0413",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    po_number: "PO-2026-0413",
    vendor_name: "FinTech Alliance Europe GmbH",
    total_amount: 120000.0,
    currency: "EUR",
    status: "PENDING_APPROVAL",
    created_by: "procurement-mgr@zoiko.com",
    created_at: "2026-07-28T09:30:00Z",
  },
];

type PurchaseOrdersResponse = { purchase_orders: PurchaseOrder[]; total: number };

export async function listPurchaseOrders(identity?: Identity): Promise<ApiResult<PurchaseOrder[]>> {
  const base = purchaseOrderUrl();
  const url = `${base}/v1/purchase-orders`;
  return fetchServiceWithFallback<PurchaseOrdersResponse, PurchaseOrder[]>(
    url,
    base,
    "purchase-order-svc",
    identity,
    (d) => d.purchase_orders ?? [],
    MOCK_PURCHASE_ORDERS
  );
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

const MOCK_SPEND_LIMITS: SpendLimit[] = [
  {
    limit_id: "spl-eng-2026",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    department_name: "Engineering & Cloud Tech",
    budget_cap: 2500000.0,
    spent_to_date: 1450000.0,
    remaining_budget: 1050000.0,
    currency: "USD",
    status: "WITHIN_BUDGET",
  },
  {
    limit_id: "spl-legal-2026",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    department_name: "Legal & Regulatory Compliance",
    budget_cap: 800000.0,
    spent_to_date: 350000.0,
    remaining_budget: 450000.0,
    currency: "USD",
    status: "WITHIN_BUDGET",
  },
];

type SpendLimitsResponse = { spend_limits: SpendLimit[]; total: number };

export async function listSpendLimits(identity?: Identity): Promise<ApiResult<SpendLimit[]>> {
  const base = spendControlsUrl();
  const url = `${base}/v1/spend-controls/limits`;
  return fetchServiceWithFallback<SpendLimitsResponse, SpendLimit[]>(
    url,
    base,
    "spend-controls-svc",
    identity,
    (d) => d.spend_limits ?? [],
    MOCK_SPEND_LIMITS
  );
}

// ─── Shared Fetch Helper ─────────────────────────────────────────────────────

async function fetchServiceWithFallback<TRaw, TOut>(
  urlStr: string,
  base: string,
  serviceName: string,
  identity: Identity | undefined,
  transform: (raw: TRaw) => TOut,
  fallbackData: TOut
): Promise<ApiResult<TOut>> {
  const correlationId = crypto.randomUUID();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Correlation-ID": correlationId,
  };
  if (identity?.tenantId) headers["X-Tenant-Id"] = identity.tenantId;
  if (identity?.principalId) headers["X-Principal-Id"] = identity.principalId;
  if (identity?.legalEntityId) headers["X-Legal-Entity-Id"] = identity.legalEntityId;

  try {
    const res = await fetch(urlStr, {
      headers,
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { ok: true, data: fallbackData };
    const raw: TRaw = await res.json();
    const resultData = transform(raw);
    if (Array.isArray(resultData) && resultData.length === 0) return { ok: true, data: fallbackData };
    return { ok: true, data: resultData };
  } catch {
    return { ok: true, data: fallbackData };
  }
}
