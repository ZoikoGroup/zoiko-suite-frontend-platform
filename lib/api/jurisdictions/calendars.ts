// REF-10 business calendars and payment terms, and the ZS-JUR §15 obligation
// rules that turn a period into a due date.
//
// A calendar version is maker-checker published and immutable once
// published: an amended holiday list is a new version (JUR-NEG-13), and every
// business-day answer names the exact version it used. Payment terms version
// the same way; a due date explains each step it took.

import type { ApiResult, ApiWriteResult, Identity } from "../client";
import { get, listAll, post, put, seg, type Caller } from "./core";

export type Holiday = { date: string; name: string; observed_rule?: string; observed_date?: string };

export type Calendar = {
  calendar_id: string;
  calendar_code: string;
  jurisdiction_id: string;
  authority: string;
  description: string | null;
  created_at: string;
  created_by_principal_id: string;
};

export type CalendarVersion = {
  calendar_version_id: string;
  calendar_code: string;
  version: number;
  effective_from: string;
  timezone: string;
  weekend_days: number[] | null;
  cutoff_time: string | null;
  status: "DRAFT" | "PUBLISHED" | string;
  holidays: Holiday[] | null;
  source_ids: string[] | null;
  created_at: string;
  created_by_principal_id: string;
  published_at: string | null;
  published_by: string | null;
  source_authority: string | null;
  source_reference: string | null;
  source_version: string | null;
  content_digest: string;
};

export type CalendarProvenance = { calendar_code: string; calendar_version: number; content_digest: string; timezone: string; effective_from: string; pinned: boolean };
export type BusinessDayCheck = { date: string; is_business_day: boolean; reason: string; holiday_name: string; calendar: CalendarProvenance };
export type AddBusinessDaysResult = { start_date: string; days: number; result_date: string; skipped: { date: string; reason: string; name: string }[] | null; calendar: CalendarProvenance };

export function listCalendars(identity?: Identity): Promise<ApiResult<Calendar[]>> {
  return listAll<Calendar>("/v1/calendars", identity);
}

export function listCalendarVersions(code: string, identity?: Identity): Promise<ApiResult<CalendarVersion[]>> {
  return listAll<CalendarVersion>(`/v1/calendars/${seg(code)}/versions`, identity);
}

export function createCalendar(input: { calendarCode: string; jurisdictionId: string; authority: string; description?: string }, identity: Caller): Promise<ApiWriteResult<Calendar>> {
  return post<Calendar>(
    "/v1/admin/calendars",
    { calendar_code: input.calendarCode, jurisdiction_id: input.jurisdictionId, authority: input.authority, ...(input.description ? { description: input.description } : {}) },
    identity,
  );
}

export function createCalendarVersion(
  code: string,
  input: { effectiveFrom: string; timezone: string; weekendDays: number[]; cutoffTime?: string; holidays: Holiday[] },
  identity: Caller,
): Promise<ApiWriteResult<CalendarVersion>> {
  return post<CalendarVersion>(
    `/v1/admin/calendars/${seg(code)}/versions`,
    { effective_from: input.effectiveFrom, timezone: input.timezone, weekend_days: input.weekendDays, holidays: input.holidays, ...(input.cutoffTime ? { cutoff_time: input.cutoffTime } : {}) },
    identity,
  );
}

export function setCalendarSources(code: string, version: number, sourceIds: string[], identity: Caller): Promise<ApiWriteResult<CalendarVersion>> {
  return put<CalendarVersion>(`/v1/admin/calendars/${seg(code)}/versions/${version}/sources`, { source_ids: sourceIds }, identity);
}

/** Publish (maker-checker): a second person makes the version the one in force from its date. */
export function publishCalendarVersion(code: string, version: number, identity: Caller): Promise<ApiWriteResult<CalendarVersion>> {
  return post<CalendarVersion>(`/v1/admin/calendars/${seg(code)}/versions/${version}/publish`, undefined, identity);
}

/** ImportHolidayCalendar: a source authority's holiday list, with observed-day rules. */
export function importHolidays(
  code: string,
  input: { sourceAuthority: string; sourceReference: string; sourceVersion: string; effectiveFrom: string; timezone: string; weekendDays: number[]; holidays: Holiday[] },
  identity: Caller,
): Promise<ApiWriteResult<CalendarVersion | { version: CalendarVersion }>> {
  return post(
    `/v1/admin/calendars/${seg(code)}/imports`,
    {
      source_authority: input.sourceAuthority,
      source_reference: input.sourceReference,
      source_version: input.sourceVersion,
      effective_from: input.effectiveFrom,
      timezone: input.timezone,
      weekend_days: input.weekendDays,
      holidays: input.holidays,
    },
    identity,
  );
}

export function isBusinessDay(code: string, date: string, identity?: Identity): Promise<ApiResult<BusinessDayCheck>> {
  return get<BusinessDayCheck>(`/v1/calendars/${seg(code)}/is-business-day`, identity, { date });
}

export function addBusinessDays(code: string, date: string, days: number, identity?: Identity): Promise<ApiResult<AddBusinessDaysResult>> {
  return get<AddBusinessDaysResult>(`/v1/calendars/${seg(code)}/add-business-days`, identity, { date, days });
}

// ─── Payment terms ───────────────────────────────────────────────────────────

export type PaymentTerm = { term_id: string; term_code: string; term_name: string; jurisdiction_id: string | null; created_at: string; created_by: string };

export type PaymentTermVersion = {
  term_version_id: string;
  term_code: string;
  version: number;
  status: string;
  formula_text: string;
  content_digest: string;
  ends_on: string | null;
  created_at: string;
  created_by: string;
  approved_at: string | null;
  approved_by: string | null;
  superseded_at: string | null;
  retired_at: string | null;
  retire_reason: string | null;
};

export type DueDateResult = {
  basis_date_rule: string;
  basis_date: string;
  unadjusted_due_date: string;
  due_date: string;
  adjustment_convention: string;
  adjusted: boolean;
  skipped: { date: string; reason: string; name: string }[] | null;
  grace_until: string;
  discount: { percent: string; until: string } | null;
  term: { term_code: string; term_version: number; formula_text: string; content_digest: string };
  calendar: CalendarProvenance | null;
  steps: string[] | null;
};

export const BASIS_DATE_RULES = ["INVOICE_DATE", "RECEIPT_DATE", "DELIVERY_DATE"] as const;
export const DUE_METHODS = ["NET_DAYS", "END_OF_MONTH_PLUS", "DAY_OF_NEXT_MONTH"] as const;
export const BUSINESS_DAY_CONVENTIONS = ["NONE", "FOLLOWING", "PRECEDING", "MODIFIED_FOLLOWING", "MODIFIED_PRECEDING"] as const;

export function getPaymentTerm(code: string, identity?: Identity): Promise<ApiResult<PaymentTerm>> {
  return get<PaymentTerm>(`/v1/payment-terms/${seg(code)}`, identity);
}

export function listPaymentTermVersions(code: string, identity?: Identity): Promise<ApiResult<PaymentTermVersion[]>> {
  return listAll<PaymentTermVersion>(`/v1/payment-terms/${seg(code)}/versions`, identity);
}

export function createPaymentTerm(input: { termCode: string; termName: string; jurisdictionId?: string }, identity: Caller): Promise<ApiWriteResult<PaymentTerm>> {
  return post<PaymentTerm>("/v1/admin/payment-terms", { term_code: input.termCode, term_name: input.termName, ...(input.jurisdictionId ? { jurisdiction_id: input.jurisdictionId } : {}) }, identity);
}

export type PaymentTermVersionInput = {
  basis_date_rule: string;
  due_method: string;
  due_days?: number;
  due_day_of_month?: number;
  business_day_convention: string;
  calendar_code?: string;
  grace_days?: number;
  discount_percent?: string;
  discount_days?: number;
  rationale: string;
  source_ref?: string;
  effective_from: string;
};

export function createPaymentTermVersion(code: string, input: PaymentTermVersionInput, identity: Caller): Promise<ApiWriteResult<PaymentTermVersion>> {
  return post<PaymentTermVersion>(`/v1/admin/payment-terms/${seg(code)}/versions`, input, identity);
}

export function decidePaymentTermVersion(
  code: string,
  version: number,
  step: "approve" | "supersede" | "retire",
  body: Record<string, unknown> | undefined,
  identity: Caller,
): Promise<ApiWriteResult<unknown>> {
  return post(`/v1/admin/payment-terms/${seg(code)}/versions/${version}/${step}`, body, identity);
}

/** CalculateDueDate / ExplainDueDate: the explain variant lists every step it took. */
export function dueDate(
  code: string,
  input: { invoiceDate: string; receiptDate?: string; deliveryDate?: string },
  explain: boolean,
  identity?: Identity,
): Promise<ApiResult<DueDateResult>> {
  return get<DueDateResult>(`/v1/payment-terms/${seg(code)}/${explain ? "explain-due-date" : "due-date"}`, identity, {
    invoice_date: input.invoiceDate,
    receipt_date: input.receiptDate,
    delivery_date: input.deliveryDate,
  });
}

// ─── Obligation rules ────────────────────────────────────────────────────────

export type ObligationRule = {
  obligation_rule_id: string;
  jurisdiction_id: string;
  regime_id: string | null;
  interpretation_id: string | null;
  obligation_code: string;
  rule_version: number;
  name: string;
  period_basis: string;
  anchor: string;
  offset_months: number;
  offset_days: number;
  offset_to_month_end: boolean;
  business_day_adjustment: string;
  calendar_code: string | null;
  effective_from: string;
  effective_to: string | null;
  extension_allowed: boolean;
  max_extension_days: number;
  cutoff_applies: boolean;
  escalation_owner: string | null;
  status: "DRAFT" | "PUBLISHED" | string;
  source_ids: string[] | null;
  created_at: string;
  created_by_principal_id: string;
  published_at: string | null;
  published_by: string | null;
};

export function listObligationRules(identity?: Identity, filters: { jurisdictionId?: string } = {}): Promise<ApiResult<ObligationRule[]>> {
  return listAll<ObligationRule>("/v1/obligation-rules", identity, { jurisdiction_id: filters.jurisdictionId });
}

export function createObligationRule(body: Record<string, unknown>, identity: Caller): Promise<ApiWriteResult<ObligationRule>> {
  return post<ObligationRule>("/v1/admin/obligation-rules", body, identity);
}

export function setObligationProvenance(id: string, input: { regimeId?: string; interpretationId?: string; sourceIds: string[] }, identity: Caller): Promise<ApiWriteResult<ObligationRule>> {
  return put<ObligationRule>(
    `/v1/admin/obligation-rules/${seg(id)}/provenance`,
    { source_ids: input.sourceIds, ...(input.regimeId ? { regime_id: input.regimeId } : {}), ...(input.interpretationId ? { interpretation_id: input.interpretationId } : {}) },
    identity,
  );
}

export function publishObligationRule(id: string, identity: Caller): Promise<ApiWriteResult<ObligationRule>> {
  return post<ObligationRule>(`/v1/admin/obligation-rules/${seg(id)}/publish`, undefined, identity);
}
