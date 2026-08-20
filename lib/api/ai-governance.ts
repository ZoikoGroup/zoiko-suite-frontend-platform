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
