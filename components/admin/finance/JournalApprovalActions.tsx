"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { FIELD, LABEL } from "@/components/admin/shared/form";
import {
  submitJournalAction,
  approveJournalAction,
  rejectJournalAction,
  requestPostingAction,
  fetchAvailableActionsAction,
  fetchJournalHistoryAction,
  type JournalHistoryResult,
} from "@/app/admin/finance/actions";
import { IDLE_APPROVAL_STATE, type ApprovalActionState } from "@/app/admin/finance/state";
import { APPROVAL_STATUS_LABELS, ACTION_LABELS, type JournalWithLines } from "@/lib/api/general-ledger";

const TONE = {
  refused: "warning",
  "out-of-sequence": "warning",
  error: "error",
  idle: "neutral",
  done: "success",
} as const;

/** The four one-click lifecycle commands this console offers a form for.
 *  `amend` and `correct` are real backend endpoints too (see
 *  lib/api/general-ledger.ts) but need a full line-replacement form of their
 *  own — reported below when available, but not yet given a button here. */
const BUILT_ACTIONS = new Set(["submit", "approve", "reject", "request-posting"]);

/**
 * ACC-03's governed approval workflow for one journal, shown under its
 * lookup result. Buttons are gated by the service's own GetAvailableActions
 * answer, fetched fresh on mount — never guessed from the journal's status
 * client-side, since maker/checker (who may act next) is not decidable from
 * the record alone.
 */
export function JournalApprovalActions({ journal }: { journal: JournalWithLines }) {
  const [availableActions, setAvailableActions] = useState<string[] | null>(null);
  const [history, setHistory] = useState<JournalHistoryResult | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [submitState, submitAction, submitPending] = useActionState<ApprovalActionState, FormData>(
    submitJournalAction,
    IDLE_APPROVAL_STATE,
  );
  const [approveState, approveAction, approvePending] = useActionState<ApprovalActionState, FormData>(
    approveJournalAction,
    IDLE_APPROVAL_STATE,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState<ApprovalActionState, FormData>(
    rejectJournalAction,
    IDLE_APPROVAL_STATE,
  );
  const [postingState, postingAction, postingPending] = useActionState<ApprovalActionState, FormData>(
    requestPostingAction,
    IDLE_APPROVAL_STATE,
  );

  useEffect(() => {
    let cancelled = false;
    fetchAvailableActionsAction(journal.journal_id).then((actions) => {
      if (!cancelled) setAvailableActions(actions);
    });
    return () => {
      cancelled = true;
    };
    // Re-fetch whenever a command above just changed the journal's status —
    // the set of legal next actions changes with it.
  }, [journal.journal_id, submitState, approveState, rejectState, postingState]);

  async function loadHistory() {
    setHistoryLoading(true);
    setHistory(await fetchJournalHistoryAction(journal.journal_id));
    setHistoryLoading(false);
  }

  const unbuilt = (availableActions ?? []).filter((a) => !BUILT_ACTIONS.has(a));

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Approval status
        </span>
        <span className="inline-flex rounded-full bg-navy-100 px-2 py-0.5 text-[11px] font-medium text-navy-700 dark:bg-navy-500/15 dark:text-navy-300">
          {APPROVAL_STATUS_LABELS[journal.approval_status]}
        </span>
        {journal.rejection_reason && (
          <span className="text-xs text-rose-600 dark:text-rose-400">
            Rejected: {journal.rejection_reason}
          </span>
        )}
      </div>

      {availableActions === null ? (
        <p className="text-xs text-slate-400">Checking which actions are available…</p>
      ) : availableActions.length === 0 ? (
        <p className="text-xs text-slate-500">No further approval action is available on this journal.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          <input type="hidden" name="journal_id" value={journal.journal_id} />

          {availableActions.includes("submit") && (
            <form action={submitAction}>
              <input type="hidden" name="journal_id" value={journal.journal_id} />
              <Button type="submit" size="sm" variant="secondary" disabled={submitPending}>
                {submitPending ? "Submitting…" : ACTION_LABELS.submit}
              </Button>
            </form>
          )}
          {availableActions.includes("approve") && (
            <form action={approveAction}>
              <input type="hidden" name="journal_id" value={journal.journal_id} />
              <Button type="submit" size="sm" disabled={approvePending}>
                {approvePending ? "Approving…" : ACTION_LABELS.approve}
              </Button>
            </form>
          )}
          {availableActions.includes("request-posting") && (
            <form action={postingAction}>
              <input type="hidden" name="journal_id" value={journal.journal_id} />
              <Button type="submit" size="sm" disabled={postingPending}>
                {postingPending ? "Requesting…" : ACTION_LABELS["request-posting"]}
              </Button>
            </form>
          )}
          {availableActions.includes("reject") && (
            <form action={rejectAction} className="flex items-end gap-2">
              <input type="hidden" name="journal_id" value={journal.journal_id} />
              <div>
                <label className={LABEL} htmlFor={`reject_reason_${journal.journal_id}`}>
                  Rejection reason
                </label>
                <input
                  className={`${FIELD} w-56`}
                  id={`reject_reason_${journal.journal_id}`}
                  name="reason"
                  placeholder="Required"
                />
              </div>
              <Button type="submit" size="sm" variant="secondary" disabled={rejectPending}>
                {rejectPending ? "Rejecting…" : ACTION_LABELS.reject}
              </Button>
            </form>
          )}
        </div>
      )}

      {unbuilt.length > 0 && (
        <p className="text-xs text-slate-400">
          Also available on this journal, not yet a form on this console:{" "}
          {unbuilt.map((a) => ACTION_LABELS[a] ?? a).join(", ")}.
        </p>
      )}

      {[submitState, approveState, rejectState, postingState].map((s, i) =>
        s.status !== "idle" ? (
          <ResultBanner key={i} tone={TONE[s.status]} message={s.message} />
        ) : null,
      )}

      <div>
        <Button type="button" size="sm" variant="ghost" onClick={loadHistory} disabled={historyLoading}>
          {historyLoading ? "Loading history…" : "View lifecycle history"}
        </Button>
        {history && (
          <div className="mt-2">
            {history.ok ? (
              history.entries.length === 0 ? (
                <p className="text-xs text-slate-500">No lifecycle events recorded.</p>
              ) : (
                <ol className="space-y-1.5 border-l-2 border-slate-200 pl-3 dark:border-slate-700">
                  {history.entries.map((e, i) => (
                    <li key={i} className="text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{e.event}</span>{" "}
                      <span className="text-slate-400">
                        by {e.principal_id} · {new Date(e.at).toLocaleString()}
                      </span>
                      {e.detail && <span className="block text-slate-500">{e.detail}</span>}
                    </li>
                  ))}
                </ol>
              )
            ) : (
              <ResultBanner tone="error" message={history.message} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
