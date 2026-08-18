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

// ─── Shared Fetch Helper ──────────────────────────────────────────────────────

/**
 * GET a JSON resource from a domain service and report what actually happened.
 *
 * Design principles (matching the pattern established in PR #9):
 * - An unreachable service returns `{ ok: false, error: { kind: "unreachable" } }`
 * - A non-OK HTTP status returns `{ ok: false, error: { kind: "http" } }`
 * - A malformed body returns `{ ok: false, error: { kind: "malformed" } }`
 * - An **empty list** from a healthy service returns `{ ok: true, data: [] }` — it
 *   is NOT substituted with mock data. A healthy service with no records is
 *   genuinely empty; showing invented rows in its place is misleading.
 *
 * All MOCK_* arrays that used to be passed as `fallbackData` have been removed.
 * Panels that previously relied on them now render an honest empty state.
 */

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
    res = await fetch(urlStr, { headers, signal: AbortSignal.timeout(3000) });
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

