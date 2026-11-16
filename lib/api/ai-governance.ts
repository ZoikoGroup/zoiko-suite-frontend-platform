// Server-side API client for ai-governance-svc (:8146)

import { apiGet, apiPost, type ApiResult, type Identity } from "./client";

export type AIRun = {
  run_id: string;
  tenant_id?: string;
  legal_entity_id?: string;
  model_provider: string;
  model_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_estimate_usd: number;
  guardrail_status: "PASSED" | "FLAGGED" | "BLOCKED";
  purpose: string;
  created_at?: string;
};

export type ActionRiskClassification = {
  action_type: string;
  risk_tier: "TIER_1_CRITICAL" | "TIER_2_HIGH" | "TIER_3_MEDIUM" | "TIER_4_LOW";
  requires_human_in_the_loop: boolean;
  approval_quorum: number;
  description: string;
};

export type AutomationPolicy = {
  policy_id: string;
  action_type: string;
  allowed_autonomy_level: "AUTONOMOUS" | "PROPOSE_ONLY" | "FORBIDDEN";
  max_monetary_limit?: number;
  condition_json?: string;
};

export type ModelProviderRegistration = {
  provider: string;
  model: string;
  is_verified: boolean;
  max_context_tokens: number;
  data_residency_region: string;
  created_at?: string;
};

export async function createAIRun(
  body: {
    model_provider: string;
    model_name: string;
    purpose: string;
    prompt_tokens?: number;
    completion_tokens?: number;
  },
  identity?: Identity
): Promise<ApiResult<AIRun>> {
  const res = await apiPost<{ run?: AIRun } | AIRun>("aiGovernance", "/v1/ai-runs", body, { identity });
  if (!res.ok) return res;
  const r = (res.data as { run?: AIRun }).run ?? (res.data as AIRun);
  return { ok: true, data: r };
}

export async function getAIRun(runId: string, identity?: Identity): Promise<ApiResult<AIRun>> {
  const res = await apiGet<{ run?: AIRun } | AIRun>("aiGovernance", `/v1/ai-runs/${runId}`, { identity });
  if (!res.ok) return res;
  const r = (res.data as { run?: AIRun }).run ?? (res.data as AIRun);
  return { ok: true, data: r };
}

export async function setActionRiskClassification(
  body: ActionRiskClassification,
  identity?: Identity
): Promise<ApiResult<ActionRiskClassification>> {
  const res = await apiPost<{ classification?: ActionRiskClassification } | ActionRiskClassification>(
    "aiGovernance",
    "/v1/action-risk-classifications",
    body,
    { identity }
  );
  if (!res.ok) return res;
  const c = (res.data as { classification?: ActionRiskClassification }).classification ?? (res.data as ActionRiskClassification);
  return { ok: true, data: c };
}

export async function getActionRiskClassification(
  actionType: string,
  identity?: Identity
): Promise<ApiResult<ActionRiskClassification>> {
  const res = await apiGet<{ classification?: ActionRiskClassification } | ActionRiskClassification>(
    "aiGovernance",
    `/v1/action-risk-classifications/${actionType}`,
    { identity }
  );
  if (!res.ok) return res;
  const c = (res.data as { classification?: ActionRiskClassification }).classification ?? (res.data as ActionRiskClassification);
  return { ok: true, data: c };
}

export async function registerModelProvider(
  body: {
    provider: string;
    model: string;
    max_context_tokens: number;
    data_residency_region: string;
  },
  identity?: Identity
): Promise<ApiResult<ModelProviderRegistration>> {
  const res = await apiPost<{ provider?: ModelProviderRegistration } | ModelProviderRegistration>(
    "aiGovernance",
    "/v1/model-providers",
    body,
    { identity }
  );
  if (!res.ok) return res;
  const p = (res.data as { provider?: ModelProviderRegistration }).provider ?? (res.data as ModelProviderRegistration);
  return { ok: true, data: p };
}

export async function verifyModelProvider(
  provider: string,
  model: string,
  identity?: Identity
): Promise<ApiResult<{ verified: boolean; latency_ms: number }>> {
  return apiGet<{ verified: boolean; latency_ms: number }>(
    "aiGovernance",
    `/v1/model-providers/${provider}/${model}/verify`,
    { identity }
  );
}

// ─── Registers (list reads) ──────────────────────────────────────────────────
// Shapes are the ones ai-governance-svc actually returns (internal/domain/types.go).
// The service has no endpoint that lists AI runs; a run is read by id only.

export type RiskClassificationRecord = {
  action_type: string;
  risk_category: string;
  human_review_trigger: boolean;
  requires_maker_checker: boolean;
  created_at: string;
  created_by_principal_id: string;
};

export type ModelProviderRecord = {
  provider_registration_id: string;
  provider_name: string;
  model_name: string;
  training_use_posture: string;
  data_region: string;
  dpa_verified: boolean;
  approved_data_classes?: string[];
  approved_at?: string;
  created_at: string;
};

export type AutomationPolicyRecord = {
  automation_policy_id: string;
  role: string;
  risk_category: string;
  tool: string;
  action_type: string;
  max_scope_amount?: number | string | null;
  required_approvals: number;
  dry_run_required: boolean;
  kill_switch_engaged: boolean;
  created_at: string;
};

export type AutomationActionRecord = {
  automation_action_id: string;
  action_type: string;
  risk_category: string;
  approval_status: string;
  status: string;
  proposed_by_principal_id: string;
  created_at: string;
};

export type PolicyChangeApprovalRecord = {
  policy_change_approval_id: string;
  target_policy_ref: string;
  proposed_by_principal_id: string;
  decision?: string | null;
  decided_at?: string | null;
  created_at: string;
};

export type UseCaseRecord = {
  use_case_id: string;
  domain: string;
  purpose: string;
  automation_level: string;
  lifecycle_state: string;
  owner_principal_id: string;
  created_at: string;
};

export type ModelReleaseRecord = {
  model_release_id: string;
  provider: string;
  provider_model_id: string;
  deployment_region: string;
  release_state: string;
  created_at: string;
};

async function listRegister<T>(path: string, key: string, identity?: Identity): Promise<ApiResult<T[]>> {
  const res = await apiGet<Record<string, unknown>>("aiGovernance", path, { identity });
  if (!res.ok) return res;
  const value = res.data?.[key];
  // Go encodes an empty slice it never allocated as null: that is "none", not an error.
  if (value === null || value === undefined) return { ok: true, data: [] };
  if (!Array.isArray(value)) {
    return { ok: false, error: { kind: "malformed", message: `ai-governance-svc ${path} did not return a "${key}" list` } };
  }
  return { ok: true, data: value as T[] };
}

export const listRiskClassifications = (identity?: Identity) =>
  listRegister<RiskClassificationRecord>("/v1/action-risk-classifications", "action_risk_classifications", identity);
export const listModelProviders = (identity?: Identity) =>
  listRegister<ModelProviderRecord>("/v1/model-providers", "model_providers", identity);
export const listAutomationPolicies = (identity?: Identity) =>
  listRegister<AutomationPolicyRecord>("/v1/automation-policies", "automation_policies", identity);
export const listAutomationActions = (identity?: Identity) =>
  listRegister<AutomationActionRecord>("/v1/automation-actions", "automation_actions", identity);
export const listPolicyChangeApprovals = (identity?: Identity) =>
  listRegister<PolicyChangeApprovalRecord>("/v1/policy-change-approvals", "policy_change_approvals", identity);
export const listUseCases = (identity?: Identity) =>
  listRegister<UseCaseRecord>("/v1/ai/use-cases", "use_cases", identity);
export const listModelReleases = (identity?: Identity) =>
  listRegister<ModelReleaseRecord>("/v1/ai/model-releases", "model_releases", identity);
