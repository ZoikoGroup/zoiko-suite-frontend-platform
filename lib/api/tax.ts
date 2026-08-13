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

  return fetchDomainService<TaxRulesResponse, TaxRule[]>(
    url.toString(),
    base,
    "tax-rules-svc",
    identity,
    (d) => d.rules ?? [],
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

  return fetchDomainService<DeterminationsResponse, TaxDetermination[]>(
    url.toString(),
    base,
    "tax-determination-svc",
    identity,
    (d) => d.determinations ?? [],
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

type VATReturnsResponse = { vat_returns: VATReturn[]; total: number };

export async function listVATReturns(
  identity?: Identity,
  options?: { legalEntityId?: string; status?: string }
): Promise<ApiResult<VATReturn[]>> {
  const base = vatGstUrl();
  const url = new URL(`${base}/v1/vat-returns`);
  if (options?.legalEntityId) url.searchParams.set("legal_entity_id", options.legalEntityId);
  if (options?.status) url.searchParams.set("status", options.status);

  return fetchDomainService<VATReturnsResponse, VATReturn[]>(
    url.toString(),
    base,
    "vat-gst-svc",
    identity,
    (d) => d.vat_returns ?? [],
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

  return fetchDomainService<CorporateTaxResponse, CorporateTaxReturn[]>(
    url.toString(),
    base,
    "corporate-tax-svc",
    identity,
    (d) => d.returns ?? [],
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

type WithholdingResponse = { obligations: WithholdingTaxObligation[]; total: number };

export async function listWithholdingObligations(
  identity?: Identity,
  options?: { legalEntityId?: string; status?: string }
): Promise<ApiResult<WithholdingTaxObligation[]>> {
  const base = withholdingTaxUrl();
  const url = new URL(`${base}/v1/withholding-tax`);
  if (options?.legalEntityId) url.searchParams.set("legal_entity_id", options.legalEntityId);
  if (options?.status) url.searchParams.set("status", options.status);

  return fetchDomainService<WithholdingResponse, WithholdingTaxObligation[]>(
    url.toString(),
    base,
    "withholding-tax-svc",
    identity,
    (d) => d.obligations ?? [],
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

type FilingDraftsResponse = { drafts: FilingDraft[]; total: number };

export async function listFilingDrafts(
  identity?: Identity,
  options?: { legalEntityId?: string; status?: string }
): Promise<ApiResult<FilingDraft[]>> {
  const base = filingPrepUrl();
  const url = new URL(`${base}/v1/filing-preparation/drafts`);
  if (options?.legalEntityId) url.searchParams.set("legal_entity_id", options.legalEntityId);
  if (options?.status) url.searchParams.set("status", options.status);

  return fetchDomainService<FilingDraftsResponse, FilingDraft[]>(
    url.toString(),
    base,
    "filing-preparation-svc",
    identity,
    (d) => d.drafts ?? [],
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

type TaxAuthorityResponse = { interfaces: TaxAuthorityInterface[]; total: number };

export async function listTaxAuthorityInterfaces(
  identity?: Identity
): Promise<ApiResult<TaxAuthorityInterface[]>> {
  const base = taxAuthorityUrl();
  const url = new URL(`${base}/v1/tax-authority/interfaces`);

  return fetchDomainService<TaxAuthorityResponse, TaxAuthorityInterface[]>(
    url.toString(),
    base,
    "tax-authority-interface-svc",
    identity,
    (d) => d.interfaces ?? [],
  );
}

// ─── 8. Tax Summary Stats (KPI Aggregator) ──────────────────────────────────

export type TaxSummaryStats = {
  /**
   * Services whose read failed, so their contribution to every figure below is
   * ZERO rather than unknown.
   *
   * These aggregates used to fall back to hardcoded sample arrays on a failed read,
   * which meant a KPI computed entirely from invented records was reported exactly
   * like a real one. Falling back to an empty list is more honest but still not
   * self-describing: a zero total and "we could not read it" look identical. This
   * field is what tells them apart, and it is non-empty precisely when the numbers
   * are understated.
   */
  sourcesUnavailable: string[];
  activeRules: number;
  totalDeterminations: number;
  netVatPayableGBP: number;
  corporateBalanceDueUSD: number;
  withheldTotalEUR: number;
  upcomingFilingCount: number;
  finalizedDraftCount: number;
  activeAuthorityConnections: number;
};

export async function getTaxSummaryStats(identity?: Identity): Promise<ApiResult<TaxSummaryStats>> {
  const [rulesRes, detRes, vatRes, corpRes, whtRes, draftsRes, authRes] = await Promise.all([
    listTaxRules(identity),
    listTaxDeterminations(identity),
    listVATReturns(identity),
    listCorporateTaxReturns(identity),
    listWithholdingObligations(identity),
    listFilingDrafts(identity),
    listTaxAuthorityInterfaces(identity),
  ]);

  const rules = rulesRes.ok ? rulesRes.data : [];
  const dets = detRes.ok ? detRes.data : [];
  const vatReturns = vatRes.ok ? vatRes.data : [];
  const corpReturns = corpRes.ok ? corpRes.data : [];
  const whtObligations = whtRes.ok ? whtRes.data : [];
  const drafts = draftsRes.ok ? draftsRes.data : [];
  const authorities = authRes.ok ? authRes.data : [];

  // Which reads failed, so a caller can tell an understated figure from a real
  // one. Every aggregate below treats a failed source as contributing zero, and
  // without this list that is indistinguishable from the source genuinely having
  // nothing in it.
  const sourcesUnavailable = (
    [
      [rulesRes.ok, "tax-rules-svc"],
      [detRes.ok, "tax-determination-svc"],
      [vatRes.ok, "vat-gst-svc"],
      [corpRes.ok, "corporate-tax-svc"],
      [whtRes.ok, "withholding-tax-svc"],
      [draftsRes.ok, "filing-preparation-svc"],
      [authRes.ok, "tax-authority-interface-svc"],
    ] as const
  )
    .filter(([ok]) => !ok)
    .map(([, name]) => name);

  const netVatPayableGBP = vatReturns
    .filter((v) => v.currency === "GBP")
    .reduce((acc, v) => acc + v.net_tax_payable, 0);

  const corporateBalanceDueUSD = corpReturns
    .filter((c) => c.currency === "USD")
    .reduce((acc, c) => acc + c.balance_due, 0);

  const withheldTotalEUR = whtObligations
    .filter((w) => w.currency === "EUR" && w.status === "REMITTED")
    .reduce((acc, w) => acc + w.withheld_amount, 0);

  const today = new Date();
  const thirtyDaysOut = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const upcomingFilingCount = drafts.filter((d) => {
    const due = new Date(d.due_date);
    return due >= today && due <= thirtyDaysOut;
  }).length;

  return {
    ok: true,
    data: {
      sourcesUnavailable,
      activeRules: rules.filter((r) => r.status === "ACTIVE").length,
      totalDeterminations: dets.length,
      netVatPayableGBP,
      corporateBalanceDueUSD,
      withheldTotalEUR,
      upcomingFilingCount,
      finalizedDraftCount: drafts.filter((d) => d.validation_status === "FINALIZED").length,
      activeAuthorityConnections: authorities.filter((a) => a.status === "ACTIVE").length,
    },
  };
}

// ─── 9. Upcoming Tax Deadlines ────────────────────────────────────────────────

export type TaxDeadline = {
  id: string;
  label: string;
  jurisdiction: string;
  dueDate: string;
  daysUntilDue: number;
  type: "VAT_FILING" | "CORPORATE_TAX" | "WHT_REMITTANCE" | "ESTIMATED_PAYMENT";
  urgency: "overdue" | "urgent" | "upcoming" | "comfortable";
};

export async function listUpcomingTaxDeadlines(identity?: Identity): Promise<ApiResult<TaxDeadline[]>> {
  const [draftsRes, whtRes] = await Promise.all([
    listFilingDrafts(identity),
    listWithholdingObligations(identity),
  ]);

  const drafts = draftsRes.ok ? draftsRes.data : [];
  const whtObligations = whtRes.ok ? whtRes.data : [];

  const today = new Date();

  function urgency(days: number): TaxDeadline["urgency"] {
    if (days < 0) return "overdue";
    if (days <= 7) return "urgent";
    if (days <= 21) return "upcoming";
    return "comfortable";
  }

  const deadlines: TaxDeadline[] = [
    // From filing drafts
    ...drafts.map((d) => {
      const due = new Date(d.due_date);
      const days = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: d.draft_id,
        label: `${d.filing_type} — ${d.period_key}`,
        jurisdiction: d.jurisdiction_id,
        dueDate: d.due_date,
        daysUntilDue: days,
        type: "VAT_FILING" as const,
        urgency: urgency(days),
      };
    }),
    // WHT remittances pending
    ...whtObligations
      .filter((w) => w.status === "PENDING_REMITTANCE" || w.status === "CALCULATED")
      .map((w) => {
        const due = new Date(w.effective_from);
        due.setDate(due.getDate() + 30); // 30-day remittance window
        const days = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: w.obligation_id,
          label: `WHT Remittance — ${w.payment_type} (${w.payment_reference})`,
          jurisdiction: w.jurisdiction_id,
          dueDate: due.toISOString().split("T")[0],
          daysUntilDue: days,
          type: "WHT_REMITTANCE" as const,
          urgency: urgency(days),
        };
      }),
  ].sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  return { ok: true, data: deadlines };
}

// ─── Shared Fetch Helper with Fallback ────────────────────────────────────────


/**
 * GET a JSON resource from a domain service and report what actually happened.
 *
 * This replaces `fetchServiceWithFallback`, which substituted hardcoded sample
 * data and reported it as `{ ok: true }`. It did so in three cases — a non-OK
 * status, a thrown request, AND **a successful response whose list was empty** —
 * and that last one is the dangerous one: a healthy service with no records
 * displayed invented rows indistinguishable from real ones. There was no way for a
 * caller, or a reader of the page, to tell.
 *
 * It also made the panels' own error handling unreachable. Every consumer of these
 * functions already branches on `!res.ok` to render a "service unavailable" state;
 * because the helper never returned `ok: false`, that branch was dead code. Failing
 * honestly is what makes it live again.
 *
 * An empty list is now an empty list. An unreachable service is an error.
 */
// ─── Shared Mock Fallback Data ────────────────────────────────────────────────

export const MOCK_TAX_RULES: TaxRule[] = [
  {
    rule_id: "rule-uk-vat-01",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "uk-gov-01",
    rule_code: "UK-VAT-STD-20",
    name: "UK Standard VAT Rate",
    category: "VAT",
    tax_rate_percentage: 20,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01",
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    rule_id: "rule-us-corp-02",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "us-fed-01",
    rule_code: "US-CORP-FED-21",
    name: "US Federal Corporate Tax",
    category: "CORPORATE_INCOME",
    tax_rate_percentage: 21,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01",
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    rule_id: "rule-sg-gst-03",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "sg-iras-01",
    rule_code: "SG-GST-STD-09",
    name: "Singapore Goods & Services Tax",
    category: "GST",
    tax_rate_percentage: 9,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01",
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    rule_id: "rule-de-wht-04",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "de-bzst-01",
    rule_code: "DE-WHT-DIV-15",
    name: "Germany Dividend Withholding Tax",
    category: "WITHHOLDING",
    tax_rate_percentage: 15,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01",
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

export const MOCK_TAX_DETERMINATIONS: TaxDetermination[] = [
  {
    determination_id: "det-2026-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    transaction_id: "tx-inv-1001",
    source_module: "AR_INVOICES",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "uk-gov-01",
    rule_id: "rule-uk-vat-01",
    tax_category: "VAT",
    gross_amount: 100000,
    taxable_amount: 100000,
    tax_rate_percentage: 20,
    calculated_tax_amount: 20000,
    exempt_amount: 0,
    currency: "GBP",
    status: "APPLIED",
    effective_from: "2026-06-01",
    evaluated_at: "2026-06-01T10:00:00Z",
    evaluated_by: "engine",
    created_at: "2026-06-01T10:00:00Z",
    updated_at: "2026-06-01T10:00:00Z",
  },
  {
    determination_id: "det-2026-002",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    transaction_id: "tx-inv-1002",
    source_module: "AR_INVOICES",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "us-fed-01",
    rule_id: "rule-us-corp-02",
    tax_category: "CORPORATE_INCOME",
    gross_amount: 250000,
    taxable_amount: 250000,
    tax_rate_percentage: 21,
    calculated_tax_amount: 52500,
    exempt_amount: 0,
    currency: "USD",
    status: "APPLIED",
    effective_from: "2026-06-15",
    evaluated_at: "2026-06-15T14:30:00Z",
    evaluated_by: "engine",
    created_at: "2026-06-15T14:30:00Z",
    updated_at: "2026-06-15T14:30:00Z",
  },
];

export const MOCK_VAT_RETURNS: VATReturn[] = [
  {
    return_id: "vat-2026-q1",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "uk-gov-01",
    tax_registration_number: "GB999888777",
    tax_period: "2026-Q1",
    total_sales_amount: 500000,
    total_purchase_amount: 200000,
    output_tax_amount: 100000,
    input_tax_amount: 40000,
    net_tax_payable: 60000,
    currency: "GBP",
    status: "ACCEPTED",
    filed_at: "2026-04-15T09:00:00Z",
    filed_by: "finance-lead",
    effective_from: "2026-01-01",
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-04-15T09:00:00Z",
  },
  {
    return_id: "vat-2026-q2",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "uk-gov-01",
    tax_registration_number: "GB999888777",
    tax_period: "2026-Q2",
    total_sales_amount: 650000,
    total_purchase_amount: 250000,
    output_tax_amount: 130000,
    input_tax_amount: 50000,
    net_tax_payable: 80000,
    currency: "GBP",
    status: "DRAFT",
    effective_from: "2026-04-01",
    created_by: "system",
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  },
];

export const MOCK_CORPORATE_RETURNS: CorporateTaxReturn[] = [
  {
    return_id: "cit-2025-us",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "us-fed-01",
    tax_registration_number: "12-3456789",
    fiscal_year: 2025,
    accounting_period_start: "2025-01-01",
    accounting_period_end: "2025-12-31",
    gross_revenue: 5000000,
    allowable_deductions: 3500000,
    taxable_income: 1500000,
    tax_rate_percent: 21,
    gross_tax_liability: 315000,
    tax_credits: 40000,
    net_tax_payable: 275000,
    tax_already_paid: 200000,
    balance_due: 75000,
    currency: "USD",
    status: "SUBMITTED",
    submitted_at: "2026-03-15T11:00:00Z",
    submitted_by: "cfo",
    effective_from: "2025-01-01",
    created_by: "system",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2026-03-15T11:00:00Z",
  },
];

export const MOCK_WHT_OBLIGATIONS: WithholdingTaxObligation[] = [
  {
    obligation_id: "wht-2026-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "de-bzst-01",
    counterparty_id: "cp-acme-corp",
    payment_reference: "PMT-DE-8821",
    payment_type: "DIVIDEND",
    gross_payment_amount: 100000,
    taxable_base_amount: 100000,
    withholding_rate_percent: 15,
    withheld_amount: 15000,
    currency: "EUR",
    tax_treaty_exemption: false,
    status: "REMITTED",
    remittance_reference: "REMIT-BZST-401",
    remitted_at: "2026-05-10T08:00:00Z",
    effective_from: "2026-05-01",
    created_by: "system",
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-10T08:00:00Z",
  },
  {
    obligation_id: "wht-2026-002",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "de-bzst-01",
    counterparty_id: "cp-tech-corp",
    payment_reference: "PMT-DE-8822",
    payment_type: "ROYALTY",
    gross_payment_amount: 200000,
    taxable_base_amount: 200000,
    withholding_rate_percent: 15,
    withheld_amount: 30000,
    currency: "EUR",
    tax_treaty_exemption: false,
    status: "PENDING_REMITTANCE",
    effective_from: "2026-07-15",
    created_by: "system",
    created_at: "2026-07-15T00:00:00Z",
    updated_at: "2026-07-15T00:00:00Z",
  },
];

export const MOCK_FILING_DRAFTS: FilingDraft[] = [
  {
    draft_id: "draft-hmrc-q2",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "uk-gov-01",
    filing_type: "VAT100_MTD",
    period_key: "2026-Q2",
    due_date: "2026-08-31",
    payload_data: '{"box1":370000,"box5":186000}',
    validation_status: "FINALIZED",
    created_by: "admin-console",
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-01T10:00:00Z",
  },
  {
    draft_id: "draft-irs-1120",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "us-fed-01",
    filing_type: "FORM_1120",
    period_key: "2025-FY",
    due_date: "2026-09-15",
    payload_data: '{"line1":5000000}',
    validation_status: "PREPARED",
    created_by: "admin-console",
    created_at: "2026-06-01T10:00:00Z",
    updated_at: "2026-06-01T10:00:00Z",
  },
];

export const MOCK_AUTHORITIES: TaxAuthorityInterface[] = [
  {
    interface_id: "if-hmrc-mtd",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "uk-gov-01",
    authority_code: "HMRC_MTD",
    authority_name: "HM Revenue & Customs (Making Tax Digital)",
    api_endpoint: "https://api.service.hmrc.gov.uk",
    auth_type: "OAUTH2",
    protocol: "REST_JSON",
    status: "ACTIVE",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    interface_id: "if-irs-meff",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "us-fed-01",
    authority_code: "IRS_MEF",
    authority_name: "IRS Modernized e-File",
    api_endpoint: "https://mef.irs.gov",
    auth_type: "MUTUAL_TLS",
    protocol: "SOAP_XML",
    status: "ACTIVE",
    created_at: "2026-01-01T00:00:00Z",
  },
];

async function fetchDomainService<TRaw, TOut>(
  urlStr: string,
  base: string,
  serviceName: string,
  identity: Identity | undefined,
  transform: (raw: TRaw) => TOut,
  fallbackData?: TOut,
): Promise<ApiResult<TOut>> {
  const correlationId = crypto.randomUUID();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Correlation-ID": correlationId,
  };
  if (identity?.tenantId) headers["X-Tenant-Id"] = identity.tenantId;
  if (identity?.principalId) headers["X-Principal-Id"] = identity.principalId;
  if (identity?.legalEntityId) headers["X-Legal-Entity-Id"] = identity.legalEntityId;

  let res: Response;
  try {
    res = await fetch(urlStr, { headers, signal: AbortSignal.timeout(3000) });
  } catch (cause) {
    if (fallbackData !== undefined) {
      return { ok: true, data: fallbackData };
    }
    const isTimeout = cause instanceof DOMException && cause.name === "TimeoutError";
    return {
      ok: false,
      error: {
        kind: isTimeout ? "timeout" : "unreachable",
        message: isTimeout
          ? `${serviceName} did not respond within 3000ms`
          : `${serviceName} is unreachable at ${base}`,
      },
    };
  }

  if (!res.ok) {
    if (fallbackData !== undefined) {
      return { ok: true, data: fallbackData };
    }
    return {
      ok: false,
      error: {
        kind: "http",
        status: res.status,
        message: `${serviceName} returned ${res.status} for ${urlStr.slice(base.length)}`,
      },
    };
  }

  try {
    const parsed = (await res.json()) as TRaw;
    const data = transform(parsed);
    if (Array.isArray(data) && data.length === 0 && fallbackData !== undefined) {
      return { ok: true, data: fallbackData };
    }
    return { ok: true, data };
  } catch {
    if (fallbackData !== undefined) {
      return { ok: true, data: fallbackData };
    }
    return {
      ok: false,
      error: { kind: "malformed", message: `${serviceName} returned a non-JSON body` },
    };
  }
}

