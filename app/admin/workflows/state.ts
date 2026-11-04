import type {
  ReleaseVerification,
  WorkflowDefinition,
  WorkflowTransition,
  WorkflowWithStages,
} from "@/lib/api/workflow";

/**
 * Action states for the workflow console.
 *
 * `refused` is kept apart from `error` throughout. Most refusals here are the
 * controls working — the initiator may not approve their own workflow, nobody
 * decides two stages, a service account never decides one — and reading those
 * as faults invites a retry, which is exactly the wrong response.
 *
 * `replayed` is kept apart from success: the service is idempotent on the
 * request key, and a resubmitted form resolves to what the first submission
 * already did. Reporting that as a new decision would tell an operator they had
 * just approved something that was approved a minute ago.
 */

export type StartWorkflowState =
  | { status: "idle" }
  | { status: "started" | "replayed"; workflow: WorkflowWithStages; message: string }
  | { status: "refused" | "error"; message: string };

export type DecideWorkflowState =
  | { status: "idle" }
  | { status: "decided" | "replayed"; workflow: WorkflowWithStages; message: string }
  | { status: "refused" | "error"; message: string };

export type LifecycleState =
  | { status: "idle" }
  | { status: "done"; message: string }
  | { status: "refused" | "error"; message: string };

export type ReleaseState =
  | { status: "idle" }
  | { status: "covered" | "not-covered"; result: ReleaseVerification; message: string }
  | { status: "refused" | "error"; message: string };

export type DefineWorkflowState =
  | { status: "idle" }
  | { status: "defined"; definition: WorkflowDefinition; message: string }
  | { status: "refused" | "error"; message: string };

export type DefinitionCommandState =
  | { status: "idle" }
  | { status: "done"; message: string }
  | { status: "refused" | "error"; message: string };

/** What the lookup reads back: the instance and, separately, its trail. The
 *  trail can be refused on its own, so it is optional rather than fatal. */
export type WorkflowRecord = {
  workflow: WorkflowWithStages;
  transitions: WorkflowTransition[] | null;
  transitionsError?: string;
};

export const IDLE_START: StartWorkflowState = { status: "idle" };
export const IDLE_DECIDE: DecideWorkflowState = { status: "idle" };
export const IDLE_LIFECYCLE: LifecycleState = { status: "idle" };
export const IDLE_RELEASE: ReleaseState = { status: "idle" };
export const IDLE_DEFINE: DefineWorkflowState = { status: "idle" };
export const IDLE_DEFINITION_COMMAND: DefinitionCommandState = { status: "idle" };
