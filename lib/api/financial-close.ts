// financial-close-svc (:8104, /financial-close-svc through the gateway) — the
// authority on which accounting periods are open and which are sealed.
//
// This is the service general-ledger-svc consults before EVERY journal create,
// post and reverse, and it fails closed on the answer: a period this service
// reports CLOSED or LOCKED cannot be posted into, and a period it cannot be
// asked about at all cannot be posted into either. Nothing else in the Finance
// domain has that kind of veto.
//
// The lifecycle is short and one-way:
//
//     OPEN ──▶ LOCKED
//
// A period is registered OPEN, and locking it is the month-end close. There is
// no unlock — the domain type names a CLOSED status as well, but nothing in the
// service ever sets it and general-ledger-svc treats CLOSED and LOCKED
// identically, so the console does not offer it rather than inventing a
// transition the backend does not have.
//
// Locking is not a status change. It runs three readiness checks, compiles a
// trial balance from the ledger, uploads it to document-vault-svc, and records
// a signed hash of it — and any of those failing refuses the close outright.
// That is why the console offers a readiness check as a separate, side-effect
// free step: a month-end is checked repeatedly and locked once.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

/** The statuses the service can report. CLOSED is never written by any code
 *  path today; it is accepted here because general-ledger-svc treats it as
 *  locked and a period carrying it must not render as unknown. */
export type CloseStatus = "OPEN" | "CLOSED" | "LOCKED";

/** Wire shape. Field names match the Go json tags exactly. */
export type FiscalPeriod = {
  fiscal_period_id: string;
  tenant_id: string;
  legal_entity_id: string;
  /** Free text, e.g. "2026-07". No fiscal calendar service exists, and this is
   *  the string general-ledger-svc matches a journal's fiscal_period against —
   *  exactly, with no normalisation. "2026-7" and "2026-07" are two periods. */
  period_name: string;
  period_start: string;
  period_end: string;
  close_status: CloseStatus;
  close_locked_at?: string | null;
  /** The document-vault-svc id of the trial balance uploaded at close. */
  evidence_document_id?: string | null;
};

export type ReadinessCheck = {
  is_ready: boolean;
  /** Machine-prefixed reasons, e.g. "unposted_journals_exist: 3 journals …".
   *  Always a list, never null. */
  blocking_issues: string[];
};

export type PeriodLockResult = {
  fiscal_period_id: string;
  period_name: string;
  close_status: CloseStatus;
  close_locked_at: string;
  evidence_document_id: string;
  /** SHA-256 over the compiled trial balance. Stored alongside an HMAC
   *  signature of the same hash, keyed with the service's configured signing
   *  key — NOT with the tenant id, which is public and made every signature
   *  forgeable. */
  verification_hash: string;
};

export type ListPeriodsInput = {
  identity: Identity & { principalId: string; tenantId: string };
  legalEntityId: string;
};

/**
 * List the fiscal periods registered for one legal entity, newest first.
 *
 * `legal_entity_id` is required — this service has no "all entities" read — and
 * the tenant comes from the verified X-Tenant-Id header. Reading the register
 * is an authorized action (PERIOD_CLOSE_VIEW), so a principal without it gets
 * 403 rather than an empty list.
 */
export async function listFiscalPeriods(
  input: ListPeriodsInput,
): Promise<ApiResult<FiscalPeriod[]>> {
  const result = await apiGet<FiscalPeriod[] | null>("financialClose", "/v1/close/periods", {
    query: { legal_entity_id: input.legalEntityId },
    identity: input.identity,
  });

  if (!result.ok) return result;
  if (result.data === null) return { ok: true, data: [] };

  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: { kind: "malformed", message: "financial-close-svc returned a non-array period list" },
    };
  }
  return { ok: true, data: result.data };
}

export type CreatePeriodInput = {
  identity: Identity & { principalId: string; tenantId: string; legalEntityId: string };
  periodName: string;
  /** RFC3339. The Go fields are time.Time, so a bare YYYY-MM-DD fails to
   *  unmarshal and answers 400 invalid_json — the action converts before it
   *  gets here. */
  periodStart: string;
  periodEnd: string;
};

/**
 * Register a fiscal period. It lands OPEN and seals nothing.
 *
 * 201 means a period was registered; 200 means one already existed with this
 * name for this entity and the service resolved to it rather than creating a
 * second — (tenant, legal entity, period name) is unique, and a retried submit
 * must not produce a duplicate period that could be locked independently.
 *
 * Registering a period is what makes it lockable. It is NOT what makes it
 * postable: general-ledger-svc treats an unregistered period as open, so the
 * ledger works before anyone has registered anything. Registering is how a
 * period becomes closeable, not how it becomes usable.
 */
export async function createFiscalPeriod(
  input: CreatePeriodInput,
): Promise<ApiWriteResult<FiscalPeriod>> {
  return apiPost<FiscalPeriod>(
    "financialClose",
    "/v1/close/periods",
    {
      legal_entity_id: input.identity.legalEntityId,
      period_name: input.periodName,
      period_start: input.periodStart,
      period_end: input.periodEnd,
    },
    { identity: input.identity },
  );
}

/**
 * Check whether a period could be closed. Changes nothing.
 *
 * Runs the same three checks the lock runs — unposted journals in the ledger,
 * unsettled payables and unsettled receivables, all scoped to this period —
 * without writing, publishing, or touching the period. Before this existed the
 * only way to ask was to attempt the close, which emitted close.started and
 * close.blocked events for what was really a question.
 *
 * A dependency that cannot be reached is a 503, never `is_ready: false` with an
 * empty list: "we could not check" and "there is nothing to report" are
 * opposite answers.
 */
export async function checkPeriodReadiness(
  fiscalPeriodId: string,
  identity: Identity & { principalId: string; tenantId: string },
): Promise<ApiResult<ReadinessCheck>> {
  return apiGet<ReadinessCheck>(
    "financialClose",
    `/v1/close/periods/${fiscalPeriodId}/readiness`,
    { identity },
  );
}

/**
 * Close the period: run the readiness checks, compile and file the trial
 * balance, and seal it.
 *
 * Takes no body — the actor comes from X-Principal-Id and the period from the
 * route. Outcomes worth distinguishing:
 *
 *  - 200: closed. The response carries the vault document id for the trial
 *    balance and the verification hash that was signed and stored.
 *  - 422 with a ReadinessCheck body: refused because of outstanding items, or
 *    because the period is already locked. Nothing was changed.
 *  - 503: a dependency could not be reached, or the ledger returned a full page
 *    so the trial balance might have been incomplete. Refused rather than
 *    sealed over an unknown.
 *  - 500 `evidence_not_recorded`: the period IS locked and the trial balance IS
 *    in the vault, but the signed hash was not persisted. The one outcome that
 *    needs a human: the close happened and is not evidenced.
 */
export async function lockFiscalPeriod(
  fiscalPeriodId: string,
  identity: Identity & { principalId: string; tenantId: string },
): Promise<ApiWriteResult<PeriodLockResult | ReadinessCheck>> {
  return apiPost<PeriodLockResult | ReadinessCheck>(
    "financialClose",
    `/v1/close/periods/${fiscalPeriodId}/lock`,
    {},
    { identity },
  );
}

// ─── Derived views ───────────────────────────────────────────────────────────

export type CloseStats = {
  open: number;
  locked: number;
  /** The most recent period that is still open, by start date. Month-end is
   *  worked oldest-first, so this is the one that matters. */
  oldestOpen?: FiscalPeriod;
};

export function summarisePeriods(periods: FiscalPeriod[]): CloseStats {
  const stats: CloseStats = { open: 0, locked: 0 };

  for (const period of periods) {
    if (period.close_status === "OPEN") stats.open += 1;
    else stats.locked += 1;
  }

  const open = periods
    .filter((p) => p.close_status === "OPEN")
    .sort((a, b) => a.period_start.localeCompare(b.period_start));
  stats.oldestOpen = open[0];

  return stats;
}

export function isLocked(period: FiscalPeriod): boolean {
  return period.close_status !== "OPEN";
}

/** A period's window as calendar dates. The columns are timestamps but the
 *  values are day boundaries, so rendering them as local instants shows the
 *  previous day west of Greenwich — a period ending on the 31st reading as the
 *  30th. Taken as a string and never re-zoned. */
export function formatPeriodRange(period: FiscalPeriod): string {
  return `${period.period_start.slice(0, 10)} → ${period.period_end.slice(0, 10)}`;
}

/**
 * Turn a machine-prefixed blocking reason into a sentence.
 *
 * The service returns `code: human detail`. The code is the part worth
 * explaining — an operator reading "unsettled_ap_invoices_exist" needs to know
 * WHERE to go and clear it — and the detail already carries the count.
 */
export function explainBlockingIssue(issue: string): string {
  const [code, ...rest] = issue.split(":");
  const detail = rest.join(":").trim();

  switch (code.trim()) {
    case "unposted_journals_exist":
      return `Unposted journals — ${detail}. A period cannot be sealed while entries for it are still drafts: validate and post them on the journal register above, or reverse the ones that should not stand.`;
    case "unsettled_ap_invoices_exist":
      return `Unsettled payables — ${detail}. Only invoices due in this period count; take each one to PAYMENT_REQUESTED on the payables register, which is as settled as accounts-payable-svc can report (executing the payment belongs to Treasury).`;
    case "unsettled_ar_invoices_exist":
      return `Unsettled receivables — ${detail}. Only invoices due in this period count; each needs to reach PAID in accounts-receivable-svc.`;
    case "period_already_locked":
      return `Already closed — ${detail}. There is no unlock: a sealed period stays sealed, and a correction is posted as a reversing journal in a period that is still open.`;
    default:
      return issue;
  }
}

/** Turn a backend failure into something an operator can act on. */
export function explainCloseError(message: string): string {
  if (message.includes("evidence_not_recorded")) {
    return "The period WAS locked and the trial balance was filed in the vault, but the signed hash could not be recorded — so this close is not evidenced. This needs a person: the books are sealed and the record of what they said at the moment of sealing is missing. Do not treat the period as closed for audit purposes until that is resolved.";
  }
  if (message.includes("ledger_page_truncated")) {
    return "The ledger returned a full page, so there may be journals this service never saw. The close was refused rather than sealing a trial balance that could be incomplete — a close that fails can be retried, one that silently omitted journals cannot be detected afterwards.";
  }
  if (message.includes("readiness_check_failed")) {
    return "A service the close depends on could not be reached, so the period was not sealed. This is a fail-closed refusal, not a finding about the books — nothing was changed and it can be retried once the dependency is back.";
  }
  if (message.includes("close_failed")) {
    return "The trial balance could not be compiled or filed, so the period was not sealed. Nothing was changed.";
  }
  if (message.includes("period_already_locked")) {
    return "This period is already closed. There is no unlock — a correction is posted as a reversing journal in a period that is still open.";
  }
  if (message.includes("invalid_period_range")) {
    return "The period must end after it starts. A backwards window contains nothing, so every readiness check would pass and it would seal clean — an empty close over a range that cannot hold a transaction.";
  }
  if (message.includes("tenant_scope_missing")) {
    return "No verified tenant scope reached the service, so it failed closed. Sign in again.";
  }
  if (message.includes("forbidden") || message.includes("authorization_denied")) {
    return "Authorization denied — this principal does not hold the required permission on this legal entity. Registering a period, reading the register, and initiating a close are three separate grants (PERIOD_CLOSE_CONFIG, PERIOD_CLOSE_VIEW, PERIOD_CLOSE_INITIATE), so holding one does not imply the others.";
  }
  if (message.includes("authz_unavailable")) {
    return "Could not verify authorization, so the action was refused. authorization-svc is unreachable — this is a fail-closed refusal, not a denial.";
  }
  if (message.includes("identity_missing")) {
    return "No caller identity reached the service, so it failed closed. Sign in again.";
  }
  if (message.includes("period_not_found")) {
    return "No fiscal period with that id exists for this tenant. A period belonging to another tenant reads as absent in exactly the same way.";
  }
  if (message.includes("missing_fields")) {
    return "A required field was empty — a period needs a name, a start and an end.";
  }
  if (message.includes("store_unavailable")) {
    return "financial-close-svc could not reach its database. Nothing was written.";
  }
  return message;
}
