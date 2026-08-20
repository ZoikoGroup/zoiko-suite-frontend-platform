"use client";

import { useActionState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, TriangleAlert, Undo2 } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { CopyableId } from "@/components/admin/shared";
import { CELL, FIELD, LABEL } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { advanceJournalEntry, reverseJournalEntry } from "@/app/admin/finance/actions";
import { IDLE_LEDGER_STATE, type LedgerActionState } from "@/app/admin/finance/state";
import {
  JOURNAL_STAGES,
  NEXT_STEP,
  stageIndex,
  type JournalHeader,
  type JournalStatus,
} from "@/lib/api/general-ledger";

/**
 * Amber while it is a draft, navy once the debits and credits agree, emerald
 * once it is on the books, slate once it has been corrected away. The ladder is
 * deliberate: colour carries how far the posting has travelled, so a reader
 * scanning the register sees the position without reading the labels.
 */
const STAGE_TONE: Record<JournalStatus, "warning" | "info" | "success" | "neutral"> = {
  PENDING: "warning",
  VALIDATED: "info",
  FINALIZED: "success",
  REVERSED: "neutral",
};

const STAGE_FILL: Record<JournalStatus, string> = {
  PENDING: "bg-amber-400 dark:bg-amber-500",
  VALIDATED: "bg-navy-500 dark:bg-navy-400",
  FINALIZED: "bg-emerald-500 dark:bg-emerald-400",
  REVERSED: "bg-slate-400 dark:bg-slate-500",
};

/**
 * How far along the three-stage lifecycle this journal is.
 *
 * REVERSED is not a fourth segment. It is not further along the path — it is the
 * same path, finished, and then undone by a separate entry — so drawing it as
 * progress would say the opposite of what happened. A reversed journal shows all
 * three segments filled in slate, with the state named beside them.
 */
function StageMeter({ status }: { status: JournalStatus }) {
  const reversed = status === "REVERSED";
  const reached = reversed ? JOURNAL_STAGES.length : stageIndex(status) + 1;

  return (
    <span className="mt-1.5 flex items-center gap-1.5">
      <span className="flex gap-0.5" aria-hidden="true">
        {JOURNAL_STAGES.map((stage, index) => (
          <span
            key={stage}
            className={cn(
              "h-1 w-4 rounded-full",
              index < reached ? STAGE_FILL[status] : "bg-slate-200 dark:bg-slate-700",
            )}
          />
        ))}
      </span>
      <span className="text-[11px] text-slate-400 dark:text-slate-500">
        {reversed ? "posted, then reversed" : `${reached} of ${JOURNAL_STAGES.length}`}
      </span>
    </span>
  );
}

/**
 * One journal, with the single action that is legal from where it stands.
 *
 * PENDING and VALIDATED each offer their one transition, derived from the row's
 * own status: the service moves a journal with `WHERE status = <expected>` as
 * one atomic statement, so any other transition answers 422, and offering it
 * would be offering a refusal. FINALIZED offers a reversal instead, behind a
 * disclosure and requiring a reason — it posts a second entry onto the books,
 * which is not something to put one click away. REVERSED offers nothing: a
 * reversal is never itself reversible.
 *
 * That also means this row cannot act on a stale reading. If the register is out
 * of date the derived action is the wrong one and the service refuses it, which
 * is why a 422 renders as "not from here" rather than as a failure.
 */
export function JournalRow({
  journal,
  columnCount,
  reversedByJournalId,
}: {
  journal: JournalHeader;
  columnCount: number;
  /** The journal that reversed this one, when it is in the same page of the
   *  register. The link is stored on the REVERSING journal, so the original can
   *  only learn it by looking sideways — worth doing, because "reversed" without
   *  "by what" leaves the correction untraceable from the entry being corrected. */
  reversedByJournalId?: string;
}) {
  const [advanceState, advanceAction, advancePending] = useActionState<LedgerActionState, FormData>(
    advanceJournalEntry,
    IDLE_LEDGER_STATE,
  );
  const [reverseState, reverseAction, reversePending] = useActionState<LedgerActionState, FormData>(
    reverseJournalEntry,
    IDLE_LEDGER_STATE,
  );

  const next = NEXT_STEP[journal.status];

  // Whichever action has actually run, preferring the reversal — on any one row
  // a reversal can only follow a posting, never precede it, so if both have
  // fired the reversal is the later news.
  //
  // Selecting by the row's CURRENT status instead looks equivalent and is not:
  // a successful write changes that status, so the banner would switch to the
  // other hook's idle state in the same render that delivers the result. Posting
  // a journal flipped the row to FINALIZED and therefore to reverseState, and
  // reversing it flipped the row to REVERSED and therefore back to advanceState
  // — in both cases the confirmation the operator just earned was discarded at
  // the instant it arrived, while the transition itself had plainly succeeded.
  // Caught by clicking; every server-side assertion around it passed.
  const state = reverseState.status !== "idle" ? reverseState : advanceState;

  // Who last moved it, and when. The lifecycle stamps a separate actor column
  // per stage, so the most recent one is the furthest along that is populated.
  const lastActor =
    journal.reversed_by_principal_id ??
    journal.posted_by_principal_id ??
    journal.validated_by_principal_id ??
    journal.created_by_principal_id;
  const lastActedAt =
    journal.reversed_at ?? journal.posted_at ?? journal.validated_at ?? journal.created_at;

  const feedback =
    state.status === "error"
      ? { tone: "error" as const, message: state.message }
      : state.status === "out-of-sequence" ||
          state.status === "unbalanced" ||
          state.status === "period-locked" ||
          state.status === "replayed"
        ? { tone: "warning" as const, message: state.message }
        : state.status === "advanced" || state.status === "reversed"
          ? { tone: "success" as const, message: state.message }
          : null;

  return (
    <>
      <tr className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60">
        <td className={cn(CELL, "text-slate-900 dark:text-slate-100")}>
          <span className="block break-words font-medium">{journal.description}</span>
          <CopyableId value={journal.journal_id} className="mt-0.5" />

          {/* Atomic Linking, and the reversal link in both directions. All three
              are shown only when they exist — a manually-entered journal has no
              upstream event and no governing decision, and inventing a dash for
              each would fill the register with absences. */}
          {journal.reversal_of_journal_id && (
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <Undo2 className="h-3 w-3 shrink-0" aria-hidden="true" />
              reverses
              <CopyableId value={journal.reversal_of_journal_id} className="text-[11px]" />
            </span>
          )}
          {reversedByJournalId && (
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <Undo2 className="h-3 w-3 shrink-0" aria-hidden="true" />
              reversed by
              <CopyableId value={reversedByJournalId} className="text-[11px]" />
            </span>
          )}
          {journal.source_event_id && (
            <span className="mt-1 block break-words text-[11px] text-slate-400 dark:text-slate-500">
              from event {journal.source_event_id}
            </span>
          )}
          {journal.governance_decision_id && (
            <span className="mt-1 block break-words text-[11px] text-slate-400 dark:text-slate-500">
              under decision {journal.governance_decision_id}
            </span>
          )}
        </td>

        <td className={cn(CELL, "whitespace-nowrap tabular-nums text-slate-500 dark:text-slate-400")}>
          {journal.fiscal_period}
        </td>

        <td className={CELL}>
          <Badge tone={STAGE_TONE[journal.status]} dot={journal.status === "PENDING" || journal.status === "VALIDATED"}>
            {journal.status}
          </Badge>
          <StageMeter status={journal.status} />
        </td>

        <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
          <CopyableId value={lastActor} className="text-xs" />
          <p className="mt-0.5 whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-500">
            {formatDateTime(lastActedAt)}
          </p>
        </td>

        <td className={cn(CELL, "text-right")}>
          {next ? (
            <form action={advanceAction} className="inline-flex">
              <input type="hidden" name="journal_id" value={journal.journal_id} />
              <input type="hidden" name="action" value={next.action} />
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                loading={advancePending}
                aria-label={`${next.label} journal ${journal.journal_id}`}
                className="shrink-0"
              >
                {next.label}
                {!advancePending && <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
              </Button>
            </form>
          ) : journal.status === "FINALIZED" ? (
            <details className="group text-left">
              <summary className="cursor-pointer list-none text-right text-xs font-medium text-navy-700 underline-offset-2 hover:underline dark:text-navy-300">
                Reverse this journal
              </summary>
              <form action={reverseAction} className="mt-2 space-y-2">
                <input type="hidden" name="journal_id" value={journal.journal_id} />
                <div>
                  <label htmlFor={`reason-${journal.journal_id}`} className={LABEL}>
                    Reason
                  </label>
                  <input
                    id={`reason-${journal.journal_id}`}
                    name="reason"
                    required
                    placeholder="Posted to the wrong entity"
                    className={FIELD}
                    autoComplete="off"
                  />
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  This posts a NEW journal with the inverse of every line, already FINALIZED, and
                  marks this one REVERSED. Nothing is edited or deleted, and the reversal cannot
                  itself be reversed.
                </p>
                <Button type="submit" size="sm" variant="secondary" loading={reversePending}>
                  {reversePending ? "Reversing…" : "Post reversal"}
                </Button>
              </form>
            </details>
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Terminal — corrected by an inverse entry
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
