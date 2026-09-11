import { apiGet, apiPost, type ApiResult, type ApiWriteResult } from "./client";
import type { Identity } from "./client";

export type WorkflowHistoryEvent = {
  event_id: string;
  workflow_instance_id: string;
  event_type: string;
  correlation_id: string;
  tenant_id: string;
  legal_entity_id: string;
  payload: Record<string, unknown>;
  recorded_at: string;
};

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
  stages?: WorkflowStage[];
};

export async function createWorkflowInstance(
  input: {
    workflow_type: string;
    stages: {
      stage_order: number;
      stage_name: string;
      required_role: string;
      approver_principal_id: string;
    }[];
  },
  identity: Identity
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
    { identity }
  );
}

export async function submitWorkflowStageAction(
  workflowInstanceId: string,
  input: {
    action: "APPROVE" | "REJECT";
    rationale?: string;
  },
  identity: Identity
): Promise<ApiWriteResult<{ status: string; workflow_instance_id: string }>> {
  return apiPost<{ status: string; workflow_instance_id: string }>(
    "workflow",
    `/v1/workflows/${encodeURIComponent(workflowInstanceId)}/actions`,
    input,
    { identity }
  );
}

export async function getWorkflowInstanceHistory(
  instanceId: string,
  identity?: Identity
): Promise<ApiResult<WorkflowHistoryEvent[]>> {
  return apiGet<WorkflowHistoryEvent[]>(
    "workflowHistory",
    `/v1/workflows/${encodeURIComponent(instanceId)}/history`,
    { identity }
  );
}
