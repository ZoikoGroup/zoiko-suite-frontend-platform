import { cookies } from "next/headers";
import { CloudOff, Scale, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listBoardMeetings, listBoardResolutions } from "@/lib/api/legal";
import { BoardMeetingForm } from "./BoardMeetingForm";
import { BoardResolutionForm } from "./BoardResolutionForm";
import { ResolutionActions } from "./ResolutionActions";

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  IN_PROGRESS: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  ADJOURNED: "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  PROPOSED: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  PASSED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  RESCINDED: "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",
};

const CATEGORY_COLORS: Record<string, string> = {
  GOVERNANCE: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  FINANCIAL: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  OPERATIONAL: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  EXECUTIVE: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  STATUTORY: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
};

export async function BoardResolutionsPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in to view board meetings and resolutions."
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

  const serviceDown = !meetingsResult.ok && meetingsResult.error.kind === "unreachable";

  if (serviceDown) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="board-resolutions-svc unavailable"
        hint={meetingsResult.error.message}
      />
    );
  }

  const meetings = meetingsResult.ok ? meetingsResult.data : [];
  const resolutions = resolutionsResult.ok ? resolutionsResult.data : [];

  return (
    <div className="space-y-6">
      {/* Write path: schedule a meeting + propose a resolution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Schedule a meeting
          </h3>
          <BoardMeetingForm />
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Propose a resolution
          </h3>
          <BoardResolutionForm meetings={meetings} />
        </div>
      </div>

      {/* Meetings Table */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Board Meetings ({meetings.length})
        </h3>
        {meetings.length === 0 ? (
          <PanelEmptyState icon={Scale} label="No board meetings recorded" hint="Meetings created via board-resolutions-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Title", "Scheduled", "Location", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {meetings.map((m) => (
                  <tr key={m.meeting_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{m.title}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {new Date(m.scheduled_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{m.location ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_COLORS[m.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resolutions Table */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Board Resolutions ({resolutions.length})
        </h3>
        {resolutions.length === 0 ? (
          <PanelEmptyState icon={Scale} label="No resolutions recorded" hint="Resolutions created via board-resolutions-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Number", "Title", "Category", "Votes", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {resolutions.map((r) => (
                  <tr key={r.resolution_id} className="align-top hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{r.resolution_number || "—"}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 max-w-[240px]">
                      <span className="block truncate">{r.title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${CATEGORY_COLORS[r.category] ?? "bg-slate-100 text-slate-600"}`}>
                        {r.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">{r.votes_for}✓</span>
                      {" · "}
                      <span className="text-red-500 dark:text-red-400">{r.votes_against}✗</span>
                      {r.abstentions > 0 && <span className="ml-1 text-slate-400">+{r.abstentions} abs.</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_COLORS[r.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ResolutionActions resolution={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
