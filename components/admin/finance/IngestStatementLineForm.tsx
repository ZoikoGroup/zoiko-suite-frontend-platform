"use client";

import { useActionState, useState } from "react";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, CheckCircle2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { FIELD, LABEL, HINT } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { ingestBankStatementLine } from "@/app/admin/finance/actions";
import { IDLE_RECONCILIATION_STATE, CURRENCIES } from "@/app/admin/finance/state";
import type { ReconciliationActionState } from "@/app/admin/finance/state";

/**
 * Ingest one bank statement line.
 *
 * Two fields on this form carry the weight of the whole service, and both are
 * explained inline rather than left to be discovered at match time:
 *
 * The AMOUNT is signed in bank terms. Positive is money arriving, negative is
 * money leaving. That sign is not cosmetic — it is half of what a match
 * verifies, and a journal of exactly the right size moving the other way will
 * be refused. So the direction is shown in words as the operator types, rather
 * than resting on a minus sign one pixel wide.
 *
 * The LEDGER ACCOUNT CODE is what makes direction checkable at all: a debit to
 * this account is money in, a credit is money out. Without it the service
 * refuses to match the line at any point in the future, so it is required here
 * — while the operator still has the statement in front of them — rather than
 * being discovered as an unmatched-forever row weeks later.
 */
export function IngestStatementLineForm() {
  const [state, formAction, pending] = useActionState<ReconciliationActionState, FormData>(
    ingestBankStatementLine,
    IDLE_RECONCILIATION_STATE,
  );
  const [amount, setAmount] = useState("");

  const parsed = Number(amount);
  const showDirection = amount.trim() !== "" && !Number.isNaN(parsed) && parsed !== 0;
  const moneyOut = parsed < 0;

  const feedback =
    state.status === "error"
      ? { tone: "error" as const, message: state.message }
      : state.status === "replayed"
        ? { tone: "warning" as const, message: state.message }
        : state.status === "ingested"
          ? { tone: "success" as const, message: state.message }
          : null;

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="bank_reference" className={LABEL}>
            Bank reference
          </label>
          <input
            id="bank_reference"
            name="bank_reference"
            required
            maxLength={255}
            placeholder="ACH-2026-08-0041"
            className={FIELD}
            autoComplete="off"
          />
          <p className={HINT}>
            Whatever the bank calls this transaction on the statement. It is how a human finds the
            line again on the original document.
          </p>
        </div>

        <div>
          <label htmlFor="bank_account_id" className={LABEL}>
            Bank account ID
          </label>
          <input
            id="bank_account_id"
            name="bank_account_id"
            required
            placeholder="00000000-0000-0000-0000-000000000000"
            className={FIELD}
            autoComplete="off"
          />
          <p className={HINT}>
            A UUID. No bank-account registry service exists in this platform, so nothing validates
            that this account is real — it is whatever your statement import uses.
          </p>
        </div>

        <div>
          <label htmlFor="statement_date" className={LABEL}>
            Statement date
          </label>
          <input
            id="statement_date"
            name="statement_date"
            type="date"
            required
            className={FIELD}
          />
          <p className={HINT}>
            A statement is completed per bank account and date, so this is what groups the lines.
          </p>
        </div>

        <div>
          <label htmlFor="amount" className={LABEL}>
            Amount
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="-1250.00"
            className={cn(FIELD, "tabular-nums")}
            autoComplete="off"
          />
          {/* Direction in words, live. The sign is half of what a match verifies
              and it is a single character — this is the one thing on the form
              that must not be misread. */}
          {showDirection ? (
            <p
              className={cn(
                "mt-1.5 flex items-center gap-1.5 text-xs font-medium",
                moneyOut
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-emerald-600 dark:text-emerald-400",
              )}
              aria-live="polite"
            >
              {moneyOut ? (
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {moneyOut ? "Money OUT of the account" : "Money INTO the account"}
            </p>
          ) : (
            <p className={HINT}>
              Signed, in bank terms: positive is money in, negative is money out. Zero is refused —
              it has no direction and reconciles against nothing.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="currency_code" className={LABEL}>
            Currency
          </label>
          <select id="currency_code" name="currency_code" defaultValue="USD" className={FIELD}>
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <p className={HINT}>
            Recorded, but <strong>not verified against the ledger</strong> — general-ledger journals
            carry no currency at all, so a match cannot compare them.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="gl_cash_account_code" className={LABEL}>
            Ledger account for this bank account
          </label>
          <input
            id="gl_cash_account_code"
            name="gl_cash_account_code"
            required
            maxLength={50}
            placeholder="1000"
            className={cn(FIELD, "tabular-nums")}
            autoComplete="off"
          />
          <p className={HINT}>
            The general-ledger account code this bank account posts to. This is what makes the
            direction of a match checkable — a debit to it is money in, a credit is money out.
            Required: a line without one can never be matched, because the service refuses to verify
            a match whose direction it cannot check.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {pending ? "Ingesting…" : "Ingest statement line"}
        </Button>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Lands UNMATCHED. This records what the bank says happened and asserts nothing about the
          ledger.
        </p>
      </div>

      {feedback && (
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm animate-fade-up",
            feedback.tone === "error" &&
              "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
            feedback.tone === "warning" &&
              "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
            feedback.tone === "success" &&
              "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
          )}
          role="status"
          aria-live="polite"
        >
          {feedback.tone === "error" ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : feedback.tone === "warning" ? (
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span className="break-words">{feedback.message}</span>
        </div>
      )}
    </form>
  );
}
