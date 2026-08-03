import { fetchFromBackend, SERVICE_ENDPOINTS, ApiResponse } from "@/lib/api-client";

export type InvoiceStatus = "ISSUED" | "SENT" | "OVERDUE" | "PAID";

export interface CustomerInvoice {
  invoice_id: string;
  tenant_id: string;
  legal_entity_id: string;
  customer_id: string;
  invoice_number: string;
  amount: number;
  currency_code: string;
  due_date: string;
  status: InvoiceStatus;
  created_by_principal_id: string;
  correlation_id?: string;
  created_at?: string;
}

// Local mock data fallback when backend service is offline
const MOCK_INVOICES: CustomerInvoice[] = [
  {
    invoice_id: "inv-local-001",
    tenant_id: "tenant-zoiko-dev-01",
    legal_entity_id: "le-singapore-01",
    customer_id: "cust-global-tech",
    invoice_number: "INV-2026-0891",
    amount: 24500.0,
    currency_code: "USD",
    due_date: "2026-08-15T00:00:00Z",
    status: "ISSUED",
    created_by_principal_id: "principal-admin-01",
    created_at: "2026-07-28T10:00:00Z",
  },
  {
    invoice_id: "inv-local-002",
    tenant_id: "tenant-zoiko-dev-01",
    legal_entity_id: "le-uk-ltd-02",
    customer_id: "cust-apex-corp",
    invoice_number: "INV-2026-0892",
    amount: 142000.5,
    currency_code: "GBP",
    due_date: "2026-08-01T00:00:00Z",
    status: "SENT",
    created_by_principal_id: "principal-finance-lead",
    created_at: "2026-07-25T14:30:00Z",
  },
  {
    invoice_id: "inv-local-003",
    tenant_id: "tenant-zoiko-dev-01",
    legal_entity_id: "le-us-inc-03",
    customer_id: "cust-horizon-labs",
    invoice_number: "INV-2026-0885",
    amount: 8790.0,
    currency_code: "USD",
    due_date: "2026-07-20T00:00:00Z",
    status: "OVERDUE",
    created_by_principal_id: "principal-admin-01",
    created_at: "2026-07-05T09:15:00Z",
  },
];
const getBaseUrl = () => {
  if (typeof window !== "undefined") {
    // Relative path to avoid CORS issues in the browser
    return "/api/backend/ar";
  }
  return SERVICE_ENDPOINTS.accountsReceivable;
};

/**
 * Lists invoices from local accounts-receivable-svc.
 */
export async function listInvoices(
  tenantID?: string
): Promise<ApiResponse<CustomerInvoice[]>> {
  return fetchFromBackend<CustomerInvoice[]>(
    getBaseUrl(),
    "/v1/invoices",
    { method: "GET" },
    MOCK_INVOICES,
    tenantID
  );
}

/**
 * Creates a new customer invoice via accounts-receivable-svc.
 */
export async function createInvoice(
  invoice: Partial<CustomerInvoice>,
  tenantID?: string
): Promise<ApiResponse<CustomerInvoice>> {
  const payload: CustomerInvoice = {
    invoice_id: invoice.invoice_id || `inv-${Date.now()}`,
    tenant_id: tenantID || "tenant-zoiko-dev-01",
    legal_entity_id: invoice.legal_entity_id || "le-singapore-01",
    customer_id: invoice.customer_id || "cust-default",
    invoice_number: invoice.invoice_number || `INV-${Math.floor(Math.random() * 9000 + 1000)}`,
    amount: invoice.amount || 1000.0,
    currency_code: invoice.currency_code || "USD",
    due_date: invoice.due_date || new Date(Date.now() + 14 * 86400000).toISOString(),
    status: "ISSUED",
    created_by_principal_id: "principal-admin-01",
    correlation_id: `corr-${Date.now()}`,
  };

  const mockResponse = { ...payload, created_at: new Date().toISOString() };

  return fetchFromBackend<CustomerInvoice>(
    getBaseUrl(),
    "/v1/invoices",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    mockResponse,
    tenantID
  );
}

/**
 * Transitions an existing invoice status.
 */
export async function transitionInvoice(
  invoiceID: string,
  fromStatus: InvoiceStatus,
  toStatus: InvoiceStatus,
  tenantID?: string
): Promise<ApiResponse<{ success: boolean; invoice_id: string; new_status: InvoiceStatus }>> {
  return fetchFromBackend(
    getBaseUrl(),
    `/v1/invoices/${invoiceID}/transition`,
    {
      method: "POST",
      body: JSON.stringify({ from_status: fromStatus, to_status: toStatus }),
    },
    { success: true, invoice_id: invoiceID, new_status: toStatus },
    tenantID
  );
}
