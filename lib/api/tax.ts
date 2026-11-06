// Server-side API clients for the Tax domain services:
// - tax-rules-svc (8125)
// - tax-determination-svc (8126)
// - vat-gst-svc (8127)
// - corporate-tax-svc (8128)
// - withholding-tax-svc (8129)
// - filing-preparation-svc (8130)
// - tax-authority-interface-svc (8147)

import { type ApiResult, type Identity } from "./client";
import { serviceUrl } from "./config";
import { envelopeHeaders } from "./envelope";

// Base URLs come from the shared registry so ZOIKO_USE_GATEWAY applies to Tax
// like every other domain. The per-service env overrides are unchanged:
// serviceUrl("taxRules") still reads ZOIKO_TAX_RULES_URL, and so on.

function taxRulesUrl(): string {
  return serviceUrl("taxRules");
}

function taxDeterminationUrl(): string {
  return serviceUrl("taxDetermination");
}

function vatGstUrl(): string {
  return serviceUrl("vatGst");
}

function corporateTaxUrl(): string {
  return serviceUrl("corporateTax");
}

function withholdingTaxUrl(): string {
  return serviceUrl("withholdingTax");
}

function filingPrepUrl(): string {
  return serviceUrl("filingPreparation");
}

function taxAuthorityUrl(): string {
  return serviceUrl("taxAuthorityInterface");
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

type CorporateTaxResponse = { corporate_tax_returns?: CorporateTaxReturn[]; total: number };

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
    // corporate-tax-svc lists under corporate_tax_returns; reading `returns`
    // made every register empty.
    (d) => d.corporate_tax_returns ?? [],
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

// withholding-tax-svc lists under withholding_tax_obligations, with the same
// field names as WithholdingTaxObligation. The old normaliser read
// withholding_obligations/obligations (a mock's keys), so the register was
// always empty, and it filled gaps with "USD", "system" and the current time.
type WithholdingResponse = { withholding_tax_obligations?: WithholdingTaxObligation[]; total: number };

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
    (d) => d.withholding_tax_obligations ?? [],
  );
}

// ─── 6. Filing Preparation ───────────────────────────────────────────────────

/** filing-preparation-svc: a draft is validated, then finalized to READY_FOR_SUBMISSION. */
export type ValidationStatus = "DRAFT" | "VALIDATING" | "PREPARED" | "BLOCKED" | "READY_FOR_SUBMISSION";

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
    tenant_id:             String(src.tenant_id ?? ""),
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
    validation_status:     String(src.validation_status ?? "") as ValidationStatus,
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

/** tax-authority-interface-svc TaxInterface, as the service returns it. */
export type TaxAuthorityInterface = {
  interface_id: string;
  tenant_id: string;
  legal_entity_id: string;
  jurisdiction: string;
  authority_name: string;
  protocol: string;
  status: string;
  /** Empty when no authority adapter is bound; nothing is then sent to the authority. */
  provider_key?: string;
  adapter_kind?: string;
  created_at: string;
  updated_at: string;
};

// The old mapper invented what the service does not return: an authority code
// from the id, a placeholder government endpoint, an auth type from the
// protocol, a healthy status, is_active true and a UK jurisdiction id (the
// service's field is `jurisdiction`), so every interface was shown as a healthy
// UK connection.
type TaxAuthorityResponse = { interfaces?: TaxAuthorityInterface[]; total: number };

export async function listTaxAuthorityInterfaces(
  identity?: Identity
): Promise<ApiResult<TaxAuthorityInterface[]>> {
  const base = taxAuthorityUrl();
  const url = new URL(`${base}/v1/tax-authority/interfaces`);
  // Scoped to the session's entity; without it the service lists the tenant's.
  if (identity?.legalEntityId) url.searchParams.set("legal_entity_id", identity.legalEntityId);

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
    .filter((w) => w.currency === "EUR" && (w.status === "REMITTED" || w.status === "CALCULATED"))
    .reduce((acc, w) => acc + (w.withheld_amount || 0), 0);

  // Drafts not yet ready for submission whose due date is today or later. A
  // draft without a readable due date is not counted; it used to count as
  // upcoming, and a zero result fell back to the total.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingFilingCount = drafts.filter((d) => {
    if (d.validation_status === "READY_FOR_SUBMISSION" || !d.due_date) return false;
    const due = new Date(d.due_date);
    return !isNaN(due.getTime()) && due >= today;
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
      finalizedDraftCount: drafts.filter((d) => d.validation_status === "READY_FOR_SUBMISSION").length,
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
  type: "FILING";
  urgency: "overdue" | "urgent" | "upcoming" | "comfortable";
};

/**
 * Filing drafts with a due date, soonest first.
 *
 * Only real due dates. This used to give an undated draft today's date (or 30
 * days), label every draft a VAT filing, add withholding "deadlines" 30 days
 * after effective_from (the service records no due date for them), and answer
 * ok with an empty list when the reads failed.
 */
export async function listUpcomingTaxDeadlines(identity?: Identity): Promise<ApiResult<TaxDeadline[]>> {
  const draftsRes = await listFilingDrafts(identity);
  if (!draftsRes.ok) return draftsRes;

  const today = new Date();
  function urgency(days: number): TaxDeadline["urgency"] {
    if (days < 0) return "overdue";
    if (days <= 7) return "urgent";
    if (days <= 21) return "upcoming";
    return "comfortable";
  }

  const deadlines: TaxDeadline[] = draftsRes.data
    .filter((d) => d.due_date && !isNaN(new Date(d.due_date).getTime()))
    .map((d) => {
      const days = Math.round((new Date(d.due_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: d.draft_id,
        label: `${d.filing_type} — ${d.period_key}`,
        jurisdiction: d.jurisdiction_id,
        dueDate: d.due_date,
        daysUntilDue: days,
        type: "FILING" as const,
        urgency: urgency(days),
      };
    })
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

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
      tenant_id: identity?.tenantId,
      created_by: identity?.principalId,
    },
    (d) => d
  );
}

/**
 * tax-rules-svc UpdateTaxRuleRequest. Only a DRAFT rule can be changed: the
 * service answers 409 for any PUT to an ACTIVE or DEPRECATED rule (TAX-02 — an
 * active rate is superseded by a new version, never edited). Activation is a
 * PUT of `status: "ACTIVE"` on a DRAFT rule. updated_by is the session's.
 */
export type UpdateTaxRuleInput = {
  name?: string;
  tax_rate_percentage?: number;
  effective_to?: string;
  status?: RuleStatus;
};

export async function updateTaxRule(
  ruleId: string,
  input: UpdateTaxRuleInput,
  identity?: Identity
): Promise<ApiResult<TaxRule>> {
  const base = taxRulesUrl();
  return fetchDomainServicePost<TaxRule, TaxRule>(
    `${base}/v1/tax-rules/${encodeURIComponent(ruleId)}`,
    base,
    "tax-rules-svc",
    identity,
    {
      ...(input.name ? { name: input.name } : {}),
      ...(input.tax_rate_percentage !== undefined ? { tax_rate_percentage: input.tax_rate_percentage } : {}),
      ...(input.effective_to ? { effective_to: input.effective_to } : {}),
      ...(input.status ? { status: input.status } : {}),
      updated_by: identity?.principalId,
    },
    (d) => d,
    { method: "PUT" },
  );
}

/**
 * tax-determination-svc DetermineTaxRequest, including the TAX-03 inputs it
 * refuses a determination without (who supplies whom, where, when, what).
 * The legal entity and evaluator are the session's: evaluated_by used to
 * default to a fixed engine name and could be overridden by the body,
 * and the service stores it as given.
 */
export type EvaluateDeterminationInput = {
  transaction_id: string;
  source_module?: string;
  jurisdiction_id: string;
  tax_category: string;
  gross_amount: number;
  exempt_amount?: number;
  currency: string;
  effective_from?: string;
  seller_party_id: string;
  buyer_party_id: string;
  supply_jurisdiction_id: string;
  supply_date: string;
  product_classification: string;
  supply_kind: "GOODS" | "SERVICES" | "DIGITAL_SERVICES";
  supply_type: "B2B" | "B2C" | "B2G";
  /** Required for B2B: the buyer's registration in the place of supply. */
  buyer_tax_registration_id?: string;
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
      ...input,
      effective_from: input.effective_from || input.supply_date,
      legal_entity_id: identity?.legalEntityId,
      evaluated_by: identity?.principalId,
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
  return fetchDomainServicePost<{ vat_return?: VATReturn } & Partial<VATReturn>, VATReturn>(
    `${base}/v1/vat-returns`,
    base,
    "vat-gst-svc",
    identity,
    {
      ...input,
      tenant_id: identity?.tenantId,
      created_by: identity?.principalId,
    },
    // The mock service wraps the record: { vat_return: {...} }.
    // A real backend may return the flat object directly — fall back to the
    // raw response so both shapes work without a code change.
    (d) => (d.vat_return ?? d) as VATReturn
  );
}

/** The evidence the filing gate requires, sent as X-Evidence-Refs. The filer is the session's principal. */
export type FileVATReturnInput = {
  evidence_refs: string[];
};

export async function fileVATReturn(
  returnId: string,
  input: FileVATReturnInput,
  identity?: Identity
): Promise<ApiResult<VATReturn>> {
  const base = vatGstUrl();
  return fetchDomainServicePost<VATReturn, VATReturn>(
    `${base}/v1/vat-returns/${encodeURIComponent(returnId)}/file`,
    base,
    "vat-gst-svc",
    identity,
    { filed_by: identity?.principalId },
    (d) => d,
    { evidenceRefs: input.evidence_refs },
  );
}

export async function getVATReturn(
  returnId: string,
  identity?: Identity
): Promise<ApiResult<VATReturn>> {
  const base = vatGstUrl();
  return fetchDomainService<VATReturn, VATReturn>(
    `${base}/v1/vat-returns/${encodeURIComponent(returnId)}`,
    base,
    "vat-gst-svc",
    identity,
    (d) => d
  );
}

/**
 * corporate-tax-svc CreateTaxReturnRequest, minus the session's fields.
 *
 * The service computes taxable_income, gross_tax_liability, net_tax_payable and
 * balance_due itself (TaxReturn.Compute); the old input sent a taxable_income
 * the service has no field for, took legal_entity_id from the caller, and
 * omitted tax_credits and tax_already_paid. The body is now mapped field by
 * field, so nothing a caller adds reaches the service.
 */
export type CreateCorporateTaxInput = {
  jurisdiction_id: string;
  tax_registration_number: string;
  fiscal_year: number;
  accounting_period_start: string;
  accounting_period_end: string;
  gross_revenue: number;
  allowable_deductions: number;
  tax_rate_percent: number;
  tax_credits: number;
  tax_already_paid: number;
  currency: string;
  effective_from: string;
  notes?: string;
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
      legal_entity_id: identity?.legalEntityId,
      jurisdiction_id: input.jurisdiction_id,
      tax_registration_number: input.tax_registration_number,
      fiscal_year: input.fiscal_year,
      accounting_period_start: input.accounting_period_start,
      accounting_period_end: input.accounting_period_end,
      gross_revenue: input.gross_revenue,
      allowable_deductions: input.allowable_deductions,
      tax_rate_percent: input.tax_rate_percent,
      tax_credits: input.tax_credits,
      tax_already_paid: input.tax_already_paid,
      currency: input.currency,
      effective_from: input.effective_from,
      ...(input.notes ? { notes: input.notes } : {}),
      created_by: identity?.principalId,
    },
    (d) => d
  );
}

/**
 * withholding-tax-svc CreateObligationRequest, minus the session's fields.
 *
 * withheld_amount is computed by the service (gross or taxable base × rate), so
 * it is not an input; the old input required the caller to state it, and took
 * legal_entity_id from the caller. taxable_base_amount is optional: the service
 * uses the gross amount when it is absent.
 */
export type CreateWithholdingInput = {
  jurisdiction_id: string;
  counterparty_id: string;
  payment_reference: string;
  payment_type: string;
  gross_payment_amount: number;
  taxable_base_amount?: number;
  withholding_rate_percent: number;
  currency: string;
  tax_treaty_exemption?: boolean;
  exemption_certificate_ref?: string;
  notes?: string;
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
      legal_entity_id: identity?.legalEntityId,
      jurisdiction_id: input.jurisdiction_id,
      counterparty_id: input.counterparty_id,
      payment_reference: input.payment_reference,
      payment_type: input.payment_type,
      gross_payment_amount: input.gross_payment_amount,
      ...(input.taxable_base_amount !== undefined ? { taxable_base_amount: input.taxable_base_amount } : {}),
      withholding_rate_percent: input.withholding_rate_percent,
      currency: input.currency,
      tax_treaty_exemption: input.tax_treaty_exemption === true,
      ...(input.exemption_certificate_ref ? { exemption_certificate_ref: input.exemption_certificate_ref } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      effective_from: input.effective_from,
      created_by: identity?.principalId,
    },
    (d) => d
  );
}

/** filing-preparation-svc CreateDraftRequest; legal entity and author are the session's. */
export type CreateFilingDraftInput = {
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
      legal_entity_id: identity?.legalEntityId,
      created_by: identity?.principalId,
    },
    (raw) => normaliseDraft(raw as Record<string, unknown>)
  );
}

/**
 * Validate a draft against evidence-requirements-svc. The service refuses to
 * finalize a draft that has not been validated (422), so this comes first.
 */
export async function validateFilingDraft(
  draftId: string,
  identity?: Identity
): Promise<ApiResult<FilingDraft>> {
  const base = filingPrepUrl();
  return fetchDomainServicePost<Record<string, unknown>, FilingDraft>(
    `${base}/v1/filing-preparation/drafts/${encodeURIComponent(draftId)}/validate`,
    base,
    "filing-preparation-svc",
    identity,
    { validated_by: identity?.principalId },
    (raw) => normaliseDraft(raw as Record<string, unknown>)
  );
}

/** Mark a validated (PREPARED) draft READY_FOR_SUBMISSION. */
export async function finalizeFilingDraft(
  draftId: string,
  body?: { notes?: string },
  identity?: Identity
): Promise<ApiResult<FilingDraft>> {
  const base = filingPrepUrl();
  return fetchDomainServicePost<Record<string, unknown>, FilingDraft>(
    `${base}/v1/filing-preparation/drafts/${encodeURIComponent(draftId)}/finalize`,
    base,
    "filing-preparation-svc",
    identity,
    { ...(body?.notes ? { notes: body.notes } : {}), finalized_by: identity?.principalId },
    (raw) => normaliseDraft(raw as Record<string, unknown>)
  );
}

/** tax-authority-interface-svc CreateInterfaceRequest; the legal entity is the session's. */
export type CreateTaxAuthorityInput = {
  jurisdiction: string;
  authority_name: string;
  protocol?: string;
  provider_key?: string;
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
    { ...input, legal_entity_id: identity?.legalEntityId },
    (d) => d
  );
}

export type TaxAuthorityHealth = {
  provider_key: string;
  recent_calls: number;
  recent_failures: number;
  window: string;
};

/**
 * Recent submission calls to an authority adapter (GET /v1/tax-authority/health).
 *
 * The service has no connection test: the console used to POST
 * /interfaces/{id}/test, which does not exist, so the button always failed.
 * This reports what the service does record. While the adapter is off it
 * answers 503.
 */
export async function getTaxAuthorityHealth(
  providerKey: string,
  identity?: Identity
): Promise<ApiResult<TaxAuthorityHealth>> {
  const base = taxAuthorityUrl();
  const url = new URL(`${base}/v1/tax-authority/health`);
  url.searchParams.set("provider_key", providerKey);
  return fetchDomainService<TaxAuthorityHealth, TaxAuthorityHealth>(
    url.toString(), base, "tax-authority-interface-svc", identity, (d) => d,
  );
}

// ─── Shared Fetch Helpers ─────────────────────────────────────────────────────
//
// Headers come from envelopeHeaders, like every other client: the identity
// headers, request/correlation ids, source channel, the session's envelope
// JWT (needed behind the gateway; these helpers used to omit it) and, on
// writes, an Idempotency-Key. The PATCH helpers that sat here are gone: every
// tax service registers updates as PUT, so they could only answer 405, and
// nothing called them.

const TAX_PURPOSE = "tax_compliance";

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as Record<string, unknown>;
    const detail = [body.error, body.detail, body.message].filter((v) => typeof v === "string" && v).join(": ");
    return detail || fallback;
  } catch {
    return fallback;
  }
}

async function fetchDomainServicePost<TRaw, TOut>(
  urlStr: string,
  base: string,
  serviceName: string,
  identity: Identity | undefined,
  body: Record<string, unknown>,
  transform: (raw: TRaw) => TOut,
  options: { evidenceRefs?: string[]; method?: "POST" | "PUT" } = {},
): Promise<ApiResult<TOut>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...envelopeHeaders({ identity, materialWrite: true, purposeContext: TAX_PURPOSE, evidenceRefs: options.evidenceRefs }),
  };

  let res: Response;
  try {
    res = await fetch(urlStr, { method: options.method ?? "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  } catch (cause) {
    const isTimeout = cause instanceof DOMException && cause.name === "TimeoutError";
    return {
      ok: false,
      error: {
        kind: isTimeout ? "timeout" : "unreachable",
        message: isTimeout
          ? `${serviceName} did not respond within 5000ms`
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
        message: await readError(res, `${serviceName} returned ${res.status} for ${urlStr.slice(base.length)}`),
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

async function fetchDomainService<TRaw, TOut>(
  urlStr: string,
  base: string,
  serviceName: string,
  identity: Identity | undefined,
  transform: (raw: TRaw) => TOut,
): Promise<ApiResult<TOut>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...envelopeHeaders({ identity, materialWrite: false, purposeContext: TAX_PURPOSE }),
  };

  let res: Response;
  try {
    res = await fetch(urlStr, { headers, signal: AbortSignal.timeout(15000) });
  } catch (cause) {
    const isTimeout = cause instanceof DOMException && cause.name === "TimeoutError";
    // A failed read is returned as a failure. There is no sample-data fallback:
    // it used to answer any error with hardcoded rules, returns and healthy
    // authority interfaces for a fixed demo tenant, shown as live.
    return {
      ok: false,
      error: {
        kind: isTimeout ? "timeout" : "unreachable",
        message: isTimeout
          ? `${serviceName} did not respond within 15000ms`
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
        message: await readError(res, `${serviceName} returned ${res.status} for ${urlStr.slice(base.length)}`),
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

