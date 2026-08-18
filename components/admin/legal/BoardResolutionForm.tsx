"use client";

import { useActionState } from "react";
import { FileSignature } from "lucide-react";
import { Button } from "@/components/ui";
import { FIELD, LABEL } from "@/components/admin/shared/form";
import { proposeBoardResolution } from "@/app/admin/legal/actions";
import { IDLE_BOARD_STATE, type BoardActionState } from "@/app/admin/legal/state";
import { ActionFeedback } from "./ActionFeedback";
import type { BoardMeeting } from "@/lib/api/legal";

const CATEGORIES = ["GOVERNANCE", "FINANCIAL", "OPERATIONAL", "EXECUTIVE", "STATUTORY"];

/**
 * Propose a board resolution against board-resolutions-svc (:8122).
 *
 * Always lands in PROPOSED — the service ignores any status supplied by the
 * caller. The meeting picker offers the tenant's scheduled meetings, but a
 * resolution may also be proposed standalone (the meeting_id column is
 * optional on the service).
 */
export function BoardResolutionForm({ meetings }: { meetings: BoardMeeting[] }) {
  const [state, action, pending] = useActionState<BoardActionState, FormData>(
    proposeBoardResolution,
    IDLE_BOARD_STATE,
  );

  return (
    <div className="animate-fade-up space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
      <form action={action} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="title" className={LABEL}>
              Resolution title
            </label>
            <input
              id="title"
              name="title"
              required
              placeholder="Approve FY26 capital budget"
              className={FIELD}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="meeting_id" className={LABEL}>
              Meeting <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <select id="meeting_id" name="meeting_id" className={FIELD} defaultValue="">
              <option value="">No meeting — standalone resolution</option>
              {meetings.map((m) => (
                <option key={m.meeting_id} value={m.meeting_id}>
                  {m.title} ({new Date(m.scheduled_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="category" className={LABEL}>
              Category
            </label>
            <select id="category" name="category" required className={FIELD} defaultValue="GOVERNANCE">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="resolution_number" className={LABEL}>
              Resolution number <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="resolution_number"
              name="resolution_number"
              placeholder="BR-2026-014"
              className={`${FIELD} font-mono text-xs`}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="effective_from" className={LABEL}>
              Effective from
            </label>
            <input id="effective_from" name="effective_from" type="date" required className={FIELD} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="content" className={LABEL}>
              Content
            </label>
            <textarea
              id="content"
              name="content"
              required
              rows={4}
              placeholder="RESOLVED, that the board approves the FY26 capital budget of GBP 12,500,000..."
              className={`${FIELD} font-mono text-xs`}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" loading={pending} size="sm">
            <FileSignature className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {pending ? "Proposing…" : "Propose resolution"}
          </Button>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Always PROPOSED on creation — it stays open for votes until it is passed.
          </p>
        </div>
      </form>
      <ActionFeedback state={state} />
    </div>
  );
}