"use server";

// Server Actions that WRITE to tax-rules-svc, tax-determination-svc,
// corporate-tax-svc and withholding-tax-svc.
//
// Every actor and entity field comes from the session cookie: created_by,
// updated_by, evaluated_by and legal_entity_id are set in lib/api/tax.ts from
// the identity resolved here, never from the form. Every figure, currency,
// rate and jurisdiction is the reader's; nothing is defaulted. A refusal is
// returned as the service sent it.
//
// Writes end in refresh(): the tax page reads cookies() and is fully dynamic,
// so there is no cache entry to revalidate, and refresh() re-renders the route
// so the panels list the record that was just written.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import type { ApiError } from "@/lib/api/client";
import {
  createTaxRule,
  updateTaxRule,
  evaluateTaxDetermination,
  createCorporateTaxReturn,
  createWithholdingObligation,
  type TaxCategory,
  type SupplyKind,
  type SupplyType,
  type UpdateTaxRuleInput,
} from "@/lib/api/tax";
import {
  TAX_RULE_CATEGORIES,
  type TaxRuleState,
  type DeterminationState,
  type CorporateTaxState,
  type WithholdingState,
} from "./tax-state";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
    envelopeJwt: session.envelopeJwt,
  };
}

type Failure = { status: "error"; message: string };

const EXPIRED: Failure = { status: "error", message: "Your session has expired — sign in again." };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCY_RE = /^[A-Z]{3}$/;

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/** A number the reader typed, or null when absent or not a finite number. */
function num(fd: FormData, key: string): number | null {
  const raw = text(fd, key);
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** The service's refusal, verbatim, with the status it came with. */
function refusal(service: string, error: ApiError): Failure {
  return {
    status: "error",
    message: error.status ? `${service} answered ${error.status}: ${error.message}` : error.message,
  };
}

function fail(message: string): Failure {
  return { status: "error", message };
}

// ── Tax rules ────────────────────────────────────────────────────────────────

/** Create a tax rule. It lands DRAFT and applies to nothing until activated. */
export async function createTaxRuleAction(_prev: TaxRuleState, fd: FormData): Promise<TaxRuleState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const jurisdictionId = text(fd, "jurisdiction_id");
  const ruleCode = text(fd, "rule_code");
  const name = text(fd, "name");
  const category = text(fd, "category");
  const rate = num(fd, "tax_rate_percentage");
  const effectiveFrom = text(fd, "effective_from");
  const effectiveTo = text(fd, "effective_to");

  if (!UUID_RE.test(jurisdictionId)) return fail("Choose a jurisdiction from the register.");
  if (!ruleCode) return fail("A rule code is required.");
  if (!name) return fail("A rule name is required.");
  if (!(TAX_RULE_CATEGORIES as readonly string[]).includes(category)) return fail("Choose a tax category.");
  if (rate === null || rate < 0 || rate > 100) return fail("The tax rate must be a number from 0 to 100.");
  if (!DATE_RE.test(effectiveFrom)) return fail("The effective-from date is required.");
  if (effectiveTo && (!DATE_RE.test(effectiveTo) || effectiveTo < effectiveFrom)) {
    return fail("The effective-to date must be a date on or after the effective-from date.");
  }

  const res = await createTaxRule(
    {
      jurisdiction_id: jurisdictionId,
      rule_code: ruleCode,
      name,
      category: category as TaxCategory,
      tax_rate_percentage: rate,
      effective_from: effectiveFrom,
      ...(effectiveTo ? { effective_to: effectiveTo } : {}),
    },
    identity,
  );
  if (!res.ok) return refusal("tax-rules-svc", res.error);

  refresh();
  const rule = res.data;
  return {
    status: "success",
    message: `Rule ${rule.rule_code} recorded by tax-rules-svc as ${rule.status} (version ${rule.version}).`,
    record: rule,
  };
}

/**
 * Change a rule: activate it, deprecate it, or edit a DRAFT's name, rate and
 * end date. The service refuses any change to an ACTIVE or DEPRECATED rule with
 * 409; that refusal is shown as sent rather than pre-empted here, because the
 * status on the page may be stale.
 */
export async function updateTaxRuleAction(_prev: TaxRuleState, fd: FormData): Promise<TaxRuleState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const ruleId = text(fd, "rule_id");
  const intent = text(fd, "intent");
  if (!ruleId) return fail("No rule was named.");

  let input: UpdateTaxRuleInput;
  if (intent === "activate") {
    input = { status: "ACTIVE" };
  } else if (intent === "deprecate") {
    input = { status: "DEPRECATED" };
  } else if (intent === "edit") {
    const name = text(fd, "name");
    const rateRaw = text(fd, "tax_rate_percentage");
    const rate = num(fd, "tax_rate_percentage");
    const effectiveTo = text(fd, "effective_to");
    if (rateRaw !== "" && (rate === null || rate < 0 || rate > 100)) {
      return fail("The tax rate must be a number from 0 to 100.");
    }
    if (effectiveTo && !DATE_RE.test(effectiveTo)) return fail("The effective-to date must be a date.");
    if (!name && rate === null && !effectiveTo) return fail("Change at least one of name, rate or effective-to.");
    input = {
      ...(name ? { name } : {}),
      ...(rate !== null ? { tax_rate_percentage: rate } : {}),
      ...(effectiveTo ? { effective_to: effectiveTo } : {}),
    };
  } else {
    return fail("Unknown rule action.");
  }

  const res = await updateTaxRule(ruleId, input, identity);
  if (!res.ok) return refusal("tax-rules-svc", res.error);

  refresh();
  const rule = res.data;
  return {
    status: "success",
    message: `Rule ${rule.rule_code} is now ${rule.status} (version ${rule.version}).`,
    record: rule,
  };
}

// ── Tax determination ────────────────────────────────────────────────────────

const SUPPLY_KINDS: readonly SupplyKind[] = ["GOODS", "SERVICES", "DIGITAL_SERVICES"];
const SUPPLY_TYPES: readonly SupplyType[] = ["B2B", "B2C", "B2G"];

/**
 * Evaluate one supply. tax-determination-svc validates both jurisdictions
 * against jurisdiction-rules-svc and applies the ACTIVE rule for the
 * jurisdiction and category; the rule, rate and amounts shown are its answer.
 */
export async function evaluateDeterminationAction(
  _prev: DeterminationState,
  fd: FormData,
): Promise<DeterminationState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const f = {
    transaction_id: text(fd, "transaction_id"),
    jurisdiction_id: text(fd, "jurisdiction_id"),
    tax_category: text(fd, "tax_category"),
    currency: text(fd, "currency").toUpperCase(),
    seller_party_id: text(fd, "seller_party_id"),
    buyer_party_id: text(fd, "buyer_party_id"),
    supply_jurisdiction_id: text(fd, "supply_jurisdiction_id"),
    supply_date: text(fd, "supply_date"),
    product_classification: text(fd, "product_classification"),
    supply_kind: text(fd, "supply_kind"),
    supply_type: text(fd, "supply_type"),
    buyer_tax_registration_id: text(fd, "buyer_tax_registration_id"),
  };
  const gross = num(fd, "gross_amount");

  if (!f.transaction_id) return fail("A transaction ID is required.");
  if (!UUID_RE.test(f.jurisdiction_id)) return fail("Choose the jurisdiction from the register.");
  if (!UUID_RE.test(f.supply_jurisdiction_id)) return fail("Choose the place of supply from the register.");
  if (!(TAX_RULE_CATEGORIES as readonly string[]).includes(f.tax_category)) return fail("Choose a tax category.");
  if (gross === null || gross <= 0) return fail("The gross amount must be a number greater than zero.");
  if (!CURRENCY_RE.test(f.currency)) return fail("The currency must be a three-letter ISO 4217 code.");
  if (!f.seller_party_id || !f.buyer_party_id) return fail("Seller and buyer party IDs are required.");
  if (!DATE_RE.test(f.supply_date)) return fail("The supply date is required.");
  if (!f.product_classification) return fail("A product classification is required.");
  if (!(SUPPLY_KINDS as readonly string[]).includes(f.supply_kind)) return fail("Choose a supply kind.");
  if (!(SUPPLY_TYPES as readonly string[]).includes(f.supply_type)) return fail("Choose a supply type.");
  if (f.supply_type === "B2B" && !f.buyer_tax_registration_id) {
    return fail("A B2B supply needs the buyer's tax registration in the place of supply.");
  }

  const res = await evaluateTaxDetermination(
    {
      transaction_id: f.transaction_id,
      jurisdiction_id: f.jurisdiction_id,
      tax_category: f.tax_category,
      gross_amount: gross,
      currency: f.currency,
      seller_party_id: f.seller_party_id,
      buyer_party_id: f.buyer_party_id,
      supply_jurisdiction_id: f.supply_jurisdiction_id,
      supply_date: f.supply_date,
      product_classification: f.product_classification,
      supply_kind: f.supply_kind as SupplyKind,
      supply_type: f.supply_type as SupplyType,
      ...(f.buyer_tax_registration_id ? { buyer_tax_registration_id: f.buyer_tax_registration_id } : {}),
    },
    identity,
  );
  if (!res.ok) return refusal("tax-determination-svc", res.error);

  refresh();
  const d = res.data;
  return {
    status: "success",
    message: `Determination ${d.determination_id} recorded as ${d.status}.`,
    record: d,
  };
}

// ── Corporate tax ────────────────────────────────────────────────────────────

/** Raise a corporate income tax return. It lands DRAFT; the service computes the liability. */
export async function createCorporateTaxReturnAction(
  _prev: CorporateTaxState,
  fd: FormData,
): Promise<CorporateTaxState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const jurisdictionId = text(fd, "jurisdiction_id");
  const registration = text(fd, "tax_registration_number");
  const fiscalYear = num(fd, "fiscal_year");
  const periodStart = text(fd, "accounting_period_start");
  const periodEnd = text(fd, "accounting_period_end");
  const currency = text(fd, "currency").toUpperCase();
  const effectiveFrom = text(fd, "effective_from");
  const notes = text(fd, "notes");
  const amounts: [string, number | null][] = [
    ["Gross revenue", num(fd, "gross_revenue")],
    ["Allowable deductions", num(fd, "allowable_deductions")],
    ["Tax rate", num(fd, "tax_rate_percent")],
    ["Tax credits", num(fd, "tax_credits")],
    ["Tax already paid", num(fd, "tax_already_paid")],
  ];

  if (!UUID_RE.test(jurisdictionId)) return fail("Choose a jurisdiction from the register.");
  if (!registration) return fail("The corporation tax registration number is required.");
  if (fiscalYear === null || !Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 9999) {
    return fail("The fiscal year must be a four-digit year.");
  }
  if (!DATE_RE.test(periodStart) || !DATE_RE.test(periodEnd)) {
    return fail("The accounting period start and end are required.");
  }
  if (periodEnd < periodStart) return fail("The accounting period must end on or after it starts.");
  for (const [label, v] of amounts) {
    if (v === null || v < 0) return fail(`${label} must be a number, 0 or more (enter 0 if there is none).`);
  }
  const [grossRevenue, deductions, rate, credits, alreadyPaid] = amounts.map(([, v]) => v as number);
  if (rate > 100) return fail("The tax rate cannot exceed 100%.");
  if (!CURRENCY_RE.test(currency)) return fail("The currency must be a three-letter ISO 4217 code.");
  if (!DATE_RE.test(effectiveFrom)) return fail("The effective-from date is required.");

  const res = await createCorporateTaxReturn(
    {
      jurisdiction_id: jurisdictionId,
      tax_registration_number: registration,
      fiscal_year: fiscalYear,
      accounting_period_start: periodStart,
      accounting_period_end: periodEnd,
      gross_revenue: grossRevenue,
      allowable_deductions: deductions,
      tax_rate_percent: rate,
      tax_credits: credits,
      tax_already_paid: alreadyPaid,
      currency,
      effective_from: effectiveFrom,
      ...(notes ? { notes } : {}),
    },
    identity,
  );
  if (!res.ok) return refusal("corporate-tax-svc", res.error);

  refresh();
  const r = res.data;
  return {
    status: "success",
    message: `Corporate tax return ${r.return_id} for fiscal ${r.fiscal_year} recorded as ${r.status}.`,
    record: r,
  };
}

// ── Withholding tax ──────────────────────────────────────────────────────────

/** Record a withholding obligation on a payment; the service computes the amount withheld. */
export async function createWithholdingAction(
  _prev: WithholdingState,
  fd: FormData,
): Promise<WithholdingState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const jurisdictionId = text(fd, "jurisdiction_id");
  const counterpartyId = text(fd, "counterparty_id");
  const paymentReference = text(fd, "payment_reference");
  const paymentType = text(fd, "payment_type");
  const gross = num(fd, "gross_payment_amount");
  const baseRaw = text(fd, "taxable_base_amount");
  const base = num(fd, "taxable_base_amount");
  const rate = num(fd, "withholding_rate_percent");
  const currency = text(fd, "currency").toUpperCase();
  const effectiveFrom = text(fd, "effective_from");
  const treaty = fd.get("tax_treaty_exemption") === "on";
  const certificate = text(fd, "exemption_certificate_ref");
  const notes = text(fd, "notes");

  if (!UUID_RE.test(jurisdictionId)) return fail("Choose a jurisdiction from the register.");
  if (!counterpartyId) return fail("Choose the counterparty being paid.");
  // payment_reference: withholding-tax-svc refuses it empty, in its own words.
  if (!paymentType) return fail("A payment type is required.");
  if (gross === null || gross <= 0) return fail("The gross payment must be a number greater than zero.");
  if (baseRaw !== "" && (base === null || base <= 0)) {
    return fail("The taxable base, when given, must be greater than zero.");
  }
  if (rate === null || rate < 0 || rate > 100) return fail("The withholding rate must be a number from 0 to 100.");
  if (!CURRENCY_RE.test(currency)) return fail("The currency must be a three-letter ISO 4217 code.");
  if (!DATE_RE.test(effectiveFrom)) return fail("The effective-from date is required.");
  if (treaty && !certificate) return fail("A treaty exemption needs the exemption certificate reference.");

  const res = await createWithholdingObligation(
    {
      jurisdiction_id: jurisdictionId,
      counterparty_id: counterpartyId,
      payment_reference: paymentReference,
      payment_type: paymentType,
      gross_payment_amount: gross,
      ...(base !== null ? { taxable_base_amount: base } : {}),
      withholding_rate_percent: rate,
      currency,
      tax_treaty_exemption: treaty,
      ...(certificate ? { exemption_certificate_ref: certificate } : {}),
      ...(notes ? { notes } : {}),
      effective_from: effectiveFrom,
    },
    identity,
  );
  if (!res.ok) return refusal("withholding-tax-svc", res.error);

  refresh();
  const o = res.data;
  return {
    status: "success",
    message: `Withholding obligation ${o.obligation_id} on ${o.payment_reference} recorded as ${o.status}.`,
    record: o,
  };
}
