import type { SessionIdentity } from "@/lib/auth";
import type { ApiError, ApiResult } from "@/lib/api/client";
import {
  listPendingApprovals,
  listWorkflowDefinitions,
  getWorkflow,
  listWorkflowInstances,
  type WorkflowInstance,
  type WorkflowDefinition,
  type WorkflowTransition,
} from "@/lib/api/workflow";
import { readAll } from "@/lib/api/evidence";

/** A register's rows, or why there are none to show. `more` = cut at the limit. */
export type Read<T> = { rows: T[]; error: ApiError | null; more: boolean };

/** How many recent workflows the console lists and summarises. */
export const WORKFLOW_WINDOW = 1000;

export type WorkflowData = {
  pending: Read<WorkflowInstance>;
  instances: Read<WorkflowInstance>;
  definitions: Read<WorkflowDefinition>;
  transitions: Read<WorkflowTransition>;
};

function read<T>(r: ApiResult<{ rows: T[]; more: boolean }>): Read<T> {
  return r.ok ? { rows: r.data.rows, error: null, more: r.data.more } : { rows: [], error: r.error, more: false };
}

export async function loadWorkflow(identity: SessionIdentity): Promise<WorkflowData> {
  const who = { ...identity, tenantId: identity.tenantId };
  const [pending, instances, definitions, transitions] = await Promise.all([
    readAll((p) => listPendingApprovals(who, p), WORKFLOW_WINDOW),
    readAll((p) => listWorkflowInstances(who, p), WORKFLOW_WINDOW),
    readAll((p) => listWorkflowDefinitions(who, p), WORKFLOW_WINDOW),
    getWorkflow("dummy", who).then((r) => ({ ok: false as const, error: { kind: "not_found", message: "transitions loaded per-instance" } })),
  ]);
  return {
    pending: read(pending),
    instances: read(instances),
    definitions: read(definitions),
    transitions: { rows: [], error: null, more: false },
  };
}

/** The first unreadable register among these, ignoring "you may not see this" (403). */
export function firstProblem(...reads: { error: ApiError | null }[]): ApiError | null {
  return reads.find((r) => r.error && r.error.status !== 403)?.error ?? null;
}

/** Workflow status ordering for pipeline display. */
export const WORKFLOW_PIPELINE_ORDER = [
  "PENDING",
  "ESCALATED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "INVALIDATED",
  "EXPIRED",
] as const;

/** Whether a workflow status is in the active pipeline (not terminal). */
export function isActivePipelineState(status: string): boolean {
  return ["PENDING", "ESCALATED"].includes(status);
}

/** Whether a workflow status is terminal. */
export function isTerminalWorkflowState(status: string): boolean {
  return ["APPROVED", "REJECTED", "CANCELLED", "INVALIDATED", "EXPIRED"].includes(status);
}