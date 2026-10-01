import type { WorkflowHistoryEvent } from "@/lib/api/workflow-history";

/**
 * Outcome of looking up one workflow instance's history.
 *
 * `not_found` is kept distinct from an empty result: the service answers 404
 * for a genuinely unknown or cross-tenant instance id — deliberately
 * indistinguishable between the two, by design (anti-enumeration) — so this
 * is a real, different outcome from "found zero events" (which cannot
 * actually happen on this route: a 200 always carries at least one event).
 */
export type InstanceHistoryState =
  | { status: "idle" }
  | { status: "found"; workflowInstanceId: string; events: WorkflowHistoryEvent[] }
  | { status: "not_found"; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export const IDLE_INSTANCE_HISTORY: InstanceHistoryState = { status: "idle" };

/**
 * Outcome of a cross-workflow search. No `not_found` variant — this route
 * always answers 200 with an array, empty when nothing matches the window.
 */
export type SearchHistoryState =
  | { status: "idle" }
  | { status: "found"; events: WorkflowHistoryEvent[] }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export const IDLE_SEARCH_HISTORY: SearchHistoryState = { status: "idle" };
