"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  createAIRun,
  registerModelProvider,
  setActionRiskClassification,
  type ActionRiskClassification,
  createAutomationPolicy,
  resolveAutomationPolicy,
  proposeAutomationAction,
  decideAutomationAction,
  type AutomationPolicy,
  type AutomationAction,
} from "@/lib/api/ai-governance";
import { resolveKillSwitch } from "@/lib/api/kill-switch";

async function getIdentity() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  return session
    ? {
        principalId: session.principalId,
        tenantId: session.tenantId,
        legalEntityId: session.legalEntityId,
      }
    : undefined;
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
  const riskTier = String(formData.get("riskTier") || "TIER_2_HIGH") as ActionRiskClassification["risk_tier"];
  const requiresHuman = formData.get("requiresHuman") === "on" || formData.get("requiresHuman") === "true";
  const approvalQuorum = Number(formData.get("approvalQuorum") || 1);
  const description = String(formData.get("description") || "").trim();

  if (!actionType) {
    return { success: false, error: "Action Type is required." };
  }

  const payload: ActionRiskClassification = {
    action_type: actionType,
    risk_tier: riskTier,
    requires_human_in_the_loop: requiresHuman,
    approval_quorum: approvalQuorum,
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
    message: `Risk classification for ${actionType} recorded: Category=${res.data.risk_category || riskTier}, MakerChecker=${res.data.requires_maker_checker ? "Required (Dual-Key)" : "Single-Key"}`,
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
  const baseIdentity = await getIdentity();
  const actionId = String(formData.get("actionId") || "").trim();
  const decision = String(formData.get("decision") || "APPROVED") as "APPROVED" | "REJECTED";
  const reason = String(formData.get("reason") || "").trim();
  const checkerPrincipalId = String(formData.get("checkerPrincipalId") || "").trim();

  if (!actionId) {
    return { success: false, error: "Action ID is required." };
  }

  // Allow specifying an independent checker identity so SoD (decider != proposer) can be exercised
  const identity = checkerPrincipalId
    ? {
        principalId: checkerPrincipalId,
        tenantId: baseIdentity?.tenantId || "11111111-1111-1111-1111-111111111111",
        legalEntityId: baseIdentity?.legalEntityId,
      }
    : baseIdentity;

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
    message: `Action ${actionId} decision recorded: Decision=${decision} by ${identity?.principalId || "authorized-checker"}. Status=${res.data.status}.`,
  };
}


