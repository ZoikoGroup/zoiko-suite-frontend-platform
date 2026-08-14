// bank-reconciliation-svc (:8102, /bank-reconciliation-svc through the gateway)
// — matches ingested bank statement lines against real ledger postings.
//
// It owns no money of its own. Every line it holds is a claim by the BANK about
// what happened; the ledger is the claim by the BUSINESS. Reconciling is the act
// of proving those two agree, one transaction at a time:
//
//     UNMATCHED ──▶ MATCHED          (a ledger journal accounts for this line)
//     UNMATCHED ──▶ EXCEPTION        (nothing accounts for it — queue it)
//     EXCEPTION ──▶ MATCHED          (the right journal was eventually found)
//
// MATCHED is terminal. An EXCEPTION is not a dead end — it is a queue item, and
// resolving one is the normal path out.
//
// ── What "matched" is allowed to mean ───────────────────────────────────────
//
// The caller names a journal; the service never takes that claim at face value.
// It fetches the journal from general-ledger-svc and requires ALL of:
//
//   - the journal exists and is FINALIZED (a draft has not hit the books)
//   - it belongs to the same legal entity as the statement line
//   - it moves EXACTLY this line's amount through this bank account's own
//     ledger account — same cents, and crucially the same DIRECTION
//
// That last clause is why `gl_cash_account_code` is required at ingest. Until it
// existed the check compared magnitudes, so a 500.00 payment OUT reconciled
// cleanly against a journal recording 500.00 IN — the exact error, or
// concealment, that reconciling is supposed to surface. Direction is read from
// which side of the journal the cash line falls on: a debit to the bank's own
// ledger account is money in, a credit is money out.
//
// A line ingested before that column existed carries no cash account, and the
// service REFUSES to match it (422 `cash_account_unknown`) rather than falling
// back to the weaker comparison.
//
// ── Sign convention ─────────────────────────────────────────────────────────
//
// `amount` is signed in bank terms: positive is money arriving in the account,
// negative is money leaving it. Zero is refused — it has no direction and
// reconciles against nothing.
//
// ── What it does not own ────────────────────────────────────────────────────
//
// There is no bank-account registry anywhere in this platform, so
// `bank_account_id` is a free UUID validated by nothing, and the mapping from it
// to a ledger account code is supplied per line rather than looked up. Nor is
// `currency_code` verifiable: general-ledger journals carry no currency at all,
// so a USD line and a EUR journal of the same magnitude are indistinguishable to
// the check. The panel says both out loud rather than implying a rigour that is
// not there.
//
// Reads are scoped to the caller's verified X-Tenant-Id. The register used to be
// scoped by a `tenant_id` query parameter, so any caller could read any tenant's
// entire bank history; nothing here sends one.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

export type StatementLineStatus = "UNMATCHED" | "MATCHED" | "EXCEPTION";

/** Wire shape of a statement line. Field names match the Go json tags exactly. */
export type StatementLine = {
  statement_line_id: string;
  tenant_id: string;
  legal_entity_id: string;
  /** Free UUID. No bank-account registry service exists to validate it against. */
  bank_account_id: string;
  statement_date: string;
  /** Signed, in bank terms: positive is money in, negative is money out. */
  amount: number;
  currency_code: string;
  bank_reference: string;
  status: StatementLineStatus;

  /** The ledger account representing this bank account. Null only for lines
   *  ingested before it was required — those cannot be matched at all. */
  gl_cash_account_code?: string | null;

  matched_journal_id?: string | null;
  matched_by_principal_id?: string | null;
  matched_at?: string | null;

  exception_reason?: string | null;
  flagged_by_principal_id?: string | null;
  flagged_at?: string | null;

  correlation_id: string;
  created_at: string;
};

/** Lifecycle order, for the stage meter. EXCEPTION is deliberately absent — it
 *  is a detour off this path, not a step along it. */
export const RECONCILIATION_STAGES: StatementLineStatus[] = ["UNMATCHED", "MATCHED"];

/** Whether this line still needs a decision from someone. */
export function isOpen(line: StatementLine): boolean {
  return line.status !== "MATCHED";
}

/**
 * Whether this line can be matched at all.
 *
 * A line with no cash account code is refused by the service, because the
 * direction of the match cannot be verified. The console disables the form
 * rather than letting the operator discover it at submit time — but the service
 * still checks, so this is an affordance, not the enforcement.
 */
export function canBeMatched(line: StatementLine): boolean {
  return line.status !== "MATCHED" && Boolean(line.gl_cash_account_code);
}

export type ListStatementLinesInput = {
  identity: Identity & { tenantId: string };
  bankAccountId?: string;
  statementDate?: string;
  status?: StatementLineStatus;
  limit?: number;
};

/**
 * List statement lines for the caller's tenant, newest first.
 *
 * Scoped by the X-Tenant-Id header only. The service bounds the page at 200 by
 * default and 1000 at most; a non-positive or oversized `limit` is refused (400)
 * rather than silently replaced, so a short page can never be mistaken for the
 * whole register.
 */
export async function listStatementLines(
  input: ListStatementLinesInput,
): Promise<ApiResult<StatementLine[]>> {
  const result = await apiGet<StatementLine[] | null>(
    "bankReconciliation",
    "/v1/statement-lines",
    {
      query: {
        bank_account_id: input.bankAccountId,
        statement_date: input.statementDate,
        status: input.status,
        limit: input.limit,
      },
      identity: input.identity,
    },
  );

  if (!result.ok) return result;
  // The service answers [] for an empty register; a null would be a lie about
  // shape rather than content, so it is normalised rather than trusted.
  if (result.data === null) return { ok: true, data: [] };

  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "bank-reconciliation-svc returned a non-array statement line list",
      },
    };
  }

  return { ok: true, data: result.data };
}

/**
 * Fetch one statement line by id.
 *
 * Tenant scope comes from the X-Tenant-Id header only, and the service answers
 * 401 when no verified scope reaches it at all. An unknown id and a line
 * belonging to another tenant both read as absent in exactly the same way —
 * deliberately, so a probe cannot confirm that a line exists.
 */
export async function getStatementLine(
  statementLineId: string,
  identity: Identity & { tenantId: string },
): Promise<ApiResult<StatementLine>> {
  return apiGet<StatementLine>(
    "bankReconciliation",
    `/v1/statement-lines/${statementLineId}`,
    { identity },
  );
}

export type IngestStatementLineInput = {
  identity: Identity & { principalId: string; tenantId: string; legalEntityId: string };
  bankAccountId: string;
  /** ISO date, e.g. "2026-08-13". */
  statementDate: string;
  /** Signed: positive money in, negative money out. Zero is refused. */
  amount: number;
  currencyCode: string;
  bankReference: string;
  /** The ledger account representing this bank account. Required — without it
   *  no future match against this line could verify direction. */
  glCashAccountCode: string;
};

/**
 * Ingest one bank statement line. It lands UNMATCHED and asserts nothing about
 * the ledger.
 *
 * 201 means a line was recorded; 200 means this replayed an existing one and
 * nothing was written — correlation_id is an idempotency key backed by a partial
 * unique index on (tenant_id, correlation_id), and a retry resolves to the
 * ORIGINAL line, id included.
 *
 * The row is written under the caller's VERIFIED tenant. A body naming a
 * different one is refused with 403 rather than quietly overridden.
 */
export async function ingestStatementLine(
  input: IngestStatementLineInput,
): Promise<ApiWriteResult<StatementLine>> {
  return apiPost<StatementLine>(
    "bankReconciliation",
    "/v1/statement-lines",
    {
      tenant_id: input.identity.tenantId,
      legal_entity_id: input.identity.legalEntityId,
      bank_account_id: input.bankAccountId,
      statement_date: `${input.statementDate}T00:00:00Z`,
      amount: input.amount,
      currency_code: input.currencyCode,
      bank_reference: input.bankReference,
      gl_cash_account_code: input.glCashAccountCode,
      correlation_id: crypto.randomUUID(),
    },
    { identity: input.identity },
  );
}

/**
 * Match a statement line to a ledger journal.
 *
 * The journal is verified against general-ledger-svc before anything is written:
 * FINALIZED, same legal entity, and the exact signed cash movement through this
 * line's ledger account. A failure here is a 400 and the line stays where it
 * was — nothing partial is recorded.
 */
export async function matchStatementLine(
  statementLineId: string,
  journalId: string,
  identity: Identity & { principalId: string; tenantId: string },
): Promise<ApiWriteResult<StatementLine>> {
  return apiPost<StatementLine>(
    "bankReconciliation",
    `/v1/statement-lines/${statementLineId}/match`,
    { journal_id: journalId },
    { identity },
  );
}

/**
 * Flag a statement line as an exception. Requires a reason: an exception with no
 * stated reason is not a useful queue item for whoever investigates it later.
 */
export async function flagException(
  statementLineId: string,
  reason: string,
  identity: Identity & { principalId: string; tenantId: string },
): Promise<ApiWriteResult<StatementLine>> {
  return apiPost<StatementLine>(
    "bankReconciliation",
    `/v1/statement-lines/${statementLineId}/exception`,
    { reason },
    { identity },
  );
}

export type CompleteStatementResponse = {
  tenant_id: string;
  bank_account_id: string;
  statement_date: string;
  status: string;
};

/**
 * Declare a statement reconciled for one bank account and date.
 *
 * Refused with 422 while any line is still UNMATCHED — an EXCEPTION counts as
 * resolved, because it has been looked at and recorded as unexplained, whereas
 * an UNMATCHED line has simply not been dealt with.
 *
 * `legalEntityId` is both what the caller is authorized against AND checked
 * against the lines themselves: naming an entity the caller holds rights over
 * while the bank account belongs to another is refused with 403
 * `legal_entity_mismatch`. Completing a bank account and date with no lines at
 * all is a 404 rather than a success, since announcing that a statement nobody
 * ingested has been reconciled is worse than saying nothing.
 *
 * This publishes reconciliation.completed and stores nothing — completion is a
 * derived signal, not a record. There is no "reopen".
 */
export async function completeStatement(
  bankAccountId: string,
  statementDate: string,
  identity: Identity & { principalId: string; tenantId: string; legalEntityId: string },
): Promise<ApiWriteResult<CompleteStatementResponse>> {
  const query = new URLSearchParams({ legal_entity_id: identity.legalEntityId });
  return apiPost<CompleteStatementResponse>(
    "bankReconciliation",
    `/v1/bank-accounts/${bankAccountId}/statements/${statementDate}/complete?${query}`,
    {},
    { identity },
  );
}

// ─── Derived views ───────────────────────────────────────────────────────────

export type ReconciliationStats = {
  unmatched: number;
  matched: number;
  exception: number;
  /** Lines nobody has dealt with yet. An EXCEPTION is NOT counted here: it has
   *  been looked at and recorded as unexplained, which is a different state of
   *  the world from untouched. */
  open: number;
  /** Net signed movement across the listed lines, in cents. */
  netCents: number;
};

export function summariseStatementLines(lines: StatementLine[]): ReconciliationStats {
  const stats: ReconciliationStats = {
    unmatched: 0,
    matched: 0,
    exception: 0,
    open: 0,
    netCents: 0,
  };

  for (const line of lines) {
    if (line.status === "UNMATCHED") stats.unmatched += 1;
    else if (line.status === "MATCHED") stats.matched += 1;
    else stats.exception += 1;
    stats.netCents += toCents(line.amount);
  }
  stats.open = stats.unmatched;

  return stats;
}

/** Exact cents. Rounded, not truncated: 12.34 * 100 lands on 1233.9999999999998
 *  in binary floating point and would truncate to 1233. */
export function toCents(value: number): number {
  return Math.round(value * 100);
}

/** A signed bank amount, with its direction stated rather than left to a minus
 *  sign the eye can skip. */
export function formatSignedAmount(value: number, currencyCode?: string): string {
  const magnitude = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = value < 0 ? "−" : "+";
  return currencyCode ? `${sign}${magnitude} ${currencyCode}` : `${sign}${magnitude}`;
}

/** "Money in" / "Money out" — the property this whole service turns on, said in
 *  words so it does not rest on a character one pixel wide. */
export function directionLabel(value: number): string {
  return value < 0 ? "Money out" : "Money in";
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Turn a backend failure into something an operator can act on. */
export function explainReconciliationError(message: string): string {
  if (message.includes("ledger_verification_failed")) {
    return "That journal does not account for this line, so nothing was matched. All four conditions have to hold: the journal must exist and be FINALIZED, belong to the same legal entity, move this exact amount through this bank account's ledger account, and move it in the SAME DIRECTION. A journal of the right size recording money in cannot reconcile a payment out.";
  }
  if (message.includes("cash_account_unknown")) {
    return "This line has no ledger account recorded for its bank account, so the direction of a match cannot be verified — and a match that cannot verify direction is refused rather than approximated. Lines ingested before that field was required are affected; re-ingest the line with a gl_cash_account_code.";
  }
  if (message.includes("ledger_service_unavailable")) {
    return "The journal could not be verified, so the match was refused. general-ledger-svc is unreachable — this is a fail-closed refusal, not a rejected journal. Nothing was written.";
  }
  if (message.includes("statement_incomplete")) {
    return "Some lines for this bank account and date are still UNMATCHED, so the statement cannot be declared reconciled. Match them, or flag the ones nothing explains as exceptions — an exception counts as resolved, an untouched line does not.";
  }
  if (message.includes("statement_not_found")) {
    return "No statement lines exist for that bank account and date, so there is nothing to reconcile. A statement nobody ingested is not the same as one with no problems.";
  }
  if (message.includes("legal_entity_mismatch")) {
    return "That bank account's lines belong to a different legal entity from the one this action was authorized against, so it was refused. The permission was real; it just does not cover this bank account.";
  }
  if (message.includes("invalid_transition")) {
    return "That move is not available from where this line currently is. MATCHED is terminal, and an exception can only be raised on a line that is still UNMATCHED. If the register looks out of date, reload it: the check and the move are one atomic update, so the service refused rather than acting on a stale reading.";
  }
  if (message.includes("tenant_scope_mismatch")) {
    return "The request named a different tenant from the one this session is verified as, so it was refused rather than served. This is an identity fault, not a data one.";
  }
  if (message.includes("tenant_scope_missing")) {
    return "No verified tenant scope reached the service, so it failed closed. Sign in again.";
  }
  if (message.includes("authorization_denied")) {
    return "Authorization denied — this principal does not hold the required permission on this legal entity. Ingesting, matching, flagging an exception and completing a statement are four separate grants (BANKREC_STATEMENT_INGEST, BANKREC_MATCH, BANKREC_FLAG_EXCEPTION, BANKREC_COMPLETE_STATEMENT), so holding one does not imply the others.";
  }
  if (message.includes("authorization_service_unavailable")) {
    return "Could not verify authorization, so the action was refused. authorization-svc is unreachable — this is a fail-closed refusal, not a denial.";
  }
  if (message.includes("identity_missing")) {
    return "No caller identity reached the service, so it failed closed. Sign in again.";
  }
  if (message.includes("statement_line_not_found")) {
    return "No statement line with that id exists for this tenant. A line belonging to another tenant reads as absent in exactly the same way.";
  }
  if (message.includes("invalid_identifier")) {
    return "One of the identifiers or the date was not in a valid format. This is a malformed request, not a service outage.";
  }
  if (message.includes("missing_field")) {
    return `A required field was empty: ${message.split("missing_field").pop()?.replace(/[^a-z_ ]/gi, " ").trim() || "check the form"}.`;
  }
  if (message.includes("invalid_field")) {
    return `That value was rejected: ${message.split("invalid_field").pop()?.replace(/["{}:,]/g, " ").trim() || "check the form"}.`;
  }
  if (message.includes("invalid_json")) {
    return "The service could not parse the request body. The detail above names the field that failed.";
  }
  if (message.includes("store_unavailable")) {
    return "bank-reconciliation-svc could not reach its database. Nothing was written.";
  }
  return message;
}
