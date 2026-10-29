"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Gavel, Users, Vote } from "lucide-react";
import { Button } from "@/components/ui";
import { FIELD, HINT, LABEL, OPTIONAL, PANEL } from "@/components/admin/shared/form";
import { openVoting, castVote, closeVoting } from "@/app/admin/legal/actions";
import { IDLE_BOARD_STATE, type BoardActionState } from "@/app/admin/legal/state";
import { ActionFeedback } from "./ActionFeedback";
import { ResolutionSummary } from "./BoardSummary";
import { describeResolutionStatus, type BoardResolution } from "@/lib/api/legal";
import { formatDateTime } from "@/lib/format";

/**
 * Voting actions for one resolution, following board-resolutions-svc:
 *
 *   PROPOSED → open voting (fix roster + quorum) → OPEN
 *   OPEN     → each roster member casts their own vote
 *   OPEN     → someone other than the proposer closes it → PASSED | FAILED
 *
 * The service decides the outcome at close: PASSED only when the votes cast
 * reach the quorum and FOR outnumbers AGAINST, and only with the evidence the
 * category requires on file. These forms state the rules up front; the service
 * is the only thing that enforces them.
 */
export function ResolutionActions({
  resolution,
  /** The signed-in principal, so proposer and roster rules can be explained
   *  before the attempt. */
  currentPrincipalId,
}: {
  resolution: BoardResolution;
  currentPrincipalId?: string;
}) {
  const [openPanel, setOpenPanel] = useState(false);
  const [openState, openAction, openPending] = useActionState<BoardActionState, FormData>(
    openVoting,
    IDLE_BOARD_STATE,
  );
  const [voteState, voteAction, votePending] = useActionState<BoardActionState, FormData>(
    castVote,
    IDLE_BOARD_STATE,
  );
  const [closeState, closeAction, closePending] = useActionState<BoardActionState, FormData>(
    closeVoting,
    IDLE_BOARD_STATE,
  );

  const status = describeResolutionStatus(resolution.status);

  // An unrecognised status also sets `final`, so it is handled first: this
  // console will not act on a record it cannot read.
  if (status.unmapped) {
    return (
      <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
        No actions are offered here: this resolution is in a state this console does not
        recognise, so it cannot say whether the board has decided it. Check with whoever
        operates the service before relying on the record.
      </p>
    );
  }

  if (status.final) {
    return (
      <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
        <ActionFeedback state={closeState}>
          {closeState.resolution && (
            <ResolutionSummary resolution={closeState.resolution} variant="compact" />
          )}
        </ActionFeedback>
        <p className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Closed — {status.label.toLowerCase()}
            {resolution.voting_closed_at ? `, ${formatDateTime(resolution.voting_closed_at)}` : ""}
          </span>
        </p>
        {resolution.passed_by && (
          <p className="pl-5">
            Closed by <span className="font-mono">{resolution.passed_by}</span>
          </p>
        )}
        <p className="pl-5 text-slate-400 dark:text-slate-500">
          Its votes and its outcome can no longer be changed.
        </p>
      </div>
    );
  }

  const hidden = (
    <>
      <input type="hidden" name="resolution_id" value={resolution.resolution_id} />
      <input type="hidden" name="resolution_title" value={resolution.title} />
    </>
  );

  if (resolution.status === "PROPOSED") {
    return (
      <div className="space-y-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpenPanel((o) => !o)}>
          <Users className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {openPanel ? "Cancel" : "Open voting"}
        </Button>

        {openPanel && (
          <form action={openAction} className={PANEL}>
            {hidden}
            <div>
              <label htmlFor={`roster_${resolution.resolution_id}`} className={LABEL}>
                Voter roster <span className={OPTIONAL}>(principal IDs, one per line)</span>
              </label>
              <textarea
                id={`roster_${resolution.resolution_id}`}
                name="voter_principal_ids"
                required
                rows={3}
                defaultValue={currentPrincipalId ?? ""}
                className={FIELD}
              />
            </div>
            <div className="max-w-40">
              <label htmlFor={`quorum_${resolution.resolution_id}`} className={LABEL}>
                Quorum (votes)
              </label>
              <input
                id={`quorum_${resolution.resolution_id}`}
                name="quorum_threshold"
                type="number"
                min={1}
                step={1}
                required
                defaultValue={1}
                className={FIELD}
              />
            </div>
            <p className={HINT}>
              Both are frozen once voting opens. The quorum is how many roster votes must be cast
              for the result to count, from 1 up to the roster size.
            </p>
            <Button type="submit" size="sm" loading={openPending}>
              {openPending ? "Opening…" : "Open voting"}
            </Button>
          </form>
        )}

        <ActionFeedback state={openState} />
      </div>
    );
  }

  // OPEN
  const isProposer = Boolean(currentPrincipalId) && resolution.created_by === currentPrincipalId;

  return (
    <div className="space-y-3">
      {/* A successful open refreshes the record to OPEN, which lands here, not in
          the PROPOSED branch above — so its confirmation is shown here. */}
      <ActionFeedback state={openState} />
      <form action={voteAction} className="flex flex-wrap items-end gap-2">
        {hidden}
        <div>
          <label htmlFor={`vote_${resolution.resolution_id}`} className={LABEL}>
            Your vote
          </label>
          <select
            id={`vote_${resolution.resolution_id}`}
            name="vote"
            defaultValue="FOR"
            className={FIELD}
          >
            <option value="FOR">For</option>
            <option value="AGAINST">Against</option>
            <option value="ABSTAIN">Abstain</option>
          </select>
        </div>
        <Button type="submit" variant="secondary" size="sm" loading={votePending}>
          {!votePending && <Vote className="mr-1.5 h-4 w-4" aria-hidden="true" />}
          {votePending ? "Recording…" : "Cast my vote"}
        </Button>
      </form>
      <p className={HINT}>
        Only people on the roster frozen when voting opened can vote, once each.
        {resolution.quorum_threshold ? ` Quorum: ${resolution.quorum_threshold} vote(s).` : ""}
      </p>
      <ActionFeedback state={voteState} />

      {isProposer ? (
        <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          You proposed this resolution, so you cannot close its vote. Someone else with the
          authority to close resolutions has to do it.
        </p>
      ) : (
        <form action={closeAction} className="flex flex-wrap items-end gap-2">
          {hidden}
          <input type="hidden" name="resolution_created_by" value={resolution.created_by} />
          <div>
            <label htmlFor={`minutes_${resolution.resolution_id}`} className={LABEL}>
              Minutes document ID <span className={OPTIONAL}>(optional)</span>
            </label>
            <input
              id={`minutes_${resolution.resolution_id}`}
              name="document_vault_id"
              className={FIELD}
              autoComplete="off"
            />
          </div>
          <Button type="submit" size="sm" loading={closePending}>
            {!closePending && <Gavel className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            {closePending ? "Closing…" : "Close voting"}
          </Button>
        </form>
      )}

      <ActionFeedback state={closeState}>
        {closeState.resolution && (
          <ResolutionSummary resolution={closeState.resolution} variant="compact" />
        )}
      </ActionFeedback>
    </div>
  );
}
