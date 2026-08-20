"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { FIELD, LABEL, HINT } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { completeBankStatement } from "@/app/admin/finance/actions";
import {
  IDLE_RECONCILIATION_STATE,
  type ReconciliationActionState,
} from "@/app/admin/finance/state";

/** One bank account + date on this page of the register, with how much of it is
 *  still untouched. */
export type StatementGroup = {
  bankAccountId: string;
  statementDate: string;
  total: number;
  unmatched: number;
};

/**
 * Declare one bank account's statement reconciled for a date.
 *
 * The options are the (bank account, date) groups actually present on this page
 * of the register, not a free-text pair. Two reasons: the service answers 404
 * for a combination with no lines at all, so free text mostly produces that; and
 * the count of still-untouched lines can be shown against each option, which
 * turns "why was this refused" into something visible before the click rather
 * than after it.
 *
 * A group with unmatched lines is still offered rather than hidden. The refusal
 * is informative — it names what is outstanding — and hiding the option would
 * leave an operator wondering where their statement went.
 */
export function CompleteStatementForm({ groups }: { groups: StatementGroup[] }) {
  const [state, formAction, pending] = useActionState<ReconciliationActionState, FormData>(
    completeBankStatement,
    IDLE_RECONCILIATION_STATE,
  );

  const feedback =
    state.status === "error"
      ? { tone: "error" as const, message: state.message }
      : state.status === "incomplete"
        ? { tone: "warning" as const, message: state.message }
        : state.status === "completed"
          ? { tone: "success" as const, message: state.message }
          : null;

  if (groups.length === 0) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Nothing to complete — no statement lines are on this page of the register.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="statement_group" className={LABEL}>
          Statement
        </label>
        <select
          id="statement_group"
          name="statement_group"
          className={FIELD}
          defaultValue={`${groups[0].bankAccountId}|${groups[0].statementDate}`}
          onChange={(event) => {
            const [account, date] = event.target.value.split("|");
            const form = event.target.form;
            if (!form) return;
            (form.elements.namedItem("bank_account_id") as HTMLInputElement).value = account;
            (form.elements.namedItem("statement_date") as HTMLInputElement).value = date;
          }}
        >
          {groups.map((group) => (
            <option
              key={`${group.bankAccountId}|${group.statementDate}`}
              value={`${group.bankAccountId}|${group.statementDate}`}
            >
              {group.statementDate} · {group.bankAccountId.slice(0, 8)}… ·{" "}
              {group.unmatched === 0
                ? `${group.total} line${group.total === 1 ? "" : "s"}, all resolved`
                : `${group.unmatched} of ${group.total} still unmatched`}
            </option>
          ))}
        </select>
        <p className={HINT}>
          A statement is completed per bank account and per date. Only the groups on this page of
          the register are offered.
        </p>
      </div>

      {/* The select carries a composite value for readability; these are what the
          action reads. Seeded from the first option so submitting without
          touching the select sends the same pair that is displayed. */}
      <input type="hidden" name="bank_account_id" defaultValue={groups[0].bankAccountId} />
      <input type="hidden" name="statement_date" defaultValue={groups[0].statementDate} />

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="secondary" loading={pending}>
          {pending ? "Completing…" : "Declare reconciled"}
        </Button>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Refused while any line is still UNMATCHED. An exception counts as resolved.
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
