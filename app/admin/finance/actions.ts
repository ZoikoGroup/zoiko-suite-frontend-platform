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
  type CreateJournalLineInput,
  type JournalAction,
} from "@/lib/api/general-ledger";
import {
  createFiscalPeriod,
  checkPeriodReadiness,
  lockFiscalPeriod,
  explainCloseError,
  explainBlockingIssue,
  type PeriodLockResult,
} from "@/lib/api/financial-close";
import { formatMoney } from "@/lib/format";
import type { LookupState } from "@/components/admin/shared/lookup";
import type { CloseActionState, LedgerActionState, PayableActionState } from "./state";

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

  const result = await createJournal({ identity, fiscalPeriod, description, lines });

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
