"use client";

import { useActionState, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL, CELL, HEAD } from "@/components/admin/shared/form";
import { searchWorkflowHistoryAction } from "@/app/admin/workflow-history/actions";
import { IDLE_SEARCH_HISTORY, type SearchHistoryState } from "@/app/admin/workflow-history/state";
import { summarizeEvent } from "@/lib/api/workflow-history";

const TONE = {
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
  found: "success",
} as const;

function when(value: string): string {
  return new Date(value).toLocaleString("en-CA");
}

/**
 * Search every workflow history event for a legal entity within a time
 * window, across every workflow instance — GET /v1/workflows/history.
 *
 * This route always answers 200 with an array, empty when nothing matches;
 * there is no 404 case to distinguish here, unlike the per-instance lookup.
 */
export function CrossWorkflowSearch({ legalEntityId }: { legalEntityId: string }) {
  const [state, action, pending] = useActionState<SearchHistoryState, FormData>(
    searchWorkflowHistoryAction,
    IDLE_SEARCH_HISTORY,
  );
  const [searchTerm, setSearchTerm] = useState("");

  const events = state.status === "found" ? state.events : [];
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return events;
    return events.filter(
      (e) =>
        e.workflow_instance_id.toLowerCase().includes(term) ||
        e.event_type.toLowerCase().includes(term) ||
        e.correlation_id.toLowerCase().includes(term),
    );
  }, [events, searchTerm]);

  return (
    <div className="space-y-4">
      <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={LABEL} htmlFor="ch_legal_entity_id">
            Legal entity <span className={OPTIONAL}>(defaults to your session)</span>
          </label>
          <input className={FIELD} id="ch_legal_entity_id" name="legal_entity_id" defaultValue={legalEntityId} />
        </div>
        <div>
          <label className={LABEL} htmlFor="from">
            From
          </label>
          <input className={FIELD} id="from" name="from" type="date" required />
        </div>
        <div>
          <label className={LABEL} htmlFor="to">
            To
          </label>
          <input className={FIELD} id="to" name="to" type="date" required />
        </div>
        <div className="sm:col-span-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Searching…" : "Search history"}
          </Button>
        </div>
      </form>

      {state.status !== "idle" && state.status !== "found" && (
        <ResultBanner tone={TONE[state.status]} message={state.message} />
      )}

      {state.status === "found" && (
        <div className="space-y-3">
          {events.length === 0 ? (
            <p className="text-sm text-slate-500">No workflow history events in that window.</p>
          ) : (
            <>
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by instance ID, event type, or correlation ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-navy-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[48rem] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className={HEAD}>Workflow instance</th>
                      <th className={HEAD}>Event</th>
                      <th className={HEAD}>Correlation ID</th>
                      <th className={HEAD}>Recorded at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td className={`${CELL} text-slate-400`} colSpan={4}>
                          No event matches &ldquo;{searchTerm}&rdquo;.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((e) => (
                        <tr key={e.event_id} className="border-t border-slate-100 dark:border-slate-800">
                          <td className={`${CELL} font-mono text-xs`}>{e.workflow_instance_id}</td>
                          <td className={CELL}>{summarizeEvent(e)}</td>
                          <td className={CELL}>
                            <span className="font-mono text-[11px] text-slate-400">{e.correlation_id}</span>
                          </td>
                          <td className={CELL}>
                            <span className="text-xs">{when(e.recorded_at)}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
