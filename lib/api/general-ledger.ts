// general-ledger-svc (:8098, /general-ledger-svc through the gateway) — the
// authoritative record of journalized financial postings.
//
// This is the hub of the Finance domain: treasury-svc, financial-close-svc,
// bank-reconciliation-svc, intercompany-accounting-svc and consolidation-svc
// all read it, and bank reconciliation will only match a bank line against a
// journal this service reports as FINALIZED.
//
// The lifecycle is the spec's Tri-Phase Commit, plus one terminal state:
//
//     PENDING ──▶ VALIDATED ──▶ FINALIZED ──▶ REVERSED
//
// Three properties of it are worth stating plainly, because they are the reason
// the register looks the way it does:
//
//  - PENDING is a draft and is ALLOWED to be unbalanced. The double-entry
//    invariant — sum(debits) == sum(credits) — is enforced at the VALIDATED
//    hop, not at creation, so a half-written journal is a normal thing to see.
//  - FINALIZED is immutable. No finalized journal may be hard-edited; the only
//    sanctioned correction is a reversal.
//  - A reversal never touches the original. It posts a BRAND-NEW journal whose
//    lines are the exact debit/credit inverse, already FINALIZED, and marks the
//    original REVERSED. Both halves commit in one transaction, so the books
//    cannot end up holding a posting and its inverse as two live entries.
//
// Two things the service does not own, which the UI has to say out loud because
// no form can imply them:
//
//  - `account_code` is a free string, validated by nothing. No Chart of Accounts
//    service exists anywhere in this platform, so a typo produces a perfectly
//    valid posting against an account that does not exist.
//  - `fiscal_period` is likewise a plain string ("2026-07"). There is no fiscal
//    calendar service. What DOES check it is financial-close-svc: creating or
//    posting into a period it reports CLOSED or LOCKED is refused with 412.
//
// Reads are scoped to the caller's verified X-Tenant-Id, not to a tenant_id
// query parameter. Sending one that disagrees is refused with 403 rather than
// answered — see the note on listJournals.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

export type JournalStatus = "PENDING" | "VALIDATED" | "FINALIZED" | "REVERSED";

/** Wire shape of a journal header. Field names match the Go json tags exactly. */
export type JournalHeader = {
  journal_id: string;
  tenant_id: string;
  legal_entity_id: string;
  /** Plain string reference, e.g. "2026-07". No fiscal calendar service exists. */
  fiscal_period: string;
  status: JournalStatus;
  /** Set only on a reversing journal, pointing at the journal it reverses. */
  reversal_of_journal_id?: string | null;
  /** Atomic Linking references: the upstream event and/or governance decision
   *  that caused this posting. Both null for a manually-entered journal —
   *  nothing is fabricated when there is no real link to carry. */
  source_event_id?: string | null;
  governance_decision_id?: string | null;
  description: string;
  created_by_principal_id: string;
  validated_by_principal_id?: string | null;
  posted_by_principal_id?: string | null;
  reversed_by_principal_id?: string | null;
  correlation_id: string;
  created_at: string;
  validated_at?: string | null;
  posted_at?: string | null;
  reversed_at?: string | null;
};

export type JournalLine = {
  journal_line_id: string;
  journal_id: string;
  line_number: number;
  account_code: string;
  debit_amount: number;
  credit_amount: number;
  description?: string;
  /** Null unless the line has a tax component. tax_logic_snapshot_id is always
   *  null in practice — no TaxLogicSnapshot-producing service exists yet. */
  tax_code?: string | null;
  tax_logic_snapshot_id?: string | null;
};

/** What the read endpoints and every write return: the header plus its lines. */
export type JournalWithLines = JournalHeader & { lines: JournalLine[] | null };

/** The two plain transitions, named after their route segments. Reversal is not
 *  one of them: it takes a body and posts a second journal, so it has its own
 *  function. */
export type JournalAction = "validate" | "post";

export function isJournalAction(value: string): value is JournalAction {
  return value === "validate" || value === "post";
}

/**
 * The one legal next hop out of each state.
 *
 * Single source of truth for the register's per-row button. Deriving the action
 * from the row's own status is what keeps the console from offering a
 * transition the service would refuse — the service still checks it atomically
 * with `WHERE status = <expected>`, so this is an affordance, not the
 * enforcement.
 *
 * FINALIZED's next hop is a reversal, which is deliberately NOT modelled here:
 * it needs a reason and an inverse posting, so it is a form, not a button.
 */
export const NEXT_STEP: Record<
  JournalStatus,
  { action: JournalAction; label: string; becomes: JournalStatus } | null
> = {
  PENDING: { action: "validate", label: "Validate", becomes: "VALIDATED" },
  VALIDATED: { action: "post", label: "Post to ledger", becomes: "FINALIZED" },
  FINALIZED: null,
  REVERSED: null,
};

/** Lifecycle order, for the stage meter and "step 2 of 3" wording. */
export const JOURNAL_STAGES: JournalStatus[] = ["PENDING", "VALIDATED", "FINALIZED"];

export function stageIndex(status: JournalStatus): number {
  // REVERSED sits past the end of the linear path rather than on it.
  return JOURNAL_STAGES.indexOf(status);
}

export type ListJournalsInput = {
  identity: Identity & { tenantId: string };
  legalEntityId?: string;
  fiscalPeriod?: string;
  status?: JournalStatus;
  limit?: number;
};

/**
 * List journals for the caller's tenant, newest first.
 *
 * Scoped by the X-Tenant-Id header, NOT by a tenant_id query parameter. The
 * service used to filter by whatever tenant_id the query named, so any caller
 * could read any tenant's entire ledger; it now takes the verified header as
 * authoritative and refuses a query parameter that disagrees with 403. Nothing
 * here sends one — the header alone is both necessary and sufficient — so a 403
 * from this call would mean the identity itself is wrong.
 *
 * The service bounds the page at 200 by default and 1000 at most, so a very
 * long ledger comes back truncated rather than slowly. `limit` asks for a
 * specific size; a non-positive one is refused (400) rather than silently
 * replaced.
 */
export async function listJournals(input: ListJournalsInput): Promise<ApiResult<JournalHeader[]>> {
  const result = await apiGet<JournalHeader[] | null>("generalLedger", "/v1/journals", {
    query: {
      legal_entity_id: input.legalEntityId,
      fiscal_period: input.fiscalPeriod,
      status: input.status,
      limit: input.limit,
    },
    identity: input.identity,
  });

  if (!result.ok) return result;
  // The service answers [] for an empty ledger, but a null would be a lie about
  // shape rather than about content, so it is normalised rather than trusted.
  if (result.data === null) return { ok: true, data: [] };

  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: { kind: "malformed", message: "general-ledger-svc returned a non-array journal list" },
    };
  }

  return { ok: true, data: result.data };
}

/**
 * Fetch one journal with all of its lines.
 *
 * Tenant scope comes from the X-Tenant-Id header only. Another tenant's
 * journal, an unknown id, and a malformed one all read as absent in exactly the
 * same way — deliberately, so a probe cannot confirm that a journal exists.
 */
export async function getJournal(
  journalId: string,
  identity: Identity & { tenantId: string },
): Promise<ApiResult<JournalWithLines>> {
  return apiGet<JournalWithLines>("generalLedger", `/v1/journals/${journalId}`, { identity });
}

export type CreateJournalLineInput = {
  accountCode: string;
  /** Exactly one of these is greater than zero. The service refuses a line with
   *  both set, with neither set, or with a negative amount. */
  debitAmount?: number;
  creditAmount?: number;
  description?: string;
};

export type CreateJournalInput = {
  identity: Identity & { principalId: string; tenantId: string; legalEntityId: string };
  fiscalPeriod: string;
  description: string;
  lines: CreateJournalLineInput[];
};

/**
 * Record a journal. It lands PENDING and posts nothing to the books.
 *
 * 201 means a journal was created; 200 means this replayed an existing one and
 * nothing was written — correlation_id is a required idempotency key backed by a
 * partial unique index on (tenant_id, correlation_id), and a retry resolves to
 * the ORIGINAL journal in full. Reporting a replay as a second journal would be
 * a lie about what is on the books, which is the entire point of the key.
 *
 * Refused with 412 `period_locked` if financial-close-svc reports the fiscal
 * period CLOSED or LOCKED, and with 503 if that service cannot be reached: the
 * period check fails closed, so an unreachable close service blocks posting
 * rather than waving it through.
 */
export async function createJournal(
  input: CreateJournalInput,
): Promise<ApiWriteResult<JournalWithLines>> {
  return apiPost<JournalWithLines>(
    "generalLedger",
    "/v1/journals",
    {
      tenant_id: input.identity.tenantId,
      legal_entity_id: input.identity.legalEntityId,
      fiscal_period: input.fiscalPeriod,
      description: input.description,
      lines: input.lines.map((line) => ({
        account_code: line.accountCode,
        debit_amount: line.debitAmount ?? 0,
        credit_amount: line.creditAmount ?? 0,
        description: line.description,
      })),
      correlation_id: crypto.randomUUID(),
    },
    { identity: input.identity },
  );
}

/**
 * Advance a journal one stage: PENDING → VALIDATED, or VALIDATED → FINALIZED.
 *
 * Neither takes a body — the actor comes from X-Principal-Id and the target
 * state is implied by the route. Each is a distinct authorization action
 * (GL_JOURNAL_VALIDATE / GL_JOURNAL_POST), so holding one grant does not imply
 * the next.
 *
 * `validate` is where the double-entry invariant is enforced: an unbalanced
 * journal is refused with 422 `unbalanced_journal` and stays PENDING. `post` is
 * the immutability boundary — after it, the only correction is a reversal.
 */
export async function advanceJournal(
  journalId: string,
  action: JournalAction,
  identity: Identity & { principalId: string; tenantId: string },
): Promise<ApiWriteResult<JournalHeader>> {
  return apiPost<JournalHeader>("generalLedger", `/v1/journals/${journalId}/${action}`, {}, { identity });
}

/**
 * Reverse a FINALIZED journal.
 *
 * Posts a new journal whose lines are the exact debit/credit inverse of the
 * original, already FINALIZED, and marks the original REVERSED — both in one
 * transaction. Returns the REVERSING journal, not the original.
 *
 * 201 is a reversal that happened; 200 is a replay of one that already had.
 * Only a FINALIZED journal is reversible, and a reversal is itself not
 * reversible: correcting a reversal means posting a fresh journal.
 */
export async function reverseJournal(
  journalId: string,
  reason: string,
  identity: Identity & { principalId: string; tenantId: string },
): Promise<ApiWriteResult<JournalWithLines>> {
  return apiPost<JournalWithLines>(
    "generalLedger",
    `/v1/journals/${journalId}/reverse`,
    { reason, correlation_id: crypto.randomUUID() },
    { identity },
  );
}

// ─── Derived views ───────────────────────────────────────────────────────────

export type LedgerStats = {
  pending: number;
  validated: number;
  finalized: number;
  reversed: number;
  /** Journals awaiting a decision — PENDING or VALIDATED. Nothing in these has
   *  reached the books yet. */
  inFlight: number;
};

export function summariseJournals(journals: JournalHeader[]): LedgerStats {
  const stats: LedgerStats = { pending: 0, validated: 0, finalized: 0, reversed: 0, inFlight: 0 };

  for (const journal of journals) {
    if (journal.status === "PENDING") stats.pending += 1;
    else if (journal.status === "VALIDATED") stats.validated += 1;
    else if (journal.status === "FINALIZED") stats.finalized += 1;
    else stats.reversed += 1;
  }
  stats.inFlight = stats.pending + stats.validated;

  return stats;
}

/** Totals for one journal's lines, in the same units the service stores. */
export function totalLines(lines: JournalLine[] | null | undefined): {
  debit: number;
  credit: number;
  balanced: boolean;
} {
  const debit = (lines ?? []).reduce((sum, line) => sum + line.debit_amount, 0);
  const credit = (lines ?? []).reduce((sum, line) => sum + line.credit_amount, 0);
  // Compared in minor units. Summing decimal amounts in binary floating point
  // leaves 0.1 + 0.2 !== 0.3, and this figure decides whether the panel says a
  // journal balances — the service itself compares exact cents from Postgres.
  return { debit, credit, balanced: Math.round(debit * 100) === Math.round(credit * 100) };
}

/** A journal amount, in the tenant's own presentation. No currency code exists
 *  on a journal line — the ledger carries amounts, and the entity's reporting
 *  currency lives outside this service — so no symbol is invented. */
export function formatAmount(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Turn a backend failure into something an operator can act on. */
export function explainLedgerError(message: string): string {
  if (message.includes("unbalanced_journal")) {
    return "This journal does not balance — the debits and the credits must total exactly the same. It has been left PENDING and nothing was posted. A draft is allowed to be unbalanced; validation is where the double-entry invariant is enforced.";
  }
  if (message.includes("only_finalized_reversible")) {
    return "Only a FINALIZED journal can be reversed. A journal that has not been posted yet has not affected the books, so there is nothing to reverse — and a reversal itself is never reversible: correct it by posting a fresh journal.";
  }
  if (message.includes("period_locked")) {
    return "That fiscal period is CLOSED or LOCKED in financial-close-svc, so nothing was written. Postings into a closed period are refused rather than queued — reopen the period, or file the entry against an open one.";
  }
  if (message.includes("close_check_failed")) {
    return "The fiscal period could not be checked, so the posting was refused. financial-close-svc is unreachable — this is a fail-closed refusal, not a locked period. Nothing was written.";
  }
  if (message.includes("invalid_transition")) {
    return "That stage is not reachable from where this journal currently is. The lifecycle is strictly sequential — PENDING → VALIDATED → FINALIZED — and no stage can be skipped or repeated. If the register looks out of date, reload it: the check and the move are one atomic update, so the service refused rather than acting on a stale reading.";
  }
  if (message.includes("tenant_scope_mismatch")) {
    return "The request named a different tenant from the one this session is verified as, so it was refused rather than served. This is an identity fault, not a data one.";
  }
  if (message.includes("tenant_scope_missing")) {
    return "No verified tenant scope reached the service, so it failed closed. Sign in again.";
  }
  if (message.includes("authorization_denied")) {
    return "Authorization denied — this principal does not hold the required permission on this legal entity. Recording, validating, posting and reversing are four separate grants (GL_JOURNAL_CREATE, GL_JOURNAL_VALIDATE, GL_JOURNAL_POST, GL_JOURNAL_REVERSE), so holding one does not imply the next.";
  }
  if (message.includes("authorization_service_unavailable")) {
    return "Could not verify authorization, so the action was refused. authorization-svc is unreachable — this is a fail-closed refusal, not a denial.";
  }
  if (message.includes("identity_missing")) {
    return "No caller identity reached the service, so it failed closed. Sign in again.";
  }
  if (message.includes("journal_not_found")) {
    return "No journal with that id exists for this tenant. A journal belonging to another tenant, and an id that is not a UUID at all, both read as absent in exactly the same way.";
  }
  if (message.includes("no_lines")) {
    return "A journal needs at least one line. Nothing was written.";
  }
  if (message.includes("invalid_line")) {
    return "Every line must carry exactly one of a debit or a credit, and it must be greater than zero. A line with both, with neither, or with a negative amount is refused.";
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
    return "general-ledger-svc could not reach its database. Nothing was written.";
  }
  return message;
}
