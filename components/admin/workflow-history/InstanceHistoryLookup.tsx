"use client";

import { useState } from "react";
import { Search, Play, CheckCircle2, XCircle, AlertTriangle, Flag } from "lucide-react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { FIELD, LABEL } from "@/components/admin/shared/form";
import { lookupInstanceHistoryAction } from "@/app/admin/workflow-history/actions";
import { IDLE_INSTANCE_HISTORY, type InstanceHistoryState } from "@/app/admin/workflow-history/state";
import { extractWorkflowType, summarizeEvent, type WorkflowHistoryEvent } from "@/lib/api/workflow-history";

const TONE = {
  not_found: "warning",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

const EVENT_ICON: Record<WorkflowHistoryEvent["event_type"], typeof Play> = {
  "workflow.started": Play,
  "approval.granted": CheckCircle2,
  "approval.rejected": XCircle,
  "workflow.escalated": AlertTriangle,
  "workflow.completed": Flag,
};

const EVENT_TONE: Record<WorkflowHistoryEvent["event_type"], string> = {
  "workflow.started": "text-sky-600 dark:text-sky-400",
  "approval.granted": "text-emerald-600 dark:text-emerald-400",
  "approval.rejected": "text-rose-600 dark:text-rose-400",
  "workflow.escalated": "text-amber-600 dark:text-amber-400",
  "workflow.completed": "text-slate-600 dark:text-slate-300",
};

function when(value: string): string {
  return new Date(value).toLocaleString("en-CA");
}

/**
 * Look up one workflow instance's full history and render it as a timeline.
 *
 * A 404 here (no history for that id, in this tenant) is shown as its own
 * distinct outcome — not folded into a generic error, and not shown as an
 * empty timeline, since the service treats "unknown" and "someone else's" as
 * the same deliberately-indistinguishable answer.
 */
export function InstanceHistoryLookup() {
  const [instanceId, setInstanceId] = useState("");
  const [state, setState] = useState<InstanceHistoryState>(IDLE_INSTANCE_HISTORY);
  const [pending, setPending] = useState(false);

  async function onLookup(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const result = await lookupInstanceHistoryAction(instanceId);
    setState(result);
    setPending(false);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onLookup} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[20rem] flex-1">
          <label className={LABEL} htmlFor="workflow_instance_id">
            Workflow instance ID
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className={`${FIELD} pl-9`}
              id="workflow_instance_id"
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value)}
              placeholder="e.g. a workflow instance ID from Purchase Orders, Invoice Approval, etc."
              required
            />
          </div>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Looking up…" : "Look up history"}
        </Button>
      </form>

      {state.status !== "idle" && state.status !== "found" && (
        <ResultBanner tone={TONE[state.status]} message={state.message} />
      )}

      {state.status === "found" && (
        <div className="space-y-3">
          {extractWorkflowType(state.events) && (
            <p className="text-xs text-slate-500">
              Workflow type: <span className="font-medium text-slate-700 dark:text-slate-300">{extractWorkflowType(state.events)}</span>
            </p>
          )}
          <ol className="space-y-3 border-l-2 border-slate-200 pl-4 dark:border-slate-800">
            {state.events.map((event) => {
              const Icon = EVENT_ICON[event.event_type] ?? Play;
              return (
                <li key={event.event_id} className="relative">
                  <span className="absolute -left-[1.45rem] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white dark:bg-slate-950">
                    <Icon className={`h-4 w-4 ${EVENT_TONE[event.event_type] ?? "text-slate-500"}`} />
                  </span>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {summarizeEvent(event)}
                    </span>
                    <span className="text-xs text-slate-400">{when(event.recorded_at)}</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">{event.event_type}</div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
