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
  return (process.env.ZOIKO_TAX_AUTHORITY_INTERFACE_URL ?? "http://localhost:8147").replace(/\/$/, "");
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

/**
 * TAX-03's product/service classification, at the level that changes the
 * treatment. Every VAT and GST system distinguishes these three: goods follow
 * where they move, services follow where the customer belongs, and digital
 * services carry their own destination rules.
 *
 * UNSPECIFIED can come back on a determination made before the input contract
 * existed. It is refused on a new one.
 */
export type SupplyKind = "GOODS" | "SERVICES" | "DIGITAL_SERVICES";
export type SupplyKindOnRead = SupplyKind | "UNSPECIFIED";

/** TAX-03's B2B/B2C fact. B2G is separate because public bodies attract
 *  distinct e-invoicing and withholding obligations in several jurisdictions. */
export type SupplyType = "B2B" | "B2C" | "B2G";
export type SupplyTypeOnRead = SupplyType | "UNSPECIFIED";

/**
 * How the place of supply was arrived at.
 *
 * Only CALLER_ASSERTED occurs today. §9.J expects place-of-supply RULES to
 * derive it from establishments, supply kind and B2B/B2C facts, and those rules
 * are jurisdiction-pack data that no pack currently carries — so the service
 * records that the caller stated the place of supply rather than letting it read
 * as something the engine determined. Surfaced in the UI for the same reason.
 */
export type PlaceOfSupplyBasis = "CALLER_ASSERTED" | "RULE_DERIVED";

export const SUPPLY_KINDS: { value: SupplyKind; label: string; hint: string }[] = [
  { value: "GOODS", label: "Goods", hint: "Physical supply. Treatment follows where the goods move." },
  { value: "SERVICES", label: "Services", hint: "Treatment generally follows where the customer belongs." },
  { value: "DIGITAL_SERVICES", label: "Digital services", hint: "Electronically supplied services, which carry their own destination rules." },
];

/** Short labels for the determination register, where the column is narrow.
 *  UNSPECIFIED maps to an em dash rather than the raw marker: a reader scanning
 *  the table needs to see an absence, not a word that looks like a choice. */
export const SUPPLY_KIND_LABELS: Record<SupplyKindOnRead, string> = {
  GOODS: "Goods",
  SERVICES: "Services",
  DIGITAL_SERVICES: "Digital",
  UNSPECIFIED: "—",
};

export const SUPPLY_TYPES: { value: SupplyType; label: string; hint: string }[] = [
  { value: "B2C", label: "B2C — consumer", hint: "Buyer is not registered for tax in the place of supply." },
  { value: "B2B", label: "B2B — business", hint: "Requires the buyer's registration: its presence is what makes a cross-border supply reverse-charge." },
  { value: "B2G", label: "B2G — public body", hint: "Distinct e-invoicing and withholding obligations in several jurisdictions." },
];

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

  // ── TAX-03 required business/source inputs ──────────────────────────────

  seller_party_id: string;
  buyer_party_id: string;
  /** Null: ORG-08 Address & Establishment does not exist, so nothing can issue
   *  or validate an establishment id. Carried for callers that track them. */
  seller_establishment_id?: string | null;
  buyer_establishment_id?: string | null;
  /** Validated against jurisdiction-rules-svc when present. Often absent — a
   *  supply of services frequently has no movement. */
  ship_from_jurisdiction_id?: string | null;
  ship_to_jurisdiction_id?: string | null;
  /** The place of supply: the jurisdiction whose rules govern this
   *  transaction. Validated against jurisdiction-rules-svc. */
  supply_jurisdiction_id: string;
  /** The tax point, as an ISO calendar date. Distinct from effective_from,
   *  which is when the rule version applies. */
  supply_date?: string | null;
  place_of_supply_basis: PlaceOfSupplyBasis;
  product_classification: string;
  supply_kind: SupplyKindOnRead;
  supply_type: SupplyTypeOnRead;
  /** The buyer's registration in the place of supply. Required for B2B. */
  buyer_tax_registration_id?: string | null;
  /** Why an exemption was claimed, and what substantiates it. Required
   *  whenever exempt_amount is greater than zero (INV-10). */
  exemption_reason?: string | null;
  exemption_certificate_ref?: string | null;

  // ── TAX-03 server-resolved input ────────────────────────────────────────

  /** The seller's tax registration in the place of supply, read from
   *  tenant-entity-registry-svc's tax identity bundles as at the supply date —
   *  not accepted from the caller. Null means the seller holds none there,
   *  which is a real state and the fact that decides whether tax is charged
   *  at all, not a failed lookup. */
  seller_registration_id?: string | null;
  seller_registration_status?: string | null;
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
    (d) =>
      (d.vat_returns ?? []).map((r) => ({
        ...r,
        // Some mock responses omit net_tax_payable; derive it from the component amounts.
        net_tax_payable:
          r.net_tax_payable != null
            ? r.net_tax_payable
            : (r.output_tax_amount ?? 0) - (r.input_tax_amount ?? 0),
      })),
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

// The WHT mock service uses the top-level key "obligations" and names the rate
// field "applied_rate_percent", the amount field "tax_withheld_amount", and the
// due-date field "statutory_due_date". We normalise all of these here so the
// rest of the codebase only ever sees the canonical schema.
type WithholdingResponse = {
  // canonical (future real service)
  withholding_obligations?: Record<string, unknown>[];
  // mock service uses this key
  obligations?: Record<string, unknown>[];
  total: number;
};

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
    (d) => {
      const raw = d.withholding_obligations ?? d.obligations ?? [];
      return raw.map((r) => ({
        obligation_id:           String(r.obligation_id ?? ""),
        tenant_id:               String(r.tenant_id ?? "11111111-1111-1111-1111-111111111111"),
        legal_entity_id:         String(r.legal_entity_id ?? ""),
        jurisdiction_id:         String(r.jurisdiction_id ?? ""),
        counterparty_id:         String(r.counterparty_id ?? ""),
        payment_reference:       String(r.payment_reference ?? ""),
        payment_type:            String(r.payment_type ?? ""),
        gross_payment_amount:    Number(r.gross_payment_amount ?? 0),
        taxable_base_amount:     Number(r.taxable_base_amount ?? r.gross_payment_amount ?? 0),
        // mock uses applied_rate_percent or statutory_rate_percent
        withholding_rate_percent: Number(
          r.withholding_rate_percent ?? r.applied_rate_percent ?? r.statutory_rate_percent ?? 0
        ),
        // mock uses tax_withheld_amount
        withheld_amount:         Number(r.withheld_amount ?? r.tax_withheld_amount ?? 0),
        currency:                String(r.currency ?? "USD"),
        tax_rule_id:             r.tax_rule_id != null ? String(r.tax_rule_id) : undefined,
        tax_treaty_exemption:    Boolean(r.tax_treaty_exemption ?? false),
        exemption_certificate_ref: r.exemption_certificate_ref != null
          ? String(r.exemption_certificate_ref) : undefined,
        status:                  String(r.status ?? "DRAFT") as WithholdingStatus,
        remittance_reference:    r.remittance_reference != null ? String(r.remittance_reference) : undefined,
        remitted_at:             r.remitted_at != null ? String(r.remitted_at) : undefined,
        remitted_by:             r.remitted_by != null ? String(r.remitted_by) : undefined,
        notes:                   r.notes != null ? String(r.notes) : undefined,
        effective_from:          String(r.effective_from ?? r.statutory_due_date ?? new Date().toISOString()),
        effective_to:            r.effective_to != null ? String(r.effective_to) : undefined,
        created_by:              String(r.created_by ?? "system"),
        created_at:              String(r.created_at ?? new Date().toISOString()),
        updated_at:              String(r.updated_at ?? new Date().toISOString()),
      })) as WithholdingTaxObligation[];
    },
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

// The mock filing-preparation-svc uses slightly different field names:
//   - top-level key is "drafts" (not "filing_drafts")
//   - period is "reporting_period" (not "period_key")
//   - status lives under both "status" and "validation_status"
type FilingDraftsResponse = {
  drafts?:        Record<string, unknown>[];
  filing_drafts?: Record<string, unknown>[]; // canonical future shape
  total: number;
};

function normaliseDraft(r: Record<string, unknown>): FilingDraft {
  // Unwrap a { data: {...} } wrapper that some POST responses include
  const src = (r.data && typeof r.data === "object" ? r.data : r) as Record<string, unknown>;
  return {
    draft_id:              String(src.draft_id ?? ""),
    tenant_id:             String(src.tenant_id ?? "11111111-1111-1111-1111-111111111111"),
    legal_entity_id:       String(src.legal_entity_id ?? ""),
    jurisdiction_id:       String(src.jurisdiction_id ?? ""),
    filing_type:           String(src.filing_type ?? ""),
    // mock uses "reporting_period"; canonical uses "period_key"
    period_key:            String(src.period_key ?? src.reporting_period ?? ""),
    due_date:              String(src.due_date ?? ""),
    payload_data:          String(src.payload_data ?? "{}"),
    evidence_manifest_ref: src.evidence_manifest_ref != null
      ? String(src.evidence_manifest_ref) : undefined,
    // mock status and validation_status are both valid
    validation_status:     String(
      src.validation_status ?? src.status ?? "UNVALIDATED"
    ) as ValidationStatus,
    block_reasons:         src.block_reasons != null ? String(src.block_reasons) : undefined,
    notes:                 src.notes != null ? String(src.notes) : undefined,
    created_by:            String(src.created_by ?? "system"),
    created_at:            String(src.created_at ?? new Date().toISOString()),
    updated_at:            String(src.updated_at ?? new Date().toISOString()),
  };
}

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
    (d) => {
      const raw = (d.filing_drafts ?? d.drafts ?? []) as Record<string, unknown>[];
      const seen = new Set<string>();
      return raw
        .map(normaliseDraft)
        .filter((draft) => {
          if (seen.has(draft.draft_id)) return false;
          seen.add(draft.draft_id);
          return true;
        });
    },
  );
}

// ─── 7. Tax Authority Interface ──────────────────────────────────────────────

export type TaxAuthorityInterface = {
  interface_id: string;
  tenant_id?: string;
  jurisdiction_id: string;
  authority_code: string;
  authority_name: string;
  api_endpoint: string;
  endpoint_url?: string;
  auth_type: string;
  auth_credential_id?: string;
  protocol: string;
  protocol_type?: string;
  status: string;
  health_status?: string;
  is_active?: boolean;
  error_count?: number;
  created_at: string;
};

type TaxAuthorityResponse = { interfaces: Record<string, unknown>[]; total: number };

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
    (d) =>
      (d.interfaces ?? []).map((raw) => {
        const ifaceId = String(raw.interface_id || "if-generic");
        const authCode = String(
          raw.authority_code ||
          (ifaceId.includes("hmrc") ? "HMRC_MTD" : ifaceId.includes("irs") ? "IRS_MEF" : ifaceId.toUpperCase())
        );
        const protocol = String(raw.protocol || raw.protocol_type || "REST_OAUTH2");
        const endpoint = String(raw.api_endpoint || raw.endpoint_url || "https://api.tax.gov");
        const authType = String(
          raw.auth_type ||
          (protocol.includes("OAUTH") ? "OAuth2" : protocol.includes("SOAP") ? "mTLS + SAML2" : "API Key")
        );
        const status =
          raw.status === "ACTIVE" || raw.is_active === true || raw.health_status === "HEALTHY"
            ? "ACTIVE"
            : "INACTIVE";

        return {
          interface_id: ifaceId,
          tenant_id: String(raw.tenant_id || "11111111-1111-1111-1111-111111111111"),
          jurisdiction_id: String(raw.jurisdiction_id || "jur-uk-gb"),
          authority_code: authCode,
          authority_name: String(raw.authority_name || "Tax Authority"),
          api_endpoint: endpoint,
          endpoint_url: endpoint,
          auth_type: authType,
          auth_credential_id: raw.auth_credential_id ? String(raw.auth_credential_id) : undefined,
          protocol: protocol,
          protocol_type: protocol,
          status: status,
          health_status: String(raw.health_status || "HEALTHY"),
          is_active: raw.is_active !== false,
          error_count: Number(raw.error_count || 0),
          created_at: String(raw.created_at || new Date().toISOString()),
        };
      })
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
    .filter((w) => w.status === "REMITTED" || w.status === "CALCULATED")
    .reduce((acc, w) => acc + (w.withheld_amount || 0), 0);

  const today = new Date();
  const upcomingFilingCount = drafts.length > 0
    ? drafts.filter((d) => {
      if (d.validation_status !== "FINALIZED") return true;
      if (!d.due_date) return true;
      const due = new Date(d.due_date);
      return isNaN(due.getTime()) || due >= today;
    }).length || drafts.length
    : 0;

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
      activeAuthorityConnections: authorities.filter((a) => a.status === "ACTIVE" || a.is_active === true || a.health_status === "HEALTHY").length,
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
      const dueDateStr = d.due_date || new Date().toISOString().split("T")[0];
      const due = new Date(dueDateStr);
      const days = isNaN(due.getTime()) ? 30 : Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: d.draft_id,
        label: `${d.filing_type} — ${d.period_key}`,
        jurisdiction: d.jurisdiction_id,
        dueDate: dueDateStr,
        daysUntilDue: days,
        type: "VAT_FILING" as const,
        urgency: urgency(days),
      };
    }),
    // WHT remittances pending
    ...whtObligations
      .filter((w) => w.status === "PENDING_REMITTANCE" || w.status === "CALCULATED")
      .map((w) => {
        const rawDate = w.effective_from || new Date().toISOString();
        const due = new Date(rawDate);
        if (isNaN(due.getTime())) {
          due.setTime(today.getTime());
        }
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

// ─── Creation & Execution Handlers (Write Path) ─────────────────────────────

export type CreateTaxRuleInput = {
  jurisdiction_id: string;
  rule_code: string;
  name: string;
  category: TaxCategory;
  tax_rate_percentage: number;
  standard_deductions?: number;
  exemptions_json?: string;
  effective_from: string;
  effective_to?: string;
  created_by?: string;
};

export async function createTaxRule(
  input: CreateTaxRuleInput,
  identity?: Identity
): Promise<ApiResult<TaxRule>> {
  const base = taxRulesUrl();
  return fetchDomainServicePost<TaxRule, TaxRule>(
    `${base}/v1/tax-rules`,
    base,
    "tax-rules-svc",
    identity,
    {
      ...input,
      tenant_id: identity?.tenantId ?? "11111111-1111-1111-1111-111111111111",
      created_by: input.created_by ?? identity?.principalId ?? "33333333-3333-3333-3333-333333333333",
    },
    (d) => d
  );
}

export type EvaluateDeterminationInput = {
  transaction_id: string;
  source_module?: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  tax_category: string;
  gross_amount: number;
  taxable_amount?: number;
  currency: string;
  effective_from?: string;
  evaluated_by?: string;
};

export async function evaluateTaxDetermination(
  input: EvaluateDeterminationInput,
  identity?: Identity
): Promise<ApiResult<TaxDetermination>> {
  const base = taxDeterminationUrl();
  return fetchDomainServicePost<TaxDetermination, TaxDetermination>(
    `${base}/v1/tax-determinations`,
    base,
    "tax-determination-svc",
    identity,
    {
      source_module: "ADMIN_CONSOLE",
      effective_from: new Date().toISOString().split("T")[0],
      evaluated_by: "tax-determination-engine",
      ...input,
      tenant_id: identity?.tenantId ?? "11111111-1111-1111-1111-111111111111",
    },
    (d) => d
  );
}

export type CreateVATReturnInput = {
  legal_entity_id: string;
  jurisdiction_id: string;
  tax_registration_number: string;
  tax_period: string;
  total_sales_amount: number;
  total_purchase_amount: number;
  output_tax_amount: number;
  input_tax_amount: number;
  currency: string;
  effective_from: string;
};

export async function createVATReturn(
  input: CreateVATReturnInput,
  identity?: Identity
): Promise<ApiResult<VATReturn>> {
  const base = vatGstUrl();
  return fetchDomainServicePost<VATReturn, VATReturn>(
    `${base}/v1/vat-returns`,
    base,
    "vat-gst-svc",
    identity,
    {
      ...input,
      tenant_id: identity?.tenantId ?? "11111111-1111-1111-1111-111111111111",
      created_by: identity?.principalId ?? "33333333-3333-3333-3333-333333333333",
    },
    (d) => d
  );
}

export type CreateCorporateTaxInput = {
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
  currency: string;
  effective_from: string;
};

export async function createCorporateTaxReturn(
  input: CreateCorporateTaxInput,
  identity?: Identity
): Promise<ApiResult<CorporateTaxReturn>> {
  const base = corporateTaxUrl();
  return fetchDomainServicePost<CorporateTaxReturn, CorporateTaxReturn>(
    `${base}/v1/corporate-tax-returns`,
    base,
    "corporate-tax-svc",
    identity,
    {
      ...input,
      tenant_id: identity?.tenantId ?? "11111111-1111-1111-1111-111111111111",
      created_by: identity?.principalId ?? "33333333-3333-3333-3333-333333333333",
    },
    (d) => d
  );
}

export type CreateWithholdingInput = {
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
  tax_treaty_exemption?: boolean;
  effective_from: string;
};

export async function createWithholdingObligation(
  input: CreateWithholdingInput,
  identity?: Identity
): Promise<ApiResult<WithholdingTaxObligation>> {
  const base = withholdingTaxUrl();
  return fetchDomainServicePost<WithholdingTaxObligation, WithholdingTaxObligation>(
    `${base}/v1/withholding-tax`,
    base,
    "withholding-tax-svc",
    identity,
    {
      ...input,
      tenant_id: identity?.tenantId ?? "11111111-1111-1111-1111-111111111111",
      created_by: identity?.principalId ?? "33333333-3333-3333-3333-333333333333",
    },
    (d) => d
  );
}

export type CreateFilingDraftInput = {
  legal_entity_id: string;
  jurisdiction_id: string;
  filing_type: string;
  period_key: string;
  due_date: string;
  payload_data: string;
  evidence_manifest_ref?: string;
  notes?: string;
};

export async function createFilingDraft(
  input: CreateFilingDraftInput,
  identity?: Identity
): Promise<ApiResult<FilingDraft>> {
  const base = filingPrepUrl();
  return fetchDomainServicePost<Record<string, unknown>, FilingDraft>(
    `${base}/v1/filing-preparation/drafts`,
    base,
    "filing-preparation-svc",
    identity,
    {
      ...input,
      // Provide both field names so both mock and real service accept the body
      reporting_period: input.period_key,
      tenant_id: identity?.tenantId ?? "11111111-1111-1111-1111-111111111111",
      created_by: identity?.principalId ?? "33333333-3333-3333-3333-333333333333",
    },
    // The mock returns { message, status, data: { draft: {...} } }; unwrap all layers
    (raw) => normaliseDraft(raw as Record<string, unknown>)
  );
}

export async function finalizeFilingDraft(
  draftId: string,
  body?: { notes?: string },
  identity?: Identity
): Promise<ApiResult<FilingDraft>> {
  const base = filingPrepUrl();
  return fetchDomainServicePost<Record<string, unknown>, FilingDraft>(
    `${base}/v1/filing-preparation/drafts/${draftId}/finalize`,
    base,
    "filing-preparation-svc",
    identity,
    body ?? { notes: "Finalized from Tax Governance console." },
    (raw) => normaliseDraft(raw as Record<string, unknown>)
  );
}

export type CreateTaxAuthorityInput = {
  jurisdiction_id: string;
  authority_code: string;
  authority_name: string;
  api_endpoint: string;
  auth_type: string;
  protocol: string;
};

export async function registerTaxAuthorityInterface(
  input: CreateTaxAuthorityInput,
  identity?: Identity
): Promise<ApiResult<TaxAuthorityInterface>> {
  const base = taxAuthorityUrl();
  return fetchDomainServicePost<TaxAuthorityInterface, TaxAuthorityInterface>(
    `${base}/v1/tax-authority/interfaces`,
    base,
    "tax-authority-interface-svc",
    identity,
    {
      ...input,
      tenant_id: identity?.tenantId ?? "11111111-1111-1111-1111-111111111111",
    },
    (d) => d
  );
}

export async function testTaxAuthorityConnection(
  interfaceId: string,
  identity?: Identity
): Promise<ApiResult<{ status: string; latency_ms: number; timestamp: string }>> {
  const base = taxAuthorityUrl();
  return fetchDomainServicePost<{ status: string; latency_ms: number; timestamp: string }, { status: string; latency_ms: number; timestamp: string }>(
    `${base}/v1/tax-authority/interfaces/${interfaceId}/test`,
    base,
    "tax-authority-interface-svc",
    identity,
    {},
    (d) => d
  );
}

// ─── PATCH helpers ─────────────────────────────────────────────────────────────

export type PatchResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: { kind: string; status?: number; message: string } };

async function fetchDomainServicePatch(
  urlStr: string,
  base: string,
  serviceName: string,
  identity: Identity | undefined,
  body: Record<string, unknown>,
): Promise<PatchResult> {
  const correlationId = crypto.randomUUID();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Correlation-ID": correlationId,
  };
  if (identity?.tenantId) headers["X-Tenant-Id"] = identity.tenantId;
  if (identity?.principalId) headers["X-Principal-Id"] = identity.principalId;
  if (identity?.legalEntityId) headers["X-Legal-Entity-Id"] = identity.legalEntityId;

  let res: Response;
  try {
    res = await fetch(urlStr, { method: "PATCH", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(3000) });
  } catch (cause) {
    const isTimeout = cause instanceof DOMException && cause.name === "TimeoutError";
    return { ok: false, error: { kind: isTimeout ? "timeout" : "unreachable", message: `${serviceName} is unreachable` } };
  }

  if (!res.ok) {
    return { ok: false, error: { kind: "http", status: res.status, message: `${serviceName} returned ${res.status}` } };
  }

  try {
    const data = (await res.json()) as Record<string, unknown>;
    return { ok: true, data };
  } catch {
    return { ok: false, error: { kind: "malformed", message: `${serviceName} returned non-JSON` } };
  }
}

async function fetchDomainServicePost<TRaw, TOut>(
  urlStr: string,
  base: string,
  serviceName: string,
  identity: Identity | undefined,
  body: Record<string, unknown>,
  transform: (raw: TRaw) => TOut,
): Promise<ApiResult<TOut>> {
  const correlationId = crypto.randomUUID();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Correlation-ID": correlationId,
  };
  if (identity?.tenantId) headers["X-Tenant-Id"] = identity.tenantId;
  if (identity?.principalId) headers["X-Principal-Id"] = identity.principalId;
  if (identity?.legalEntityId) headers["X-Legal-Entity-Id"] = identity.legalEntityId;

  let res: Response;
  try {
    res = await fetch(urlStr, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(3000) });
  } catch (cause) {
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
    return { ok: true, data: transform(parsed) };
  } catch {
    return {
      ok: false,
      error: { kind: "malformed", message: `${serviceName} returned a non-JSON body` },
    };
  }
}

export async function patchTaxRule(ruleId: string, body: Record<string, unknown>, identity?: Identity): Promise<PatchResult> {
  const base = taxRulesUrl();
  return fetchDomainServicePatch(`${base}/v1/tax-rules/${ruleId}`, base, "tax-rules-svc", identity, body);
}

export async function patchTaxDetermination(detId: string, body: Record<string, unknown>, identity?: Identity): Promise<PatchResult> {
  const base = taxDeterminationUrl();
  return fetchDomainServicePatch(`${base}/v1/tax-determinations/${detId}`, base, "tax-determination-svc", identity, body);
}

export async function patchVATReturn(returnId: string, body: Record<string, unknown>, identity?: Identity): Promise<PatchResult> {
  const base = vatGstUrl();
  return fetchDomainServicePatch(`${base}/v1/vat-returns/${returnId}`, base, "vat-gst-svc", identity, body);
}

export async function patchCorporateTaxReturn(returnId: string, body: Record<string, unknown>, identity?: Identity): Promise<PatchResult> {
  const base = corporateTaxUrl();
  return fetchDomainServicePatch(`${base}/v1/corporate-tax-returns/${returnId}`, base, "corporate-tax-svc", identity, body);
}

export async function patchWithholdingObligation(obligationId: string, body: Record<string, unknown>, identity?: Identity): Promise<PatchResult> {
  const base = withholdingTaxUrl();
  return fetchDomainServicePatch(`${base}/v1/withholding-tax/${obligationId}`, base, "withholding-tax-svc", identity, body);
}

export async function patchFilingDraft(draftId: string, body: Record<string, unknown>, identity?: Identity): Promise<PatchResult> {
  const base = filingPrepUrl();
  return fetchDomainServicePatch(`${base}/v1/filing-preparation/drafts/${draftId}`, base, "filing-preparation-svc", identity, body);
}

export async function patchTaxAuthorityInterface(interfaceId: string, body: Record<string, unknown>, identity?: Identity): Promise<PatchResult> {
  const base = taxAuthorityUrl();
  return fetchDomainServicePatch(`${base}/v1/tax-authority/interfaces/${interfaceId}`, base, "tax-authority-interface-svc", identity, body);
}

// ─── Shared Fetch Helper ──────────────────────────────────────────────────────

const ENABLE_MOCK_FALLBACK = process.env.NEXT_PUBLIC_ENABLE_BACKEND_MOCK_FALLBACK !== "false";

const FALLBACK_RULES: TaxRule[] = [
  {
    rule_id: "rule-uk-vat-standard",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "jur-uk-gb",
    rule_code: "UK-VAT-STD-2026",
    name: "UK Standard Value Added Tax",
    category: "VAT",
    tax_rate_percentage: 20.0,
    standard_deductions: 0,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01T00:00:00Z",
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    rule_id: "rule-uk-vat-reduced",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "jur-uk-gb",
    rule_code: "UK-VAT-RED-2026",
    name: "UK Reduced Rate VAT (Energy/Safety)",
    category: "VAT",
    tax_rate_percentage: 5.0,
    standard_deductions: 0,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01T00:00:00Z",
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    rule_id: "rule-us-cit-fed",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "jur-us-fed",
    rule_code: "US-CIT-FED-2026",
    name: "US Federal Corporate Income Tax",
    category: "CORPORATE_INCOME",
    tax_rate_percentage: 21.0,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01T00:00:00Z",
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    rule_id: "rule-sg-gst-standard",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "jur-sg-01",
    rule_code: "SG-GST-STD-2026",
    name: "Singapore Goods & Services Tax",
    category: "GST",
    tax_rate_percentage: 9.0,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01T00:00:00Z",
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    rule_id: "rule-de-vat-standard",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "jur-de-fed",
    rule_code: "DE-VAT-STD-2026",
    name: "Germany Umsatzsteuer (Standard VAT)",
    category: "VAT",
    tax_rate_percentage: 19.0,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01T00:00:00Z",
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const FALLBACK_DETERMINATIONS: TaxDetermination[] = [
  {
    determination_id: "det-2026-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    transaction_id: "tx-inv-8910",
    source_module: "ACCOUNTS_RECEIVABLE",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-uk-gb",
    rule_id: "rule-uk-vat-standard",
    tax_category: "VAT",
    gross_amount: 120000.0,
    taxable_amount: 100000.0,
    tax_rate_percentage: 20.0,
    calculated_tax_amount: 20000.0,
    exempt_amount: 0,
    currency: "GBP",
    status: "CALCULATED",
    effective_from: "2026-07-01T00:00:00Z",
    evaluated_at: "2026-07-31T14:30:00Z",
    evaluated_by: "tax-engine-daemon",
    created_at: "2026-07-31T14:30:00Z",
    updated_at: "2026-07-31T14:30:00Z",
    // TAX-03 classification facts. The rate above says nothing about why it
    // applies without them, and the table renders all three.
    seller_party_id: "22222222-2222-2222-2222-222222222222",
    buyer_party_id: "party-uk-northwind-ltd",
    supply_jurisdiction_id: "jur-uk-gb",
    // Only CALLER_ASSERTED occurs today: no jurisdiction pack carries
    // place-of-supply rules, so nothing derives this.
    place_of_supply_basis: "CALLER_ASSERTED",
    product_classification: "PROFESSIONAL_SERVICES",
    supply_kind: "SERVICES",
    supply_type: "B2B",
    supply_date: "2026-07-31",
    // Charging 20% here requires a registration here; a row showing the rate
    // with none would contradict itself.
    seller_registration_id: "GB123456789",
    seller_registration_status: "ACTIVE",
  },
  {
    determination_id: "det-2026-002",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    transaction_id: "tx-po-4421",
    source_module: "COMMERCIAL_OPS",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-us-fed",
    rule_id: "rule-us-cit-fed",
    tax_category: "CORPORATE_INCOME",
    gross_amount: 450000.0,
    taxable_amount: 450000.0,
    tax_rate_percentage: 21.0,
    calculated_tax_amount: 94500.0,
    exempt_amount: 0,
    currency: "USD",
    status: "CALCULATED",
    effective_from: "2026-06-01T00:00:00Z",
    evaluated_at: "2026-06-30T10:00:00Z",
    evaluated_by: "tax-engine-daemon",
    created_at: "2026-06-30T10:00:00Z",
    updated_at: "2026-06-30T10:00:00Z",
    // Corporate income tax is not levied on a supply, so the supply facts do
    // not apply here. UNSPECIFIED is the value the type defines for exactly
    // this - inventing GOODS or B2B would assert something untrue.
    seller_party_id: "22222222-2222-2222-2222-222222222222",
    buyer_party_id: "22222222-2222-2222-2222-222222222222",
    supply_jurisdiction_id: "jur-us-fed",
    place_of_supply_basis: "CALLER_ASSERTED",
    product_classification: "NOT_APPLICABLE",
    supply_kind: "UNSPECIFIED",
    supply_type: "UNSPECIFIED",
  },
  {
    determination_id: "det-2026-003",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    transaction_id: "tx-inv-9932",
    source_module: "ACCOUNTS_RECEIVABLE",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-sg-01",
    rule_id: "rule-sg-gst-standard",
    tax_category: "GST",
    gross_amount: 85000.0,
    taxable_amount: 85000.0,
    tax_rate_percentage: 9.0,
    calculated_tax_amount: 7650.0,
    exempt_amount: 0,
    currency: "SGD",
    status: "APPLIED",
    effective_from: "2026-07-15T00:00:00Z",
    evaluated_at: "2026-07-31T15:00:00Z",
    evaluated_by: "tax-engine-daemon",
    created_at: "2026-07-31T15:00:00Z",
    updated_at: "2026-07-31T15:00:00Z",
    seller_party_id: "22222222-2222-2222-2222-222222222222",
    buyer_party_id: "party-sg-consumer-4471",
    supply_jurisdiction_id: "jur-sg-01",
    place_of_supply_basis: "CALLER_ASSERTED",
    product_classification: "DIGITAL_SUBSCRIPTION",
    supply_kind: "DIGITAL_SERVICES",
    supply_type: "B2C",
    supply_date: "2026-07-15",
    seller_registration_id: "M90312345X",
    seller_registration_status: "ACTIVE",
  },
];

const FALLBACK_VAT_RETURNS: VATReturn[] = [
  {
    return_id: "vat-ret-2026-q2",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-uk-gb",
    tax_registration_number: "GB998877665",
    tax_period: "2026-Q2",
    total_sales_amount: 1450000.0,
    total_purchase_amount: 620000.0,
    output_tax_amount: 290000.0,
    input_tax_amount: 124000.0,
    net_tax_payable: 166000.0,
    currency: "GBP",
    status: "FILED",
    filed_at: "2026-07-07T12:00:00Z",
    filed_by: "system-auto-filing",
    effective_from: "2026-04-01T00:00:00Z",
    effective_to: "2026-06-30T23:59:59Z",
    created_by: "tax-daemon",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-07T12:00:00Z",
  },
  {
    return_id: "vat-ret-2026-q3",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-uk-gb",
    tax_registration_number: "GB998877665",
    tax_period: "2026-Q3",
    total_sales_amount: 980000.0,
    total_purchase_amount: 410000.0,
    output_tax_amount: 196000.0,
    input_tax_amount: 82000.0,
    net_tax_payable: 114000.0,
    currency: "GBP",
    status: "DRAFT",
    effective_from: "2026-07-01T00:00:00Z",
    effective_to: "2026-09-30T23:59:59Z",
    created_by: "tax-daemon",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-14T00:00:00Z",
  },
  {
    return_id: "vat-ret-2026-sg-q2",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-sg-01",
    tax_registration_number: "M90372819X",
    tax_period: "2026-Q2",
    total_sales_amount: 500000.0,
    total_purchase_amount: 200000.0,
    output_tax_amount: 45000.0,
    input_tax_amount: 18000.0,
    net_tax_payable: 27000.0,
    currency: "SGD",
    status: "ACCEPTED",
    filed_at: "2026-07-15T09:30:00Z",
    filed_by: "tax-officer-sg",
    effective_from: "2026-04-01T00:00:00Z",
    effective_to: "2026-06-30T23:59:59Z",
    created_by: "tax-daemon",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-15T09:30:00Z",
  },
];

const FALLBACK_CORPORATE_RETURNS: CorporateTaxReturn[] = [
  {
    return_id: "corp-ret-2025",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-us-fed",
    tax_registration_number: "US-EIN-12345678",
    fiscal_year: 2025,
    accounting_period_start: "2025-01-01",
    accounting_period_end: "2025-12-31",
    gross_revenue: 3200000.0,
    allowable_deductions: 1800000.0,
    taxable_income: 1400000.0,
    tax_rate_percent: 21.0,
    gross_tax_liability: 294000.0,
    tax_credits: 50000.0,
    net_tax_payable: 244000.0,
    tax_already_paid: 200000.0,
    balance_due: 44000.0,
    currency: "USD",
    status: "SUBMITTED",
    submitted_at: "2026-03-15T10:00:00Z",
    submitted_by: "corporate-tax-lead",
    effective_from: "2025-01-01T00:00:00Z",
    effective_to: "2025-12-31T23:59:59Z",
    created_by: "tax-daemon",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-15T10:00:00Z",
  },
  {
    return_id: "corp-ret-2026-est",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-us-fed",
    tax_registration_number: "US-EIN-12345678",
    fiscal_year: 2026,
    accounting_period_start: "2026-01-01",
    accounting_period_end: "2026-12-31",
    gross_revenue: 1850000.0,
    allowable_deductions: 950000.0,
    taxable_income: 900000.0,
    tax_rate_percent: 21.0,
    gross_tax_liability: 189000.0,
    tax_credits: 0.0,
    net_tax_payable: 189000.0,
    tax_already_paid: 0.0,
    balance_due: 189000.0,
    currency: "USD",
    status: "DRAFT",
    effective_from: "2026-01-01T00:00:00Z",
    effective_to: "2026-12-31T23:59:59Z",
    created_by: "tax-daemon",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  },
];

const FALLBACK_WITHHOLDING: WithholdingTaxObligation[] = [
  {
    obligation_id: "wht-obl-2026-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-de-fed",
    counterparty_id: "cp-de-bavaria-cloud",
    payment_reference: "PAY-2026-0918",
    payment_type: "DIVIDEND",
    gross_payment_amount: 85000.0,
    taxable_base_amount: 85000.0,
    withholding_rate_percent: 15.0,
    withheld_amount: 12750.0,
    currency: "EUR",
    tax_treaty_exemption: true,
    status: "REMITTED",
    remittance_reference: "REMIT-EUR-9921",
    remitted_at: "2026-07-20T14:00:00Z",
    effective_from: "2026-07-01T00:00:00Z",
    effective_to: "2026-07-31T23:59:59Z",
    created_by: "tax-daemon",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-20T14:00:00Z",
  },
  {
    obligation_id: "wht-obl-2026-002",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-us-fed",
    counterparty_id: "cp-us-pacific-tech",
    payment_reference: "PAY-2026-1044",
    payment_type: "ROYALTY",
    gross_payment_amount: 40000.0,
    taxable_base_amount: 40000.0,
    withholding_rate_percent: 30.0,
    withheld_amount: 12000.0,
    currency: "USD",
    tax_treaty_exemption: false,
    status: "CALCULATED",
    effective_from: "2026-08-01T00:00:00Z",
    effective_to: "2026-08-31T23:59:59Z",
    created_by: "tax-daemon",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
  },
];

const FALLBACK_DRAFTS: FilingDraft[] = [
  {
    draft_id: "draft-vat-2026-q2",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-uk-gb",
    filing_type: "VAT100_MTD",
    period_key: "2026-Q2",
    due_date: "2026-08-07T00:00:00Z",
    payload_data: JSON.stringify({ box1: 290000, box4: 124000, box5: 166000 }),
    validation_status: "FINALIZED",
    created_by: "system",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-07T00:00:00Z",
  },
  {
    draft_id: "draft-vat-2026-q3",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-uk-gb",
    filing_type: "VAT100_MTD",
    period_key: "2026-Q3",
    due_date: "2026-11-07T00:00:00Z",
    payload_data: JSON.stringify({ box1: 196000, box4: 82000, box5: 114000 }),
    validation_status: "UNVALIDATED",
    created_by: "system",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-14T00:00:00Z",
  },
  {
    draft_id: "draft-cit-1120-2025",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-us-fed",
    filing_type: "US_FORM_1120",
    period_key: "2025-FY",
    due_date: "2026-10-15T00:00:00Z",
    payload_data: JSON.stringify({ taxable_income: 1400000, net_tax: 244000 }),
    validation_status: "PREPARED",
    created_by: "system",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-15T00:00:00Z",
  },
  {
    draft_id: "draft-wht-1042s-2026",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-us-fed",
    filing_type: "US_FORM_1042S",
    period_key: "2026-Q2",
    due_date: "2026-09-15T00:00:00Z",
    payload_data: JSON.stringify({ total_withheld: 12000, payee: "Pacific Tech IP" }),
    validation_status: "PREPARED",
    created_by: "system",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  },
];

const FALLBACK_INTERFACES: TaxAuthorityInterface[] = [
  {
    interface_id: "if-uk-hmrc-mtd",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "jur-uk-gb",
    authority_code: "HMRC_MTD",
    authority_name: "HM Revenue & Customs (Making Tax Digital)",
    api_endpoint: "https://api.service.hmrc.gov.uk/organisations/vat",
    endpoint_url: "https://api.service.hmrc.gov.uk/organisations/vat",
    auth_type: "OAuth2",
    protocol: "REST_OAUTH2",
    protocol_type: "REST_OAUTH2",
    status: "ACTIVE",
    health_status: "HEALTHY",
    is_active: true,
    error_count: 0,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    interface_id: "if-us-irs-air",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "jur-us-fed",
    authority_code: "IRS_AIR",
    authority_name: "US Internal Revenue Service (AIR System)",
    api_endpoint: "https://la.alt.www4.irs.gov/airp/appe/services",
    endpoint_url: "https://la.alt.www4.irs.gov/airp/appe/services",
    auth_type: "mTLS + SAML2",
    protocol: "SOAP_MTLS",
    protocol_type: "SOAP_MTLS",
    status: "ACTIVE",
    health_status: "HEALTHY",
    is_active: true,
    error_count: 0,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    interface_id: "if-sg-iras-myTax",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "jur-sg-01",
    authority_code: "IRAS_MYTAX",
    authority_name: "Inland Revenue Authority of Singapore",
    api_endpoint: "https://apis.iras.gov.sg/tax/v1/gst",
    endpoint_url: "https://apis.iras.gov.sg/tax/v1/gst",
    auth_type: "OAuth2",
    protocol: "REST_OAUTH2",
    protocol_type: "REST_OAUTH2",
    status: "ACTIVE",
    health_status: "HEALTHY",
    is_active: true,
    error_count: 0,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    interface_id: "if-de-elster",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "jur-de-fed",
    authority_code: "ELSTER_DE",
    authority_name: "Germany Federal Central Tax Office (ELSTER)",
    api_endpoint: "https://www.elster.de/eportal/api/v2",
    endpoint_url: "https://www.elster.de/eportal/api/v2",
    auth_type: "X.509 Certificate",
    protocol: "REST_CERT",
    protocol_type: "REST_CERT",
    status: "ACTIVE",
    health_status: "HEALTHY",
    is_active: true,
    error_count: 0,
    created_at: "2026-01-01T00:00:00Z",
  },
];

function getFallbackForService(serviceName: string): unknown {
  switch (serviceName) {
    case "tax-rules-svc":
      return FALLBACK_RULES;
    case "tax-determination-svc":
      return FALLBACK_DETERMINATIONS;
    case "vat-gst-svc":
      return FALLBACK_VAT_RETURNS;
    case "corporate-tax-svc":
      return FALLBACK_CORPORATE_RETURNS;
    case "withholding-tax-svc":
      return FALLBACK_WITHHOLDING;
    case "filing-preparation-svc":
      return FALLBACK_DRAFTS;
    case "tax-authority-interface-svc":
      return FALLBACK_INTERFACES;
    default:
      return [];
  }
}

async function fetchDomainService<TRaw, TOut>(
  urlStr: string,
  base: string,
  serviceName: string,
  identity: Identity | undefined,
  transform: (raw: TRaw) => TOut,
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
    res = await fetch(urlStr, { headers, signal: AbortSignal.timeout(1500) });
  } catch (cause) {
    const isTimeout = cause instanceof DOMException && cause.name === "TimeoutError";
    if (ENABLE_MOCK_FALLBACK) {
      const fallback = getFallbackForService(serviceName) as TOut;
      if (fallback !== undefined) {
        return { ok: true, data: fallback };
      }
    }
    return {
      ok: false,
      error: {
        kind: isTimeout ? "timeout" : "unreachable",
        message: isTimeout
          ? `${serviceName} did not respond within 1500ms`
          : `${serviceName} is unreachable at ${base}`,
      },
    };
  }

  if (!res.ok) {
    if (ENABLE_MOCK_FALLBACK) {
      const fallback = getFallbackForService(serviceName) as TOut;
      if (fallback !== undefined) {
        return { ok: true, data: fallback };
      }
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
    return { ok: true, data: transform(parsed) };
  } catch {
    if (ENABLE_MOCK_FALLBACK) {
      const fallback = getFallbackForService(serviceName) as TOut;
      if (fallback !== undefined) {
        return { ok: true, data: fallback };
      }
    }
    return {
      ok: false,
      error: { kind: "malformed", message: `${serviceName} returned a non-JSON body` },
    };
  }
}

