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

// ─── Reading a period without reading the schema ─────────────────────────────
//
// The people who need to read a close — a financial controller, an auditor, the
// person doing the month-end — are not the people who wrote the service.
// `{"close_status":"LOCKED","evidence_document_id":null}` does not tell them
// whether the books are sealed, whether the seal is evidenced, or what they are
// still allowed to post.
//
// These helpers say what a record means in prose. They never alter or drop a
// stored value: the code the service holds stays visible next to the plain
// wording, on the doctrine the policy, governance and board consoles follow.

/** Badge tones, matching the vocabulary `Badge` accepts. */
export type CloseTone = "success" | "warning" | "danger" | "neutral" | "info";

export type CloseStatusDescription = {
  /** Short label for a badge — "Open", "Closed and sealed". */
  label: string;
  /** What the status means for the reader, and what it does not. */
  meaning: string;
  tone: CloseTone;
  /** The status exactly as stored. */
  raw: string;
  /** True once the period can no longer be posted into or closed. */
  sealed: boolean;
  unmapped: boolean;
};

const CLOSE_STATUS_MEANING: Record<
  CloseStatus,
  { label: string; meaning: string; tone: CloseTone; sealed: boolean }
> = {
  OPEN: {
    label: "Open",
    meaning:
      "The books for this period are still open. Journals can be posted into it, and " +
      "nothing about it is final. It can be closed once every journal for it has been " +
      "posted and every payable and receivable due in it has been settled.",
    tone: "warning",
    sealed: false,
  },
  LOCKED: {
    label: "Closed and sealed",
    meaning:
      "The books for this period are sealed. Nothing further can be posted into it, and " +
      "there is no way to reopen it — a correction is made by posting a reversing entry " +
      "into a period that is still open. A trial balance was filed as evidence at the " +
      "moment it was sealed.",
    tone: "success",
    sealed: true,
  },
  // Never written by any code path in the service today. It is described rather
  // than treated as unknown because the ledger refuses postings to it exactly as
  // it refuses them to LOCKED, so a reader must not be told the period is open.
  CLOSED: {
    label: "Closed",
    meaning:
      "The books for this period are closed and nothing further can be posted into it. " +
      "It carries a different code from the periods this console sealed, so it was closed " +
      "by some other means — if you need to know how, ask whoever operates the service.",
    tone: "success",
    sealed: true,
  },
};

/**
 * Say where a period stands.
 *
 * An unrecognised status is never reported as open. A period is the thing that
 * decides whether money may be posted, and the safe reading of a value we
 * cannot interpret is that it is not available to post into — the same way
 * general-ledger-svc itself fails closed when it cannot get an answer.
 */
export function describeCloseStatus(raw: string): CloseStatusDescription {
  const stored = raw?.trim() || "(empty)";
  const known = CLOSE_STATUS_MEANING[stored as CloseStatus];

  if (!known) {
    return {
      label: "Needs review",
      meaning:
        `The record holds the status "${stored}", which is not one this console knows how ` +
        "to read. It is deliberately not shown as open: nothing here can confirm the period " +
        "is safe to post into. Check with whoever operates the service before relying on it.",
      tone: "warning",
      raw: stored,
      sealed: true,
      unmapped: true,
    };
  }

  return { ...known, raw: stored, unmapped: false };
}

/**
 * Turn a machine-prefixed blocking reason into a sentence.
 *
 * The service returns `code: human detail`. The code is the part worth
 * explaining — an operator reading "unsettled_ap_invoices_exist" needs to know
 * WHERE to go and clear it — and the detail already carries the count.
 *
 * An unrecognised code is no longer passed through as it was sent. A reason a
 * reader cannot act on is the one thing a blocking list must not contain: it is
 * read as a task to clear, and `foo_check_failed: 3` names no task.
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
    // The service's detail here embeds the stored status code — "this period is
    // LOCKED and cannot be closed again". Read back as a label, with the code
    // kept in the sentence rather than dropped, since it is what an auditor
    // would quote.
    case "period_already_locked": {
      const stored = detail.match(/\b(OPEN|LOCKED|CLOSED)\b/)?.[1];
      const stands = stored
        ? `It is recorded as ${describeCloseStatus(stored).label.toLowerCase()} (${stored}).`
        : "";
      return `Already closed. ${stands} There is no unlock: a sealed period stays sealed, and a correction is posted as a reversing journal in a period that is still open.`.replace(
        /\s+/g,
        " ",
      );
    }
    default: {
      // The detail is the service's own prose and is usually a sentence; the
      // code before the colon is not. Keep the readable half, and mark the
      // code as something to quote rather than something to act on.
      const readable = detail || issue.trim();
      return `Something is outstanding for this period: ${readable}. This console has no plain wording for this check yet — the service calls it “${code.trim()}”, which is worth quoting if you have to report it.`;
    }
  }
}

/**
 * What a close failure carries beyond its message.
 *
 * financial-close-svc answers some refusals with a code the console can match on
 * and others — the envelope middleware's 401, a bare 500 — with something that
 * names a header, or with nothing at all. The status is the only thing present
 * in every case, so it is passed alongside rather than parsed back out of the
 * folded message string.
 */
export type CloseErrorContext = {
  /** The HTTP status, when the failure had one. */
  status?: number;
  /** What a 404 means for this particular action. */
  notFound?: string;
};

/** Strip the console's own framing off a refusal, leaving the service's words.
 *
 *  client.ts folds a failure into `financial-close-svc rejected the write (400)
 *  — <detail>`. That prefix is for a developer reading a log; quoting it back at
 *  a controller names a service and a status code they cannot act on. Only the
 *  detail is ever shown, and only as a marked quotation. */
function closeDetail(message: string): string {
  const separator = message.indexOf(" — ");
  return separator === -1 ? message : message.slice(separator + 3).trim();
}

/**
 * Turn a backend failure into something an operator can act on.
 *
 * Nothing here returns the service's phrasing on its own. A controller told
 * `invalid_json: parsing time "2026-07-01" as RFC3339` learns only that
 * something went wrong, and cannot tell whether the period was sealed — which
 * on this service is the one thing that matters, because a close cannot be
 * undone. Where no wording fits, the fallback says what happened and quotes the
 * service's words as a quotation, so the fact stays reportable without being
 * the answer.
 */
export function explainCloseError(message: string, context: CloseErrorContext = {}): string {
  // ── The one outcome that is not a failure to retry ────────────────────────
  //
  // Matched first, ahead of the status fallback and ahead of every dependency
  // branch, because it is the only case where the close DID happen. Anything
  // that reported it as "nothing was changed" would be actively wrong.
  if (message.includes("evidence_not_recorded")) {
    return "The period WAS locked and the trial balance was filed in the vault, but the signed hash could not be recorded — so this close is not evidenced. This needs a person: the books are sealed and the record of what they said at the moment of sealing is missing. Do not treat the period as closed for audit purposes until that is resolved.";
  }

  // ── The request never reached the service ────────────────────────────────
  //
  // These arrive as sentences already, but they name a port and a URL. The
  // period register degrades to a written empty state, while an action in the
  // same session would otherwise report the same outage as machine text.
  if (message.includes("is unreachable at")) {
    return "Nothing was changed. The service that holds the period register is not running, or cannot be reached from here — this is not something you entered. It has to be started before periods can be registered, checked, or closed.";
  }
  if (message.includes("did not respond within")) {
    return "Nothing was changed — but this one is worth confirming rather than assuming. The service did not answer in time, which does not by itself prove it did not act. Reload the register and check where the period stands before retrying a close.";
  }
  if (message.includes("non-JSON body")) {
    return "The service sent back something this console could not read, so it cannot say whether the period was sealed. Reload the register and check the period's status before doing anything else, and report it.";
  }

  // ── Refused before the handler ever saw the request ───────────────────────
  //
  // Checked ahead of the field branches: the envelope names its unmet fields —
  // `legal_entity_id`, `correlation_id` — in the same string, so a later match
  // on one of those would report a console fault as something the operator left
  // blank and send them back to a form that is already complete.
  if (message.includes("envelope_incomplete")) {
    return "Nothing was changed. The request was missing information the service requires on every change. This is a fault in the console rather than in anything you entered — report it rather than retyping the form.";
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
  // The service's own comment for this case names Go's time parser. The reader
  // filled in two date boxes, so that is what the message is about: the dates
  // are the only part of this form that can fail to parse.
  if (message.includes("invalid_json")) {
    return "Nothing was saved. The service could not read the request this console sent — on this form that is almost always the dates. Re-pick the start and end dates and try again; if it happens with dates picked from the calendar, it is a fault in the console and worth reporting.";
  }
  if (message.includes("request_too_large")) {
    return "Nothing was saved. The request was larger than the service accepts. Shorten the period name and try again.";
  }
  if (message.includes("store_unavailable")) {
    return "The service could not reach its database, and nothing was written. This is an outage rather than anything you entered — if it keeps happening it needs looking into.";
  }

  // ── Status-based fallback ────────────────────────────────────────────────
  //
  // The branch that catches whatever the service adds later without the console
  // being taught its wording. Deliberately conservative about what it claims:
  // on this service a 5xx cannot promise "nothing was changed", because the one
  // 500 that exists means the opposite — and it is matched above.
  switch (context.status) {
    case 400:
      return "The service rejected this as invalid and saved nothing. Check what you entered and try again.";
    case 401:
      return "The service no longer accepts this session. Sign in again and repeat this.";
    case 403:
      return "You do not have permission to do this for this company. Reading the register, registering a period, and closing one are three separate permissions, so holding one does not imply the others — whoever administers access can grant the rest.";
    case 404:
      return (
        context.notFound ??
        "Nothing on record matches the period given. Check the reference against the register — it may have been registered for a different company from the one you are signed in to."
      );
    case 409:
      return "This clashes with something already on record, so nothing was saved. Reload the register to see what is there now.";
    case 413:
      return "Nothing was saved. The request was larger than the service accepts. Shorten the period name and try again.";
    case 422:
      return "The close was refused: the period is not ready, or it is already sealed. The period is untouched — check its readiness for the current reasons.";
    case 503:
      return "Nothing was changed. Something the close depends on was unavailable, so it was refused rather than sealing the books over an unknown. Try again once it is back.";
    default:
      break;
  }
  if (context.status !== undefined && context.status >= 500) {
    return "The service failed while handling this. Reload the register and check where the period stands before retrying — on a close, this console cannot tell from the failure alone whether the books were sealed.";
  }

  // Last resort. The service's own words are quoted rather than presented as
  // the answer: a reader cannot act on them, but whoever they report this to
  // can, and dropping them would make the refusal unreportable.
  return (
    "The close service refused this. It gave a reason this console does not have wording " +
    `for yet, repeated here as it was sent: “${closeDetail(message)}”. Reload the register ` +
    "to see where the period stands, and report that wording if it keeps happening."
  );
}
