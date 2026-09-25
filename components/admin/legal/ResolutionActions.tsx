"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Gavel, Vote } from "lucide-react";
import { Button } from "@/components/ui";
import { FIELD, HINT, LABEL, OPTIONAL, PANEL } from "@/components/admin/shared/form";
import {
  tallyResolutionVotes,
  passResolutionIntoForce,
} from "@/app/admin/legal/actions";
import { IDLE_BOARD_STATE, type BoardActionState } from "@/app/admin/legal/state";
import { ActionFeedback } from "./ActionFeedback";
import { ResolutionSummary } from "./BoardSummary";
import { describeResolutionStatus, type BoardResolution } from "@/lib/api/legal";
import { formatDateTime } from "@/lib/format";

/**
 * Vote tally and pass actions for one resolution.
 *
 * Recording votes only stores three counts — the service does not compare them,
 * check them against a quorum, or change the resolution's state because of them,
 * so a resolution stays open until it is passed. Passing is the closing action:
 * it requires someone other than the proposer, and the supporting evidence the
 * board's rules demand for that category of decision must already be on file.
 *
 * Both constraints are stated before the button is pressed rather than only
 * reported as a refusal afterwards. The service remains the only thing that
 * enforces either; this just stops the reader discovering them by being told no.
 */
export function ResolutionActions({
  resolution,
  /** The signed-in principal, so the proposer-may-not-pass rule can be
   *  explained up front. Omitted where the caller has no session to hand, in
   *  which case the refusal is only reported after the attempt. */
  currentPrincipalId,
}: {
  resolution: BoardResolution;
  currentPrincipalId?: string;
}) {
  const [tallyOpen, setTallyOpen] = useState(false);
  const [voteState, voteAction, votePending] = useActionState<BoardActionState, FormData>(
    tallyResolutionVotes,
    IDLE_BOARD_STATE,
  );
  const [passState, passAction, passPending] = useActionState<BoardActionState, FormData>(
    passResolutionIntoForce,
    IDLE_BOARD_STATE,
  );

  const status = describeResolutionStatus(resolution.status);

  // An unrecognised status also sets `final`, so it is handled first. It is
  // final only in the sense that this console will not act on a record it
  // cannot read — reporting it as closed would claim the decision was settled.
  if (status.unmapped) {
    return (
      <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
        No actions are offered here: this resolution is in a state this console does not
        recognise, so it cannot say whether the board has decided it. Check with whoever
        operates the service before relying on the record.
      </p>
    );
  }

  // A closed resolution offers no actions, so this says what happened to it
  // instead — including who closed it and when, which is the fact anyone
  // querying the decision afterwards actually wants.
  if (status.final) {
    return (
      <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
        <p className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Closed — {status.label.toLowerCase()}
            {resolution.passed_at ? `, ${formatDateTime(resolution.passed_at)}` : ""}
          </span>
        </p>
        {resolution.passed_by && (
          <p className="pl-5">
            Put into force by <span className="font-mono">{resolution.passed_by}</span>
          </p>
        )}
        <p className="pl-5 text-slate-400 dark:text-slate-500">
          Its votes and its outcome can no longer be changed.
        </p>
      </div>
    );
  }

  const isProposer = Boolean(currentPrincipalId) && resolution.created_by === currentPrincipalId;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setTallyOpen((o) => !o)}>
          <Vote className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {tallyOpen ? "Hide vote counts" : "Record how the board voted"}
        </Button>
        {!isProposer && (
          <form action={passAction}>
            <input type="hidden" name="resolution_id" value={resolution.resolution_id} />
            <input type="hidden" name="resolution_title" value={resolution.title} />
            <input type="hidden" name="resolution_created_by" value={resolution.created_by} />
            <Button type="submit" variant="secondary" size="sm" loading={passPending}>
              <Gavel className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {passPending ? "Passing…" : "Pass into force"}
            </Button>
          </form>
        )}
      </div>

      {isProposer ? (
        <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          You proposed this resolution, so you cannot be the one to pass it. One person must not
          be able to put their own proposal into force on their own — someone else with the
          authority to close resolutions has to do it.
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-slate-400 dark:text-slate-500">
          Passing puts the decision into force and closes the record for good. It will be refused
          unless the supporting evidence the board requires for this kind of decision is already
          on file.
        </p>
      )}

      {/* The passed resolution, read back in plain English. */}
      <ActionFeedback state={passState}>
        {passState.resolution && (
          <ResolutionSummary resolution={passState.resolution} variant="compact" />
        )}
      </ActionFeedback>

      {tallyOpen && (
        <form action={voteAction} className={PANEL}>
          <input type="hidden" name="resolution_id" value={resolution.resolution_id} />
          <input type="hidden" name="resolution_title" value={resolution.title} />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor={`votes_for_${resolution.resolution_id}`} className={LABEL}>
                In favour
              </label>
              <input
                id={`votes_for_${resolution.resolution_id}`}
                name="votes_for"
                type="number"
                min={0}
                step={1}
                defaultValue={resolution.votes_for}
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor={`votes_against_${resolution.resolution_id}`} className={LABEL}>
                Against
              </label>
              <input
                id={`votes_against_${resolution.resolution_id}`}
                name="votes_against"
                type="number"
                min={0}
                step={1}
                defaultValue={resolution.votes_against}
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor={`abstentions_${resolution.resolution_id}`} className={LABEL}>
                Abstained <span className={OPTIONAL}>(no vote)</span>
              </label>
              <input
                id={`abstentions_${resolution.resolution_id}`}
                name="abstentions"
                type="number"
                min={0}
                step={1}
                defaultValue={resolution.abstentions}
                className={FIELD}
              />
            </div>
          </div>
          <p className={HINT}>
            A count of people, entered by hand. Nothing checks these figures against a quorum or
            against the size of the board.
          </p>
          <div className="flex items-center gap-3">
            <Button type="submit" loading={votePending} size="sm">
              {votePending ? "Saving…" : "Save the count"}
            </Button>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Saving the count decides nothing — the resolution still has to be passed, whichever
              way the vote went.
            </p>
          </div>

          {/* The updated tally, read back in plain English. */}
          <ActionFeedback state={voteState}>
            {voteState.resolution && (
              <ResolutionSummary resolution={voteState.resolution} variant="compact" />
            )}
          </ActionFeedback>
        </form>
      )}
    </div>
  );
}
