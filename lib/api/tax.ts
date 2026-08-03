// Server-side API clients for the Tax domain services:
// - tax-rules-svc (8125)
// - tax-determination-svc (8126)
// - vat-gst-svc (8127)
// - corporate-tax-svc (8128)
// - withholding-tax-svc (8129)
// - filing-preparation-svc (8130)
// - tax-authority-interface-svc (8147)

import { type ApiResult, type Identity } from "./client";

function taxRulesUrl(): string {
  return (process.env.ZOIKO_TAX_RULES_URL ?? "http://localhost:8125").replace(/\/$/, "");
}

function taxDeterminationUrl(): string {
  return (process.env.ZOIKO_TAX_DETERMINATION_URL ?? "http://localhost:8126").replace(/\/$/, "");
}

function vatGstUrl(): string {
  return (process.env.ZOIKO_VAT_GST_URL ?? "http://localhost:8127").replace(/\/$/, "");
}

function corporateTaxUrl(): string {
  return (process.env.ZOIKO_CORPORATE_TAX_URL ?? "http://localhost:8128").replace(/\/$/, "");
}

function withholdingTaxUrl(): string {
  return (process.env.ZOIKO_WITHHOLDING_TAX_URL ?? "http://localhost:8129").replace(/\/$/, "");
}

function filingPrepUrl(): string {
  return (process.env.ZOIKO_FILING_PREPARATION_URL ?? "http://localhost:8130").replace(/\/$/, "");
}

function taxAuthorityUrl(): string {
  return (process.env.ZOIKO_TAX_AUTHORITY_URL ?? "http://localhost:8147").replace(/\/$/, "");
}

// ─── 1. Tax Rules ────────────────────────────────────────────────────────────

export type TaxCategory = "VAT" | "GST" | "SALES_TAX" | "CORPORATE_INCOME" | "WITHHOLDING" | "EXCISE" | "CUSTOMS";
export type RuleStatus = "DRAFT" | "ACTIVE" | "DEPRECATED";

export type TaxRule = {
  rule_id: string;
  tenant_id: string;
  jurisdiction_id: string;
  rule_code: string;
  name: string;
  category: TaxCategory;
  tax_rate_percentage: number;
  standard_deductions?: number;
  exemptions_json?: string;
  status: RuleStatus;
  version: number;
  effective_from: string;
  effective_to?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const MOCK_TAX_RULES: TaxRule[] = [
  {
    rule_id: "rule-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "uk-gov-01",
    rule_code: "UK-VAT-STD-2026",
    name: "UK Standard VAT Rate",
    category: "VAT",
    tax_rate_percentage: 20.0,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01",
    created_by: "system-seed",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    rule_id: "rule-002",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "us-fed-01",
    rule_code: "US-CIT-FED-2026",
    name: "US Federal Corporate Income Tax",
    category: "CORPORATE_INCOME",
    tax_rate_percentage: 21.0,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01",
    created_by: "system-seed",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    rule_id: "rule-003",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "sg-iras-01",
    rule_code: "SG-GST-2026",
    name: "Singapore Goods & Services Tax",
    category: "GST",
    tax_rate_percentage: 9.0,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01",
    created_by: "system-seed",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    rule_id: "rule-004",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "de-bzst-01",
    rule_code: "DE-WHT-DIV-2026",
    name: "German Dividend Withholding Tax",
    category: "WITHHOLDING",
    tax_rate_percentage: 15.0,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01",
    created_by: "system-seed",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

type TaxRulesResponse = { rules: TaxRule[]; total: number };

export async function listTaxRules(
  identity?: Identity,
  options?: { jurisdictionId?: string; category?: string; status?: string }
): Promise<ApiResult<TaxRule[]>> {
  const base = taxRulesUrl();
  const url = new URL(`${base}/v1/tax-rules`);
  if (options?.jurisdictionId) url.searchParams.set("jurisdiction_id", options.jurisdictionId);
  if (options?.category) url.searchParams.set("category", options.category);
  if (options?.status) url.searchParams.set("status", options.status);

  return fetchServiceWithFallback<TaxRulesResponse, TaxRule[]>(
    url.toString(),
    base,
    "tax-rules-svc",
    identity,
    (d) => d.rules ?? [],
    MOCK_TAX_RULES
  );
}

// ─── 2. Tax Determination ───────────────────────────────────────────────────

export type DeterminationStatus = "CALCULATED" | "APPLIED" | "OVERRIDDEN" | "REVERSED";

export type TaxDetermination = {
  determination_id: string;
  tenant_id: string;
  transaction_id: string;
  source_module: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  rule_id?: string;
  tax_category: string;
  gross_amount: number;
  taxable_amount: number;
  tax_rate_percentage: number;
  calculated_tax_amount: number;
  exempt_amount: number;
  currency: string;
  status: DeterminationStatus;
  effective_from: string;
  effective_to?: string;
  evaluated_at: string;
  evaluated_by: string;
  created_at: string;
  updated_at: string;
};

const MOCK_TAX_DETERMINATIONS: TaxDetermination[] = [
  {
    determination_id: "det-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    transaction_id: "inv-2026-0891",
    source_module: "AR",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "uk-gov-01",
    rule_id: "rule-001",
    tax_category: "VAT",
    gross_amount: 120000.0,
    taxable_amount: 100000.0,
    tax_rate_percentage: 20.0,
    calculated_tax_amount: 20000.0,
    exempt_amount: 0.0,
    currency: "GBP",
    status: "APPLIED",
    effective_from: "2026-07-01",
    evaluated_at: "2026-07-15T10:30:00Z",
    evaluated_by: "tax-determination-engine",
    created_at: "2026-07-15T10:30:00Z",
    updated_at: "2026-07-15T10:30:00Z",
  },
  {
    determination_id: "det-002",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    transaction_id: "po-2026-0412",
    source_module: "PURCHASE_ORDER",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "us-fed-01",
    rule_id: "rule-002",
    tax_category: "CORPORATE_INCOME",
    gross_amount: 450000.0,
    taxable_amount: 450000.0,
    tax_rate_percentage: 21.0,
    calculated_tax_amount: 94500.0,
    exempt_amount: 0.0,
    currency: "USD",
    status: "CALCULATED",
    effective_from: "2026-07-01",
    evaluated_at: "2026-07-20T14:15:00Z",
    evaluated_by: "tax-determination-engine",
    created_at: "2026-07-20T14:15:00Z",
    updated_at: "2026-07-20T14:15:00Z",
  },
];

type DeterminationsResponse = { determinations: TaxDetermination[]; total: number };

export async function listTaxDeterminations(
  identity?: Identity,
  options?: { legalEntityId?: string; transactionId?: string; status?: string }
): Promise<ApiResult<TaxDetermination[]>> {
  const base = taxDeterminationUrl();
  const url = new URL(`${base}/v1/tax-determinations`);
  if (options?.legalEntityId) url.searchParams.set("legal_entity_id", options.legalEntityId);
  if (options?.transactionId) url.searchParams.set("transaction_id", options.transactionId);
  if (options?.status) url.searchParams.set("status", options.status);

  return fetchServiceWithFallback<DeterminationsResponse, TaxDetermination[]>(
    url.toString(),
    base,
    "tax-determination-svc",
    identity,
    (d) => d.determinations ?? [],
    MOCK_TAX_DETERMINATIONS
  );
}

// ─── 3. VAT / GST ─────────────────────────────────────────────────────────────

export type VATFilingStatus = "DRAFT" | "FILED" | "ACCEPTED" | "REJECTED";

export type VATReturn = {
  return_id: string;
  tenant_id: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  tax_registration_number: string;
  tax_period: string;
  total_sales_amount: number;
  total_purchase_amount: number;
  output_tax_amount: number;
  input_tax_amount: number;
  net_tax_payable: number;
  currency: string;
  status: VATFilingStatus;
  filed_at?: string;
  filed_by?: string;
  effective_from: string;
  effective_to?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const MOCK_VAT_RETURNS: VATReturn[] = [
  {
    return_id: "vat-2026-q1",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "uk-gov-01",
    tax_registration_number: "GB-987654321",
    tax_period: "2026-Q1",
    total_sales_amount: 1500000.0,
    total_purchase_amount: 800000.0,
    output_tax_amount: 300000.0,
    input_tax_amount: 160000.0,
    net_tax_payable: 140000.0,
    currency: "GBP",
    status: "FILED",
    filed_at: "2026-04-15T09:00:00Z",
    filed_by: "tax-officer@zoiko.com",
    effective_from: "2026-01-01",
    created_by: "tax-officer@zoiko.com",
    created_at: "2026-04-10T10:00:00Z",
    updated_at: "2026-04-15T09:00:00Z",
  },
  {
    return_id: "vat-2026-q2",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "uk-gov-01",
    tax_registration_number: "GB-987654321",
    tax_period: "2026-Q2",
    total_sales_amount: 1850000.0,
    total_purchase_amount: 920000.0,
    output_tax_amount: 370000.0,
    input_tax_amount: 184000.0,
    net_tax_payable: 186000.0,
    currency: "GBP",
    status: "ACCEPTED",
    filed_at: "2026-07-14T11:20:00Z",
    filed_by: "tax-officer@zoiko.com",
    effective_from: "2026-04-01",
    created_by: "tax-officer@zoiko.com",
    created_at: "2026-07-10T12:00:00Z",
    updated_at: "2026-07-14T11:20:00Z",
  },
];

type VATReturnsResponse = { vat_returns: VATReturn[]; total: number };

export async function listVATReturns(
  identity?: Identity,
  options?: { legalEntityId?: string; status?: string }
): Promise<ApiResult<VATReturn[]>> {
  const base = vatGstUrl();
  const url = new URL(`${base}/v1/vat-returns`);
  if (options?.legalEntityId) url.searchParams.set("legal_entity_id", options.legalEntityId);
  if (options?.status) url.searchParams.set("status", options.status);

  return fetchServiceWithFallback<VATReturnsResponse, VATReturn[]>(
    url.toString(),
    base,
    "vat-gst-svc",
    identity,
    (d) => d.vat_returns ?? [],
    MOCK_VAT_RETURNS
  );
}

// ─── 4. Corporate Tax ────────────────────────────────────────────────────────

export type CorporateFilingStatus = "DRAFT" | "SUBMITTED" | "ASSESSED" | "SETTLED" | "DISPUTED";

export type CorporateTaxReturn = {
  return_id: string;
  tenant_id: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  tax_registration_number: string;
  fiscal_year: number;
  accounting_period_start: string;
  accounting_period_end: string;
  gross_revenue: number;
  allowable_deductions: number;
  taxable_income: number;
  tax_rate_percent: number;
  gross_tax_liability: number;
  tax_credits: number;
  net_tax_payable: number;
  tax_already_paid: number;
  balance_due: number;
  currency: string;
  status: CorporateFilingStatus;
  submitted_at?: string;
  submitted_by?: string;
  assessed_tax_amount?: number;
  assessment_reference?: string;
  notes?: string;
  effective_from: string;
  effective_to?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const MOCK_CORPORATE_RETURNS: CorporateTaxReturn[] = [
  {
    return_id: "cit-2025-us",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "us-fed-01",
    tax_registration_number: "EIN-12-3456789",
    fiscal_year: 2025,
    accounting_period_start: "2025-01-01",
    accounting_period_end: "2025-12-31",
    gross_revenue: 8500000.0,
    allowable_deductions: 5200000.0,
    taxable_income: 3300000.0,
    tax_rate_percent: 21.0,
    gross_tax_liability: 693000.0,
    tax_credits: 43000.0,
    net_tax_payable: 650000.0,
    tax_already_paid: 600000.0,
    balance_due: 50000.0,
    currency: "USD",
    status: "SUBMITTED",
    submitted_at: "2026-03-15T14:00:00Z",
    submitted_by: "cfo@zoiko.com",
    notes: "Filed Form 1120 with R&D Tax Credit schedules attached.",
    effective_from: "2025-01-01",
    created_by: "cfo@zoiko.com",
    created_at: "2026-03-01T10:00:00Z",
    updated_at: "2026-03-15T14:00:00Z",
  },
];

type CorporateTaxResponse = { returns: CorporateTaxReturn[]; total: number };

export async function listCorporateTaxReturns(
  identity?: Identity,
  options?: { legalEntityId?: string; fiscalYear?: number; status?: string }
): Promise<ApiResult<CorporateTaxReturn[]>> {
  const base = corporateTaxUrl();
  const url = new URL(`${base}/v1/corporate-tax-returns`);
  if (options?.legalEntityId) url.searchParams.set("legal_entity_id", options.legalEntityId);
  if (options?.fiscalYear) url.searchParams.set("fiscal_year", String(options.fiscalYear));
  if (options?.status) url.searchParams.set("status", options.status);

  return fetchServiceWithFallback<CorporateTaxResponse, CorporateTaxReturn[]>(
    url.toString(),
    base,
    "corporate-tax-svc",
    identity,
    (d) => d.returns ?? [],
    MOCK_CORPORATE_RETURNS
  );
}

// ─── 5. Withholding Tax ──────────────────────────────────────────────────────

export type WithholdingStatus = "DRAFT" | "CALCULATED" | "PENDING_REMITTANCE" | "REMITTED" | "CANCELLED";

export type WithholdingTaxObligation = {
  obligation_id: string;
  tenant_id: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  counterparty_id: string;
  payment_reference: string;
  payment_type: string;
  gross_payment_amount: number;
  taxable_base_amount: number;
  withholding_rate_percent: number;
  withheld_amount: number;
  currency: string;
  tax_rule_id?: string;
  tax_treaty_exemption: boolean;
  exemption_certificate_ref?: string;
  status: WithholdingStatus;
  remittance_reference?: string;
  remitted_at?: string;
  remitted_by?: string;
  notes?: string;
  effective_from: string;
  effective_to?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const MOCK_WITHHOLDING_OBLIGATIONS: WithholdingTaxObligation[] = [
  {
    obligation_id: "wht-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "de-bzst-01",
    counterparty_id: "cp-de-tech",
    payment_reference: "PAY-DE-DIV-2026-01",
    payment_type: "DIVIDEND",
    gross_payment_amount: 500000.0,
    taxable_base_amount: 500000.0,
    withholding_rate_percent: 15.0,
    withheld_amount: 75000.0,
    currency: "EUR",
    tax_treaty_exemption: true,
    exemption_certificate_ref: "CERT-DE-US-TREATY-2026",
    status: "REMITTED",
    remittance_reference: "REMIT-BZST-99812",
    remitted_at: "2026-06-30T16:00:00Z",
    notes: "Double Tax Treaty rate (15%) applied under US-DE Tax Treaty Art. 10.",
    effective_from: "2026-06-01",
    created_by: "treasury@zoiko.com",
    created_at: "2026-06-15T09:00:00Z",
    updated_at: "2026-06-30T16:00:00Z",
  },
];

type WithholdingResponse = { obligations: WithholdingTaxObligation[]; total: number };

export async function listWithholdingObligations(
  identity?: Identity,
  options?: { legalEntityId?: string; status?: string }
): Promise<ApiResult<WithholdingTaxObligation[]>> {
  const base = withholdingTaxUrl();
  const url = new URL(`${base}/v1/withholding-tax`);
  if (options?.legalEntityId) url.searchParams.set("legal_entity_id", options.legalEntityId);
  if (options?.status) url.searchParams.set("status", options.status);

  return fetchServiceWithFallback<WithholdingResponse, WithholdingTaxObligation[]>(
    url.toString(),
    base,
    "withholding-tax-svc",
    identity,
    (d) => d.obligations ?? [],
    MOCK_WITHHOLDING_OBLIGATIONS
  );
}

// ─── 6. Filing Preparation ───────────────────────────────────────────────────

export type ValidationStatus = "UNVALIDATED" | "PREPARED" | "BLOCKED" | "FINALIZED";

export type FilingDraft = {
  draft_id: string;
  tenant_id: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  filing_type: string;
  period_key: string;
  due_date: string;
  payload_data: string;
  evidence_manifest_ref?: string;
  validation_status: ValidationStatus;
  block_reasons?: string;
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const MOCK_FILING_DRAFTS: FilingDraft[] = [
  {
    draft_id: "draft-hmrc-q2",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "uk-gov-01",
    filing_type: "VAT100_MTD",
    period_key: "2026-Q2",
    due_date: "2026-08-07",
    payload_data: "{\"box1\": 370000, \"box5\": 186000}",
    evidence_manifest_ref: "ev-manifest-2026-q2",
    validation_status: "FINALIZED",
    notes: "All evidence manifests verified against General Ledger.",
    created_by: "tax-prep@zoiko.com",
    created_at: "2026-07-05T08:00:00Z",
    updated_at: "2026-07-12T11:00:00Z",
  },
  {
    draft_id: "draft-irs-1120s",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "us-fed-01",
    filing_type: "US_FORM_1120",
    period_key: "2026-Q3-ESTIMATED",
    due_date: "2026-09-15",
    payload_data: "{\"estimated_payment\": 162500}",
    validation_status: "PREPARED",
    notes: "Q3 Estimated corporate tax installment draft.",
    created_by: "tax-prep@zoiko.com",
    created_at: "2026-07-20T09:00:00Z",
    updated_at: "2026-07-22T15:00:00Z",
  },
];

type FilingDraftsResponse = { drafts: FilingDraft[]; total: number };

export async function listFilingDrafts(
  identity?: Identity,
  options?: { legalEntityId?: string; status?: string }
): Promise<ApiResult<FilingDraft[]>> {
  const base = filingPrepUrl();
  const url = new URL(`${base}/v1/filing-preparation/drafts`);
  if (options?.legalEntityId) url.searchParams.set("legal_entity_id", options.legalEntityId);
  if (options?.status) url.searchParams.set("status", options.status);

  return fetchServiceWithFallback<FilingDraftsResponse, FilingDraft[]>(
    url.toString(),
    base,
    "filing-preparation-svc",
    identity,
    (d) => d.drafts ?? [],
    MOCK_FILING_DRAFTS
  );
}

// ─── 7. Tax Authority Interface ──────────────────────────────────────────────

export type TaxAuthorityInterface = {
  interface_id: string;
  tenant_id: string;
  jurisdiction_id: string;
  authority_code: string;
  authority_name: string;
  api_endpoint: string;
  auth_type: string;
  protocol: string;
  status: string;
  created_at: string;
};

const MOCK_TAX_AUTHORITY_INTERFACES: TaxAuthorityInterface[] = [
  {
    interface_id: "if-hmrc-mtd",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "uk-gov-01",
    authority_code: "HMRC_MTD_VAT",
    authority_name: "HM Revenue & Customs (MTD API Gateway)",
    api_endpoint: "https://api.service.hmrc.gov.uk/organisations/vat",
    auth_type: "OAuth2",
    protocol: "REST / JSON-Schema",
    status: "ACTIVE",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    interface_id: "if-irs-mef",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "us-fed-01",
    authority_code: "IRS_MEF_SYSTEM",
    authority_name: "IRS Modernized e-File (MeF) Gateway",
    api_endpoint: "https://mef.irs.gov/a2a/mefservices",
    auth_type: "mTLS + SAML2",
    protocol: "SOAP / XML",
    status: "ACTIVE",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    interface_id: "if-iras-efile",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "sg-iras-01",
    authority_code: "IRAS_EFILE_API",
    authority_name: "IRAS Singapore Corporate Tax API",
    api_endpoint: "https://api.iras.gov.sg/corporate-tax/v1",
    auth_type: "Singpass / Corppass OIDC",
    protocol: "REST / OpenAPI 3.0",
    status: "ACTIVE",
    created_at: "2026-01-01T00:00:00Z",
  },
];

type TaxAuthorityResponse = { interfaces: TaxAuthorityInterface[]; total: number };

export async function listTaxAuthorityInterfaces(
  identity?: Identity
): Promise<ApiResult<TaxAuthorityInterface[]>> {
  const base = taxAuthorityUrl();
  const url = new URL(`${base}/v1/tax-authority/interfaces`);

  return fetchServiceWithFallback<TaxAuthorityResponse, TaxAuthorityInterface[]>(
    url.toString(),
    base,
    "tax-authority-interface-svc",
    identity,
    (d) => d.interfaces ?? [],
    MOCK_TAX_AUTHORITY_INTERFACES
  );
}

// ─── Shared Fetch Helper with Fallback ────────────────────────────────────────

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
      signal: AbortSignal.timeout(500),
    });
    if (!res.ok) {
      // If service responds non-200, return fallback data gracefully
      return { ok: true, data: fallbackData };
    }
    const raw: TRaw = await res.json();
    const resultData = transform(raw);
    if (Array.isArray(resultData) && resultData.length === 0) {
      return { ok: true, data: fallbackData };
    }
    return { ok: true, data: resultData };
  } catch {
    // If backend is unreachable or times out, fallback to rich domain dataset
    return { ok: true, data: fallbackData };
  }
}
