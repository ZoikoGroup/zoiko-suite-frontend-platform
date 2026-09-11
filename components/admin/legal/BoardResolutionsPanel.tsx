import { cookies } from "next/headers";
import { CloudOff, Scale, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui";
import { PanelEmptyState } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import {
  describeMeetingStatus,
  describeResolutionCategory,
  describeResolutionStatus,
  summariseVotes,
  listBoardMeetings,
  listBoardResolutions,
} from "@/lib/api/legal";
import { BoardMeetingForm } from "./BoardMeetingForm";
import { BoardResolutionForm } from "./BoardResolutionForm";
import { ResolutionActions } from "./ResolutionActions";
import { ResolutionSummary } from "./BoardSummary";

/**
 * The board register: meetings booked, and resolutions put to the board.
 *
 * Resolutions are rendered as records rather than as table rows. Two reasons,
 * and the first is the stronger: the wording of a resolution IS the decision,
 * and a table had nowhere to put it — the `content` field was never shown at
 * all, so the console displayed everything about each decision except what was
 * decided. The second is that the columns a table can hold were codes.
 * PROPOSED and PASSED look equally settled side by side, and only one of them
 * means the board has agreed anything.
 *
 * Meetings stay a table. A booked meeting has nothing to read — where and when
 * is the whole of it — so scanning is what a reader wants from that list.
 */
export async function BoardResolutionsPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="You are not signed in"
        hint="Sign in to see the board's meetings and resolutions."
      />
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const [meetingsResult, resolutionsResult] = await Promise.all([
    listBoardMeetings(identity),
    listBoardResolutions(identity),
  ]);

  if (!meetingsResult.ok && meetingsResult.error.kind === "unreachable") {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="The board records cannot be reached"
        hint="Nothing is lost — the service that holds them is not responding. Try again shortly."
      />
    );
  }

  const meetings = meetingsResult.ok ? meetingsResult.data : [];
  const resolutions = resolutionsResult.ok ? resolutionsResult.data : [];

  return (
    <div className="space-y-8">
      {/* Write path: book a meeting, put a resolution to the board. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Book a meeting
          </h3>
          <BoardMeetingForm />
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Put a resolution to the board
          </h3>
          <BoardResolutionForm meetings={meetings} />
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Meetings in the diary ({meetings.length})
        </h3>
        {meetings.length === 0 ? (
          <PanelEmptyState
            icon={Scale}
            label="No meetings have been booked"
            hint="Book one above and it will be listed here."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Meeting", "When it sits", "Where", "Stage"].map((h) => (
                    <th key={h} className={`${HEAD} text-left`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {meetings.map((m) => {
                  const status = describeMeetingStatus(m.status);
                  return (
                    <tr
                      key={m.meeting_id}
                      className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                    >
                      <td className={`${CELL} font-medium text-slate-800 dark:text-slate-200`}>
                        {m.title}
                      </td>
                      <td className={`${CELL} whitespace-nowrap`}>
                        {m.scheduled_at ? formatDateTime(m.scheduled_at) : "Not recorded"}
                      </td>
                      <td className={CELL}>{m.location || "Not recorded"}</td>
                      <td className={CELL}>
                        {/* The label reads, the code stays quotable. */}
                        <Badge tone={status.tone}>{status.label}</Badge>
                        <span className="ml-2 font-mono text-[10px] text-slate-400 dark:text-slate-500">
                          {status.raw}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Resolutions put to the board ({resolutions.length})
        </h3>
        {resolutions.length === 0 ? (
          <PanelEmptyState
            icon={Scale}
            label="No resolutions have been put to the board"
            hint="Propose one above and it will be listed here."
          />
        ) : (
          <ul className="space-y-3">
            {resolutions.map((r) => {
              const status = describeResolutionStatus(r.status);
              const category = describeResolutionCategory(r.category);
              const votes = summariseVotes(r);

              return (
                <li
                  key={r.resolution_id}
                  className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                >
                  {/* The scannable line: where it stands, what it is called,
                      what kind of decision, and how the vote went. Everything
                      a table gave, without asking the reader to know a code. */}
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        {r.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {r.resolution_number
                          ? `Resolution ${r.resolution_number}`
                          : "Not numbered"}
                        {" · "}
                        {category.label}
                        {" · "}
                        {votes.line}
                      </p>
                    </div>
                    <Badge tone={status.tone} dot={status.raw === "PASSED"}>
                      {status.label}
                    </Badge>
                  </div>

                  {/* Full detail behind a disclosure. Open, a dozen of these
                      would bury the list; closed, the reader can still see
                      which resolution they want before opening it. */}
                  <details className="group">
                    {/* Chevron-and-stable-label, matching the disclosure in
                        PayloadDetails — one affordance across the console. */}
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-navy-700 transition-colors hover:bg-slate-50 dark:text-navy-300 dark:hover:bg-slate-800/40">
                      <span className="transition-transform group-open:rotate-90" aria-hidden="true">
                        ›
                      </span>
                      Read it in full{status.final ? "" : ", and act on it"}
                    </summary>
                    <div className="space-y-5 border-t border-slate-100 px-4 py-4 dark:border-slate-800">
                      <ResolutionSummary resolution={r} />
                      <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                        <ResolutionActions
                          resolution={r}
                          currentPrincipalId={session.principalId}
                        />
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
