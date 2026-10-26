// workflow-svc (:8090) — governed approval workflows.
//
// Approvals extend authorization, never replace it. Every decision is checked
// against authorization-svc (WORKFLOW_APPROVE, with workflow_type, approver_role
// and stage_order as attributes) and fails closed, and three refusals hold
// whatever grants the caller has:
//
//  - the initiator never decides their own workflow (self_approval_not_allowed);
//  - nobody decides two stages of one instance (already_decided);
//  - a service account or system principal never decides one (approver_not_human).
//
// Reads need WORKFLOW_READ on the instance's legal entity — PLATFORM scope for
// the pending list and the definitions — unless the caller is the initiator or
// an approver of the current stage. So a 403 on the pending list is common and
// is not the same as the workflow being unreadable.
//
// Commands carry an Idempotency-Key with a hash of the body: the same key and
// body replays with 200, a different body under the same key is 409
// idempotency_mismatch. envelopeHeaders mints a fresh key per write unless the
// caller passes one, so a form that may be resubmitted passes a stable key.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

const SERVICE = "workflow" as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export type WorkflowStatus =
  | "PENDING"
  | "ESCALATED"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "INVALIDATED"
  | "EXPIRED";

export type StageType = "SINGLE" | "QUORUM" | "ROLE";

export type WorkflowInstance = {
  workflow_instance_id: string;
  tenant_id: string;
  legal_entity_id: string;
  workflow_type: string;
  workflow_status: WorkflowStatus | string;
  current_stage: number;
  review_cycle?: number;
  initiated_by: string;
  created_by?: string;
  correlation_id?: string;
  subject_type?: string | null;
  subject_id?: string | null;
  subject_version?: number | null;
  subject_fingerprint?: string | null;
  due_at?: string | null;
  next_action_at?: string | null;
  escalation_target?: string | null;
  escalated_at?: string | null;
  workflow_definition_id?: string | null;
  workflow_definition_version?: number | null;
  row_version?: number;
  created_at?: string;
  updated_at?: string;
};

export type WorkflowStage = {
  workflow_stage_id: string;
  workflow_instance_id: string;
  stage_order: number;
  stage_type: StageType | string;
  approver_principal_id?: string | null;
  approver_role?: string | null;
  required_approvals?: number | null;
  quorum_approvers?: string[] | null;
  stage_status: string;
  due_at?: string | null;
  acted_at?: string | null;
  acted_by?: string | null;
  rationale?: string | null;
};

export type WorkflowWithStages = WorkflowInstance & {
  stages?: WorkflowStage[];
  /** The governance-ledger record of the decision just taken. Absent on an
   *  idempotent replay, which recorded nothing new. */
  decision_id?: string;
};

/** One row of the append-only transition log, with its lineage. */
export type WorkflowTransition = {
  from_state: string;
  to_state: string;
  acted_by: string;
  rationale?: string | null;
  stage_order?: number | null;
  review_cycle?: number | null;
  access_decision_id?: string | null;
  authority_basis?: string | null;
  delegation_id?: string | null;
  decision_id?: string | null;
  workflow_definition_version?: number | null;
  acted_at: string;
};

export type WorkflowDefinition = {
  workflow_definition_id: string;
  tenant_id: string;
  workflow_type: string;
  version: number;
  /** base64 of a JSON array of DefinitionStage — Go marshals []byte that way. */
  stages_json?: string;
  name?: string | null;
  description?: string | null;
  created_by?: string;
  created_at?: string;
  superseded_by?: string | null;
  is_active: boolean;
  expiry_hours?: number | null;
  escalation_target?: string | null;
};

/** A stage as a caller describes it, for an instance or a definition. */
export type StageInput = {
  stage_type: StageType;
  approver_principal_id?: string;
  quorum_approvers?: string[];
  required_approvals?: number;
  approver_role?: string;
  due_at_hours?: number;
};

export type ReleaseVerification = {
  workflow_instance_id?: string;
  can_release: boolean;
  status?: string;
  reason?: string;
  workflow_status?: string;
  subject_fingerprint?: string;
};

type Caller = Identity & { principalId: string; tenantId: string };

// ─── Reads ───────────────────────────────────────────────────────────────────

/** PENDING and ESCALATED instances of the caller's tenant. WORKFLOW_READ at PLATFORM scope. */
export function listPendingApprovals(
  identity: Identity,
  options: { limit?: number; offset?: number } = {},
): Promise<ApiResult<WorkflowInstance[]>> {
  return apiGet<WorkflowInstance[]>(SERVICE, "/v1/workflows/pending", {
    identity,
    query: { limit: options.limit, offset: options.offset },
  });
}

export function getWorkflow(id: string, identity: Identity): Promise<ApiResult<WorkflowWithStages>> {
  return apiGet<WorkflowWithStages>(SERVICE, `/v1/workflows/${encodeURIComponent(id)}`, { identity });
}

/** The transition log, oldest first. */
export function getApprovalEvidence(
  id: string,
  identity: Identity,
): Promise<ApiResult<WorkflowTransition[]>> {
  return apiGet<WorkflowTransition[]>(SERVICE, `/v1/workflows/${encodeURIComponent(id)}/evidence`, {
    identity,
  });
}

export function listWorkflowDefinitions(
  identity: Identity,
  options: { workflowType?: string; isActive?: boolean } = {},
): Promise<ApiResult<WorkflowDefinition[]>> {
  return apiGet<WorkflowDefinition[]>(SERVICE, "/v1/workflow-definitions", {
    identity,
    query: {
      workflow_type: options.workflowType,
      is_active: options.isActive === undefined ? undefined : String(options.isActive),
      limit: 200,
    },
  });
}

// ─── Instance commands ───────────────────────────────────────────────────────

export function createWorkflow(input: {
  identity: Caller;
  legalEntityId: string;
  workflowType: string;
  subjectType?: string;
  subjectId?: string;
  escalationTarget?: string;
  workflowDefinitionId?: string;
  stages?: StageInput[];
  idempotencyKey: string;
}): Promise<ApiWriteResult<WorkflowWithStages>> {
  return apiPost<WorkflowWithStages>(
    SERVICE,
    "/v1/workflows",
    {
      tenant_id: input.identity.tenantId,
      legal_entity_id: input.legalEntityId,
      workflow_type: input.workflowType,
      ...(input.subjectType ? { subject_type: input.subjectType } : {}),
      ...(input.subjectId ? { subject_id: input.subjectId } : {}),
      ...(input.escalationTarget ? { escalation_target: input.escalationTarget } : {}),
      ...(input.workflowDefinitionId ? { workflow_definition_id: input.workflowDefinitionId } : {}),
      ...(input.stages?.length ? { stages: input.stages } : {}),
    },
    {
      // The body's legal entity is what is authorized and stored; the header
      // must agree with it or the service answers legal_entity_mismatch.
      identity: { ...input.identity, legalEntityId: input.legalEntityId },
      // The instance's idempotency is keyed on X-Correlation-ID as well as the
      // key: a retry of the same form resolves to the instance already started.
      correlationId: input.idempotencyKey,
      idempotencyKey: input.idempotencyKey,
    },
  );
}

/**
 * APPROVE or REJECT the current stage. QUORUM stages take a vote on a separate
 * route; `quorum` picks it.
 */
export function decideWorkflow(input: {
  identity: Caller;
  workflowInstanceId: string;
  decision: "APPROVE" | "REJECT";
  rationale?: string;
  quorum: boolean;
  idempotencyKey: string;
}): Promise<ApiWriteResult<WorkflowWithStages>> {
  const route = input.quorum ? "quorum-votes" : "actions";
  return apiPost<WorkflowWithStages>(
    SERVICE,
    `/v1/workflows/${encodeURIComponent(input.workflowInstanceId)}/${route}`,
    { action: input.decision, ...(input.rationale ? { rationale: input.rationale } : {}) },
    { identity: input.identity, idempotencyKey: input.idempotencyKey },
  );
}

export type LifecycleCommand = "escalate" | "escalate-to" | "cancel" | "request-changes" | "invalidate";

export function runLifecycleCommand(input: {
  identity: Caller;
  workflowInstanceId: string;
  command: LifecycleCommand;
  escalationTarget?: string;
  reasonCode?: string;
  narrative?: string;
  /** invalidate only — the row_version the operator last read. */
  expectedVersion?: string;
  idempotencyKey: string;
}): Promise<ApiWriteResult<WorkflowInstance | { status: string }>> {
  const path = `/v1/workflows/${encodeURIComponent(input.workflowInstanceId)}/${input.command}`;
  let body: unknown = undefined;
  switch (input.command) {
    case "escalate-to":
      body = {
        escalation_target: input.escalationTarget,
        reason_code: input.reasonCode,
        ...(input.narrative ? { narrative: input.narrative } : {}),
      };
      break;
    case "request-changes":
      body = input.narrative ? { rationale: input.narrative } : {};
      break;
    case "invalidate":
      body = { reason_code: input.reasonCode, ...(input.narrative ? { narrative: input.narrative } : {}) };
      break;
  }
  return apiPost<WorkflowInstance | { status: string }>(SERVICE, path, body, {
    identity: input.identity,
    idempotencyKey: input.idempotencyKey,
    expectedVersion: input.expectedVersion,
  });
}

/**
 * The Critical Release Rule: does the approval still cover the subject as it is
 * now? 409 with can_release=false is an ANSWER, not a failure — the caller in
 * lib/api/client.ts reports it as an http error, so the action reads the body.
 */
export function verifyRelease(input: {
  identity: Caller;
  workflowInstanceId: string;
  currentSubjectFingerprint: string;
  expectedSubjectVersion?: number;
}): Promise<ApiWriteResult<ReleaseVerification>> {
  return apiPost<ReleaseVerification>(
    SERVICE,
    `/v1/workflows/${encodeURIComponent(input.workflowInstanceId)}/verify-release`,
    {
      current_subject_fingerprint: input.currentSubjectFingerprint,
      ...(input.expectedSubjectVersion !== undefined
        ? { expected_subject_version: input.expectedSubjectVersion }
        : {}),
    },
    { identity: input.identity },
  );
}

// ─── Definition commands (WORKFLOW_DEFINE, PLATFORM scope) ───────────────────

/**
 * Register a versioned route. Active the moment it is created.
 *
 * The service stores stages_json without parsing it and only finds a malformed
 * route when somebody starts an instance from it (invalid_definition_stages) —
 * so the console builds the array from structured fields and never accepts it
 * as text.
 */
export function createWorkflowDefinition(input: {
  identity: Caller;
  workflowType: string;
  version: number;
  name?: string;
  description?: string;
  stages: StageInput[];
}): Promise<ApiWriteResult<WorkflowDefinition>> {
  const route = input.stages.map((stage, index) => ({ order: index + 1, ...stage }));
  return apiPost<WorkflowDefinition>(
    SERVICE,
    "/v1/workflow-definitions",
    {
      tenant_id: input.identity.tenantId,
      workflow_type: input.workflowType,
      version: input.version,
      stages_json: Buffer.from(JSON.stringify(route), "utf8").toString("base64"),
      ...(input.name ? { name: input.name } : {}),
      ...(input.description ? { description: input.description } : {}),
    },
    { identity: input.identity },
  );
}

export type DefinitionCommand = "activate" | "suspend" | "retire" | "supersede";

export function runDefinitionCommand(input: {
  identity: Caller;
  workflowDefinitionId: string;
  command: DefinitionCommand;
  newDefinitionId?: string;
}): Promise<ApiWriteResult<{ status: string }>> {
  return apiPost<{ status: string }>(
    SERVICE,
    `/v1/workflow-definitions/${encodeURIComponent(input.workflowDefinitionId)}/${input.command}`,
    input.command === "supersede" ? { new_definition_id: input.newDefinitionId } : {},
    { identity: input.identity },
  );
}

// ─── Reading ─────────────────────────────────────────────────────────────────

/** Decode a definition's stored route. null when it cannot be read — which is
 *  itself worth showing, because an instance started from it will be refused. */
export function decodeDefinitionStages(stagesJson: string | undefined): StageInput[] | null {
  if (!stagesJson) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(stagesJson, "base64").toString("utf8"));
    return Array.isArray(parsed) ? (parsed as StageInput[]) : null;
  } catch {
    return null;
  }
}

/** Who a stage is waiting on, in a sentence. */
export function describeStage(stage: Pick<StageInput, "stage_type" | "approver_principal_id" | "approver_role" | "required_approvals" | "quorum_approvers">): string {
  const type = stage.stage_type || (stage.approver_role ? "ROLE" : stage.quorum_approvers?.length ? "QUORUM" : "SINGLE");
  switch (type) {
    case "ROLE":
      return `Anyone holding ${stage.approver_role ?? "the named role"}`;
    case "QUORUM": {
      const pool = stage.quorum_approvers?.length;
      return `${stage.required_approvals ?? "?"} of ${pool ?? "?"} named approvers`;
    }
    default:
      return stage.approver_principal_id ? "One named approver" : "One approver (not named)";
  }
}

const STATUS_TEXT: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  PENDING: { label: "Awaiting a decision", tone: "info" },
  ESCALATED: { label: "Escalated", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  INVALIDATED: { label: "Invalidated — subject changed", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

/** Plain-English status. An unknown code is shown as itself and never as a
 *  green state — the console does not guess that something it cannot read is
 *  fine. */
export function describeWorkflowStatus(status: string): { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" } {
  return STATUS_TEXT[status] ?? { label: status, tone: "neutral" };
}

/**
 * Governed reason codes (ZS-STATE-001 Appendix B) offered for invalidation.
 * The service parses FAMILY:CODE and refuses anything outside the registry with
 * invalid_reason_code; these are the families that describe a subject change.
 */
export const INVALIDATION_REASONS = [
  { code: "RETURN:DATA_CORRECTION_REQUIRED", label: "The subject's data was corrected" },
  { code: "RETURN:MISSING_EVIDENCE", label: "Evidence the approval relied on is missing" },
  { code: "RETURN:POLICY_EXCEPTION", label: "A policy exception changed what was approved" },
  { code: "REJECT:POLICY_NOT_MET", label: "The subject no longer meets policy" },
  { code: "REJECT:CONTROL_FAILURE", label: "A control the approval depended on failed" },
  { code: "CANCEL:DUPLICATE", label: "The subject duplicates another" },
  { code: "OVERRIDE:AUTHORIZED_EXCEPTION", label: "Authorized exception" },
] as const;

const ERRORS: [string, string][] = [
  ["self_approval_not_allowed", "You started this workflow, so you may not decide it. Segregation of duties holds whatever grants you have."],
  ["initiator_cannot_be_approver", "You named yourself as an approver of a workflow you are starting. The initiator can never approve their own submission — choose somebody else."],
  ["approver_not_human", "A service account or system principal cannot decide an approval. A person has to."],
  ["already_decided", "You already decided another stage of this workflow. One person decides at most one stage, so the stages stay independent."],
  ["wrong_approver", "You are not the approver for the stage that is waiting. Only its named approver, a delegate of that approver, a holder of its role, or the escalation target may decide it."],
  ["not_escalation_owner", "This workflow has been escalated to a named owner, and only that owner may decide the stage now."],
  ["not_eligible_quorum_approver", "You are not in the approver pool for this quorum stage."],
  ["not_quorum_stage", "The current stage is not a quorum stage — submit an ordinary decision instead of a vote."],
  ["no_current_stage", "This workflow has no stage waiting for a decision — it has already finished."],
  ["rationale_required", "A rejection needs a reason. It is recorded with the decision and shown to the initiator."],
  ["approver_not_authorized", "One of the named approvers does not hold WORKFLOW_APPROVE for this legal entity, so the workflow could never be completed. Grant it first, or name somebody who has it."],
  ["duplicate_approver", "The same person appears in more than one stage. Each stage needs a different approver."],
  ["duplicate_quorum_approver", "A quorum pool lists the same person twice."],
  ["invalid_required_approvals", "The number of approvals a quorum needs must be at least 1 and no more than the size of its pool."],
  ["role_stage_takes_no_approver", "A role stage names a role, not a person — leave the approver fields empty for it."],
  ["no_stages", "A workflow needs at least one stage, either listed here or taken from a definition."],
  ["workflow_definition_not_active", "That definition is suspended or retired, so nothing new can start from it."],
  ["workflow_definition_type_mismatch", "The definition belongs to a different workflow type from the one entered."],
  ["workflow_definition_version_mismatch", "The definition has moved on to a different version."],
  ["workflow_definition_not_found", "No such workflow definition in your tenant."],
  ["invalid_definition_stages", "The definition's stored route cannot be read, so nothing can start from it. Register a corrected version and supersede this one."],
  ["legal_entity_not_found", "That legal entity does not exist in your tenant (tenant-entity-registry-svc)."],
  ["legal_entity_mismatch", "The legal entity on the request does not match the one you are acting for."],
  ["registry_unavailable", "tenant-entity-registry-svc could not be reached to confirm the legal entity, so the workflow was refused rather than started on an unverified entity. Nothing was written."],
  ["invalid_transition", "The workflow is not in a state that allows that. A finished workflow cannot be escalated, cancelled or decided."],
  ["concurrency_conflict", "Somebody changed this workflow while you were looking at it. Look it up again and retry."],
  ["missing_expected_version", "Invalidating needs the version you last read, so an invalidation never lands on a workflow that moved on underneath you."],
  ["invalid_reason_code", "That reason is not a governed reason code (ZS-STATE-001 Appendix B)."],
  ["idempotency_mismatch", "This submission reused an earlier request's key with different details. Reload the page to start a fresh request."],
  ["authorization_service_unavailable", "authorization-svc could not be reached, so the action was refused rather than allowed. This is a dependency outage, not a permissions problem — nothing was written."],
  ["authorization_unavailable", "authorization-svc could not be reached, so the action was refused rather than allowed. Nothing was written."],
  ["authorization_denied", "authorization-svc refused this for your principal. You need the matching WORKFLOW_* grant — WORKFLOW_READ at platform scope for the lists on this page."],
  ["forbidden", "authorization-svc refused this for your principal."],
  ["workflow_not_found", "No such workflow in your tenant."],
  ["invalid_uuid", "That ID is not a UUID. A truncated paste is the usual cause."],
  ["missing_correlation_id", "The request carried no correlation id."],
  ["store_unavailable", "workflow-svc could not reach its database. Nothing was written."],
];

export function explainWorkflowError(message: string): string {
  for (const [code, text] of ERRORS) {
    if (message.includes(code)) return text;
  }
  if (message.includes("is unreachable")) {
    return "workflow-svc is not reachable. Start it (and its dependencies: authorization-svc, tenant-entity-registry-svc, identity-context-svc) and try again.";
  }
  return message;
}
