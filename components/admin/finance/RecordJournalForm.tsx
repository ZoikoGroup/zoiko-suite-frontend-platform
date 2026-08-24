"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { Plus, X } from "lucide-react";
import { CopyableId, ResultBanner, type BannerTone } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { Button } from "@/components/ui";
import { recordJournal } from "@/app/admin/finance/actions";
import { JOURNAL_TYPES, todayISODate } from "@/lib/api/general-ledger";
import {
  IDLE_LEDGER_STATE,
  JOURNAL_LINE_SLOTS,
  type LedgerActionState,
} from "@/app/admin/finance/state";

const TONE: Record<LedgerActionState["status"], BannerTone> = {
  idle: "neutral",
  recorded: "success",
  // A replay wrote nothing. Green would claim a posting that was not made.
  replayed: "neutral",
  advanced: "success",
  reversed: "success",
  // Correct refusals with a remedy, not malfunctions: the journal does not
  // balance, the period is shut, or the stage has moved on.
  unbalanced: "warning",
  "period-locked": "warning",
  "out-of-sequence": "warning",
  error: "error",
};

const CELL_FIELD = `${FIELD} text-sm`;

/**
 * Today's calendar date, as the *browser* reckons it.
 *
 * This cannot be an initial useState value or a defaultValue. The form renders
 * on the server as well, where the clock is UTC, and the operator's calendar day
 * differs from UTC's for a wide band of timezones at any given moment — so the
 * server would emit one date into the HTML and the client would render another,
 * producing a hydration mismatch on the very field whose entire job is to name
 * the right day. useSyncExternalStore is the supported way to say "this value is
 * legitimately different on the server": it renders the server snapshot during
 * hydration and swaps to the client's afterwards.
 *
 * The snapshot is memoised because useSyncExternalStore compares snapshots by
 * identity and would loop forever on a function that returned a fresh string
 * each call. One consequence: a console left open across midnight keeps
 * yesterday as the *default*. That is a default, not a submitted value — the
 * operator sees the date in the field and the service records what is sent.
 */
const subscribeToNothing = () => () => {};
let todaySnapshot: string | null = null;
const getTodaySnapshot = () => (todaySnapshot ??= todayISODate());
const getServerTodaySnapshot = () => "";

function useToday(): string {
  return useSyncExternalStore(subscribeToNothing, getTodaySnapshot, getServerTodaySnapshot);
}

/**
 * Stage 1 of 3 — record a journal.
 *
 * The journal lands PENDING and posts nothing to the books. Tenant and legal
 * entity come from the session rather than the form: they are uuid columns fed
 * to the row-level security policy, and they are not the operator's to choose.
 *
 * Lines are added and removed client-side and submitted as parallel arrays, so
 * the number of rows is not fixed by the markup. Nothing here enforces balance:
 * a PENDING journal is ALLOWED to be unbalanced — that is what makes it a draft
 * — and the double-entry invariant belongs to validation. A running total is
 * shown instead, so an operator can see whether the next step will succeed
 * without the form pretending to a rule the ledger does not have.
 *
 * The created ID is surfaced as a copy button rather than only inside the
 * sentence, because it is the one value that has to leave this form by hand —
 * the lookup panel takes it, and text inside a banner cannot be clicked.
 */
export function RecordJournalForm() {
  const [state, action, pending] = useActionState<LedgerActionState, FormData>(
    recordJournal,
    IDLE_LEDGER_STATE,
  );

  const [lineIds, setLineIds] = useState<number[]>(() =>
    Array.from({ length: JOURNAL_LINE_SLOTS.initial }, (_, i) => i),
  );
  const [nextId, setNextId] = useState<number>(JOURNAL_LINE_SLOTS.initial);

  // Mirrors of the amount inputs, kept only to show the running total. The
  // submitted values are the inputs' own, so this state can never disagree with
  // what is sent — it is display, not a source of truth.
  const [amounts, setAmounts] = useState<Record<number, { debit: string; credit: string }>>({});

  // ACC-03's two business dates. Null means "operator has not touched it", and
  // falls back to today — see useToday for why today cannot simply be the
  // initial state.
  const today = useToday();
  const [transactionDateInput, setTransactionDate] = useState<string | null>(null);
  const [postingDateInput, setPostingDate] = useState<string | null>(null);
  const transactionDate = transactionDateInput ?? today;
  const postingDate = postingDateInput ?? today;

  const debitTotal = sumColumn(lineIds, amounts, "debit");
  const creditTotal = sumColumn(lineIds, amounts, "credit");

  // Shown beside the field rather than waiting for the service's 400. The
  // service still refuses it — this is an affordance, not the enforcement.
  const postingBeforeTransaction =
    transactionDate !== "" && postingDate !== "" && postingDate < transactionDate;
  // Compared in minor units: 0.1 + 0.2 !== 0.3 in binary floating point, and
  // this is the figure that tells an operator whether validation will pass.
  const balanced = Math.round(debitTotal * 100) === Math.round(creditTotal * 100);
  const anyAmount = debitTotal > 0 || creditTotal > 0;

  function addLine() {
    if (lineIds.length >= JOURNAL_LINE_SLOTS.max) return;
    setLineIds((ids) => [...ids, nextId]);
    setNextId((id) => id + 1);
  }

  function removeLine(id: number) {
    // Never below one row: a journal with no lines is refused by the service,
    // and an empty form gives an operator nothing to start from.
    if (lineIds.length <= 1) return;
    setLineIds((ids) => ids.filter((existing) => existing !== id));
    setAmounts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function setAmount(id: number, side: "debit" | "credit", value: string) {
    setAmounts((current) => {
      const existing = current[id] ?? { debit: "", credit: "" };
      return { ...current, [id]: { ...existing, [side]: value } };
    });
  }

  return (
    <form action={action} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="fiscal_period" className={LABEL}>
            Fiscal period
          </label>
          <input
            id="fiscal_period"
            name="fiscal_period"
            required
            placeholder="2026-07"
            pattern="\d{4}-(0[1-9]|1[0-2])"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            YYYY-MM. A plain string — there is no fiscal calendar service to pick from — but
            financial-close-svc refuses a posting into a period it has closed or locked.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="description" className={LABEL}>
            Description
          </label>
          <input
            id="description"
            name="description"
            required
            placeholder="July software licence revenue recognition"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            The only human-readable account of why this posting exists. It travels with the journal
            for the life of the ledger and cannot be edited once posted.
          </p>
        </div>
      </div>

      {/*
        ACC-03 required business/source inputs (ZS-ARCH-SVC-001 §9.D). The
        ledger refuses a journal missing any of the four, naming the one that
        was absent, so they are grouped here rather than scattered through the
        form — an operator filling this in top to bottom should not discover a
        required field only after a round trip.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div>
          <label htmlFor="journal_type" className={LABEL}>
            Journal type
          </label>
          <select id="journal_type" name="journal_type" required defaultValue="STANDARD" className={FIELD}>
            {JOURNAL_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Decides how downstream reports read this posting — an accrual is expected to reverse, an
            opening balance is excluded from period movement.
          </p>
        </div>

        <div>
          <label htmlFor="transaction_date" className={LABEL}>
            Transaction date
          </label>
          <input
            id="transaction_date"
            name="transaction_date"
            type="date"
            required
            value={transactionDate}
            onChange={(event) => setTransactionDate(event.target.value)}
            className={FIELD}
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            The date on the source document.
          </p>
        </div>

        <div>
          <label htmlFor="posting_date" className={LABEL}>
            Posting date
          </label>
          <input
            id="posting_date"
            name="posting_date"
            type="date"
            required
            value={postingDate}
            onChange={(event) => setPostingDate(event.target.value)}
            min={transactionDate || undefined}
            aria-invalid={postingBeforeTransaction || undefined}
            className={FIELD}
          />
          <p
            className={`mt-1.5 text-xs ${
              postingBeforeTransaction
                ? "text-amber-600 dark:text-amber-500"
                : "text-slate-400 dark:text-slate-500"
            }`}
          >
            {postingBeforeTransaction
              ? "Earlier than the transaction date — a journal cannot reach the ledger before the document it records exists. The ledger will refuse this."
              : "When it takes effect in the ledger. May be later than the transaction date — never earlier."}
          </p>
        </div>

        <div>
          <label htmlFor="currency_code" className={LABEL}>
            Currency
          </label>
          <input
            id="currency_code"
            name="currency_code"
            required
            placeholder="GBP"
            pattern="[A-Za-z]{3}"
            maxLength={3}
            className={`${FIELD} uppercase`}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            ISO 4217, three letters. Only the shape is checked — no currency registry service
            exists — so a code this entity never trades in still posts.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="book_id" className={LABEL}>
          Accounting book <span className={OPTIONAL}>(optional)</span>
        </label>
        <input
          id="book_id"
          name="book_id"
          placeholder="BOOK-STAT-GB"
          className={FIELD}
          autoComplete="off"
        />
        <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
          Which book or reporting basis this posting belongs to. Recorded as typed and validated by
          nothing: no Accounting Book service exists yet, so the statutory / management / tax split
          the architecture calls for cannot be enforced here. Leaving it blank is the honest default
          until one ships.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className={LABEL}>Lines</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {lineIds.length} of {JOURNAL_LINE_SLOTS.max}
          </p>
        </div>

        <div className="space-y-2">
          {lineIds.map((id, index) => (
            <div
              key={id}
              className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-12 dark:border-slate-800"
            >
              <div className="sm:col-span-3">
                <label htmlFor={`account_code-${id}`} className={LABEL}>
                  Account code
                </label>
                <input
                  id={`account_code-${id}`}
                  name="account_code"
                  placeholder="1100-AR"
                  className={CELL_FIELD}
                  autoComplete="off"
                />
              </div>

              <div className="sm:col-span-4">
                <label htmlFor={`line_description-${id}`} className={LABEL}>
                  Line note <span className={OPTIONAL}>(optional)</span>
                </label>
                <input
                  id={`line_description-${id}`}
                  name="line_description"
                  placeholder="Trade receivable raised"
                  className={CELL_FIELD}
                  autoComplete="off"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor={`debit-${id}`} className={LABEL}>
                  Debit
                </label>
                <input
                  id={`debit-${id}`}
                  name="debit"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className={`${CELL_FIELD} tabular-nums`}
                  autoComplete="off"
                  value={amounts[id]?.debit ?? ""}
                  onChange={(event) => setAmount(id, "debit", event.target.value)}
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor={`credit-${id}`} className={LABEL}>
                  Credit
                </label>
                <input
                  id={`credit-${id}`}
                  name="credit"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className={`${CELL_FIELD} tabular-nums`}
                  autoComplete="off"
                  value={amounts[id]?.credit ?? ""}
                  onChange={(event) => setAmount(id, "credit", event.target.value)}
                />
              </div>

              <div className="flex items-end sm:col-span-1">
                <button
                  type="button"
                  onClick={() => removeLine(id)}
                  disabled={lineIds.length <= 1}
                  aria-label={`Remove line ${index + 1}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={addLine}
            disabled={lineIds.length >= JOURNAL_LINE_SLOTS.max}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add line
          </Button>

          {/* A statement of fact, not a gate. An unbalanced draft is legitimate
              and is accepted; this says what validation will make of it. */}
          <p
            className={
              !anyAmount
                ? "text-xs text-slate-400 dark:text-slate-500"
                : balanced
                  ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                  : "text-xs font-medium text-amber-600 dark:text-amber-400"
            }
            role="status"
            aria-live="polite"
          >
            {!anyAmount
              ? "Debits 0.00 · Credits 0.00"
              : `Debits ${format(debitTotal)} · Credits ${format(creditTotal)}${
                  balanced
                    ? " — balanced, validation will carry it through"
                    : ` — out by ${format(Math.abs(debitTotal - creditTotal))}; it will be recorded, but validation will refuse it until the two sides agree`
                }`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Recording…" : "Record journal"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Stage 1 of 3. Lands PENDING — nothing reaches the books until it has been validated and
          then posted, in that order.
        </p>
      </div>

      <ResultBanner tone={TONE[state.status]} message={state.message}>
        {state.journalId && (
          <div className="flex items-center gap-2 text-xs">
            <span className="shrink-0 opacity-70">Journal ID</span>
            <CopyableId value={state.journalId} className="text-[11px]" />
          </div>
        )}
      </ResultBanner>
    </form>
  );
}

function sumColumn(
  ids: number[],
  amounts: Record<number, { debit: string; credit: string }>,
  side: "debit" | "credit",
): number {
  return ids.reduce((total, id) => {
    const value = Number(amounts[id]?.[side] ?? "");
    return Number.isFinite(value) && value > 0 ? total + value : total;
  }, 0);
}

function format(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
