"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { CopyableId, ResultBanner, type BannerTone } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { Button } from "@/components/ui";
import { recordJournal } from "@/app/admin/finance/actions";
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

  const debitTotal = sumColumn(lineIds, amounts, "debit");
  const creditTotal = sumColumn(lineIds, amounts, "credit");
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
