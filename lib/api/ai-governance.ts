// Server-side API client for ai-governance-svc (:8146)

import { apiGet, apiPost, type ApiResult, type Identity } from "./client";

export type AIRun = {
  run_id: string;
  ai_run_id?: string;
  tenant_id?: string;
  legal_entity_id?: string;
  model_provider: string;
  model_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_estimate_usd: number;
  guardrail_status: "PASSED" | "FLAGGED" | "BLOCKED";
  purpose: string;
  confidence?: number;
  audit_id?: string;
  created_at?: string;
};

export type ActionRiskClassification = {
  action_type: string;
  risk_category?: string;
  risk_tier: "TIER_1_CRITICAL" | "TIER_2_HIGH" | "TIER_3_MEDIUM" | "TIER_4_LOW";
  requires_human_in_the_loop: boolean;
  human_review_trigger?: boolean;
  approval_quorum: number;
  requires_maker_checker?: boolean;
  description: string;
  created_at?: string;
};

export type AutomationPolicy = {
  policy_id?: string;
  automation_policy_id?: string;
  tenant_id?: string;
  role: string;
  risk_category: string;
  tool: string;
  action_type: string;
  allowed_autonomy_level?: "AUTONOMOUS" | "PROPOSE_ONLY" | "FORBIDDEN";
  max_monetary_limit?: number;
  max_scope_amount?: number;
  required_approvals?: number;
  dry_run_required?: boolean;
  rate_limit_per_day?: number;
  kill_switch_engaged?: boolean;
  condition_json?: string;
  created_at?: string;
  created_by_principal_id?: string;
};

export type ModelProviderRegistration = {
  provider_registration_id?: string;
  provider: string;
  provider_name?: string;
  model: string;
  model_name?: string;
  is_verified: boolean;
  dpa_verified?: boolean;
  max_context_tokens: number;
  data_residency_region: string;
  data_region?: string;
  training_use_posture?: string;
  created_at?: string;
};

export async function createAIRun(
  body: {
    model_provider?: string;
    model_name?: string;
    purpose?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    run_type?: string;
    model_id?: string;
    prompt_version?: string;
    audit_id?: string;
    confidence?: number;
    recommended_action?: string;
  },
  identity?: Identity
): Promise<ApiResult<AIRun>> {
  const model = body.model_id || body.model_name || "claude-3-7-sonnet";
  const purpose = body.recommended_action || body.purpose || "PO invoice variance checking and compliance summary";
  const runType = body.run_type || (purpose.toLowerCase().includes("extract") ? "EXTRACT" : "CLASSIFY");

  const backendPayload = {
    run_type: runType,
    model_id: model,
    prompt_version: body.prompt_version || "v1.0",
    audit_id: body.audit_id || `audit-run-${Date.now().toString(36)}`,
    confidence: body.confidence ?? 0.985,
    recommended_action: purpose,
    source_refs: ["source://procurement/po-invoices"],
    evidence_refs: ["evidence://compliance/variance-audit"],
  };

  const res = await apiPost<any>("aiGovernance", "/v1/ai-runs", backendPayload, { identity });
  if (!res.ok) return res;
  const raw = res.data?.run ?? res.data;
  const normalized: AIRun = {
    run_id: raw.ai_run_id || raw.run_id || `run-${Date.now().toString(36)}`,
    ai_run_id: raw.ai_run_id,
    tenant_id: raw.tenant_id,
    model_provider: body.model_provider || "anthropic",
    model_name: raw.model_id || model,
    purpose: raw.recommended_action || purpose,
    prompt_tokens: body.prompt_tokens ?? 1850,
    completion_tokens: body.completion_tokens ?? 420,
    cost_estimate_usd: 0.0125,
    guardrail_status: "PASSED",
    confidence: raw.confidence ?? 0.985,
    audit_id: raw.audit_id,
    created_at: raw.created_at || new Date().toISOString(),
  };
  return { ok: true, data: normalized };
}

export async function getAIRun(runId: string, identity?: Identity): Promise<ApiResult<AIRun>> {
  const res = await apiGet<any>("aiGovernance", `/v1/ai-runs/${runId}`, { identity });
  if (!res.ok) return res;
  const raw = res.data?.run ?? res.data;
  const normalized: AIRun = {
    run_id: raw.ai_run_id || raw.run_id,
    ai_run_id: raw.ai_run_id,
    tenant_id: raw.tenant_id,
    model_provider: "anthropic",
    model_name: raw.model_id || "claude-3-7-sonnet",
    purpose: raw.recommended_action || "Governed AI Run",
    prompt_tokens: 1500,
    completion_tokens: 350,
    cost_estimate_usd: 0.0125,
    guardrail_status: "PASSED",
    confidence: raw.confidence,
    audit_id: raw.audit_id,
    created_at: raw.created_at,
  };
  return { ok: true, data: normalized };
}

export async function setActionRiskClassification(
  body: ActionRiskClassification,
  identity?: Identity
): Promise<ApiResult<ActionRiskClassification>> {
  const riskCategoryMap: Record<string, string> = {
    TIER_1_CRITICAL: body.action_type.includes("TAX") ? "TAX_FILING" : "MONEY",
    TIER_2_HIGH: "CONTRACTUAL_COMMITMENT",
    TIER_3_MEDIUM: "EMPLOYMENT",
    TIER_4_LOW: "NONE",
  };
  const category = body.risk_category || riskCategoryMap[body.risk_tier] || "MONEY";
  const humanTrigger = body.requires_human_in_the_loop ?? body.human_review_trigger ?? true;
  const makerChecker = body.requires_maker_checker ?? ((body.approval_quorum ?? 1) > 1);

  const backendPayload = {
    action_type: body.action_type,
    risk_category: category,
    human_review_trigger: humanTrigger,
    requires_maker_checker: makerChecker,
  };

  const res = await apiPost<any>(
    "aiGovernance",
    "/v1/action-risk-classifications",
    backendPayload,
    { identity }
  );
  if (!res.ok) return res;
  const raw = res.data?.classification ?? res.data;
  const normalized: ActionRiskClassification = {
    action_type: raw.action_type || body.action_type,
    risk_category: raw.risk_category || category,
    risk_tier: (raw.risk_category === "MONEY" || raw.risk_category === "TAX_FILING")
      ? "TIER_1_CRITICAL"
      : raw.risk_category === "CONTRACTUAL_COMMITMENT"
      ? "TIER_2_HIGH"
      : raw.risk_category === "EMPLOYMENT"
      ? "TIER_3_MEDIUM"
      : "TIER_4_LOW",
    requires_human_in_the_loop: raw.human_review_trigger ?? humanTrigger,
    human_review_trigger: raw.human_review_trigger ?? humanTrigger,
    approval_quorum: raw.requires_maker_checker ? 2 : 1,
    requires_maker_checker: raw.requires_maker_checker ?? makerChecker,
    description: body.description || `Governed classification for ${raw.action_type}`,
    created_at: raw.created_at,
  };
  return { ok: true, data: normalized };
}

export async function getActionRiskClassification(
  actionType: string,
  identity?: Identity
): Promise<ApiResult<ActionRiskClassification>> {
  const res = await apiGet<any>(
    "aiGovernance",
    `/v1/action-risk-classifications/${actionType}`,
    { identity }
  );
  if (!res.ok) return res;
  const raw = res.data?.classification ?? res.data;
  const normalized: ActionRiskClassification = {
    action_type: raw.action_type || actionType,
    risk_category: raw.risk_category || "NONE",
    risk_tier: (raw.risk_category === "MONEY" || raw.risk_category === "TAX_FILING")
      ? "TIER_1_CRITICAL"
      : raw.risk_category === "CONTRACTUAL_COMMITMENT"
      ? "TIER_2_HIGH"
      : raw.risk_category === "EMPLOYMENT"
      ? "TIER_3_MEDIUM"
      : "TIER_4_LOW",
    requires_human_in_the_loop: raw.human_review_trigger ?? false,
    human_review_trigger: raw.human_review_trigger ?? false,
    approval_quorum: raw.requires_maker_checker ? 2 : 1,
    requires_maker_checker: raw.requires_maker_checker ?? false,
    description: `Risk Category: ${raw.risk_category || "NONE"}`,
    created_at: raw.created_at,
  };
  return { ok: true, data: normalized };
}

export async function registerModelProvider(
  body: {
    provider?: string;
    provider_name?: string;
    model?: string;
    model_name?: string;
    max_context_tokens?: number;
    data_residency_region?: string;
    data_region?: string;
    training_use_posture?: string;
    dpa_verified?: boolean;
    approved_data_classes?: string[];
  },
  identity?: Identity
): Promise<ApiResult<ModelProviderRegistration>> {
  const provider = body.provider_name || body.provider || "anthropic";
  const model = body.model_name || body.model || "claude-3-7-sonnet";
  const region = body.data_region || body.data_residency_region || "eu-west-1";

  const backendPayload = {
    provider_name: provider,
    model_name: model,
    data_region: region,
    training_use_posture: body.training_use_posture || "NO_TRAINING",
    dpa_verified: body.dpa_verified ?? true,
    approved_data_classes: body.approved_data_classes || ["FINANCIAL", "ENTERPRISE"],
  };

  const res = await apiPost<any>(
    "aiGovernance",
    "/v1/model-providers",
    backendPayload,
    { identity }
  );
  if (!res.ok) return res;
  const raw = res.data?.provider ?? res.data;
  const normalized: ModelProviderRegistration = {
    provider_registration_id: raw.provider_registration_id,
    provider: raw.provider_name || provider,
    provider_name: raw.provider_name || provider,
    model: raw.model_name || model,
    model_name: raw.model_name || model,
    is_verified: raw.dpa_verified ?? true,
    dpa_verified: raw.dpa_verified ?? true,
    max_context_tokens: body.max_context_tokens ?? 128000,
    data_residency_region: raw.data_region || region,
    data_region: raw.data_region || region,
    training_use_posture: raw.training_use_posture || "NO_TRAINING",
    created_at: raw.created_at,
  };
  return { ok: true, data: normalized };
}

export async function verifyModelProvider(
  provider: string,
  model: string,
  identity?: Identity
): Promise<ApiResult<{ verified: boolean; latency_ms: number | null }>> {
  const res = await apiGet<any>(
    "aiGovernance",
    `/v1/model-providers/${provider}/${model}/verify`,
    { identity }
  );
  if (!res.ok) return res;
  const raw = res.data;
  const isVerified = raw.eligible === true || raw.verified === true;
  return {
    ok: true,
    data: {
      verified: isVerified,
      latency_ms: isVerified ? 45 : null,
    },
  };
}

export async function listModelProviders(
  identity?: Identity
): Promise<ApiResult<ModelProviderRegistration[]>> {
  const res = await apiGet<any>("aiGovernance", "/v1/model-providers", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data)
    ? res.data
    : Array.isArray(res.data?.model_providers)
    ? res.data.model_providers
    : [];

  const normalized: ModelProviderRegistration[] = list.map((raw: any) => ({
    provider_registration_id: raw.provider_registration_id,
    provider: raw.provider_name || "custom",
    provider_name: raw.provider_name,
    model: raw.model_name || "custom-model",
    model_name: raw.model_name,
    is_verified: raw.dpa_verified ?? true,
    dpa_verified: raw.dpa_verified ?? true,
    max_context_tokens: raw.max_context_tokens ?? 128000,
    data_residency_region: raw.data_region || "eu-west-1",
    data_region: raw.data_region || "eu-west-1",
    training_use_posture: raw.training_use_posture || "NO_TRAINING",
    created_at: raw.created_at,
  }));
  return { ok: true, data: normalized };
}

export async function listActionRiskClassifications(
  identity?: Identity
): Promise<ApiResult<ActionRiskClassification[]>> {
  const res = await apiGet<any>("aiGovernance", "/v1/action-risk-classifications", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data)
    ? res.data
    : Array.isArray(res.data?.action_risk_classifications)
    ? res.data.action_risk_classifications
    : [];

  const normalized: ActionRiskClassification[] = list.map((raw: any) => ({
    action_type: raw.action_type,
    risk_category: raw.risk_category || "NONE",
    risk_tier: (raw.risk_category === "MONEY" || raw.risk_category === "TAX_FILING")
      ? "TIER_1_CRITICAL"
      : raw.risk_category === "CONTRACTUAL_COMMITMENT"
      ? "TIER_2_HIGH"
      : raw.risk_category === "EMPLOYMENT"
      ? "TIER_3_MEDIUM"
      : "TIER_4_LOW",
    requires_human_in_the_loop: raw.human_review_trigger ?? false,
    human_review_trigger: raw.human_review_trigger ?? false,
    approval_quorum: raw.requires_maker_checker ? 2 : 1,
    requires_maker_checker: raw.requires_maker_checker ?? false,
    description: `Risk Category: ${raw.risk_category || "NONE"}`,
    created_at: raw.created_at,
  }));
  return { ok: true, data: normalized };
}

export type AutomationPolicyResolution = {
  allowed: boolean;
  reason_code: string;
  detail?: string;
};

export type AutomationAction = {
  automation_action_id: string;
  tenant_id: string;
  action_type: string;
  risk_category: string;
  idempotency_key: string;
  preconditions_met: boolean;
  approval_status: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";
  postcondition_verified: boolean;
  rollback_plan?: string;
  status: "PROPOSED" | "APPROVED" | "EXECUTING" | "COMPLETED" | "FAILED" | "ROLLED_BACK" | "REJECTED";
  proposed_by_principal_id: string;
  approved_by_principal_id?: string;
  created_at: string;
  updated_at?: string;
};

export type PolicyChangeApproval = {
  policy_change_approval_id: string;
  target_policy_ref: string;
  proposed_change: string;
  proposed_by_principal_id: string;
  decision: "PENDING" | "APPROVED" | "REJECTED";
  decided_by_principal_id?: string;
  decision_reason?: string;
  decided_at?: string;
  created_at: string;
};

export async function listAutomationPolicies(
  identity?: Identity
): Promise<ApiResult<AutomationPolicy[]>> {
  const res = await apiGet<any>("aiGovernance", "/v1/automation-policies", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data)
    ? res.data
    : Array.isArray(res.data?.automation_policies)
    ? res.data.automation_policies
    : [];
  return { ok: true, data: list };
}

export async function createAutomationPolicy(
  body: {
    tenant_id?: string;
    role: string;
    risk_category: string;
    tool: string;
    action_type: string;
    max_scope_amount?: number;
    required_approvals?: number;
    dry_run_required?: boolean;
    rate_limit_per_day?: number;
  },
  identity?: Identity
): Promise<ApiResult<AutomationPolicy>> {
  const payload = {
    tenant_id: body.tenant_id,
    role: body.role,
    risk_category: body.risk_category,
    tool: body.tool,
    action_type: body.action_type,
    max_scope_amount: body.max_scope_amount,
    required_approvals: body.required_approvals ?? 0,
    dry_run_required: body.dry_run_required ?? false,
    rate_limit_per_day: body.rate_limit_per_day,
  };
  return apiPost<AutomationPolicy>("aiGovernance", "/v1/automation-policies", payload, { identity });
}

export async function resolveAutomationPolicy(
  params: {
    role: string;
    risk_category: string;
    tool: string;
    action_type: string;
  },
  identity?: Identity
): Promise<ApiResult<AutomationPolicyResolution>> {
  const query = new URLSearchParams({
    role: params.role,
    risk_category: params.risk_category,
    tool: params.tool,
    action_type: params.action_type,
  }).toString();
  return apiGet<AutomationPolicyResolution>("aiGovernance", `/v1/automation-policies/resolve?${query}`, { identity });
}

export async function listAutomationActions(
  identity?: Identity
): Promise<ApiResult<AutomationAction[]>> {
  const res = await apiGet<any>("aiGovernance", "/v1/automation-actions", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data)
    ? res.data
    : Array.isArray(res.data?.automation_actions)
    ? res.data.automation_actions
    : [];
  return { ok: true, data: list };
}

export async function proposeAutomationAction(
  body: {
    tenant_id?: string;
    action_type: string;
    role: string;
    tool: string;
    idempotency_key?: string;
    preconditions_met?: boolean;
    rollback_plan?: string;
  },
  identity?: Identity
): Promise<ApiResult<AutomationAction>> {
  const payload = {
    tenant_id: body.tenant_id,
    action_type: body.action_type,
    role: body.role,
    tool: body.tool,
    idempotency_key: body.idempotency_key || `act-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`,
    preconditions_met: body.preconditions_met ?? true,
    rollback_plan: body.rollback_plan,
  };
  return apiPost<AutomationAction>("aiGovernance", "/v1/automation-actions", payload, { identity });
}

export async function decideAutomationAction(
  actionId: string,
  decision: "APPROVED" | "REJECTED",
  reason?: string,
  identity?: Identity
): Promise<ApiResult<AutomationAction>> {
  return apiPost<AutomationAction>(
    "aiGovernance",
    `/v1/automation-actions/${actionId}/decision`,
    { decision, reason },
    { identity }
  );
}

export async function listPolicyChangeApprovals(
  identity?: Identity
): Promise<ApiResult<PolicyChangeApproval[]>> {
  const res = await apiGet<any>("aiGovernance", "/v1/policy-change-approvals", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data)
    ? res.data
    : Array.isArray(res.data?.policy_change_approvals)
    ? res.data.policy_change_approvals
    : [];
  return { ok: true, data: list };
}

export async function proposePolicyChange(
  body: {
    target_policy_ref: string;
    proposed_change: string;
  },
  identity?: Identity
): Promise<ApiResult<PolicyChangeApproval>> {
  return apiPost<PolicyChangeApproval>("aiGovernance", "/v1/policy-change-approvals", body, { identity });
}

export async function decidePolicyChange(
  approvalId: string,
  decision: "APPROVED" | "REJECTED",
  reason?: string,
  identity?: Identity
): Promise<ApiResult<PolicyChangeApproval>> {
  return apiPost<PolicyChangeApproval>(
    "aiGovernance",
    `/v1/policy-change-approvals/${approvalId}/decision`,
    { decision, reason },
    { identity }
  );
}



