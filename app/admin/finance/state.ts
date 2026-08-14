// Shared contract between the accounts-payable Server Actions and the forms that
// call them.
//
// This lives outside actions.ts deliberately: a "use server" file may only export
// async functions, so the initial-state constant cannot live there.

import type { InvoiceStatus } from "@/lib/api/accounts-payable";
import type { StatementLineStatus } from "@/lib/api/bank-reconciliation";
import type { JournalStatus } from "@/lib/api/general-ledger";

/**
 * Outcomes of a payables write.
 *
 * `replayed` is separate from `recorded` because the service is idempotent on
 * (tenant_id, correlation_id) and answers 200 with the ORIGINAL invoice on a
 * retry — reporting that as a second invoice would overstate the liability on
 * the books, which is exactly what the idempotency exists to prevent.
 *
 * `out-of-sequence` is separate from `error` because a 422 here is a fact about
 * the record, not a failure of the attempt: the invoice was simply not in the
 * stage this transition moves out of. Rendering it red would call a correct
 * refusal a malfunction.
 *
 * `duplicate` is likewise a fact about the register — this vendor already has an
 * invoice under this number — and has a remedy the operator can act on. It only
 * became expressible once the service stopped reporting the collision as 503
 * `store_unavailable`, which was indistinguishable from a dead database.
 */
export type PayableActionState = {
  status:
    | "idle"
    | "recorded"
    | "replayed"
    | "advanced"
    | "out-of-sequence"
    | "duplicate"
    | "error";
  message: string;
  /** Echoed back so the UI can name what was acted on, and so the operator has
   *  the id without hunting the register for the row they just created. */
  invoiceId?: string;
  /** The stage the invoice now sits in, for the banner's wording. */
  stage?: InvoiceStatus;
};

export const IDLE_PAYABLE_STATE: PayableActionState = { status: "idle", message: "" };

/** Currencies the intake form offers. The column is VARCHAR(3) and the service
 *  accepts any three-letter code; these are the ones the demo entities transact
 *  in, matching the commercial-ops forms. */
export const CURRENCIES = ["GBP", "EUR", "USD", "INR"] as const;

// ─── general-ledger-svc ──────────────────────────────────────────────────────

/**
 * Outcomes of a general ledger write.
 *
 * Four of these are deliberately not `error`, because each is a true statement
 * about the journal rather than a failure of the service, and each has a
 * different remedy:
 *
 *  - `unbalanced` — the debits and credits do not agree, so validation refused
 *    and the journal is still PENDING. A draft is ALLOWED to be unbalanced, so
 *    this is a normal stop on the way, not a malfunction. The fix is to correct
 *    the lines and file it again.
 *  - `period-locked` — financial-close-svc reports the fiscal period CLOSED or
 *    LOCKED, so nothing was written. The books are shut, which is the system
 *    working; the fix is a different period, or reopening this one.
 *  - `out-of-sequence` — a 422 on a transition. The journal simply was not in
 *    the stage that transition moves out of, usually because the register on
 *    screen is a moment behind the ledger.
 *  - `replayed` — the service is idempotent on (tenant_id, correlation_id) and
 *    resolved a retry to the ORIGINAL journal. Rendering it as a success would
 *    claim a second posting that does not exist, which is the precise thing the
 *    idempotency key prevents.
 */
export type LedgerActionState = {
  status:
    | "idle"
    | "recorded"
    | "replayed"
    | "advanced"
    | "reversed"
    | "unbalanced"
    | "period-locked"
    | "out-of-sequence"
    | "error";
  message: string;
  /** Echoed back so the operator has the id without hunting the register for the
   *  row they just created. On a reversal this is the REVERSING journal. */
  journalId?: string;
  stage?: JournalStatus;
};

export const IDLE_LEDGER_STATE: LedgerActionState = { status: "idle", message: "" };

// ─── financial-close-svc ─────────────────────────────────────────────────────

/**
 * Outcomes of a financial close write.
 *
 * `blocked` is the important one, and it is not an error: the period has
 * outstanding items, which is the close doing its job. It carries the reasons
 * so the panel can list them rather than printing one line of prose.
 *
 * `unevidenced` is the outcome that needs a human. The period IS locked and the
 * trial balance IS in the vault, but the signed hash was not persisted — so the
 * books are sealed and the record of what they said at the moment of sealing is
 * missing. It is separated from `error` because the remedy is completely
 * different: nothing can be retried, and the close must not be treated as
 * evidenced.
 */
export type CloseActionState = {
  status:
    | "idle"
    | "registered"
    | "replayed"
    | "closed"
    | "blocked"
    | "ready"
    | "unevidenced"
    | "error";
  message: string;
  periodId?: string;
  /** Populated on `blocked` and `ready` — the readiness check's findings. */
  blockingIssues?: string[];
};

export const IDLE_CLOSE_STATE: CloseActionState = { status: "idle", message: "" };

// ─── bank-reconciliation-svc ─────────────────────────────────────────────────

/**
 * Outcomes of a bank reconciliation write.
 *
 * Four of these are deliberately not `error`, because each is a true statement
 * about the reconciliation rather than a failure of the service:
 *
 *  - `unverified` — the named journal does not account for this line. The most
 *    important case by far is a DIRECTION mismatch: a journal of exactly the
 *    right size that moved money the other way. It is separated from `error`
 *    because the service worked perfectly; it is the proposed match that is
 *    wrong, and that refusal is the entire value of reconciling.
 *  - `unverifiable` — the line has no ledger account recorded for its bank
 *    account, so direction cannot be checked at all. Distinct from `unverified`
 *    because nothing about the journal is wrong: the line itself is missing the
 *    information, and no journal would satisfy it.
 *  - `incomplete` — the statement still has UNMATCHED lines, so it cannot be
 *    declared reconciled. That is the check doing its job.
 *  - `replayed` — the service is idempotent on (tenant_id, correlation_id) and
 *    resolved a retry to the ORIGINAL line. Reporting it as a second ingest
 *    would double a bank transaction in the register, which is precisely what
 *    the idempotency key prevents.
 */
export type ReconciliationActionState = {
  status:
    | "idle"
    | "ingested"
    | "replayed"
    | "matched"
    | "flagged"
    | "completed"
    | "unverified"
    | "unverifiable"
    | "incomplete"
    | "out-of-sequence"
    | "error";
  message: string;
  /** Echoed back so the operator has the id without hunting the register for
   *  the row they just created. */
  statementLineId?: string;
  stage?: StatementLineStatus;
};

export const IDLE_RECONCILIATION_STATE: ReconciliationActionState = { status: "idle", message: "" };

/** How many line rows the record-journal form starts with and allows.
 *
 *  Two is the minimum that can balance, and every posting this form exists to
 *  make has at least a debit and a credit. The cap is a form limit, not a
 *  service one — the service accepts any number of lines. */
export const JOURNAL_LINE_SLOTS = { initial: 2, max: 10 } as const;
