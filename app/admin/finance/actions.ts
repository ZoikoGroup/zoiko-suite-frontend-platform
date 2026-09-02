"use server";

// Server Actions that WRITE to accounts-payable-svc (:8099) and
// general-ledger-svc (:8098) — the two writable services behind /admin/finance.
//
// Server Actions are reachable by direct POST, not only through this UI, so the
// session is verified inside every action rather than relying on the proxy's
// /admin matcher.
//
// None of these actions decide whether the caller is allowed to act — that is
// authorization-svc's job, checked inside accounts-payable-svc on every mutation
// and failing closed. The session lookup here establishes *who is asking*; it
// deliberately does not pre-empt the backend's answer, so the console can never
// grant something the governance plane would refuse.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createVendorInvoice,
  advanceVendorInvoice,
  getVendorInvoice,
  explainPayableError,
  isInvoiceAction,
  NEXT_STEP,
  type InvoiceAction,
} from "@/lib/api/accounts-payable";
import {
  createJournal,
  advanceJournal,
  reverseJournal,
  getJournal,
  explainLedgerError,
  isJournalAction,
  totalLines,
  formatAmount,
  NEXT_STEP as JOURNAL_NEXT_STEP,
  JOURNAL_TYPES,
  type CreateJournalLineInput,
  type JournalAction,
  type JournalType,
} from "@/lib/api/general-ledger";
import {
  ingestStatementLine,
  matchStatementLine,
  flagException,
  completeStatement,
  getStatementLine,
  explainReconciliationError,
  formatSignedAmount,
  directionLabel,
} from "@/lib/api/bank-reconciliation";
import {
  createFiscalPeriod,
  checkPeriodReadiness,
  lockFiscalPeriod,
  explainCloseError,
  explainBlockingIssue,
  type PeriodLockResult,
} from "@/lib/api/financial-close";
import {
  issueCustomerInvoice,
  sendCustomerInvoice,
  markCustomerInvoiceOverdue,
  receiveCustomerInvoicePayment,
  explainAccountsReceivableError,
} from "@/lib/api/accounts-receivable";
import { formatMoney } from "@/lib/format";
import type { LookupState } from "@/components/admin/shared/lookup";
import {
  isReceivableHop,
  type CloseActionState,
  type LedgerActionState,
  type PayableActionState,
  type ReceivableActionState,
  type ReconciliationActionState,
} from "./state";

// Writes end in refresh(), not revalidatePath. Nothing on this route is cached
// — cacheComponents is off and every panel reads cookies() for the session — so
// there was no cache for revalidatePath to invalidate, while in a Server
// Function it additionally refreshes every previously visited page. refresh()
// re-renders just this route, which is what these actions actually want.

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };
}

const EXPIRED: PayableActionState = {
  status: "error",
  message: "Your session has expired — sign in again.",
};

/**
 * Record a vendor invoice from the intake form. It lands RECEIVED.
 *
 * 201 means an invoice was created. 200 means the service recognised the request
 * as a replay and wrote nothing — reported as such rather than as a second
 * successful intake, because a duplicated liability is what the idempotency is
 * there to prevent.
 */
export async function recordVendorInvoice(
  _previous: PayableActionState,
  formData: FormData,
): Promise<PayableActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const vendorId = String(formData.get("vendor_id") ?? "").trim();
  const invoiceNumber = String(formData.get("invoice_number") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const currencyCode = String(formData.get("currency_code") ?? "").trim();
  const dueDateRaw = String(formData.get("due_date") ?? "").trim();

  if (!vendorId) {
    return {
      status: "error",
      message:
        "A vendor reference is required. Nothing validates it — no Vendor Master service exists — so it is also the one field a typo passes silently.",
    };
  }
  if (!invoiceNumber) {
    return { status: "error", message: "The vendor's invoice number is required." };
  }

  const amount = Number(amountRaw);
  if (amountRaw === "" || !Number.isFinite(amount) || amount <= 0) {
    return { status: "error", message: "Amount must be a number greater than zero." };
  }
  if (!currencyCode) return { status: "error", message: "Currency is required." };

  // The service now accepts a bare "2026-09-01" as well as RFC3339 — due_date is
  // a DATE column, so a day is the honest unit. This still sends the explicit
  // instant: it pins the value to UTC midnight rather than relying on the
  // service's parsing, and a date input is validated here anyway so a direct POST
  // is held to the same contract.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDateRaw)) {
    return { status: "error", message: "A due date is required, as YYYY-MM-DD." };
  }
  const dueDate = `${dueDateRaw}T00:00:00Z`;

  const result = await createVendorInvoice({
    identity,
    vendorId,
    invoiceNumber,
    amount,
    currencyCode,
    dueDate,
  });

  if (!result.ok) {
    // 409 is a re-keyed invoice number, not a failure of the service. Kept apart
    // from `error` so the banner reads as "that number is already on the
    // register" rather than as something broken — this used to arrive as a 503
    // and was reported as an outage.
    if (result.error.status === 409) {
      return {
        status: "duplicate",
        message: `${vendorId} already has an invoice numbered ${invoiceNumber} on this tenant's register, so nothing was written. (vendor, invoice number) is unique — if this is a genuinely different invoice, check the number with the vendor; if it is the same one, it is already recorded.`,
      };
    }
    return { status: "error", message: explainPayableError(result.error.message) };
  }

  refresh();

  const invoice = result.data;
  const money = formatMoney(invoice.amount, invoice.currency_code);

  return result.status === 201
    ? {
        status: "recorded",
        invoiceId: invoice.invoice_id,
        stage: invoice.status,
        message: `Invoice ${invoice.invoice_number} recorded for ${money}, status ${invoice.status} — ID ${invoice.invoice_id}. It authorises no payment: validation, approval, and a payment request are three further steps, each a separate grant.`,
      }
    : {
        status: "replayed",
        invoiceId: invoice.invoice_id,
        stage: invoice.status,
        message: `No new invoice written — this replayed an existing one (${invoice.invoice_number}, ${money}, currently ${invoice.status}, ID ${invoice.invoice_id}). The service is idempotent on correlation ID, so a retried submit resolves to the original rather than booking the liability twice.`,
      };
}

/**
 * Advance one invoice by one stage.
 *
 * The action comes from the form because the register derives it from the row's
 * own status, but it is re-checked here: a Server Action is reachable by direct
 * POST, so an arbitrary route segment must not reach the service. The stage
 * check itself stays with the backend, which does it as one atomic UPDATE.
 */
export async function advanceInvoice(
  _previous: PayableActionState,
  formData: FormData,
): Promise<PayableActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const rawAction = String(formData.get("action") ?? "").trim();

  if (!invoiceId) return { status: "error", message: "Missing invoice ID." };
  if (!isUuid(invoiceId)) {
    // The service now answers 404 for a malformed id rather than 503, so this
    // check is no longer load-bearing — it is kept to save a pointless round trip
    // and to say "that is not an id" instead of "no such invoice".
    return { status: "error", message: "An invoice ID must be a UUID." };
  }
  if (!isInvoiceAction(rawAction)) {
    return { status: "error", message: "Unrecognised transition." };
  }
  const action: InvoiceAction = rawAction;

  const result = await advanceVendorInvoice(invoiceId, action, identity);

  if (!result.ok) {
    if (result.error.status === 422) {
      return { status: "out-of-sequence", message: explainPayableError(result.error.message) };
    }
    return { status: "error", message: explainPayableError(result.error.message) };
  }

  refresh();

  const invoice = result.data;
  const next = NEXT_STEP[invoice.status];

  return {
    status: "advanced",
    invoiceId: invoice.invoice_id,
    stage: invoice.status,
    message:
      invoice.status === "PAYMENT_REQUESTED"
        ? `${invoice.invoice_number} is now PAYMENT_REQUESTED and attributed to you. Terminal here — a payment.requested event has been published, and executing the payment belongs to Treasury, not this service. No further transition is possible.`
        : `${invoice.invoice_number} is now ${invoice.status}, attributed to you. Next: ${next?.label ?? "none"} — a separate authorization grant.`,
  };
}

/**
 * Read one invoice by id.
 *
 * The full record, which the register's table cannot show: every actor and
 * timestamp along the lifecycle, and the correlation id that ties the invoice to
 * its events elsewhere in the suite.
 */
export async function lookupVendorInvoice(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const invoiceId = String(formData.get("lookup_invoice_id") ?? "").trim();
  if (!invoiceId) return { status: "error", message: "Enter an invoice ID." };
  if (!isUuid(invoiceId)) {
    return { status: "error", message: "An invoice ID must be a UUID." };
  }

  const result = await getVendorInvoice(invoiceId, identity);

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "missing",
        message:
          "No invoice with that id exists for this tenant. Two other things read identically: an invoice belonging to another tenant, and a request that carried no tenant scope at all — the store resolves tenant from the X-Tenant-Id header and returns nothing when it is absent.",
      };
    }
    return { status: "error", message: explainPayableError(result.error.message) };
  }

  return { status: "found", record: result.data, message: "" };
}

// ─── general-ledger-svc (:8098) ──────────────────────────────────────────────

const LEDGER_EXPIRED: LedgerActionState = {
  status: "error",
  message: "Your session has expired — sign in again.",
};

/** "2026-07". Not validated by any service — no fiscal calendar exists — but a
 *  free-text period would silently create a ledger nobody can group. What DOES
 *  check it is financial-close-svc, which only knows periods someone registered. */
const FISCAL_PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** ACC-03's two business dates, as ISO calendar dates. Shape only — there is no
 *  fiscal calendar service to say whether the day falls in an open period, and
 *  the range check that does exist (posting not before transaction) is done by
 *  comparing the strings, which sort correctly precisely because they are ISO. */
const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Record a journal from the intake form. It lands PENDING and posts nothing.
 *
 * The lines arrive as three parallel FormData arrays (account_code[], debit[],
 * credit[]) because the form lets an operator add and remove rows. They are
 * zipped back together here and every line is checked before the call: the
 * service refuses a line carrying both a debit and a credit, or neither, and
 * saying which row is wrong is something only this side knows.
 *
 * Balance is deliberately NOT required here. A PENDING journal is allowed to be
 * unbalanced — that is what makes it a draft — and the double-entry invariant is
 * enforced at validation. Refusing an unbalanced draft in the form would be the
 * console inventing a rule the ledger does not have.
 */
export async function recordJournal(
  _previous: LedgerActionState,
  formData: FormData,
): Promise<LedgerActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return LEDGER_EXPIRED;
  }

  const fiscalPeriod = String(formData.get("fiscal_period") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!FISCAL_PERIOD_RE.test(fiscalPeriod)) {
    return {
      status: "error",
      message:
        "A fiscal period is required, as YYYY-MM (for example 2026-07). No fiscal calendar service exists to offer a picker, so the format is the only check — but financial-close-svc will refuse a posting into a period it has closed.",
    };
  }
  if (!description) {
    return {
      status: "error",
      message: "A description is required — it is the only human-readable account of why this posting exists.",
    };
  }

  // ── ACC-03 required business/source inputs ────────────────────────────────
  //
  // Checked here as well as in the service so the operator gets the answer
  // beside the field rather than as a round-trip refusal. The service still
  // enforces all four: this is an affordance, not the enforcement.

  const journalType = String(formData.get("journal_type") ?? "").trim();
  if (!JOURNAL_TYPES.some((t) => t.value === journalType)) {
    return {
      status: "error",
      message:
        "Choose a journal type. It decides how every downstream report reads this posting — an accrual is expected to reverse, an opening balance is excluded from period movement — so the ledger will not accept a posting without one.",
    };
  }

  const transactionDate = String(formData.get("transaction_date") ?? "").trim();
  const postingDate = String(formData.get("posting_date") ?? "").trim();

  if (!ISO_DATE_RE.test(transactionDate)) {
    return { status: "error", message: "A transaction date is required, as YYYY-MM-DD. This is the date on the source document." };
  }
  if (!ISO_DATE_RE.test(postingDate)) {
    return { status: "error", message: "A posting date is required, as YYYY-MM-DD. This is the date the entry takes effect in the ledger." };
  }
  if (postingDate < transactionDate) {
    // String comparison is exact for ISO dates — they sort lexicographically.
    return {
      status: "error",
      message:
        "The posting date cannot be earlier than the transaction date — a journal cannot reach the ledger before the document it records exists. Later is fine: an invoice dated the 28th, posted on the 3rd, is an ordinary entry.",
    };
  }

  const currencyCode = String(formData.get("currency_code") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    return {
      status: "error",
      message:
        "A three-letter ISO 4217 currency code is required, such as GBP. Only the shape can be checked — no Currency Registry service exists, so a well-formed code for a currency this entity never trades in would still be accepted.",
    };
  }

  // Optional, and unvalidatable: REF-06 Accounting Book / Ledger Basis does not
  // exist, so a book named here is recorded as supplied and checked by nothing.
  const bookId = String(formData.get("book_id") ?? "").trim() || undefined;

  const accountCodes = formData.getAll("account_code").map((value) => String(value).trim());
  const debits = formData.getAll("debit").map((value) => String(value).trim());
  const credits = formData.getAll("credit").map((value) => String(value).trim());

  const lines: CreateJournalLineInput[] = [];
  for (let i = 0; i < accountCodes.length; i += 1) {
    const accountCode = accountCodes[i];
    const debitRaw = debits[i] ?? "";
    const creditRaw = credits[i] ?? "";

    // A row left entirely blank is the operator not using a slot, not an error.
    if (!accountCode && !debitRaw && !creditRaw) continue;

    const rowLabel = `Line ${i + 1}`;
    if (!accountCode) {
      return { status: "error", message: `${rowLabel}: an account code is required.` };
    }

    const debit = debitRaw === "" ? 0 : Number(debitRaw);
    const credit = creditRaw === "" ? 0 : Number(creditRaw);

    if (!Number.isFinite(debit) || !Number.isFinite(credit)) {
      return { status: "error", message: `${rowLabel}: amounts must be numbers.` };
    }
    if (debit < 0 || credit < 0) {
      return {
        status: "error",
        message: `${rowLabel}: amounts cannot be negative. A negative debit is a credit — put it in the credit column, so the journal says what it means.`,
      };
    }
    if (debit > 0 && credit > 0) {
      return {
        status: "error",
        message: `${rowLabel}: a line carries either a debit or a credit, never both. Split it into two lines.`,
      };
    }
    if (debit === 0 && credit === 0) {
      return {
        status: "error",
        message: `${rowLabel}: enter an amount greater than zero in either the debit or the credit column, or clear the whole row.`,
      };
    }

    lines.push({
      accountCode,
      debitAmount: debit,
      creditAmount: credit,
      description: String(formData.getAll("line_description")[i] ?? "").trim() || undefined,
    });
  }

  if (lines.length === 0) {
    return { status: "error", message: "A journal needs at least one line." };
  }

  const result = await createJournal({
    identity,
    fiscalPeriod,
    description,
    lines,
    journalType: journalType as JournalType,
    transactionDate,
    postingDate,
    currencyCode,
    bookId,
  });

  if (!result.ok) {
    // 412 is a closed period: the books are shut, which is the system working.
    if (result.error.status === 412) {
      return { status: "period-locked", message: explainLedgerError(result.error.message) };
    }
    return { status: "error", message: explainLedgerError(result.error.message) };
  }

  refresh();

  const journal = result.data;
  const totals = totalLines(journal.lines);
  const balanceNote = totals.balanced
    ? `It balances at ${formatAmount(totals.debit)} on each side, so validation should carry it through.`
    : `It does NOT balance — ${formatAmount(totals.debit)} of debits against ${formatAmount(totals.credit)} of credits. That is allowed in a draft, but validation will refuse it until the two agree.`;

  return result.status === 201
    ? {
        status: "recorded",
        journalId: journal.journal_id,
        stage: journal.status,
        message: `Journal recorded for ${journal.fiscal_period}, status PENDING — ID ${journal.journal_id}. Nothing has reached the books: it must be validated and then posted, each a separate authorization grant. ${balanceNote}`,
      }
    : {
        status: "replayed",
        journalId: journal.journal_id,
        stage: journal.status,
        message: `No new journal written — this replayed an existing one (${journal.fiscal_period}, currently ${journal.status}, ID ${journal.journal_id}). The service is idempotent on correlation ID, so a retried submit resolves to the original rather than posting the entry twice.`,
      };
}

/**
 * Advance one journal by one stage: validate, or post.
 *
 * The action comes from the form because the register derives it from the row's
 * own status, but it is re-checked here — a Server Action is reachable by direct
 * POST, so an arbitrary route segment must not reach the service. The stage
 * check itself stays with the backend, which does it as one atomic UPDATE.
 */
export async function advanceJournalEntry(
  _previous: LedgerActionState,
  formData: FormData,
): Promise<LedgerActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return LEDGER_EXPIRED;
  }

  const journalId = String(formData.get("journal_id") ?? "").trim();
  const rawAction = String(formData.get("action") ?? "").trim();

  if (!journalId) return { status: "error", message: "Missing journal ID." };
  if (!isUuid(journalId)) return { status: "error", message: "A journal ID must be a UUID." };
  if (!isJournalAction(rawAction)) return { status: "error", message: "Unrecognised transition." };
  const action: JournalAction = rawAction;

  const result = await advanceJournal(journalId, action, identity);

  if (!result.ok) {
    // A 422 on validate is an unbalanced journal; a 422 on post is a stage that
    // is not reachable from here. Both are correct refusals, and separating them
    // is the difference between "fix the lines" and "reload the register".
    if (result.error.status === 422) {
      const unbalanced = result.error.message.includes("unbalanced_journal");
      return {
        status: unbalanced ? "unbalanced" : "out-of-sequence",
        journalId,
        message: explainLedgerError(result.error.message),
      };
    }
    if (result.error.status === 412) {
      return { status: "period-locked", journalId, message: explainLedgerError(result.error.message) };
    }
    return { status: "error", message: explainLedgerError(result.error.message) };
  }

  refresh();

  const journal = result.data;
  const next = JOURNAL_NEXT_STEP[journal.status];

  return {
    status: "advanced",
    journalId: journal.journal_id,
    stage: journal.status,
    message:
      journal.status === "FINALIZED"
        ? `Journal ${journal.journal_id} is now FINALIZED and attributed to you. It is on the books and immutable — no finalized journal may be edited, so the only correction from here is a reversal, which posts a separate inverse entry rather than changing this one.`
        : `Journal ${journal.journal_id} is now ${journal.status}, attributed to you. The debits and credits agree, which is what validation checks. Next: ${next?.label ?? "none"} — a separate authorization grant.`,
  };
}

/**
 * Reverse a FINALIZED journal.
 *
 * This does not undo anything. It posts a NEW journal whose lines are the exact
 * inverse, already FINALIZED, and marks the original REVERSED — both halves in
 * one transaction, so the books can never hold a posting and its inverse as two
 * independently live entries. The id reported back is the reversing journal's.
 */
export async function reverseJournalEntry(
  _previous: LedgerActionState,
  formData: FormData,
): Promise<LedgerActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return LEDGER_EXPIRED;
  }

  const journalId = String(formData.get("journal_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!journalId) return { status: "error", message: "Missing journal ID." };
  if (!isUuid(journalId)) return { status: "error", message: "A journal ID must be a UUID." };
  if (!reason) {
    return {
      status: "error",
      message:
        "A reason is required. It is written into the reversing journal's description and is the only record of why a posted entry was undone.",
    };
  }

  const result = await reverseJournal(journalId, reason, identity);

  if (!result.ok) {
    if (result.error.status === 422) {
      return { status: "out-of-sequence", journalId, message: explainLedgerError(result.error.message) };
    }
    if (result.error.status === 412) {
      return { status: "period-locked", journalId, message: explainLedgerError(result.error.message) };
    }
    return { status: "error", message: explainLedgerError(result.error.message) };
  }

  refresh();

  const reversing = result.data;

  // 200 means this reversal had already been applied and the service recognised
  // the retry. Reporting it as a fresh reversal would imply a second inverse
  // posting that does not exist.
  return result.status === 201
    ? {
        status: "reversed",
        journalId: reversing.journal_id,
        stage: reversing.status,
        message: `Reversed. A new journal — ID ${reversing.journal_id} — has been posted FINALIZED with the exact debit/credit inverse of the original, and the original is now REVERSED. The original's own lines were not touched: this is the only sanctioned correction for posted financial data. A reversal is itself not reversible.`,
      }
    : {
        status: "replayed",
        journalId: reversing.journal_id,
        stage: reversing.status,
        message: `No second reversal written — this journal had already been reversed by journal ${reversing.journal_id}, and the service recognised the retry. Reversing twice would post the entry back onto the books.`,
      };
}

/**
 * Read one journal by id, with all of its lines.
 *
 * The full record: every actor and timestamp along the lifecycle, the reversal
 * link if it is one, and the Atomic Linking references tying the posting to the
 * upstream event or governance decision that caused it.
 */
export async function lookupJournal(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const journalId = String(formData.get("lookup_journal_id") ?? "").trim();
  if (!journalId) return { status: "error", message: "Enter a journal ID." };
  if (!isUuid(journalId)) return { status: "error", message: "A journal ID must be a UUID." };

  const result = await getJournal(journalId, identity);

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "missing",
        message:
          "No journal with that id exists for this tenant. Three other things read identically: a journal belonging to another tenant, an id that is not a UUID at all, and a request that carried no tenant scope — the store resolves tenant from the X-Tenant-Id header and returns nothing when it is absent. The service does not distinguish them, deliberately, so a probe cannot confirm that a journal exists.",
      };
    }
    return { status: "error", message: explainLedgerError(result.error.message) };
  }

  return { status: "found", record: result.data, message: "" };
}

// ─── financial-close-svc (:8104) ─────────────────────────────────────────────

const CLOSE_EXPIRED: CloseActionState = {
  status: "error",
  message: "Your session has expired — sign in again.",
};

/** YYYY-MM-DD. Both period bounds are calendar days sent as UTC midnight
 *  instants — the Go fields are time.Time, so a bare date fails to unmarshal
 *  and answers 400 invalid_json, a message that never mentions dates. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Register a fiscal period. It lands OPEN and seals nothing.
 *
 * Registering does not make a period postable — general-ledger-svc treats an
 * unregistered period as open, so the ledger works before anyone registers
 * anything. Registering is what makes a period CLOSEABLE.
 */
export async function registerFiscalPeriod(
  _previous: CloseActionState,
  formData: FormData,
): Promise<CloseActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return CLOSE_EXPIRED;
  }

  const periodName = String(formData.get("period_name") ?? "").trim();
  const periodStart = String(formData.get("period_start") ?? "").trim();
  const periodEnd = String(formData.get("period_end") ?? "").trim();

  if (!periodName) {
    return {
      status: "error",
      message:
        "A period name is required. general-ledger-svc matches a journal's fiscal_period against this string exactly, with no normalisation — so “2026-7” and “2026-07” are two different periods, and only one of them will ever be locked.",
    };
  }
  if (!DATE_RE.test(periodStart) || !DATE_RE.test(periodEnd)) {
    return { status: "error", message: "A start and end date are required, as YYYY-MM-DD." };
  }
  if (periodEnd < periodStart) {
    // Checked here as well as in the service. A backwards window contains
    // nothing, so every readiness check passes and it seals clean — an empty
    // close, which is the kind of success worth refusing early.
    return {
      status: "error",
      message: "The period must end after it starts.",
    };
  }

  const result = await createFiscalPeriod({
    identity,
    periodName,
    periodStart: `${periodStart}T00:00:00Z`,
    periodEnd: `${periodEnd}T00:00:00Z`,
  });

  if (!result.ok) {
    return { status: "error", message: explainCloseError(result.error.message) };
  }

  refresh();

  const period = result.data;
  return result.status === 201
    ? {
        status: "registered",
        periodId: period.fiscal_period_id,
        message: `Period ${period.period_name} registered OPEN — ID ${period.fiscal_period_id}. Nothing is sealed: it can now be checked for readiness and closed, and journals can still be posted into it until it is.`,
      }
    : {
        status: "replayed",
        periodId: period.fiscal_period_id,
        message: `No new period written — ${period.period_name} was already registered for this entity (currently ${period.close_status}, ID ${period.fiscal_period_id}). The name is unique per legal entity, so a retried submit resolves to the original rather than creating a second period that could be locked independently.`,
      };
}

/**
 * Check whether a period could be closed, without closing it.
 *
 * Side-effect free: nothing is written, nothing is published, the period is not
 * touched. This exists so a month-end can be checked repeatedly — before it,
 * the only way to ask was to attempt the close, which emitted close.started and
 * close.blocked events for what was really a question.
 */
export async function checkCloseReadiness(
  _previous: CloseActionState,
  formData: FormData,
): Promise<CloseActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return CLOSE_EXPIRED;
  }

  const periodId = String(formData.get("fiscal_period_id") ?? "").trim();
  if (!periodId) return { status: "error", message: "Missing fiscal period ID." };
  if (!isUuid(periodId)) return { status: "error", message: "A fiscal period ID must be a UUID." };

  const result = await checkPeriodReadiness(periodId, identity);
  if (!result.ok) {
    return { status: "error", message: explainCloseError(result.error.message) };
  }

  const readiness = result.data;
  if (readiness.is_ready) {
    return {
      status: "ready",
      periodId,
      blockingIssues: [],
      message:
        "Ready to close. Every journal for this period has been posted, and every payable and receivable due in it has been settled. Closing will compile the trial balance, file it in the document vault, and seal the period — there is no unlock.",
    };
  }

  return {
    status: "blocked",
    periodId,
    blockingIssues: readiness.blocking_issues.map(explainBlockingIssue),
    message: `Not ready to close — ${readiness.blocking_issues.length} ${
      readiness.blocking_issues.length === 1 ? "item is" : "items are"
    } outstanding. Nothing was changed; this was a check, not an attempt.`,
  };
}

/**
 * Close the period.
 *
 * The 422 body is a readiness result, not an error body, so it is decoded and
 * rendered as findings rather than as a failure — a refused close is the
 * service working. The 500 `evidence_not_recorded` case is separated out
 * because it is the one outcome where the close DID happen and cannot be
 * retried.
 */
export async function closeFiscalPeriod(
  _previous: CloseActionState,
  formData: FormData,
): Promise<CloseActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return CLOSE_EXPIRED;
  }

  const periodId = String(formData.get("fiscal_period_id") ?? "").trim();
  if (!periodId) return { status: "error", message: "Missing fiscal period ID." };
  if (!isUuid(periodId)) return { status: "error", message: "A fiscal period ID must be a UUID." };

  const result = await lockFiscalPeriod(periodId, identity);

  if (!result.ok) {
    if (result.error.status === 422) {
      // A refused close answers 422 with a readiness body — structured findings,
      // not an error message. The shared API client folds every error body into
      // one human string, which is right everywhere else and loses exactly the
      // part that matters here, so the reasons are re-read from the readiness
      // endpoint instead of being scraped back out of that string. One extra
      // request, only on a refusal, and it reports the current state rather
      // than a parse of a mangled one.
      const readiness = await checkPeriodReadiness(periodId, identity);
      const issues = readiness.ok ? readiness.data.blocking_issues : [];
      return {
        status: "blocked",
        periodId,
        blockingIssues: issues.map(explainBlockingIssue),
        message:
          issues.length > 0
            ? `Close refused — ${issues.length} ${issues.length === 1 ? "item is" : "items are"} outstanding. The period is untouched.`
            : "Close refused. The period is untouched — re-check readiness for the current reasons.",
      };
    }
    if (result.error.status === 500 && result.error.message.includes("evidence_not_recorded")) {
      return {
        status: "unevidenced",
        periodId,
        message: explainCloseError(result.error.message),
      };
    }
    return { status: "error", message: explainCloseError(result.error.message) };
  }

  refresh();

  const locked = result.data as PeriodLockResult;
  return {
    status: "closed",
    periodId: locked.fiscal_period_id,
    message: `Period ${locked.period_name} is closed and sealed. The trial balance was compiled from every posted journal in the period — including reversed entries and the journals that reversed them, which cancel — filed in the document vault as ${locked.evidence_document_id}, and its hash ${locked.verification_hash.slice(0, 16)}… signed and recorded. There is no unlock: corrections are posted as reversing journals in a period that is still open.`,
  };
}

// ─── bank-reconciliation-svc ─────────────────────────────────────────────────

const RECONCILIATION_EXPIRED: ReconciliationActionState = {
  status: "error",
  message: "Your session has expired — sign in again.",
};

/**
 * Ingest one bank statement line. It lands UNMATCHED and asserts nothing about
 * the ledger — it is only the bank's claim that a transaction happened.
 *
 * `gl_cash_account_code` is required here rather than optional, because a line
 * without it can never be matched: the service refuses to verify a match whose
 * direction it cannot check, and it is far better to refuse the ingest — where
 * the operator still has the information — than at match time, where they no
 * longer do.
 */
export async function ingestBankStatementLine(
  _previous: ReconciliationActionState,
  formData: FormData,
): Promise<ReconciliationActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return RECONCILIATION_EXPIRED;
  }

  const bankAccountId = String(formData.get("bank_account_id") ?? "").trim();
  const statementDate = String(formData.get("statement_date") ?? "").trim();
  const rawAmount = String(formData.get("amount") ?? "").trim();
  const currencyCode = String(formData.get("currency_code") ?? "").trim().toUpperCase();
  const bankReference = String(formData.get("bank_reference") ?? "").trim();
  const glCashAccountCode = String(formData.get("gl_cash_account_code") ?? "").trim();

  if (!bankAccountId) return { status: "error", message: "Enter the bank account ID." };
  if (!isUuid(bankAccountId)) {
    return {
      status: "error",
      message:
        "A bank account ID must be a UUID. No bank-account registry exists in this platform to look one up from, so the value is whatever your statement import uses — but it has to be a UUID, because the column is one.",
    };
  }
  if (!statementDate) return { status: "error", message: "Enter the statement date." };
  if (!bankReference) return { status: "error", message: "Enter the bank reference." };
  if (!glCashAccountCode) {
    return {
      status: "error",
      message:
        "Enter the ledger account code for this bank account. Without it the direction of any future match cannot be verified, and the service will refuse to match this line at all.",
    };
  }

  const amount = Number(rawAmount);
  if (!rawAmount || Number.isNaN(amount)) {
    return { status: "error", message: "Enter the amount as a number." };
  }
  if (amount === 0) {
    return {
      status: "error",
      message:
        "An amount of zero has no direction and reconciles against nothing, so the service refuses it. Money in is positive, money out is negative.",
    };
  }

  const result = await ingestStatementLine({
    identity,
    bankAccountId,
    statementDate,
    amount,
    currencyCode: currencyCode || "USD",
    bankReference,
    glCashAccountCode,
  });

  if (!result.ok) {
    return { status: "error", message: explainReconciliationError(result.error.message) };
  }

  refresh();

  const line = result.data;
  const direction = directionLabel(line.amount).toLowerCase();

  // 200 is a replay, not a second line. Reporting it as a fresh ingest would
  // show one bank transaction as two in a register whose whole job is agreeing
  // with the bank.
  if (result.status === 200) {
    return {
      status: "replayed",
      statementLineId: line.statement_line_id,
      stage: line.status,
      message: `This statement line had already been ingested — it resolved to the original ${line.statement_line_id}, which is ${line.status}. Nothing was written and no duplicate was created.`,
    };
  }

  return {
    status: "ingested",
    statementLineId: line.statement_line_id,
    stage: line.status,
    message: `Statement line ${line.statement_line_id} ingested as UNMATCHED — ${formatSignedAmount(line.amount, line.currency_code)}, ${direction}. It records what the bank says happened and asserts nothing about the ledger yet. Match it to a FINALIZED journal, or flag it as an exception if nothing accounts for it.`,
  };
}

/**
 * Match a statement line to a ledger journal.
 *
 * The refusal is the point of this action, not a failure of it. The service
 * fetches the journal from general-ledger-svc and requires that it be FINALIZED,
 * belong to the same legal entity, and move this exact amount through this bank
 * account's ledger account IN THE SAME DIRECTION — so a journal of precisely the
 * right size that moved money the other way is rejected, which is the error a
 * reconciliation exists to surface.
 */
export async function matchBankStatementLine(
  _previous: ReconciliationActionState,
  formData: FormData,
): Promise<ReconciliationActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return RECONCILIATION_EXPIRED;
  }

  const statementLineId = String(formData.get("statement_line_id") ?? "").trim();
  const journalId = String(formData.get("journal_id") ?? "").trim();

  if (!statementLineId) return { status: "error", message: "Missing statement line ID." };
  if (!journalId) return { status: "error", message: "Enter the journal ID to match against." };
  if (!isUuid(journalId)) {
    return { status: "error", message: "A journal ID must be a UUID." };
  }

  const result = await matchStatementLine(statementLineId, journalId, identity);

  if (!result.ok) {
    // 400 is the ledger check refusing the proposed match — the service is
    // working exactly as intended. 422 means this line can never be matched
    // (no cash account) or is already MATCHED. Three different remedies, so
    // three different states rather than one red banner.
    if (result.error.status === 400) {
      return {
        status: "unverified",
        statementLineId,
        message: explainReconciliationError(result.error.message),
      };
    }
    if (result.error.status === 422) {
      const unverifiable = result.error.message.includes("cash_account_unknown");
      return {
        status: unverifiable ? "unverifiable" : "out-of-sequence",
        statementLineId,
        message: explainReconciliationError(result.error.message),
      };
    }
    return { status: "error", message: explainReconciliationError(result.error.message) };
  }

  refresh();

  const line = result.data;
  return {
    status: "matched",
    statementLineId: line.statement_line_id,
    stage: line.status,
    message: `Statement line ${line.statement_line_id} is MATCHED to journal ${journalId}, attributed to you. The journal was verified as FINALIZED, on the same legal entity, and moving exactly ${formatSignedAmount(line.amount, line.currency_code)} through account ${line.gl_cash_account_code} in the same direction. MATCHED is terminal.`,
  };
}

/**
 * Flag a statement line as an exception — the bank says this happened and
 * nothing in the ledger accounts for it.
 *
 * This is not a failure state. It is a queue item for whoever investigates, and
 * it can still be resolved to MATCHED later if the right journal turns up, which
 * is why it demands a reason: an exception nobody can interpret is worse than an
 * unmatched line, because it looks handled.
 */
export async function flagBankStatementException(
  _previous: ReconciliationActionState,
  formData: FormData,
): Promise<ReconciliationActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return RECONCILIATION_EXPIRED;
  }

  const statementLineId = String(formData.get("statement_line_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!statementLineId) return { status: "error", message: "Missing statement line ID." };
  if (!reason) return { status: "error", message: "Enter why nothing accounts for this line." };
  if (reason.length > 500) {
    return { status: "error", message: "The reason must be 500 characters or fewer." };
  }

  const result = await flagException(statementLineId, reason, identity);

  if (!result.ok) {
    if (result.error.status === 422) {
      return {
        status: "out-of-sequence",
        statementLineId,
        message: explainReconciliationError(result.error.message),
      };
    }
    return { status: "error", message: explainReconciliationError(result.error.message) };
  }

  refresh();

  const line = result.data;
  return {
    status: "flagged",
    statementLineId: line.statement_line_id,
    stage: line.status,
    message: `Statement line ${line.statement_line_id} is flagged as an EXCEPTION, attributed to you. It counts as resolved for the purpose of completing this statement — it has been looked at and recorded as unexplained — and it can still be matched later if the journal that accounts for it turns up.`,
  };
}

/**
 * Read one statement line by id.
 *
 * The full record, which the register's table cannot show: the signed amount,
 * the cash account code that makes its direction verifiable, and every actor
 * and timestamp along the reconciliation lifecycle.
 */
export async function lookupStatementLine(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const statementLineId = String(formData.get("lookup_statement_line_id") ?? "").trim();
  if (!statementLineId) return { status: "error", message: "Enter a statement line ID." };
  if (!isUuid(statementLineId)) {
    return { status: "error", message: "A statement line ID must be a UUID." };
  }

  const result = await getStatementLine(statementLineId, identity);

  if (!result.ok) {
    if (result.error.status === 401) {
      return {
        status: "missing",
        message:
          "No verified tenant scope reached the service, so it failed closed. Sign in again and retry.",
      };
    }
    if (result.error.status === 404) {
      return {
        status: "missing",
        message:
          "No statement line with that id exists for this tenant. A line belonging to another tenant reads as absent in exactly the same way — the store resolves tenant from the X-Tenant-Id header and returns nothing otherwise.",
      };
    }
    return { status: "error", message: explainReconciliationError(result.error.message) };
  }

  return { status: "found", record: result.data, message: "" };
}

/**
 * Declare one bank account's statement reconciled for a date.
 *
 * Publishes reconciliation.completed and stores nothing: completion is a derived
 * signal, not a record, and there is no reopen. Refused while any line is still
 * UNMATCHED — an EXCEPTION counts as resolved, an untouched line does not.
 */
export async function completeBankStatement(
  _previous: ReconciliationActionState,
  formData: FormData,
): Promise<ReconciliationActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return RECONCILIATION_EXPIRED;
  }

  const bankAccountId = String(formData.get("bank_account_id") ?? "").trim();
  const statementDate = String(formData.get("statement_date") ?? "").trim();

  if (!bankAccountId) return { status: "error", message: "Missing bank account ID." };
  if (!isUuid(bankAccountId)) {
    return { status: "error", message: "A bank account ID must be a UUID." };
  }
  if (!statementDate) return { status: "error", message: "Missing statement date." };

  const result = await completeStatement(bankAccountId, statementDate, identity);

  if (!result.ok) {
    if (result.error.status === 422) {
      return {
        status: "incomplete",
        message: explainReconciliationError(result.error.message),
      };
    }
    return { status: "error", message: explainReconciliationError(result.error.message) };
  }

  refresh();

  return {
    status: "completed",
    message: `Statement for bank account ${bankAccountId} on ${statementDate} is reconciled, and reconciliation.completed has been published. Every line is either matched to a posted journal or recorded as an exception. Nothing is stored by this step and there is no reopen — it is a signal that the work was finished, not a lock on the data.`,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// ─── accounts-receivable-svc (:8101) ─────────────────────────────────────────
//
// The fifth and last service behind /admin/finance, and the only one that was
// still reached through the legacy lib/api-client.ts layer. That layer answered
// every failure with three hardcoded invoices — with the fallback ON unless
// NEXT_PUBLIC_ENABLE_BACKEND_MOCK_FALLBACK was explicitly "false" — so the 403
// that every write actually received, no RBAC bundle having ever granted AR_*,
// arrived in the UI as a successful create. Nothing here falls back to anything:
// a refusal is reported as a refusal.

/**
 * Issue a customer invoice. It lands ISSUED.
 *
 * 201 means an invoice was opened. 200 means the service recognised the
 * submission as a replay of this correlation id and wrote nothing — reported as
 * such rather than as a second receivable, since an invented receivable
 * overstates what customers owe.
 */
export async function issueCustomerInvoiceAction(
  _previous: ReceivableActionState,
  formData: FormData,
): Promise<ReceivableActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const customerId = String(formData.get("customer_id") ?? "").trim();
  const invoiceNumber = String(formData.get("invoice_number") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const currencyCode = String(formData.get("currency_code") ?? "").trim();
  const dueDateRaw = String(formData.get("due_date") ?? "").trim();
  // One fresh idempotency key per submission.
  //
  // It keys the service's partial unique index on (tenant_id, correlation_id), so
  // what it protects is a RETRY of this one POST — the client-timeout-on-a-request-
  // that-actually-succeeded case the index was built for. It does not, and must
  // not, span submissions: the form briefly supplied a useId()-derived value for
  // that purpose and, useId being deterministic per tree position, made every
  // later submission an idempotent replay of the first invoice. A deliberate
  // second submit of the same form is caught by the (customer, invoice_number)
  // unique constraint instead, which answers 409 rather than opening a duplicate.
  const correlationId = crypto.randomUUID();

  if (!customerId) {
    return {
      status: "error",
      message:
        "A customer reference is required. Nothing validates it — there is no Customer Master service on this platform — so it is also the one field a typo passes silently.",
    };
  }
  if (!invoiceNumber) {
    return { status: "error", message: "An invoice number is required." };
  }

  const amount = Number(amountRaw);
  if (amountRaw === "" || !Number.isFinite(amount) || amount <= 0) {
    return { status: "error", message: "Amount must be a number greater than zero." };
  }
  if (!currencyCode) return { status: "error", message: "Currency is required." };

  // due_date is a DATE column, so a day is the honest unit; the explicit instant
  // pins it to UTC midnight rather than relying on the service's parsing. It is
  // also load-bearing beyond validation: the due date is what the overdue check
  // measures against, so a wrong one makes an invoice late early or never.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDateRaw)) {
    return { status: "error", message: "A due date is required, as YYYY-MM-DD." };
  }
  const dueDate = `${dueDateRaw}T00:00:00Z`;

  const result = await issueCustomerInvoice({
    identity,
    legalEntityId: identity.legalEntityId ?? "",
    customerId,
    invoiceNumber,
    amount,
    currencyCode,
    dueDate,
    correlationId,
  });

  if (!result.ok) {
    const { status, message } = result.error;
    const explained = explainAccountsReceivableError(message);

    // 409 is a re-keyed invoice number, not a failure of the service. Kept apart
    // from `error` so the banner reads as "that number is already on the
    // register" rather than as something broken — this arrived as a 503
    // store_unavailable until this pass, indistinguishable from a dead database.
    if (status === 409) return { status: "duplicate", message: explained };

    // The legal entity is not in this tenant, or is not trading. A governance
    // answer about attribution rather than a fault, so it is not rendered red.
    if (
      message.includes("legal_entity_not_in_tenant") ||
      message.includes("legal_entity_not_active")
    ) {
      return { status: "entity-refused", message: explained };
    }
    return { status: "error", message: explained };
  }

  refresh();

  const invoice = result.data;
  const money = formatMoney(invoice.amount, invoice.currency_code);

  return result.status === 201
    ? {
        status: "issued",
        invoiceId: invoice.invoice_id,
        stage: invoice.status,
        message: `Invoice ${invoice.invoice_number} issued to ${invoice.customer_id} for ${money}, status ${invoice.status} — ID ${invoice.invoice_id}. It is not yet a claim on the customer: sending it, declaring it late and recording payment are three further steps, each a separate grant.`,
      }
    : {
        status: "replayed",
        invoiceId: invoice.invoice_id,
        stage: invoice.status,
        message: `No new invoice written — this replayed an existing one (${invoice.invoice_number}, ${money}, currently ${invoice.status}, ID ${invoice.invoice_id}). The service is idempotent on correlation ID, so a resubmitted form resolves to the original rather than opening a second receivable.`,
      };
}

/**
 * Move one invoice one hop: send it, declare it overdue, or record payment.
 *
 * The hop comes from the form because the register derives it from the row's own
 * status, and it is re-checked here against a closed set: a Server Action is
 * reachable by direct POST, so an arbitrary string must never reach the service
 * as a URL path segment. The status check itself stays with the backend, which
 * does it as one conditional UPDATE, so a stale page cannot skip a hop — it gets
 * 422 invalid_transition instead.
 */
export async function advanceCustomerInvoice(
  _previous: ReceivableActionState,
  formData: FormData,
): Promise<ReceivableActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const rawHop = String(formData.get("hop") ?? "").trim();

  if (!invoiceId) return { status: "error", message: "Missing invoice ID." };
  if (!isUuid(invoiceId)) {
    return { status: "error", message: "An invoice ID must be a UUID." };
  }
  if (!isReceivableHop(rawHop)) {
    return { status: "error", message: "Unrecognised transition." };
  }

  const result =
    rawHop === "send"
      ? await sendCustomerInvoice({ identity, invoiceId })
      : rawHop === "overdue"
        ? await markCustomerInvoiceOverdue({ identity, invoiceId })
        : await receiveCustomerInvoicePayment({ identity, invoiceId });

  if (!result.ok) {
    const { status, message } = result.error;
    const explained = explainAccountsReceivableError(message);

    // 400 ledger_verification_failed is the outcome an operator will meet most
    // often on the payment hop, and it is not a fault: the books hold no
    // finalized journal for this invoice yet. Given its own state so the banner
    // reads as the next thing to do rather than as something broken.
    if (status === 400 && message.includes("ledger_verification")) {
      return { status: "unledgered", message: explained, invoiceId };
    }
    // The books DO carry a finalized journal for this invoice, for a different
    // amount. Opposite remedy to `unledgered`: nothing to post, something to
    // correct — so it gets its own state rather than being folded in.
    if (status === 400 && message.includes("ledger_amount_mismatch")) {
      return { status: "unbalanced", message: explained, invoiceId };
    }
    if (status === 503 && message.includes("ledger_service_unavailable")) {
      return { status: "unledgered", message: explained, invoiceId };
    }
    // 422 splits two ways: an invoice that is not yet late, and an invoice that
    // is in the wrong status. Both are correct refusals, with different remedies.
    if (status === 422) {
      return message.includes("not_yet_due") || message.includes("before its due date")
        ? { status: "not-yet-due", message: explained, invoiceId }
        : { status: "out-of-sequence", message: explained, invoiceId };
    }
    return { status: "error", message: explained, invoiceId };
  }

  refresh();

  const invoice = result.data;
  const money = formatMoney(invoice.amount, invoice.currency_code);

  const detail =
    invoice.status === "SENT"
      ? `${invoice.invoice_number} is now SENT to ${invoice.customer_id} and attributed to you. It becomes overdue only after ${new Date(invoice.due_date).toLocaleDateString()}.`
      : invoice.status === "OVERDUE"
        ? `${invoice.invoice_number} is now OVERDUE, attributed to you. receivable.overdue has been published — aging and impairment downstream count this, so it is a statement about the customer, not a display change. Payment can still be recorded.`
        : `${invoice.invoice_number} is PAID for ${money}, attributed to you. Terminal: payment.received has been published and no further transition is possible. The payment was accepted only because general-ledger-svc holds a FINALIZED journal for this invoice.`;

  return {
    status: "advanced",
    invoiceId: invoice.invoice_id,
    stage: invoice.status,
    message: detail,
  };
}
