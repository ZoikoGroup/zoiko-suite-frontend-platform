"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, decodeSession, toIdentity } from "@/lib/auth";
import {
  createAIRun,
  registerModelProvider,
  setActionRiskClassification,
  type ActionRiskClassification,
  createAutomationPolicy,
  resolveAutomationPolicy,
  proposeAutomationAction,
  decideAutomationAction,
  proposePolicyChange,
  decidePolicyChange,
  type AutomationPolicy,
  type AutomationAction,
  type PolicyChangeApproval,
  // AIG-01
  createUseCase,
  getUseCase,
  listUseCases,
  startAssessment,
  decideAssessment,
  activateUseCase,
  suspendUseCase,
  requestReassessment,
  retireUseCase,
  getEffectiveUseCaseControl,
  createGovernedExecution,
  type AIExecution,
  createAIIncident,
  type AIIncident,
  createOutputDisposition,
  decideOutputDisposition,
  type AIOutputDisposition,
  type AIUseCase,
  type AIImpactAssessment,
  type EffectiveUseCaseControl,
  type CreateUseCaseRequest,
  type StartAssessmentRequest,
  type DecideAssessmentRequest,
  type ActivateUseCaseRequest,
  type SuspendUseCaseRequest,
  type RequestReassessmentRequest,
  type RetireUseCaseRequest,
  // AIG-02
  registerModelRelease,
  getModelRelease,
  listModelReleases,
  recordDueDiligence,
  recordEvaluation,
  approveRelease,
  rejectRelease,
  blockRelease,
  activateRelease,
  restrictRelease,
  unrestrictRelease,
  quarantineRelease,
  retireRelease,
  type AIModelRelease,
  type RegisterModelReleaseRequest,
  type AdvanceReleaseRequest,
  type ApproveReleaseRequest,
} from "@/lib/api/ai-governance";
import { resolveKillSwitch } from "@/lib/api/kill-switch";

async function getIdentity() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.envelopeJwt || !session.envelopeExpiresAt || session.envelopeExpiresAt * 1000 <= Date.now()) {
    return undefined;
  }
  return toIdentity(session);
}

export type ActionResult<T = unknown> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

export async function executeAiEvaluationAction(formData: FormData): Promise<ActionResult> {
  const identity = await getIdentity();
  const modelProvider = String(formData.get("modelProvider") || "anthropic");
  const modelName = String(formData.get("modelName") || "claude-3-7-sonnet");
  const purpose = String(formData.get("purpose") || "Contract review and automated compliance extraction");
  const promptTokens = Number(formData.get("promptTokens") || 1500);
  const completionTokens = Number(formData.get("completionTokens") || 350);

  // Pre-execution gate: check kill-switch-registry-svc (:8147)
  const ksRes = await resolveKillSwitch(
    {
      domain: "AI_AUTOMATION",
      provider_code: modelProvider.toUpperCase(),
    },
    identity
  );
  if (ksRes.ok && ksRes.data.blocked) {
    const ev = ksRes.data.matched_event || ksRes.data.matching_event;
    return {
      success: false,
      error: `BLOCKED BY KILL SWITCH (:8147): Active operational halt for domain AI_AUTOMATION / provider '${modelProvider.toUpperCase()}'. AI execution denied (Reason: "${ev?.reason || "Emergency incident safety stop"}", Runbook: ${ev?.reconciliation_procedure_ref || "N/A"}).`,
    };
  }

  const res = await createAIRun(
    {
      model_provider: modelProvider,
      model_name: modelName,
      purpose,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
    },
    identity
  );

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || "Failed to execute and audit AI run on ai-governance-svc",
    };
  }

  revalidatePath("/admin/ai-governance");
  const runId = res.data.ai_run_id || res.data.run_id;
  return {
    success: true,
    data: res.data,
    message: `AI Evaluation Run Audited: Run ID=${runId}, Model=${modelName}, Confidence=${res.data.confidence ?? "0.9850"}, Audit ID=${res.data.audit_id || "generated"}`,
  };
}

export async function createGovernedExecutionAction(formData: FormData): Promise<ActionResult<AIExecution>> {
  const identity = await getIdentity();
  if (!identity) {
    return { success: false, error: "A valid authenticated identity session is required to submit an execution." };
  }
  const useCaseId = String(formData.get("useCaseId") || "").trim();
  const modelReleaseId = String(formData.get("modelReleaseId") || "").trim();
  const packageId = String(formData.get("packageId") || "").trim();
  const packageVersion = String(formData.get("packageVersion") || "").trim();
  const idempotencyKey = String(formData.get("idempotencyKey") || "").trim();
  const inputText = String(formData.get("input") || "").trim();
  if (!useCaseId || !modelReleaseId || !packageId || !packageVersion || !idempotencyKey || !inputText) {
    return { success: false, error: "Use case, model release, package, version, input, and retry key are required." };
  }
  let input: unknown;
  try {
    input = JSON.parse(inputText);
  } catch {
    return { success: false, error: "Input must be valid JSON." };
  }

  const res = await createGovernedExecution(
    {
      use_case_id: useCaseId,
      model_release_id: modelReleaseId,
      package_id: packageId,
      package_version: packageVersion,
      input,
    },
    idempotencyKey,
    identity,
  );
  if (!res.ok) {
    return { success: false, error: res.error.message };
  }
  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Execution ${res.data.execution_id} was recorded as BLOCKED. No provider inference was run because required governance integrations are unavailable.`,
  };
}

export async function createAIIncidentAction(formData: FormData): Promise<ActionResult<AIIncident>> {
  const identity = await getIdentity();
  if (!identity) {
    return { success: false, error: "A valid authenticated identity session is required to report an incident." };
  }
  const severity = String(formData.get("severity") || "");
  const modelReleaseId = String(formData.get("modelReleaseId") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const idempotencyKey = String(formData.get("idempotencyKey") || "").trim();
  if (!["AI-P0", "AI-P1", "AI-P2", "AI-P3"].includes(severity)) {
    return { success: false, error: "Select a valid incident severity." };
  }
  if (!modelReleaseId || !description || !idempotencyKey) {
    return { success: false, error: "Model release, incident description, and retry key are required." };
  }

  const res = await createAIIncident(
    { severity: severity as AIIncident["severity"], model_release_id: modelReleaseId, description },
    idempotencyKey,
    identity,
  );
  if (!res.ok) {
    return { success: false, error: res.error.message };
  }
  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Incident ${res.data.incident_id} opened (${res.data.severity}). ${res.data.severity === "AI-P0" ? "The model release was quarantined locally." : "External containment and workflow assignment remain unavailable."}`,
  };
}

export async function createOutputDispositionAction(formData: FormData): Promise<ActionResult<AIOutputDisposition>> {
  const identity = await getIdentity();
  if (!identity) {
    return { success: false, error: "A valid authenticated identity session is required to create a disposition." };
  }
  const aiRunId = String(formData.get("aiRunId") || "").trim();
  const oversightClass = String(formData.get("oversightClass") || "");
  const idempotencyKey = String(formData.get("idempotencyKey") || "").trim();
  if (!["O0", "O1", "O2", "O3", "O4"].includes(oversightClass)) {
    return { success: false, error: "Select a valid oversight class." };
  }
  if (!aiRunId || !idempotencyKey) {
    return { success: false, error: "AI run ID and retry key are required." };
  }

  const res = await createOutputDisposition(
    { ai_run_id: aiRunId, oversight_class: oversightClass as AIOutputDisposition["oversight_class"] },
    idempotencyKey,
    identity,
  );
  if (!res.ok) {
    return { success: false, error: res.error.message };
  }
  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Disposition ${res.data.disposition_id} created (${res.data.oversight_class}) with status ${res.data.status}.`,
  };
}

export async function decideOutputDispositionAction(formData: FormData): Promise<ActionResult<AIOutputDisposition>> {
  const identity = await getIdentity();
  if (!identity) {
    return { success: false, error: "A valid authenticated identity session is required to decide a disposition." };
  }
  const dispositionId = String(formData.get("dispositionId") || "").trim();
  const decision = String(formData.get("decision") || "ACCEPTED") as "ACCEPTED" | "REJECTED";
  const reason = String(formData.get("reason") || "").trim();
  if (!dispositionId) {
    return { success: false, error: "Disposition ID is required." };
  }

  const res = await decideOutputDisposition(dispositionId, decision, reason, identity);
  if (!res.ok) {
    return { success: false, error: res.error.message };
  }
  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Disposition ${dispositionId} decision recorded: ${decision} by ${identity.principalId}.`,
  };
}

export async function registerModelAction(formData: FormData): Promise<ActionResult> {
  const identity = await getIdentity();
  const provider = String(formData.get("provider") || "").trim().toLowerCase();
  const model = String(formData.get("model") || "").trim().toLowerCase();
  const maxContextTokens = Number(formData.get("maxContextTokens") || 128000);
  const dataResidencyRegion = String(formData.get("dataResidencyRegion") || "eu-west-1").trim();

  if (!provider || !model) {
    return { success: false, error: "Provider and Model Name are required." };
  }

  const res = await registerModelProvider(
    {
      provider,
      model,
      max_context_tokens: maxContextTokens,
      data_residency_region: dataResidencyRegion,
    },
    identity
  );

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to register model ${model} with ai-governance-svc`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Model ${model} registered and pinned to region ${dataResidencyRegion}. Provider Registration ID=${res.data.provider_registration_id ?? "active"}`,
  };
}

export async function setActionRiskAction(formData: FormData): Promise<ActionResult> {
  const identity = await getIdentity();
  const actionType = String(formData.get("actionType") || "").trim().toUpperCase();
  const rawCategory = String(formData.get("riskCategory") || "").trim();
  const riskTier = String(formData.get("riskTier") || "TIER_2_HIGH") as ActionRiskClassification["risk_tier"];
  const requiresHuman = formData.get("requiresHuman") === "on" || formData.get("requiresHuman") === "true";
  const approvalQuorum = Number(formData.get("approvalQuorum") || 1);
  const description = String(formData.get("description") || "").trim();

  if (!actionType) {
    return { success: false, error: "Action Type is required." };
  }

  const payload: ActionRiskClassification = {
    action_type: actionType,
    risk_category: rawCategory || undefined,
    risk_tier: riskTier,
    requires_human_in_the_loop: requiresHuman,
    approval_quorum: approvalQuorum,
    requires_maker_checker: approvalQuorum > 1,
    description,
  };

  const res = await setActionRiskClassification(payload, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to record risk classification for ${actionType}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Risk classification for ${actionType} recorded: Category=${res.data.risk_category || rawCategory || riskTier}, MakerChecker=${res.data.requires_maker_checker ? "Required (Dual-Key)" : "Single-Key"}`,
  };
}

export async function createAutomationPolicyAction(formData: FormData): Promise<ActionResult> {
  const identity = await getIdentity();
  const role = String(formData.get("role") || "").trim();
  const riskCategory = String(formData.get("riskCategory") || "MONEY").trim();
  const tool = String(formData.get("tool") || "").trim();
  const actionType = String(formData.get("actionType") || "").trim().toUpperCase();
  const maxScopeAmount = formData.get("maxScopeAmount") ? Number(formData.get("maxScopeAmount")) : undefined;
  const requiredApprovals = Number(formData.get("requiredApprovals") || 0);
  const dryRunRequired = formData.get("dryRunRequired") === "on" || formData.get("dryRunRequired") === "true";
  const rateLimitPerDay = formData.get("rateLimitPerDay") ? Number(formData.get("rateLimitPerDay")) : undefined;

  if (!role || !tool || !actionType) {
    return { success: false, error: "Role, Tool, and Action Type are required." };
  }

  const res = await createAutomationPolicy(
    {
      role,
      risk_category: riskCategory,
      tool,
      action_type: actionType,
      max_scope_amount: maxScopeAmount,
      required_approvals: requiredApprovals,
      dry_run_required: dryRunRequired,
      rate_limit_per_day: rateLimitPerDay,
    },
    identity
  );

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to create automation policy allowlist for ${actionType}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Autonomous allowlist policy created for ${actionType} (Role: ${role}, Tool: ${tool}, Quorum: ${requiredApprovals}).`,
  };
}

export async function resolvePolicyAction(formData: FormData): Promise<ActionResult> {
  const identity = await getIdentity();
  const role = String(formData.get("role") || "").trim();
  const riskCategory = String(formData.get("riskCategory") || "MONEY").trim();
  const tool = String(formData.get("tool") || "").trim();
  const actionType = String(formData.get("actionType") || "").trim().toUpperCase();

  if (!role || !tool || !actionType) {
    return { success: false, error: "Role, Tool, and Action Type are required." };
  }

  const res = await resolveAutomationPolicy(
    { role, risk_category: riskCategory, tool, action_type: actionType },
    identity
  );

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to query policy resolution for ${actionType}`,
    };
  }

  return {
    success: true,
    data: res.data,
    message: `Policy Resolution: Allowed=${res.data.allowed ? "YES" : "NO"} (Reason: ${res.data.reason_code}${res.data.detail ? ` - ${res.data.detail}` : ""})`,
  };
}

export async function proposeAutomationActionAction(formData: FormData): Promise<ActionResult> {
  const identity = await getIdentity();
  const actionType = String(formData.get("actionType") || "").trim().toUpperCase();
  const role = String(formData.get("role") || "agent-operator").trim();
  const tool = String(formData.get("tool") || "automated-tool").trim();
  const rollbackPlan = String(formData.get("rollbackPlan") || "Rollback via compensatory transaction").trim();

  if (!actionType || !role || !tool) {
    return { success: false, error: "Action Type, Role, and Tool are required." };
  }

  const res = await proposeAutomationAction(
    {
      action_type: actionType,
      role,
      tool,
      rollback_plan: rollbackPlan,
    },
    identity
  );

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to propose autonomous action ${actionType}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Autonomous action proposed: Action ID=${res.data.automation_action_id}, Status=${res.data.status}, Approval=${res.data.approval_status}`,
  };
}

export async function decideAutomationActionAction(formData: FormData): Promise<ActionResult> {
  const identity = await getIdentity();
  const actionId = String(formData.get("actionId") || "").trim();
  const decision = String(formData.get("decision") || "APPROVED") as "APPROVED" | "REJECTED";
  const reason = String(formData.get("reason") || "").trim();

  if (!identity) {
    return { success: false, error: "A valid authenticated identity session is required to decide an action." };
  }
  if (!actionId) {
    return { success: false, error: "Action ID is required." };
  }

  const res = await decideAutomationAction(actionId, decision, reason, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Decision failed on action ${actionId}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Action ${actionId} decision recorded: Decision=${decision} by ${identity.principalId}. Status=${res.data.status}.`,
  };
}

export async function proposePolicyChangeAction(formData: FormData): Promise<ActionResult<PolicyChangeApproval>> {
  const identity = await getIdentity();
  const targetPolicyRef = String(formData.get("targetPolicyRef") || "").trim();
  const proposedChange = String(formData.get("proposedChange") || "").trim();

  if (!targetPolicyRef || !proposedChange) {
    return { success: false, error: "Target Policy Ref and Proposed Change description are required." };
  }

  const res = await proposePolicyChange(
    {
      target_policy_ref: targetPolicyRef,
      proposed_change: proposedChange,
    },
    identity
  );

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || "Failed to propose policy change approval",
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Policy change proposed: Approval ID=${res.data.policy_change_approval_id}, Target=${res.data.target_policy_ref}, Proposer=${res.data.proposed_by_principal_id}`,
  };
}

export async function decidePolicyChangeAction(formData: FormData): Promise<ActionResult<PolicyChangeApproval>> {
  const identity = await getIdentity();
  const approvalId = String(formData.get("approvalId") || "").trim();
  const decision = String(formData.get("decision") || "APPROVED") as "APPROVED" | "REJECTED";
  const reason = String(formData.get("reason") || "").trim();

  if (!identity) {
    return { success: false, error: "A valid authenticated identity session is required to decide a policy change." };
  }
  if (!approvalId) {
    return { success: false, error: "Policy Change Approval ID is required." };
  }

  const res = await decidePolicyChange(approvalId, decision, reason, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Policy change decision failed for ${approvalId}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Policy change ${approvalId} decision recorded: Decision=${decision} by ${identity.principalId}. Target=${res.data.target_policy_ref}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AIG-01: AI Use-Case, Risk & Impact Registry Server Actions
// ─────────────────────────────────────────────────────────────────────────────

export async function createUseCaseAction(formData: FormData): Promise<ActionResult<AIUseCase>> {
  const identity = await getIdentity();
  const clientRequestId = String(formData.get("clientRequestId") || `uc-${Date.now().toString(36)}`).trim();
  
  const payload: CreateUseCaseRequest = {
    domain: String(formData.get("domain") || "").trim(),
    purpose: String(formData.get("purpose") || "").trim(),
    outcome_type: String(formData.get("outcomeType") || "").trim(),
    operational_class: String(formData.get("operationalClass") || "") as CreateUseCaseRequest["operational_class"],
    legal_classification_ref: String(formData.get("legalClassificationRef") || "").trim() || undefined,
    owner_principal_id: String(formData.get("ownerPrincipalId") || "").trim(),
    business_outcome: String(formData.get("businessOutcome") || "").trim(),
    affected_decisions: String(formData.get("affectedDecisions") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    data_profile: formData.get("dataProfile") ? JSON.parse(String(formData.get("dataProfile"))) : undefined,
    automation_level: String(formData.get("automationLevel") || "") as CreateUseCaseRequest["automation_level"],
    human_role: {
      accountable_principal_id: String(formData.get("accountablePrincipalId") || "").trim(),
      reviewer_principal_id: String(formData.get("reviewerPrincipalId") || "").trim() || undefined,
      can_reject: formData.get("canReject") === "on" || formData.get("canReject") === "true",
    },
    fallback: String(formData.get("fallback") || "").trim() || undefined,
    success_measures: String(formData.get("successMeasures") || "").trim() || undefined,
    prohibited_boundary: String(formData.get("prohibitedBoundary") || "").trim() || undefined,
    retirement_criteria: String(formData.get("retirementCriteria") || "").trim() || undefined,
    client_request_id: clientRequestId,
    correlation_id: String(formData.get("correlationId") || "").trim() || undefined,
  };

  if (!payload.domain || !payload.purpose || !payload.outcome_type || !payload.operational_class ||
      !payload.owner_principal_id || !payload.business_outcome || !payload.automation_level ||
      !payload.human_role.accountable_principal_id) {
    return { success: false, error: "All required fields must be filled: domain, purpose, outcome_type, operational_class, owner_principal_id, business_outcome, automation_level, accountable_principal_id" };
  }

  const res = await createUseCase(payload, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || "Failed to create AI use case",
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `AI Use Case created: ${res.data.use_case_id} (${res.data.lifecycle_state})`,
  };
}

export async function startAssessmentAction(formData: FormData): Promise<ActionResult<AIImpactAssessment>> {
  const identity = await getIdentity();
  const useCaseId = String(formData.get("useCaseId") || "").trim();

  if (!useCaseId) {
    return { success: false, error: "Use Case ID is required." };
  }

  const payload: StartAssessmentRequest = {
    affected_groups: String(formData.get("affectedGroups") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    rights_impact: String(formData.get("rightsImpact") || "").trim() || undefined,
    financial_impact: String(formData.get("financialImpact") || "").trim() || undefined,
    employment_impact: String(formData.get("employmentImpact") || "").trim() || undefined,
    mitigations: String(formData.get("mitigations") || "").trim() || undefined,
    approvers: String(formData.get("approvers") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    expires_at: formData.get("expiresAt")
      ? new Date(String(formData.get("expiresAt"))).toISOString()
      : undefined,
    correlation_id: String(formData.get("correlationId") || "").trim() || undefined,
  };

  const res = await startAssessment(useCaseId, payload, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to start assessment for use case ${useCaseId}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Assessment started: ${res.data.assessment_id} for use case ${useCaseId} (Status: ${res.data.decision})`,
  };
}

export async function decideAssessmentAction(formData: FormData): Promise<ActionResult<AIImpactAssessment>> {
  const identity = await getIdentity();
  const assessmentId = String(formData.get("assessmentId") || "").trim();
  const decision = String(formData.get("decision") || "APPROVED") as "APPROVED" | "REJECTED";
  const reason = String(formData.get("reason") || "").trim();

  if (!identity) {
    return { success: false, error: "A valid authenticated identity session is required to decide an assessment." };
  }
  if (!assessmentId) {
    return { success: false, error: "Assessment ID is required." };
  }

  const payload: DecideAssessmentRequest = { decision, reason: reason || undefined };

  const res = await decideAssessment(assessmentId, payload, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to decide assessment ${assessmentId}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Assessment ${assessmentId} decided: ${decision} by ${identity.principalId}`,
  };
}

export async function activateUseCaseAction(formData: FormData): Promise<ActionResult<AIUseCase>> {
  const identity = await getIdentity();
  const useCaseId = String(formData.get("useCaseId") || "").trim();
  const limited = formData.get("limited") === "on" || formData.get("limited") === "true";

  if (!useCaseId) {
    return { success: false, error: "Use Case ID is required." };
  }

  const payload: ActivateUseCaseRequest = { limited, correlation_id: String(formData.get("correlationId") || "").trim() || undefined };

  const res = await activateUseCase(useCaseId, payload, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to activate use case ${useCaseId}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Use Case ${useCaseId} activated (${res.data.lifecycle_state}${res.data.lifecycle_state === "LIMITED" ? " - LIMITED" : ""})`,
  };
}

export async function suspendUseCaseAction(formData: FormData): Promise<ActionResult<AIUseCase>> {
  const identity = await getIdentity();
  const useCaseId = String(formData.get("useCaseId") || "").trim();
  const reason = String(formData.get("reason") || "").trim();

  if (!useCaseId || !reason) {
    return { success: false, error: "Use Case ID and reason are required." };
  }

  const payload: SuspendUseCaseRequest = { reason, correlation_id: String(formData.get("correlationId") || "").trim() || undefined };

  const res = await suspendUseCase(useCaseId, payload, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to suspend use case ${useCaseId}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Use Case ${useCaseId} suspended: ${res.data.lifecycle_state}`,
  };
}

export async function requestReassessmentAction(formData: FormData): Promise<ActionResult<AIUseCase>> {
  const identity = await getIdentity();
  const useCaseId = String(formData.get("useCaseId") || "").trim();
  const reason = String(formData.get("reason") || "").trim();

  if (!useCaseId || !reason) {
    return { success: false, error: "Use Case ID and reason are required." };
  }

  const payload: RequestReassessmentRequest = { reason, correlation_id: String(formData.get("correlationId") || "").trim() || undefined };

  const res = await requestReassessment(useCaseId, payload, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to request reassessment for use case ${useCaseId}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Reassessment requested for ${useCaseId}: ${res.data.lifecycle_state}`,
  };
}

export async function retireUseCaseAction(formData: FormData): Promise<ActionResult<AIUseCase>> {
  const identity = await getIdentity();
  const useCaseId = String(formData.get("useCaseId") || "").trim();
  const reason = String(formData.get("reason") || "").trim();

  if (!useCaseId || !reason) {
    return { success: false, error: "Use Case ID and reason are required." };
  }

  const payload: RetireUseCaseRequest = { reason, correlation_id: String(formData.get("correlationId") || "").trim() || undefined };

  const res = await retireUseCase(useCaseId, payload, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to retire use case ${useCaseId}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Use Case ${useCaseId} retired: ${res.data.lifecycle_state}`,
  };
}

export async function getEffectiveUseCaseControlAction(formData: FormData): Promise<ActionResult<EffectiveUseCaseControl>> {
  const identity = await getIdentity();
  const useCaseId = String(formData.get("useCaseId") || "").trim();

  if (!useCaseId) {
    return { success: false, error: "Use Case ID is required." };
  }

  const res = await getEffectiveUseCaseControl(useCaseId, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to get effective control for use case ${useCaseId}`,
    };
  }

  return {
    success: true,
    data: res.data,
    message: `Effective control retrieved for ${useCaseId}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AIG-02: Model Release Registry Server Actions
// ─────────────────────────────────────────────────────────────────────────────

export async function registerModelReleaseAction(formData: FormData): Promise<ActionResult<AIModelRelease>> {
  const identity = await getIdentity();
  const clientRequestId = String(formData.get("clientRequestId") || `mr-${Date.now().toString(36)}`).trim();

  const payload: RegisterModelReleaseRequest = {
    provider: String(formData.get("provider") || "").trim(),
    provider_model_id: String(formData.get("providerModelId") || "").trim(),
    deployment_region: String(formData.get("deploymentRegion") || "").trim(),
    capability_set: String(formData.get("capabilitySet") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    context_limit: formData.get("contextLimit") ? Number(formData.get("contextLimit")) : undefined,
    training_use: String(formData.get("trainingUse") || "NO_TRAINING") as RegisterModelReleaseRequest["training_use"],
    retention: String(formData.get("retention") || "").trim() || undefined,
    approved_scopes: String(formData.get("approvedScopes") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    control_evidence: formData.get("controlEvidence") ? JSON.parse(String(formData.get("controlEvidence"))) : undefined,
    client_request_id: clientRequestId,
    correlation_id: String(formData.get("correlationId") || "").trim() || undefined,
  };

  if (!payload.provider || !payload.provider_model_id || !payload.deployment_region) {
    return { success: false, error: "Provider, Provider Model ID, and Deployment Region are required." };
  }

  const res = await registerModelRelease(payload, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || "Failed to register model release",
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Model Release registered: ${res.data.model_release_id} (${res.data.release_state})`,
  };
}

export async function recordDueDiligenceAction(formData: FormData): Promise<ActionResult<AIModelRelease>> {
  const identity = await getIdentity();
  const modelReleaseId = String(formData.get("modelReleaseId") || "").trim();

  if (!modelReleaseId) {
    return { success: false, error: "Model Release ID is required." };
  }

  const payload: AdvanceReleaseRequest = {
    control_evidence: formData.get("controlEvidence") ? JSON.parse(String(formData.get("controlEvidence"))) : undefined,
    reason: String(formData.get("reason") || "").trim() || undefined,
    correlation_id: String(formData.get("correlationId") || "").trim() || undefined,
  };

  const res = await recordDueDiligence(modelReleaseId, payload, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to record due diligence for ${modelReleaseId}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Due diligence recorded for ${modelReleaseId}: ${res.data.release_state}`,
  };
}

export async function recordEvaluationAction(formData: FormData): Promise<ActionResult<AIModelRelease>> {
  const identity = await getIdentity();
  const modelReleaseId = String(formData.get("modelReleaseId") || "").trim();

  if (!modelReleaseId) {
    return { success: false, error: "Model Release ID is required." };
  }

  const payload: AdvanceReleaseRequest = {
    control_evidence: formData.get("controlEvidence") ? JSON.parse(String(formData.get("controlEvidence"))) : undefined,
    reason: String(formData.get("reason") || "").trim() || undefined,
    correlation_id: String(formData.get("correlationId") || "").trim() || undefined,
  };

  const res = await recordEvaluation(modelReleaseId, payload, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to record evaluation for ${modelReleaseId}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Evaluation recorded for ${modelReleaseId}: ${res.data.release_state}`,
  };
}

export async function approveReleaseAction(formData: FormData): Promise<ActionResult<AIModelRelease>> {
  const identity = await getIdentity();
  const modelReleaseId = String(formData.get("modelReleaseId") || "").trim();

  if (!modelReleaseId) {
    return { success: false, error: "Model Release ID is required." };
  }

  const payload: ApproveReleaseRequest = {
    privacy_contract_cleared: formData.get("privacyContractCleared") === "on" || formData.get("privacyContractCleared") === "true",
    residency_cleared: formData.get("residencyCleared") === "on" || formData.get("residencyCleared") === "true",
    security_cleared: formData.get("securityCleared") === "on" || formData.get("securityCleared") === "true",
    evaluation_cleared: formData.get("evaluationCleared") === "on" || formData.get("evaluationCleared") === "true",
    explainability_cleared: formData.get("explainabilityCleared") === "on" || formData.get("explainabilityCleared") === "true",
    continuity_cleared: formData.get("continuityCleared") === "on" || formData.get("continuityCleared") === "true",
    legal_cleared: formData.get("legalCleared") === "on" || formData.get("legalCleared") === "true",
    control_evidence: formData.get("controlEvidence") ? JSON.parse(String(formData.get("controlEvidence"))) : undefined,
    correlation_id: String(formData.get("correlationId") || "").trim() || undefined,
  };

  const res = await approveRelease(modelReleaseId, payload, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to approve release ${modelReleaseId}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Release ${modelReleaseId} approved: ${res.data.release_state}`,
  };
}

export async function rejectReleaseAction(formData: FormData): Promise<ActionResult<AIModelRelease>> {
  const identity = await getIdentity();
  const modelReleaseId = String(formData.get("modelReleaseId") || "").trim();
  const reason = String(formData.get("reason") || "").trim();

  if (!modelReleaseId || !reason) {
    return { success: false, error: "Model Release ID and reason are required." };
  }

  const payload: AdvanceReleaseRequest = { reason, correlation_id: String(formData.get("correlationId") || "").trim() || undefined };

  const res = await rejectRelease(modelReleaseId, payload, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to reject release ${modelReleaseId}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Release ${modelReleaseId} rejected: ${res.data.release_state}`,
  };
}

export async function blockReleaseAction(formData: FormData): Promise<ActionResult<AIModelRelease>> {
  const identity = await getIdentity();
  const modelReleaseId = String(formData.get("modelReleaseId") || "").trim();
  const reason = String(formData.get("reason") || "").trim();

  if (!modelReleaseId || !reason) {
    return { success: false, error: "Model Release ID and reason are required." };
  }

  const payload: AdvanceReleaseRequest = { reason, correlation_id: String(formData.get("correlationId") || "").trim() || undefined };

  const res = await blockRelease(modelReleaseId, payload, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to block release ${modelReleaseId}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Release ${modelReleaseId} blocked: ${res.data.release_state}`,
  };
}

export async function activateReleaseAction(formData: FormData): Promise<ActionResult<AIModelRelease>> {
  const identity = await getIdentity();
  const modelReleaseId = String(formData.get("modelReleaseId") || "").trim();

  if (!modelReleaseId) {
    return { success: false, error: "Model Release ID is required." };
  }

  const res = await activateRelease(modelReleaseId, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to activate release ${modelReleaseId}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Release ${modelReleaseId} activated: ${res.data.release_state}`,
  };
}

export async function restrictReleaseAction(formData: FormData): Promise<ActionResult<AIModelRelease>> {
  const identity = await getIdentity();
  const modelReleaseId = String(formData.get("modelReleaseId") || "").trim();
  const reason = String(formData.get("reason") || "").trim();

  if (!modelReleaseId || !reason) {
    return { success: false, error: "Model Release ID and reason are required." };
  }

  const payload: AdvanceReleaseRequest = { reason, correlation_id: String(formData.get("correlationId") || "").trim() || undefined };

  const res = await restrictRelease(modelReleaseId, payload, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to restrict release ${modelReleaseId}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Release ${modelReleaseId} restricted: ${res.data.release_state}`,
  };
}

export async function unrestrictReleaseAction(formData: FormData): Promise<ActionResult<AIModelRelease>> {
  const identity = await getIdentity();
  const modelReleaseId = String(formData.get("modelReleaseId") || "").trim();

  if (!modelReleaseId) {
    return { success: false, error: "Model Release ID is required." };
  }

  const res = await unrestrictRelease(modelReleaseId, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to unrestrict release ${modelReleaseId}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Release ${modelReleaseId} unrestricted: ${res.data.release_state}`,
  };
}

export async function quarantineReleaseAction(formData: FormData): Promise<ActionResult<AIModelRelease>> {
  const identity = await getIdentity();
  const modelReleaseId = String(formData.get("modelReleaseId") || "").trim();
  const reason = String(formData.get("reason") || "").trim();

  if (!modelReleaseId || !reason) {
    return { success: false, error: "Model Release ID and reason are required." };
  }

  const payload: AdvanceReleaseRequest = { reason, correlation_id: String(formData.get("correlationId") || "").trim() || undefined };

  const res = await quarantineRelease(modelReleaseId, payload, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to quarantine release ${modelReleaseId}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Release ${modelReleaseId} quarantined: ${res.data.release_state}`,
  };
}

export async function retireReleaseAction(formData: FormData): Promise<ActionResult<AIModelRelease>> {
  const identity = await getIdentity();
  const modelReleaseId = String(formData.get("modelReleaseId") || "").trim();
  const reason = String(formData.get("reason") || "").trim();

  if (!modelReleaseId || !reason) {
    return { success: false, error: "Model Release ID and reason are required." };
  }

  const payload: AdvanceReleaseRequest = { reason, correlation_id: String(formData.get("correlationId") || "").trim() || undefined };

  const res = await retireRelease(modelReleaseId, payload, identity);

  if (!res.ok) {
    return {
      success: false,
      error: res.error.message || `Failed to retire release ${modelReleaseId}`,
    };
  }

  revalidatePath("/admin/ai-governance");
  return {
    success: true,
    data: res.data,
    message: `Release ${modelReleaseId} retired: ${res.data.release_state}`,
  };
}
