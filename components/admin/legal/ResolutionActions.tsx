"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Gavel, Vote } from "lucide-react";
import { Button } from "@/components/ui";
import { FIELD, LABEL } from "@/components/admin/shared/form";
import {
  tallyResolutionVotes,
  passResolutionIntoForce,
} from "@/app/admin/legal/actions";
import { IDLE_BOARD_STATE, type BoardActionState } from "@/app/admin/legal/state";
import { ActionFeedback } from "./ActionFeedback";
import type { BoardResolution } from "@/lib/api/legal";

const PANEL_WRAP =
  "animate-fade-up space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40";

/**
 * Vote tally and pass actions for one resolution.
 *
 * Voting only tallies aggregate counts â€” the service does not finalize status
 * on a vote, so the resolution stays PROPOSED until it is passed. Passing is
 * the closing action: it requires a distinct principal (segregation of duties
 * â€” the proposer may not pass their own resolution) and verifies the evidence
 * gate via evidence-requirements-svc before finalizing. The UI mirrors the
 * SoD refusal up front, but the service is the only thing that actually
 * enforces it.
 */
export function ResolutionActions({ resolution }: { resolution: BoardResolution }) {
  const [tallyOpen, setTallyOpen] = useState(false);
  const [voteState, voteAction, votePending] = useActionState<BoardActionState, FormData>(
    tallyResolutionVotes,
    IDLE_BOARD_STATE,
  );
  const [passState, passAction, passPending] = useActionState<BoardActionState, FormData>(
    passResolutionIntoForce,
    IDLE_BOARD_STATE,
  );

  if (resolution.status !== "PROPOSED") {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Finalized as {resolution.status}
        {resolution.passed_by && (
          <span className="font-mono">â€” passed by {resolution.passed_by}</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setTallyOpen((o) => !o)}>
          <Vote className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Tally votes
        </Button>
        <form action={passAction}>
          <input type="hidden" name="resolution_id" value={resolution.resolution_id} />
          <input type="hidden" name="resolution_title" value={resolution.title} />
          <input type="hidden" name="resolution_created_by" value={resolution.created_by} />
          <Button type="submit" variant="secondary" size="sm" loading={passPending}>
            <Gavel className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {passPending ? "Passingâ€¦" : "Pass into force"}
          </Button>
        </form>
      </div>
      <ActionFeedback state={passState} />

      {tallyOpen && (
        <form action={voteAction} className={PANEL_WRAP}>
          <input type="hidden" name="resolution_id" value={resolution.resolution_id} />
          <input type="hidden" name="resolution_title" value={resolution.title} />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor={`votes_for_${resolution.resolution_id}`} className={LABEL}>
                For
              </label>
              <input
                id={`votes_for_${resolution.resolution_id}`}
                name="votes_for"
                type="number"
                min={0}
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
                defaultValue={resolution.votes_against}
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor={`abstentions_${resolution.resolution_id}`} className={LABEL}>
                Abstentions
              </label>
              <input
                id={`abstentions_${resolution.resolution_id}`}
                name="abstentions"
                type="number"
                min={0}
                defaultValue={resolution.abstentions}
                className={FIELD}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" loading={votePending} size="sm">
              {votePending ? "Recordingâ€¦" : "Record tally"}
            </Button>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Tallying never finalizes â€” only a pass closes the resolution.
            </p>
          </div>
        </form>
      )}
      <ActionFeedback state={voteState} />
    </div>
  );
}
