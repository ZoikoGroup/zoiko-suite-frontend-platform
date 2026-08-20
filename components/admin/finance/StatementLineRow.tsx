"use client";

import { useActionState } from "react";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Link2,
  TriangleAlert,
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { CopyableId } from "@/components/admin/shared";
import { CELL, FIELD, LABEL } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { matchBankStatementLine, flagBankStatementException } from "@/app/admin/finance/actions";
import {
  IDLE_RECONCILIATION_STATE,
  type ReconciliationActionState,
} from "@/app/admin/finance/state";
import {
  canBeMatched,
  directionLabel,
  formatSignedAmount,
  type StatementLine,
  type StatementLineStatus,
} from "@/lib/api/bank-reconciliation";

/**
 * Amber while nothing accounts for the line, rose once it has been recorded as
 * unexplained, emerald once a posted journal proves it. Rose rather than a
 * second amber: an exception is not a further stage of "not done yet", it is a
 * different outcome, and a reader scanning the register needs to see the two
 * apart without reading labels.
 */
const STATUS_TONE: Record<StatementLineStatus, "warning" | "danger" | "success"> = {
  UNMATCHED: "warning",
  EXCEPTION: "danger",
  MATCHED: "success",
};

/**
 * One bank statement line, with the actions legal from where it stands.
 *
 * UNMATCHED offers both a match and an exception — those are the two honest
 * answers to "does the ledger account for this?". EXCEPTION offers only a match,
 * because an exception is a queue item and resolving it is the way out. MATCHED
 * offers nothing: it is terminal.
 *
 * A line with no ledger account code offers no match at all, and says why. The
 * service refuses such a match with 422, so offering the form would be offering
 * a refusal — and the remedy is re-ingesting the line, not retrying.
 */
export function StatementLineRow({
  line,
  columnCount,
}: {
  line: StatementLine;
  columnCount: number;
}) {
  const [matchState, matchAction, matchPending] = useActionState<
    ReconciliationActionState,
    FormData
  >(matchBankStatementLine, IDLE_RECONCILIATION_STATE);
  const [flagState, flagAction, flagPending] = useActionState<ReconciliationActionState, FormData>(
    flagBankStatementException,
    IDLE_RECONCILIATION_STATE,
  );

  // Whichever action actually ran, preferring the match — on any one row a match
  // is the later news, since an exception can precede it but never follow.
  //
  // Selecting by the row's CURRENT status instead looks equivalent and is not: a
  // successful write changes that status, so the banner would switch to the
  // other hook's idle state in the same render that delivers the result, and the
  // confirmation would vanish at the instant it arrived. That exact bug was
  // shipped once on the journal register and only a browser caught it.
  const state = matchState.status !== "idle" ? matchState : flagState;

  const moneyOut = line.amount < 0;
  const matchable = canBeMatched(line);

  const feedback =
    state.status === "error"
      ? { tone: "error" as const, message: state.message }
      : state.status === "unverified" ||
          state.status === "unverifiable" ||
          state.status === "out-of-sequence"
        ? { tone: "warning" as const, message: state.message }
        : state.status === "matched" || state.status === "flagged"
          ? { tone: "success" as const, message: state.message }
          : null;

  return (
    <>
      <tr className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60">
        <td className={cn(CELL, "text-slate-900 dark:text-slate-100")}>
          <span className="block break-words font-medium">{line.bank_reference}</span>
          <CopyableId value={line.statement_line_id} className="mt-0.5" />
          <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500">
            account <span className="tabular-nums">{line.bank_account_id}</span>
          </span>
        </td>

        <td className={cn(CELL, "whitespace-nowrap")}>
          {/* Amount and direction together. The sign alone decides whether a
              journal can reconcile this line, so it is never left to a single
              character — the words say it too. */}
          <span
            className={cn(
              "flex items-center gap-1.5 font-medium tabular-nums",
              moneyOut ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {moneyOut ? (
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <ArrowDownLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            {formatSignedAmount(line.amount, line.currency_code)}
          </span>
          <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-slate-500">
            {directionLabel(line.amount)}
            {line.gl_cash_account_code ? ` · account ${line.gl_cash_account_code}` : ""}
          </span>
          <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-slate-500">
            {line.statement_date.slice(0, 10)}
          </span>
        </td>

        <td className={CELL}>
          <Badge tone={STATUS_TONE[line.status]} dot={line.status !== "MATCHED"}>
            {line.status}
          </Badge>
          {line.status === "MATCHED" && line.matched_journal_id && (
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <Link2 className="h-3 w-3 shrink-0" aria-hidden="true" />
              journal
              <CopyableId value={line.matched_journal_id} className="text-[11px]" />
            </span>
          )}
          {line.status === "EXCEPTION" && line.exception_reason && (
            <span className="mt-1.5 block break-words text-[11px] text-slate-500 dark:text-slate-400">
              {line.exception_reason}
            </span>
          )}
          {!line.gl_cash_account_code && (
            <span className="mt-1.5 block text-[11px] text-amber-600 dark:text-amber-400">
              No ledger account recorded — this line cannot be matched.
            </span>
          )}
        </td>

        <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
          {line.matched_by_principal_id || line.flagged_by_principal_id ? (
            <>
              <CopyableId
                value={line.matched_by_principal_id ?? line.flagged_by_principal_id ?? ""}
                className="text-xs"
              />
              <p className="mt-0.5 whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-500">
                {formatDateTime(line.matched_at ?? line.flagged_at ?? line.created_at)}
              </p>
            </>
          ) : (
            <p className="whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-500">
              ingested {formatDateTime(line.created_at)}
            </p>
          )}
        </td>

        <td className={cn(CELL, "text-right")}>
          {line.status === "MATCHED" ? (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Terminal — proven by a posted journal
            </span>
          ) : matchable ? (
            <div className="space-y-2">
              <details className="group text-left">
                <summary className="cursor-pointer list-none text-right text-xs font-medium text-navy-700 underline-offset-2 hover:underline dark:text-navy-300">
                  Match to a journal
                </summary>
                <form action={matchAction} className="mt-2 space-y-2">
                  <input type="hidden" name="statement_line_id" value={line.statement_line_id} />
                  <div>
                    <label htmlFor={`journal-${line.statement_line_id}`} className={LABEL}>
                      Journal ID
                    </label>
                    <input
                      id={`journal-${line.statement_line_id}`}
                      name="journal_id"
                      required
                      placeholder="00000000-0000-0000-0000-000000000000"
                      className={FIELD}
                      autoComplete="off"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    The journal must be FINALIZED, on the same legal entity, and move exactly{" "}
                    {formatSignedAmount(line.amount, line.currency_code)} through account{" "}
                    {line.gl_cash_account_code}{" "}
                    <strong>in the same direction</strong>. A journal of the right size that moved
                    money the other way is refused.
                  </p>
                  <Button type="submit" size="sm" variant="secondary" loading={matchPending}>
                    {matchPending ? "Verifying…" : "Verify and match"}
                  </Button>
                </form>
              </details>

              {line.status === "UNMATCHED" && (
                <details className="group text-left">
                  <summary className="cursor-pointer list-none text-right text-xs font-medium text-slate-500 underline-offset-2 hover:underline dark:text-slate-400">
                    Nothing accounts for this
                  </summary>
                  <form action={flagAction} className="mt-2 space-y-2">
                    <input type="hidden" name="statement_line_id" value={line.statement_line_id} />
                    <div>
                      <label htmlFor={`reason-${line.statement_line_id}`} className={LABEL}>
                        Reason
                      </label>
                      <input
                        id={`reason-${line.statement_line_id}`}
                        name="reason"
                        required
                        maxLength={500}
                        placeholder="Bank fee with no corresponding posting"
                        className={FIELD}
                        autoComplete="off"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      Raises an EXCEPTION. It counts as resolved for completing this statement, and
                      can still be matched later if the journal turns up.
                    </p>
                    <Button type="submit" size="sm" variant="secondary" loading={flagPending}>
                      {flagPending ? "Flagging…" : "Flag exception"}
                    </Button>
                  </form>
                </details>
              )}
            </div>
          ) : (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Cannot be matched — re-ingest with a ledger account code
            </span>
          )}
        </td>
      </tr>

      {feedback && (
        <tr>
          <td colSpan={columnCount} className="px-4 pb-3">
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
          </td>
        </tr>
      )}
    </>
  );
}
