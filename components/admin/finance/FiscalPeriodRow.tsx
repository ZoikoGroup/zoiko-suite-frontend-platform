"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Lock, Search, ShieldAlert, TriangleAlert } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { CopyableId } from "@/components/admin/shared";
import { CELL } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { checkCloseReadiness, closeFiscalPeriod } from "@/app/admin/finance/actions";
import { IDLE_CLOSE_STATE, type CloseActionState } from "@/app/admin/finance/state";
import { formatPeriodRange, isLocked, type FiscalPeriod } from "@/lib/api/financial-close";

/**
 * One fiscal period, with the two things that can be done to an open one:
 * check whether it could close, and close it.
 *
 * They are separate buttons rather than one flow because they are genuinely
 * different acts. The check changes nothing and can be run all week; the close
 * seals the period permanently — there is no unlock — and files evidence. A
 * single "Close" button that sometimes only reported blockers would blur that,
 * and the blurred version is the one that gets clicked by accident.
 */
export function FiscalPeriodRow({
  period,
  columnCount,
}: {
  period: FiscalPeriod;
  columnCount: number;
}) {
  const [checkState, checkAction, checkPending] = useActionState<CloseActionState, FormData>(
    checkCloseReadiness,
    IDLE_CLOSE_STATE,
  );
  const [closeState, closeAction, closePending] = useActionState<CloseActionState, FormData>(
    closeFiscalPeriod,
    IDLE_CLOSE_STATE,
  );

  // Whichever ran, preferring the close — a close can only follow a check, so
  // if both have fired the close is the later news. Deliberately NOT selected
  // by the period's own status: a successful close changes that status, so
  // choosing on it would swap the banner to the other hook's idle state in the
  // same render that delivered the result.
  const state = closeState.status !== "idle" ? closeState : checkState;

  const locked = isLocked(period);

  const feedback =
    state.status === "error"
      ? { tone: "error" as const, message: state.message }
      : state.status === "unevidenced"
        ? { tone: "alarm" as const, message: state.message }
        : state.status === "blocked"
          ? { tone: "warning" as const, message: state.message }
          : state.status === "closed" || state.status === "ready"
            ? { tone: "success" as const, message: state.message }
            : null;

  return (
    <>
      <tr className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60">
        <td className={cn(CELL, "text-slate-900 dark:text-slate-100")}>
          <span className="block break-words font-medium">{period.period_name}</span>
          <CopyableId value={period.fiscal_period_id} className="mt-0.5" />
        </td>

        <td className={cn(CELL, "whitespace-nowrap tabular-nums text-slate-500 dark:text-slate-400")}>
          {formatPeriodRange(period)}
        </td>

        <td className={CELL}>
          <Badge tone={locked ? "success" : "warning"} dot={!locked}>
            {period.close_status}
          </Badge>
          {period.close_locked_at && (
            <p className="mt-1 whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-500">
              sealed {formatDateTime(period.close_locked_at)}
            </p>
          )}
        </td>

        <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
          {period.evidence_document_id ? (
            <>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">vault document</span>
              <CopyableId value={period.evidence_document_id} className="mt-0.5 text-xs" />
            </>
          ) : locked ? (
            // A sealed period with no evidence document is the one state that
            // should never exist. Called out rather than left blank: a blank
            // cell reads as "not applicable", and this is the opposite.
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
              <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
              sealed with no filed evidence
            </span>
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              — filed at close
            </span>
          )}
        </td>

        <td className={cn(CELL, "text-right")}>
          {locked ? (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Sealed — there is no unlock
            </span>
          ) : (
            <div className="flex flex-col items-end gap-2">
              <form action={checkAction} className="inline-flex">
                <input type="hidden" name="fiscal_period_id" value={period.fiscal_period_id} />
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  loading={checkPending}
                  aria-label={`Check whether ${period.period_name} can be closed`}
                  className="shrink-0"
                >
                  {!checkPending && <Search className="h-3.5 w-3.5" aria-hidden="true" />}
                  {checkPending ? "Checking…" : "Check readiness"}
                </Button>
              </form>

              <form action={closeAction} className="inline-flex">
                <input type="hidden" name="fiscal_period_id" value={period.fiscal_period_id} />
                <Button
                  type="submit"
                  size="sm"
                  loading={closePending}
                  aria-label={`Close and seal ${period.period_name}`}
                  className="shrink-0"
                >
                  {!closePending && <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
                  {closePending ? "Closing…" : "Close period"}
                </Button>
              </form>
            </div>
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
                // The close happened and is not evidenced. Given its own, louder
                // treatment than an ordinary failure because nothing can be
                // retried and it needs a person.
                feedback.tone === "alarm" &&
                  "border-rose-400 bg-rose-100 font-medium text-rose-900 dark:border-rose-400/50 dark:bg-rose-500/20 dark:text-rose-200",
                feedback.tone === "warning" &&
                  "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
                feedback.tone === "success" &&
                  "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
              )}
              role="status"
              aria-live="polite"
            >
              {feedback.tone === "error" || feedback.tone === "alarm" ? (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : feedback.tone === "warning" ? (
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <div className="min-w-0 space-y-2">
                <p className="break-words">{feedback.message}</p>
                {/* Every blocker, listed. An operator clearing them one at a
                    time needs the whole set — the service reports all three
                    checks rather than stopping at the first, and collapsing
                    that back into one sentence would waste it. */}
                {state.blockingIssues && state.blockingIssues.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5">
                    {state.blockingIssues.map((issue) => (
                      <li key={issue} className="break-words">
                        {issue}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
