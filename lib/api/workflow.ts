// workflow-svc (:8090) — the platform's generic approval-workflow engine.
// Creates and drives workflow instances; workflow-history-svc (see
// lib/api/workflow-history.ts) separately durably records what happened.
//
// Restored from a prior version of this client that had been merged into
// lib/api/workflow-history.ts under the wrong service — CreateWorkflow and
// SubmitAction are real routes on workflow-svc's own port (8090), not
// workflow-history-svc's (8097). Split back out so each file matches the one
// service it actually calls.

import { apiPost, type ApiWriteResult, type Identity } from "./client";

export type WorkflowStage = {
  workflow_stage_id: string;
  workflow_instance_id: string;
  stage_order: number;
  approver_principal_id: string;
  stage_status: string;
  acted_at: string | null;
  rationale: string | null;
};

export type WorkflowInstance = {
  workflow_instance_id: string;
  tenant_id: string;
  legal_entity_id: string;
  workflow_type: string;
  workflow_status: string;
  current_stage: number;
  initiated_by: string;
  correlation_id: string;
  started_at: string;
  completed_at: string | null;
  stages?: WorkflowStage[];
};

/**
 * Start a new workflow instance.
 *
 * Each stage names only its approver — the service's real request shape has
 * no stage_name/required_role fields; those are console-side labels, not
 * anything workflow-svc stores or checks.
 */
export async function createWorkflowInstance(
  input: {
    workflow_type: string;
    stages: { approver_principal_id: string }[];
  },
  identity: Identity,
): Promise<ApiWriteResult<WorkflowInstance>> {
  return apiPost<WorkflowInstance>(
    "workflow",
    "/v1/workflows",
    {
      tenant_id: identity.tenantId,
      legal_entity_id: identity.legalEntityId,
      workflow_type: input.workflow_type,
      stages: input.stages,
    },
    { identity },
  );
}

/**
 * Approve or reject the current stage. The actor is always the verified
 * caller — workflow-svc ignores any actor identity in the body.
 */
export async function submitWorkflowStageAction(
  workflowInstanceId: string,
  input: { action: "APPROVE" | "REJECT"; rationale?: string },
  identity: Identity,
): Promise<ApiWriteResult<WorkflowInstance>> {
  return apiPost<WorkflowInstance>(
    "workflow",
    `/v1/workflows/${encodeURIComponent(workflowInstanceId)}/actions`,
    { action: input.action, ...(input.rationale ? { rationale: input.rationale } : {}) },
    { identity },
  );
}
