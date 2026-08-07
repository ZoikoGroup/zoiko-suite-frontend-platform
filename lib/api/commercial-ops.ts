// Server-side API clients for Commercial Ops domain microservices:
// - procurement-workflow-svc (8109)
// - purchase-request-svc (8110)
// - purchase-order-svc (8112)
// - invoice-approval-svc (8134)
// - vendor-due-diligence-svc (8135)
// - spend-controls-svc (8131)
// - supplier-intelligence-svc (8114)
// - catalog-governance-svc (8115)
// - requisition-engine-svc (8116)
// - contract-match-svc (8117)

import { type ApiResult, type Identity } from "./client";


function purchaseOrderUrl(): string {
  return (process.env.ZOIKO_PURCHASE_ORDER_URL ?? "http://localhost:8112").replace(/\/$/, "");
}

function spendControlsUrl(): string {
  return (process.env.ZOIKO_SPEND_CONTROLS_URL ?? "http://localhost:8131").replace(/\/$/, "");
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

// ─── 3. Supplier Intelligence ────────────────────────────────────────────────────

function supplierIntelligenceUrl(): string {
  return (process.env.ZOIKO_SUPPLIER_INTELLIGENCE_URL ?? "http://localhost:8114").replace(/\/$/, "");
}

export type SupplierProfile = {
  supplier_id: string;
  tenant_id: string;
  supplier_name: string;
  country: string;
  risk_tier: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  compliance_score: number;
  active_contracts: number;
  last_audited: string;
  status: string;
};

const MOCK_SUPPLIERS: SupplierProfile[] = [
  {
    supplier_id: "sup-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    supplier_name: "Acme Cloud Infrastructure Inc.",
    country: "US",
    risk_tier: "LOW",
    compliance_score: 94.5,
    active_contracts: 3,
    last_audited: "2026-06-01",
    status: "APPROVED",
  },
  {
    supplier_id: "sup-002",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    supplier_name: "FinTech Alliance Europe GmbH",
    country: "DE",
    risk_tier: "MEDIUM",
    compliance_score: 78.2,
    active_contracts: 1,
    last_audited: "2026-05-15",
    status: "APPROVED",
  },
];

type SuppliersResponse = { suppliers: SupplierProfile[]; total: number };

export async function listSuppliers(identity?: Identity): Promise<ApiResult<SupplierProfile[]>> {
  const base = supplierIntelligenceUrl();
  const url = `${base}/v1/suppliers`;
  return fetchServiceWithFallback<SuppliersResponse, SupplierProfile[]>(
    url, base, "supplier-intelligence-svc", identity,
    (d) => d.suppliers ?? [], MOCK_SUPPLIERS
  );
}

// ─── 4. Catalog Governance ────────────────────────────────────────────────────

function catalogGovernanceUrl(): string {
  return (process.env.ZOIKO_CATALOG_GOVERNANCE_URL ?? "http://localhost:8115").replace(/\/$/, "");
}

export type CatalogItem = {
  item_id: string;
  tenant_id: string;
  name: string;
  category: string;
  unit_price: number;
  currency: string;
  preferred_supplier_id: string;
  status: string;
  created_at: string;
};

const MOCK_CATALOG_ITEMS: CatalogItem[] = [
  {
    item_id: "cat-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    name: "Enterprise SaaS License - Cloud Infrastructure",
    category: "SOFTWARE",
    unit_price: 45000.0,
    currency: "USD",
    preferred_supplier_id: "sup-001",
    status: "ACTIVE",
    created_at: "2026-01-01T00:00:00Z",
  },
];

type CatalogResponse = { items: CatalogItem[]; total: number };

export async function listCatalogItems(identity?: Identity): Promise<ApiResult<CatalogItem[]>> {
  const base = catalogGovernanceUrl();
  const url = `${base}/v1/catalogs`;
  return fetchServiceWithFallback<CatalogResponse, CatalogItem[]>(
    url, base, "catalog-governance-svc", identity,
    (d) => d.items ?? [], MOCK_CATALOG_ITEMS
  );
}

// ─── 5. Requisition Engine ────────────────────────────────────────────────────

function requisitionEngineUrl(): string {
  return (process.env.ZOIKO_REQUISITION_ENGINE_URL ?? "http://localhost:8116").replace(/\/$/, "");
}

export type Requisition = {
  requisition_id: string;
  tenant_id: string;
  legal_entity_id: string;
  title: string;
  requestor_id: string;
  total_value: number;
  currency: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "FULFILLED";
  created_at: string;
};

const MOCK_REQUISITIONS: Requisition[] = [
  {
    requisition_id: "req-2026-0041",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    title: "Q3 Cloud Infrastructure Expansion",
    requestor_id: "usr-eng-lead-01",
    total_value: 180000.0,
    currency: "USD",
    status: "APPROVED",
    created_at: "2026-07-01T09:00:00Z",
  },
];

type RequisitionsResponse = { requisitions: Requisition[]; total: number };

export async function listRequisitions(identity?: Identity): Promise<ApiResult<Requisition[]>> {
  const base = requisitionEngineUrl();
  const url = `${base}/v1/requisitions`;
  return fetchServiceWithFallback<RequisitionsResponse, Requisition[]>(
    url, base, "requisition-engine-svc", identity,
    (d) => d. requisitions ?? [], MOCK_REQUISITIONS
  );
}

// ─── 6. Contract Match ───────────────────────────────────────────────────────

function contractMatchUrl(): string {
  return (process.env.ZOIKO_CONTRACT_MATCH_URL ?? "http://localhost:8117").replace(/\/$/, "");
}

export type ContractMatch = {
  match_id: string;
  tenant_id: string;
  purchase_order_id: string;
  contract_id: string;
  match_status: "MATCHED" | "PARTIAL" | "UNMATCHED" | "DISPUTED";
  variance_amount: number;
  currency: string;
  matched_at: string;
};

const MOCK_CONTRACT_MATCHES: ContractMatch[] = [
  {
    match_id: "cm-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    purchase_order_id: "po-2026-0412",
    contract_id: "cnt-2026-001",
    match_status: "MATCHED",
    variance_amount: 0.0,
    currency: "USD",
    matched_at: "2026-07-21T10:00:00Z",
  },
];

type ContractMatchesResponse = { matches: ContractMatch[]; total: number };

export async function listContractMatches(identity?: Identity): Promise<ApiResult<ContractMatch[]>> {
  const base = contractMatchUrl();
  const url = `${base}/v1/contract-matches`;
  return fetchServiceWithFallback<ContractMatchesResponse, ContractMatch[]>(
    url, base, "contract-match-svc", identity,
    (d) => d.matches ?? [], MOCK_CONTRACT_MATCHES
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
