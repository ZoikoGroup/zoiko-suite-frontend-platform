"use client";

import { useActionState } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui";
import { FIELD, LABEL } from "@/components/admin/shared/form";
import { scheduleBoardMeeting } from "@/app/admin/legal/actions";
import { IDLE_BOARD_STATE, type BoardActionState } from "@/app/admin/legal/state";
import { ActionFeedback } from "./ActionFeedback";

/**
 * Schedule a board meeting against board-resolutions-svc (:8122).
 *
 * The service authorizes MEETING_CREATE against the meeting's legal entity and
 * refuses a request without a principal, so a session is required; both are
 * enforced server-side in the action, not presented as choices here.
 */
export function BoardMeetingForm() {
  const [state, action, pending] = useActionState<BoardActionState, FormData>(
    scheduleBoardMeeting,
    IDLE_BOARD_STATE,
  );

  return (
    <div className="animate-fade-up space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
      <form action={action} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="title" className={LABEL}>
              Meeting title
            </label>
            <input
              id="title"
              name="title"
              required
              placeholder="Q3 Board of Directors"
              className={FIELD}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="scheduled_at" className={LABEL}>
              Scheduled at
            </label>
            <input id="scheduled_at" name="scheduled_at" type="datetime-local" required className={FIELD} />
          </div>
          <div>
            <label htmlFor="location" className={LABEL}>
              Location
            </label>
            <input id="location" name="location" placeholder="Boardroom 1" className={FIELD} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="effective_from" className={LABEL}>
              Effective from
            </label>
            <input id="effective_from" name="effective_from" type="date" required className={FIELD} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" loading={pending} size="sm">
            <CalendarPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {pending ? "Scheduling…" : "Schedule meeting"}
          </Button>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Meetings are created as SCHEDULED — the service never accepts a caller-supplied status.
          </p>
        </div>
      </form>
      <ActionFeedback state={state} />
    </div>
  );
}
