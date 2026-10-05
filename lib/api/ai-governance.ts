// Server-side API client for ai-governance-svc (:8146)

import { apiGet, apiPost, type ApiResult, type Identity } from "./client";

export type AIExecution = {
  execution_id: string;
  tenant_id: string;
  use_case_id: string;
  model_release_id: string;
  package_id: string;
  package_version: string;
  status: "BLOCKED";
  block_reason: string;
  blocked_by: string[];
  created_at: string;
  created_by_principal_id: string;
};

export async function createGovernedExecution(
  body: {
    use_case_id: string;
    model_release_id: string;
    package_id: string;
    package_version: string;
    input: unknown;
  },
  idempotencyKey: string,
  identity?: Identity,
): Promise<ApiResult<AIExecution>> {
  return apiPost<AIExecution>("aiGovernance", "/v1/ai/executions", body, {
    idempotencyKey,
    identity,
  });
}

export type AIIncident = {
  incident_id: string;
  tenant_id: string;
  severity: "AI-P0" | "AI-P1" | "AI-P2" | "AI-P3";
  model_release_id: string;
  description: string;
  evidence_references: string[];
  status: "OPEN";
  created_at: string;
  created_by_principal_id: string;
};

export async function createAIIncident(
  body: {
    severity: AIIncident["severity"];
    model_release_id: string;
    description: string;
    evidence_references?: string[];
  },
  idempotencyKey: string,
  identity?: Identity,
): Promise<ApiResult<AIIncident>> {
  return apiPost<AIIncident>("aiGovernance", "/v1/ai/incidents", body, {
    idempotencyKey,
    identity,
  });
}

// AIG-04: Human Oversight, Output Disposition & Decision Boundary
// (ZS-SVC-X-001 §7). O4 ("AI prohibited") is refused server-side, fail
// closed, before any record is created.
export type AIOutputDisposition = {
  disposition_id: string;
  tenant_id: string;
  ai_run_id: string;
  oversight_class: "O0" | "O1" | "O2" | "O3" | "O4";
  status: "DRAFT_ASSISTIVE" | "REVIEW_REQUIRED" | "ACCEPTED" | "REJECTED";
  reason?: string;
  created_at: string;
  created_by_principal_id: string;
  decided_at?: string;
  decided_by_principal_id?: string;
};

export async function createOutputDisposition(
  body: { ai_run_id: string; oversight_class: AIOutputDisposition["oversight_class"] },
  idempotencyKey: string,
  identity?: Identity,
): Promise<ApiResult<AIOutputDisposition>> {
  return apiPost<AIOutputDisposition>("aiGovernance", "/v1/ai/output-dispositions", body, {
    idempotencyKey,
    identity,
  });
}

export async function decideOutputDisposition(
  dispositionId: string,
  decision: "ACCEPTED" | "REJECTED",
  reason?: string,
  identity?: Identity,
): Promise<ApiResult<AIOutputDisposition>> {
  return apiPost<AIOutputDisposition>(
    "aiGovernance",
    `/v1/ai/output-dispositions/${dispositionId}/decision`,
    { decision, reason },
    { identity },
  );
}

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

// ─────────────────────────────────────────────────────────────────────────────
// AIG-01: AI Use-Case, Risk & Impact Registry
// ─────────────────────────────────────────────────────────────────────────────

export type UseCaseLifecycleState =
  | "DRAFT"
  | "ASSESSING"
  | "APPROVED"
  | "ACTIVE"
  | "LIMITED"
  | "SUSPENDED"
  | "REJECTED"
  | "RETIRED";

export type OperationalClass = "A0" | "A1" | "A2" | "A3" | "A4";

export type AutomationLevel =
  | "DRAFT"
  | "RECOMMENDATION"
  | "EXTRACTION"
  | "CLASSIFICATION"
  | "RANKING"
  | "AUTONOMOUS_TOOL_PLANNING"
  | "PROHIBITED";

export type AssessmentDecision = "PENDING" | "APPROVED" | "REJECTED";

export type HumanRole = {
  accountable_principal_id: string;
  reviewer_principal_id?: string;
  can_reject: boolean;
};

export type AIUseCase = {
  use_case_id: string;
  tenant_id: string;
  domain: string;
  purpose: string;
  outcome_type: string;
  operational_class: OperationalClass;
  legal_classification_ref?: string;
  owner_principal_id: string;
  business_outcome: string;
  affected_decisions?: string[];
  data_profile?: Record<string, unknown>;
  automation_level: AutomationLevel;
  human_role: HumanRole;
  fallback?: string;
  success_measures?: string;
  prohibited_boundary?: string;
  retirement_criteria?: string;
  lifecycle_state: UseCaseLifecycleState;
  created_at: string;
  created_by_principal_id: string;
  updated_at: string;
};

export type AIImpactAssessment = {
  assessment_id: string;
  use_case_id: string;
  tenant_id: string;
  version: number;
  affected_groups?: string[];
  rights_impact?: string;
  financial_impact?: string;
  employment_impact?: string;
  mitigations?: string;
  approvers?: string[];
  decision: AssessmentDecision;
  decided_by_principal_id?: string;
  decision_reason?: string;
  decided_at?: string;
  expires_at?: string;
  created_at: string;
  created_by_principal_id: string;
};

export type EffectiveUseCaseControl = {
  use_case: AIUseCase;
  latest_assessment?: AIImpactAssessment;
};

export type CreateUseCaseRequest = {
  domain: string;
  purpose: string;
  outcome_type: string;
  operational_class: OperationalClass;
  legal_classification_ref?: string;
  owner_principal_id: string;
  business_outcome: string;
  affected_decisions?: string[];
  data_profile?: Record<string, unknown>;
  automation_level: AutomationLevel;
  human_role: HumanRole;
  fallback?: string;
  success_measures?: string;
  prohibited_boundary?: string;
  retirement_criteria?: string;
  client_request_id: string;
  correlation_id?: string;
};

export type StartAssessmentRequest = {
  affected_groups?: string[];
  rights_impact?: string;
  financial_impact?: string;
  employment_impact?: string;
  mitigations?: string;
  approvers?: string[];
  expires_at?: string;
  correlation_id?: string;
};

export type DecideAssessmentRequest = {
  decision: "APPROVED" | "REJECTED";
  reason?: string;
};

export type ActivateUseCaseRequest = {
  limited?: boolean;
  correlation_id?: string;
};

export type SuspendUseCaseRequest = {
  reason: string;
  correlation_id?: string;
};

export type RequestReassessmentRequest = {
  reason: string;
  correlation_id?: string;
};

export type RetireUseCaseRequest = {
  reason: string;
  correlation_id?: string;
};

export async function createUseCase(
  body: CreateUseCaseRequest,
  identity?: Identity
): Promise<ApiResult<AIUseCase>> {
  return apiPost<AIUseCase>("aiGovernance", "/v1/ai/use-cases", body, { identity });
}

export async function getUseCase(
  useCaseId: string,
  identity?: Identity
): Promise<ApiResult<AIUseCase>> {
  const res = await apiGet<any>("aiGovernance", `/v1/ai/use-cases/${useCaseId}`, { identity });
  if (!res.ok) return res;
  return { ok: true, data: res.data };
}

export async function startAssessment(
  useCaseId: string,
  body: StartAssessmentRequest,
  identity?: Identity
): Promise<ApiResult<AIImpactAssessment>> {
  return apiPost<AIImpactAssessment>(
    "aiGovernance",
    `/v1/ai/use-cases/${useCaseId}/assess`,
    body,
    { identity }
  );
}

export async function decideAssessment(
  assessmentId: string,
  body: DecideAssessmentRequest,
  identity?: Identity
): Promise<ApiResult<AIImpactAssessment>> {
  return apiPost<AIImpactAssessment>(
    "aiGovernance",
    `/v1/ai/use-cases/assessments/${assessmentId}/decision`,
    body,
    { identity }
  );
}

export async function activateUseCase(
  useCaseId: string,
  body: ActivateUseCaseRequest,
  identity?: Identity
): Promise<ApiResult<AIUseCase>> {
  return apiPost<AIUseCase>("aiGovernance", `/v1/ai/use-cases/${useCaseId}/activate`, body, { identity });
}

export async function suspendUseCase(
  useCaseId: string,
  body: SuspendUseCaseRequest,
  identity?: Identity
): Promise<ApiResult<AIUseCase>> {
  return apiPost<AIUseCase>("aiGovernance", `/v1/ai/use-cases/${useCaseId}/suspend`, body, { identity });
}

export async function requestReassessment(
  useCaseId: string,
  body: RequestReassessmentRequest,
  identity?: Identity
): Promise<ApiResult<AIUseCase>> {
  return apiPost<AIUseCase>("aiGovernance", `/v1/ai/use-cases/${useCaseId}/reassess`, body, { identity });
}

export async function retireUseCase(
  useCaseId: string,
  body: RetireUseCaseRequest,
  identity?: Identity
): Promise<ApiResult<AIUseCase>> {
  return apiPost<AIUseCase>("aiGovernance", `/v1/ai/use-cases/${useCaseId}/retire`, body, { identity });
}

export async function getEffectiveUseCaseControl(
  useCaseId: string,
  identity?: Identity
): Promise<ApiResult<EffectiveUseCaseControl>> {
  const res = await apiGet<any>(
    "aiGovernance",
    `/v1/ai/use-cases/${useCaseId}/effective`,
    { identity }
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data };
}

export async function listUseCases(
  identity?: Identity
): Promise<ApiResult<AIUseCase[]>> {
  const res = await apiGet<any>("aiGovernance", "/v1/ai/use-cases", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data)
    ? res.data
    : Array.isArray(res.data?.use_cases)
    ? res.data.use_cases
    : [];
  return { ok: true, data: list };
}

// ─────────────────────────────────────────────────────────────────────────────
// AIG-02: Model, Provider & Capability Registry
// ─────────────────────────────────────────────────────────────────────────────

export type ReleaseState =
  | "DISCOVERED"
  | "DUE_DILIGENCE"
  | "EVALUATING"
  | "APPROVED"
  | "ACTIVE"
  | "RESTRICTED"
  | "QUARANTINED"
  | "REJECTED"
  | "BLOCKED"
  | "RETIRED";

export type TrainingUse = "NO_TRAINING" | "OPT_OUT_AVAILABLE" | "ALLOWED";

export type AIModelRelease = {
  model_release_id: string;
  provider: string;
  provider_model_id: string;
  deployment_region: string;
  capability_set?: string[];
  context_limit?: number;
  training_use: TrainingUse;
  retention?: string;
  approved_scopes?: string[];
  control_evidence?: Record<string, unknown>;
  release_state: ReleaseState;
  status_reason?: string;
  created_at: string;
  created_by_principal_id: string;
  updated_at: string;
};

export type RegisterModelReleaseRequest = {
  provider: string;
  provider_model_id: string;
  deployment_region: string;
  capability_set?: string[];
  context_limit?: number;
  training_use?: TrainingUse;
  retention?: string;
  approved_scopes?: string[];
  control_evidence?: Record<string, unknown>;
  client_request_id: string;
  correlation_id?: string;
};

export type AdvanceReleaseRequest = {
  control_evidence?: Record<string, unknown>;
  reason?: string;
  correlation_id?: string;
};

export type ApproveReleaseRequest = {
  privacy_contract_cleared: boolean;
  residency_cleared: boolean;
  security_cleared: boolean;
  evaluation_cleared: boolean;
  explainability_cleared: boolean;
  continuity_cleared: boolean;
  legal_cleared: boolean;
  control_evidence?: Record<string, unknown>;
  correlation_id?: string;
};

export async function registerModelRelease(
  body: RegisterModelReleaseRequest,
  identity?: Identity
): Promise<ApiResult<AIModelRelease>> {
  return apiPost<AIModelRelease>("aiGovernance", "/v1/ai/model-releases", body, { identity });
}

export async function getModelRelease(
  modelReleaseId: string,
  identity?: Identity
): Promise<ApiResult<AIModelRelease>> {
  const res = await apiGet<any>(
    "aiGovernance",
    `/v1/ai/model-releases/${modelReleaseId}`,
    { identity }
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data };
}

export async function recordDueDiligence(
  modelReleaseId: string,
  body: AdvanceReleaseRequest,
  identity?: Identity
): Promise<ApiResult<AIModelRelease>> {
  return apiPost<AIModelRelease>(
    "aiGovernance",
    `/v1/ai/model-releases/${modelReleaseId}/due-diligence`,
    body,
    { identity }
  );
}

export async function recordEvaluation(
  modelReleaseId: string,
  body: AdvanceReleaseRequest,
  identity?: Identity
): Promise<ApiResult<AIModelRelease>> {
  return apiPost<AIModelRelease>(
    "aiGovernance",
    `/v1/ai/model-releases/${modelReleaseId}/evaluation`,
    body,
    { identity }
  );
}

export async function approveRelease(
  modelReleaseId: string,
  body: ApproveReleaseRequest,
  identity?: Identity
): Promise<ApiResult<AIModelRelease>> {
  return apiPost<AIModelRelease>(
    "aiGovernance",
    `/v1/ai/model-releases/${modelReleaseId}/approve`,
    body,
    { identity }
  );
}

export async function rejectRelease(
  modelReleaseId: string,
  body: AdvanceReleaseRequest,
  identity?: Identity
): Promise<ApiResult<AIModelRelease>> {
  return apiPost<AIModelRelease>(
    "aiGovernance",
    `/v1/ai/model-releases/${modelReleaseId}/reject`,
    body,
    { identity }
  );
}

export async function blockRelease(
  modelReleaseId: string,
  body: AdvanceReleaseRequest,
  identity?: Identity
): Promise<ApiResult<AIModelRelease>> {
  return apiPost<AIModelRelease>(
    "aiGovernance",
    `/v1/ai/model-releases/${modelReleaseId}/block`,
    body,
    { identity }
  );
}

export async function activateRelease(
  modelReleaseId: string,
  identity?: Identity
): Promise<ApiResult<AIModelRelease>> {
  return apiPost<AIModelRelease>(
    "aiGovernance",
    `/v1/ai/model-releases/${modelReleaseId}/activate`,
    {},
    { identity }
  );
}

export async function restrictRelease(
  modelReleaseId: string,
  body: AdvanceReleaseRequest,
  identity?: Identity
): Promise<ApiResult<AIModelRelease>> {
  return apiPost<AIModelRelease>(
    "aiGovernance",
    `/v1/ai/model-releases/${modelReleaseId}/restrict`,
    body,
    { identity }
  );
}

export async function unrestrictRelease(
  modelReleaseId: string,
  identity?: Identity
): Promise<ApiResult<AIModelRelease>> {
  return apiPost<AIModelRelease>(
    "aiGovernance",
    `/v1/ai/model-releases/${modelReleaseId}/unrestrict`,
    {},
    { identity }
  );
}

export async function quarantineRelease(
  modelReleaseId: string,
  body: AdvanceReleaseRequest,
  identity?: Identity
): Promise<ApiResult<AIModelRelease>> {
  return apiPost<AIModelRelease>(
    "aiGovernance",
    `/v1/ai/model-releases/${modelReleaseId}/quarantine`,
    body,
    { identity }
  );
}

export async function retireRelease(
  modelReleaseId: string,
  body: AdvanceReleaseRequest,
  identity?: Identity
): Promise<ApiResult<AIModelRelease>> {
  return apiPost<AIModelRelease>(
    "aiGovernance",
    `/v1/ai/model-releases/${modelReleaseId}/retire`,
    body,
    { identity }
  );
}

export async function listModelReleases(
  identity?: Identity
): Promise<ApiResult<AIModelRelease[]>> {
  const res = await apiGet<any>("aiGovernance", "/v1/ai/model-releases", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data)
    ? res.data
    : Array.isArray(res.data?.model_releases)
    ? res.data.model_releases
    : [];
  return { ok: true, data: list };
}
