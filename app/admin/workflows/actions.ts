"use server";

// Server Actions for workflow-svc (:8090).
//
// Server Actions are reachable by direct POST, not only through this UI, so the
// session is verified inside every action. The session's signed envelope is
// forwarded (toIdentity) as well as the X-*-Id headers: workflow-svc verifies
// the envelope against identity-context-svc's JWKS and session status, and in
// require mode a header-only call is refused.
//
// Status mapping is the same everywhere below. 403 is a governance answer —
// the control said no — and reads as `refused`. 503 means a dependency the
// service checks before acting could not be reached, so it refused rather than
// guessed; that is an `error`, because nothing was decided.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, toIdentity, type SessionIdentity } from "@/lib/auth";
import type { LookupState } from "@/components/admin/shared";
import {
  createWorkflow,
  createWorkflowDefinition,
  decideWorkflow,
  describeWorkflowStatus,
  explainWorkflowError,
  getApprovalEvidence,
  getWorkflow,
  runDefinitionCommand,
  runLifecycleCommand,
  verifyRelease,
  type DefinitionCommand,
  type LifecycleCommand,
  type ReleaseVerification,
  type StageInput,
} from "@/lib/api/workflow";
import type {
  DecideWorkflowState,
  DefineWorkflowState,
  DefinitionCommandState,
  LifecycleState,
  ReleaseState,
  StartWorkflowState,
  WorkflowRecord,
} from "./state";

const EXPIRED = "Your session has expired — sign in again.";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email || !session.principalId || !session.tenantId) throw new Error("Unauthorized");
  return toIdentity(session);
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read the stage builder's hidden field back into stages, checking what the
 * service would refuse anyway so the reader gets the reason before a round
 * trip. The service remains the authority — these only name a slip early.
 */
function parseStages(raw: string, initiator: string): { stages: StageInput[] } | { error: string } {
  if (!raw) return { stages: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "The stage list could not be read. Reload the page and add the stages again." };
  }
  if (!Array.isArray(parsed)) return { error: "The stage list could not be read." };

  const stages: StageInput[] = [];
  for (const [i, entry] of parsed.entries()) {
    const n = i + 1;
    const s = entry as Partial<StageInput> & { quorum_approvers_text?: string };
    const type = s.stage_type ?? "SINGLE";
    const due = Number(s.due_at_hours);
    const dueAtHours = Number.isFinite(due) && due > 0 ? Math.floor(due) : undefined;

    if (type === "SINGLE") {
      const approver = (s.approver_principal_id ?? "").trim();
      if (!approver) return { error: `Stage ${n} needs an approver.` };
      if (approver === initiator) {
        return { error: `Stage ${n} names you as its approver. The initiator can never approve their own workflow.` };
      }
      stages.push({ stage_type: "SINGLE", approver_principal_id: approver, due_at_hours: dueAtHours });
    } else if (type === "QUORUM") {
      const pool = (s.quorum_approvers ?? []).map((p) => p.trim()).filter(Boolean);
      const needed = Number(s.required_approvals);
      if (pool.length === 0) return { error: `Stage ${n} is a quorum with nobody in its pool.` };
      if (new Set(pool).size !== pool.length) return { error: `Stage ${n} lists the same approver twice.` };
      if (pool.includes(initiator)) {
        return { error: `Stage ${n} includes you in its pool. The initiator can never approve their own workflow.` };
      }
      if (!Number.isInteger(needed) || needed < 1 || needed > pool.length) {
        return { error: `Stage ${n} needs between 1 and ${pool.length} approvals.` };
      }
      stages.push({ stage_type: "QUORUM", quorum_approvers: pool, required_approvals: needed, due_at_hours: dueAtHours });
    } else if (type === "ROLE") {
      const role = (s.approver_role ?? "").trim();
      if (!role) return { error: `Stage ${n} needs a role.` };
      stages.push({ stage_type: "ROLE", approver_role: role, due_at_hours: dueAtHours });
    } else {
      return { error: `Stage ${n} has an unknown type.` };
    }
  }

  const seen = new Map<string, number>();
  for (const [i, stage] of stages.entries()) {
    const people = stage.stage_type === "QUORUM" ? (stage.quorum_approvers ?? []) : stage.approver_principal_id ? [stage.approver_principal_id] : [];
    for (const p of people) {
      const first = seen.get(p);
      if (first !== undefined) {
        return { error: `The same approver appears in stages ${first} and ${i + 1}. Nobody decides two stages of one workflow.` };
      }
      seen.set(p, i + 1);
    }
  }
  return { stages };
}

function refusedOrError(status: number | undefined, message: string) {
  return status === 403 || status === 401
    ? { status: "refused" as const, message: explainWorkflowError(message) }
    : { status: "error" as const, message: explainWorkflowError(message) };
}

// ─── Look up one workflow ────────────────────────────────────────────────────

export async function lookupWorkflowAction(
  _prev: LookupState<WorkflowRecord>,
  formData: FormData,
): Promise<LookupState<WorkflowRecord>> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const id = text(formData, "workflow_instance_id");
  if (!UUID.test(id)) return { status: "error", message: "Enter a workflow ID (a UUID)." };

  const [workflow, trail] = await Promise.all([getWorkflow(id, identity), getApprovalEvidence(id, identity)]);
  if (!workflow.ok) {
    if (workflow.error.status === 404) {
      return {
        status: "missing",
        message:
          "No workflow with that ID is visible to you. The lookup is scoped to your tenant, so either it does not exist or it belongs to another tenant — from here the two are indistinguishable.",
      };
    }
    return { status: "error", message: explainWorkflowError(workflow.error.message) };
  }

  return {
    status: "found",
    message: "",
    record: {
      workflow: workflow.data,
      transitions: trail.ok ? trail.data : null,
      transitionsError: trail.ok ? undefined : explainWorkflowError(trail.error.message),
    },
  };
}

// ─── Start a workflow ────────────────────────────────────────────────────────

export async function startWorkflowAction(
  _prev: StartWorkflowState,
  formData: FormData,
): Promise<StartWorkflowState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const workflowType = text(formData, "workflow_type").toUpperCase();
  const legalEntityId = text(formData, "legal_entity_id") || identity.legalEntityId;
  const subjectType = text(formData, "subject_type");
  const subjectId = text(formData, "subject_id");
  const escalationTarget = text(formData, "escalation_target");
  const definitionId = text(formData, "workflow_definition_id");
  const idempotencyKey = text(formData, "idempotency_key");

  if (!workflowType) return { status: "error", message: "A workflow type is required." };
  if (!UUID.test(legalEntityId)) return { status: "error", message: "The legal entity must be a UUID." };
  if (Boolean(subjectType) !== Boolean(subjectId)) {
    return { status: "error", message: "Give both the subject type and the subject ID, or neither." };
  }
  if (definitionId && !UUID.test(definitionId)) {
    return { status: "error", message: "The definition ID must be a UUID." };
  }
  if (escalationTarget && escalationTarget === identity.principalId) {
    return { status: "error", message: "The escalation target may not be the initiator." };
  }

  const parsed = parseStages(text(formData, "stages"), identity.principalId);
  if ("error" in parsed) return { status: "error", message: parsed.error };
  if (!definitionId && parsed.stages.length === 0) {
    return { status: "error", message: "Add at least one stage, or start from a definition." };
  }

  const result = await createWorkflow({
    identity,
    legalEntityId,
    workflowType,
    subjectType: subjectType || undefined,
    subjectId: subjectId || undefined,
    escalationTarget: escalationTarget || undefined,
    workflowDefinitionId: definitionId || undefined,
    stages: parsed.stages,
    idempotencyKey,
  });

  if (!result.ok) return refusedOrError(result.error.status, result.error.message);

  refresh();
  const wf = result.data;
  const stages = wf.stages?.length ?? 0;
  if (result.status === 200) {
    return {
      status: "replayed",
      workflow: wf,
      message: `This submission already started workflow ${wf.workflow_instance_id}, so nothing new was created.`,
    };
  }
  return {
    status: "started",
    workflow: wf,
    message: `Started ${wf.workflow_type} with ${stages} stage${stages === 1 ? "" : "s"}. It now waits on stage 1.`,
  };
}

// ─── Decide the current stage ────────────────────────────────────────────────

export async function decideWorkflowAction(
  _prev: DecideWorkflowState,
  formData: FormData,
): Promise<DecideWorkflowState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const id = text(formData, "workflow_instance_id");
  const decision = text(formData, "decision");
  const rationale = text(formData, "rationale");
  const quorum = formData.get("quorum") === "on";
  const idempotencyKey = text(formData, "idempotency_key");

  if (!UUID.test(id)) return { status: "error", message: "Enter the workflow ID (a UUID)." };
  if (decision !== "APPROVE" && decision !== "REJECT") return { status: "error", message: "Choose approve or reject." };
  if (decision === "REJECT" && !rationale) {
    return { status: "error", message: "A rejection needs a reason. It is recorded with the decision." };
  }

  const result = await decideWorkflow({
    identity,
    workflowInstanceId: id,
    decision,
    rationale: rationale || undefined,
    quorum,
    idempotencyKey,
  });
  if (!result.ok) return refusedOrError(result.error.status, result.error.message);

  refresh();
  const wf = result.data;
  const now = describeWorkflowStatus(String(wf.workflow_status)).label;
  if (!wf.decision_id) {
    return {
      status: "replayed",
      workflow: wf,
      message: `This decision was already recorded, so nothing new was written. The workflow is: ${now}.`,
    };
  }
  return {
    status: "decided",
    workflow: wf,
    message: `${decision === "APPROVE" ? (quorum ? "Approval vote" : "Approval") : quorum ? "Rejection vote" : "Rejection"} recorded. The workflow is now: ${now}.`,
  };
}

// ─── Lifecycle commands ──────────────────────────────────────────────────────

const LIFECYCLE: Record<LifecycleCommand, string> = {
  escalate: "Escalated. The current stage stays decidable by its approver.",
  "escalate-to": "Escalated to the named owner, who may now decide the current stage.",
  cancel: "Cancelled. A cancelled workflow is finished and cannot be decided.",
  "request-changes": "Reopened for a new review cycle. The initiator is asked for changes.",
  invalidate: "Invalidated. The approval no longer covers its subject and cannot be released against.",
};

export async function lifecycleAction(_prev: LifecycleState, formData: FormData): Promise<LifecycleState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const id = text(formData, "workflow_instance_id");
  const command = text(formData, "command") as LifecycleCommand;
  const escalationTarget = text(formData, "escalation_target");
  const reasonCode = text(formData, "reason_code");
  const narrative = text(formData, "narrative");
  const expectedVersion = text(formData, "expected_version");
  const idempotencyKey = text(formData, "idempotency_key");

  if (!UUID.test(id)) return { status: "error", message: "Enter the workflow ID (a UUID)." };
  if (!(command in LIFECYCLE)) return { status: "error", message: "Choose what to do." };
  if (command === "escalate-to") {
    if (!escalationTarget) return { status: "error", message: "Name who to escalate to." };
    if (!reasonCode) return { status: "error", message: "Give a reason code for the escalation." };
  }
  if (command === "invalidate") {
    if (!reasonCode) return { status: "error", message: "Choose a governed reason for the invalidation." };
    if (!/^\d+$/.test(expectedVersion)) {
      return { status: "error", message: "Enter the version you last read (look the workflow up above — it is shown there)." };
    }
  }

  const result = await runLifecycleCommand({
    identity,
    workflowInstanceId: id,
    command,
    escalationTarget: escalationTarget || undefined,
    reasonCode: reasonCode || undefined,
    narrative: narrative || undefined,
    expectedVersion: command === "invalidate" ? expectedVersion : undefined,
    idempotencyKey,
  });
  if (!result.ok) return refusedOrError(result.error.status, result.error.message);

  refresh();
  return { status: "done", message: LIFECYCLE[command] };
}

// ─── Verify release ──────────────────────────────────────────────────────────

export async function verifyReleaseAction(_prev: ReleaseState, formData: FormData): Promise<ReleaseState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const id = text(formData, "workflow_instance_id");
  const fingerprint = text(formData, "subject_fingerprint").toLowerCase();
  const version = text(formData, "subject_version");

  if (!UUID.test(id)) return { status: "error", message: "Enter the workflow ID (a UUID)." };
  if (!/^sha256:[0-9a-f]{64}$/.test(fingerprint)) {
    return { status: "error", message: "The fingerprint must be sha256: followed by 64 hex characters." };
  }
  if (version && !/^\d+$/.test(version)) return { status: "error", message: "The subject version must be a whole number." };

  const result = await verifyRelease({
    identity,
    workflowInstanceId: id,
    currentSubjectFingerprint: fingerprint,
    expectedSubjectVersion: version ? Number(version) : undefined,
  });

  if (!result.ok) {
    // 409 with a body is the service answering "this approval does not cover
    // the subject as it is now". That is the rule doing its job, so it is read
    // as a result rather than reported as a failed request.
    const body = result.error.body as Partial<ReleaseVerification> | undefined;
    if (result.error.status === 409 && body && body.can_release === false) {
      return {
        status: "not-covered",
        result: body as ReleaseVerification,
        message: `Do not release. ${body.reason ?? "The approval does not cover the subject as it is now."}`,
      };
    }
    return refusedOrError(result.error.status, result.error.message);
  }

  return {
    status: result.data.can_release ? "covered" : "not-covered",
    result: result.data,
    message: result.data.can_release
      ? "The approval covers the subject as it is now. Release may proceed."
      : `Do not release. ${result.data.reason ?? ""}`.trim(),
  };
}

// ─── Definitions ─────────────────────────────────────────────────────────────

export async function defineWorkflowAction(
  _prev: DefineWorkflowState,
  formData: FormData,
): Promise<DefineWorkflowState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const workflowType = text(formData, "workflow_type").toUpperCase();
  const version = Number(text(formData, "version"));
  const name = text(formData, "name");
  const description = text(formData, "description");

  if (!workflowType) return { status: "error", message: "A workflow type is required." };
  if (!Number.isInteger(version) || version < 1) return { status: "error", message: "The version must be a whole number of 1 or more." };

  // The initiator check does not apply to a definition — nobody has started it
  // yet — so the pool and duplicate checks run with no initiator.
  const parsed = parseStages(text(formData, "stages"), "");
  if ("error" in parsed) return { status: "error", message: parsed.error };
  if (parsed.stages.length === 0) return { status: "error", message: "A definition needs at least one stage." };

  const result = await createWorkflowDefinition({
    identity,
    workflowType,
    version,
    name: name || undefined,
    description: description || undefined,
    stages: parsed.stages,
  });
  if (!result.ok) return refusedOrError(result.error.status, result.error.message);

  refresh();
  return {
    status: "defined",
    definition: result.data,
    message: `Registered ${result.data.workflow_type} v${result.data.version}. It is active now — new workflows of this type can start from it.`,
  };
}

// Retire is worded exactly like suspend because the service stores them the
// same way — both clear is_active, and either can be activated again. Calling
// retirement final here would claim a control workflow-svc does not have.
const DEFINITION_DONE: Record<DefinitionCommand, string> = {
  activate: "Activated. New workflows can start from this definition.",
  suspend: "Suspended. Nothing new can start from it; workflows already running keep the route they started with.",
  retire:
    "Retired. Nothing new can start from it; workflows already running keep the route they started with. workflow-svc records this exactly as a suspension, so it can still be activated again.",
  supersede:
    "Superseded. This definition is now inactive and points at its replacement, which is active.",
};

export async function definitionCommandAction(
  _prev: DefinitionCommandState,
  formData: FormData,
): Promise<DefinitionCommandState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const definitionId = text(formData, "workflow_definition_id");
  const command = text(formData, "command") as DefinitionCommand;
  const newDefinitionId = text(formData, "new_definition_id");

  if (!UUID.test(definitionId)) return { status: "error", message: "Choose a definition." };
  if (!(command in DEFINITION_DONE)) return { status: "error", message: "Choose what to do." };
  if (command === "supersede") {
    if (!UUID.test(newDefinitionId)) return { status: "error", message: "Choose the definition that replaces it." };
    if (newDefinitionId === definitionId) return { status: "error", message: "A definition cannot supersede itself." };
  }

  const result = await runDefinitionCommand({
    identity,
    workflowDefinitionId: definitionId,
    command,
    newDefinitionId: newDefinitionId || undefined,
  });
  if (!result.ok) return refusedOrError(result.error.status, result.error.message);

  refresh();
  return { status: "done", message: DEFINITION_DONE[command] };
}
