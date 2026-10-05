"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createCapability,
  getCapability,
  createMarketRelease,
  createIntegrationCapability,
  listIntegrationCapabilities,
  updateIntegrationHealth,
  setReleaseState,
  createCapabilityClaim,
  listCapabilityClaims,
  resolveCapability,
  type CreateCapabilityInput,
  type CreateMarketReleaseInput,
  type ExecutionRiskClass,
  type LegalApprovalStatus,
  type CreateIntegrationCapabilityInput,
  type SetReleaseStateInput,
  type CreateCapabilityClaimInput,
} from "@/lib/api/capability-registry";
import type { CapabilityActionState } from "./capability-state";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const decoded = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!decoded) throw new Error("unauthenticated");
  return decoded;
}

const EXPIRED: CapabilityActionState = {
  status: "error",
  message: "Session expired — please log in again.",
};

function isExecutionRiskClass(value: string): value is ExecutionRiskClass {
  return value === "LOW" || value === "MEDIUM" || value === "HIGH" || value === "CRITICAL";
}

function isLegalApprovalStatus(value: string): value is LegalApprovalStatus {
  return value === "APPROVED" || value === "PENDING" || value === "REJECTED";
}

export async function createCapabilityAction(
  _previous: CapabilityActionState,
  formData: FormData
): Promise<CapabilityActionState> {
  const idempotencyKey = String(formData.get("idempotency_key") ?? "").trim() || randomUUID();
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...EXPIRED, idempotencyKey };
  }

  const capabilityCode = String(formData.get("capability_code") ?? "").trim().toUpperCase();
  const moduleDomain = String(formData.get("module_domain") ?? "").trim().toUpperCase();
  const versionRaw = formData.get("version");
  const version = versionRaw ? parseInt(String(versionRaw), 10) : 1;
  const dependencies = String(formData.get("dependencies") ?? "").trim();
  const executionRiskClass = String(formData.get("execution_risk_class") ?? "MEDIUM").trim().toUpperCase();

  if (!capabilityCode || !moduleDomain || !isExecutionRiskClass(executionRiskClass)) {
    return {
      status: "error",
      action: "create_capability",
      message: "capability_code and module_domain are required; execution_risk_class must be LOW, MEDIUM, HIGH, or CRITICAL.",
      idempotencyKey,
    };
  }

  const input: CreateCapabilityInput = {
    capability_code: capabilityCode,
    module_domain: moduleDomain,
    version: isNaN(version) ? 1 : version,
    dependencies: dependencies || undefined,
    execution_risk_class: executionRiskClass,
  };

  const res = await createCapability(input, identity, idempotencyKey);
  if (!res.ok) {
    let friendly = res.error.message;
    if (res.error.status === 409) {
      friendly = `Capability code '${capabilityCode}' already exists in registry (HTTP 409 Conflict).`;
    }
    return {
      status: "error",
      action: "create_capability",
      message: friendly,
      error: res.error.message,
      idempotencyKey,
    };
  }

  revalidatePath("/admin/capabilities");
  return {
    status: "success",
    action: "create_capability",
    idempotencyKey: randomUUID(),
    message: `Capability Created: ${res.data.capability_code} (ID: ${res.data.capability_id}, Domain: ${res.data.module_domain}, Risk: ${res.data.execution_risk_class})`,
    capability: res.data,
  };
}

export async function getCapabilityAction(
  _previous: CapabilityActionState,
  formData: FormData
): Promise<CapabilityActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const capabilityId = String(formData.get("capability_id") ?? "").trim();
  if (!capabilityId) {
    return {
      status: "error",
      action: "get_capability",
      message: "capability_id is required.",
    };
  }

  const res = await getCapability(capabilityId, identity);
  if (!res.ok) {
    return {
      status: "error",
      action: "get_capability",
      message: res.error.message || `Capability ${capabilityId} not found.`,
      error: res.error.message,
    };
  }

  return {
    status: "success",
    action: "get_capability",
    message: `Capability Loaded: ${res.data.capability_code} (Domain: ${res.data.module_domain})`,
    capability: res.data,
  };
}

export async function createMarketReleaseAction(
  _previous: CapabilityActionState,
  formData: FormData
): Promise<CapabilityActionState> {
  const idempotencyKey = String(formData.get("idempotency_key") ?? "").trim() || randomUUID();
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...EXPIRED, idempotencyKey };
  }

  const capabilityId = String(formData.get("capability_id") ?? "").trim();
  const marketCode = String(formData.get("market_code") ?? "").trim().toUpperCase();
  const languageCode = String(formData.get("language_code") ?? "").trim().toLowerCase();
  const legalApprovalStatus = String(formData.get("legal_approval_status") ?? "APPROVED").trim().toUpperCase();
  const state = String(formData.get("state") ?? "GA").trim().toUpperCase();
  const effectiveFrom = String(formData.get("effective_from") ?? new Date().toISOString()).trim();

  if (!capabilityId || !marketCode || !isLegalApprovalStatus(legalApprovalStatus) || !state) {
    return {
      status: "error",
      action: "create_market_release",
      message: "capability_id and market_code are required; legal_approval_status must be APPROVED, PENDING, or REJECTED.",
      idempotencyKey,
    };
  }

  const input: CreateMarketReleaseInput = {
    market_code: marketCode,
    language_code: languageCode || undefined,
    legal_approval_status: legalApprovalStatus,
    state,
    effective_from: effectiveFrom,
  };

  const res = await createMarketRelease(capabilityId, input, identity, idempotencyKey);
  if (!res.ok) {
    return {
      status: "error",
      action: "create_market_release",
      message: res.error.message || "Failed to register market release.",
      error: res.error.message,
      idempotencyKey,
    };
  }

  revalidatePath("/admin/capabilities");
  return {
    status: "success",
    action: "create_market_release",
    idempotencyKey: randomUUID(),
    message: `Market Release Registered: Market=${res.data.market_code}, State=${res.data.state}, LegalStatus=${res.data.legal_approval_status} (Release ID: ${res.data.market_release_id})`,
    marketRelease: res.data,
  };
}

export async function createIntegrationCapabilityAction(
  _previous: CapabilityActionState,
  formData: FormData
): Promise<CapabilityActionState> {
  const idempotencyKey = String(formData.get("idempotency_key") ?? "").trim() || randomUUID();
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...EXPIRED, idempotencyKey };
  }

  const capabilityId = String(formData.get("capability_id") ?? "").trim();
  const providerCode = String(formData.get("provider_code") ?? "").trim().toUpperCase();
  const certified = formData.get("certified") === "true";
  const healthStatus = String(formData.get("health_status") ?? "HEALTHY").trim().toUpperCase();

  if (!capabilityId || !providerCode) {
    return {
      status: "error",
      action: "create_integration",
      message: "capability_id and provider_code are required.",
      idempotencyKey,
    };
  }

  const input: CreateIntegrationCapabilityInput = {
    provider_code: providerCode,
    certified,
    health_status: healthStatus,
  };

  const res = await createIntegrationCapability(capabilityId, input, identity, idempotencyKey);
  if (!res.ok) {
    return {
      status: "error",
      action: "create_integration",
      message: res.error.message || "Failed to attach integration capability.",
      error: res.error.message,
      idempotencyKey,
    };
  }

  // Refresh list
  const listRes = await listIntegrationCapabilities(capabilityId, identity);

  revalidatePath("/admin/capabilities");
  return {
    status: "success",
    action: "create_integration",
    idempotencyKey: randomUUID(),
    message: `Integration Connector Created: Provider=${res.data.provider_code}, Certified=${res.data.certified}, Health=${res.data.health_status} (ID: ${res.data.integration_capability_id})`,
    integration: res.data,
    integrations: listRes.ok ? listRes.data : [res.data],
  };
}

export async function updateIntegrationHealthAction(
  _previous: CapabilityActionState,
  formData: FormData
): Promise<CapabilityActionState> {
  const idempotencyKey = String(formData.get("idempotency_key") ?? "").trim() || randomUUID();
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...EXPIRED, idempotencyKey };
  }

  const integrationId = String(formData.get("integration_capability_id") ?? "").trim();
  const capabilityId = String(formData.get("capability_id") ?? "").trim();
  const healthStatus = String(formData.get("health_status") ?? "HEALTHY").trim().toUpperCase();

  if (!integrationId || !healthStatus) {
    return {
      status: "error",
      action: "update_health",
      message: "integration_capability_id and health_status are required.",
      idempotencyKey,
    };
  }

  const res = await updateIntegrationHealth(integrationId, healthStatus, identity, idempotencyKey);
  if (!res.ok) {
    return {
      status: "error",
      action: "update_health",
      message: res.error.message || "Failed to update integration health.",
      error: res.error.message,
      idempotencyKey,
    };
  }

  let integrationsList: any[] = [];
  if (capabilityId) {
    const listRes = await listIntegrationCapabilities(capabilityId, identity);
    if (listRes.ok) integrationsList = listRes.data;
  }

  const updatedIntegration = integrationsList.find((it) => it.integration_capability_id === integrationId);
  const providerDisplay = updatedIntegration?.provider_code ?? "Provider";

  revalidatePath("/admin/capabilities");
  return {
    status: "success",
    action: "update_health",
    idempotencyKey: randomUUID(),
    message: `Integration Health Updated: ${providerDisplay} (ID: ${integrationId.slice(0, 8)}...), New Health=${healthStatus}`,
    integration: updatedIntegration,
    integrations: integrationsList,
  };
}

export async function setReleaseStateAction(
  _previous: CapabilityActionState,
  formData: FormData
): Promise<CapabilityActionState> {
  const idempotencyKey = String(formData.get("idempotency_key") ?? "").trim() || randomUUID();
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...EXPIRED, idempotencyKey };
  }

  const capabilityId = String(formData.get("capability_id") ?? "").trim();
  const state = String(formData.get("state") ?? "GA").trim().toUpperCase();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!capabilityId || !state) {
    return {
      status: "error",
      action: "set_release_state",
      message: "capability_id and state are required.",
      idempotencyKey,
    };
  }

  const input: SetReleaseStateInput = {
    state,
    reason: reason || undefined,
  };

  const res = await setReleaseState(capabilityId, input, identity, idempotencyKey);
  if (!res.ok) {
    return {
      status: "error",
      action: "set_release_state",
      message: res.error.message || "Failed to set operational release state.",
      error: res.error.message,
      idempotencyKey,
    };
  }

  revalidatePath("/admin/capabilities");
  return {
    status: "success",
    action: "set_release_state",
    idempotencyKey: randomUUID(),
    message: `Operational Release State Set: State=${res.data.state} (Release ID: ${res.data.release_id}${res.data.reason ? `, Reason: '${res.data.reason}'` : ""})`,
    release: res.data,
  };
}

export async function createCapabilityClaimAction(
  _previous: CapabilityActionState,
  formData: FormData
): Promise<CapabilityActionState> {
  const idempotencyKey = String(formData.get("idempotency_key") ?? "").trim() || randomUUID();
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...EXPIRED, idempotencyKey };
  }

  const capabilityId = String(formData.get("capability_id") ?? "").trim();
  const claimText = String(formData.get("claim_text") ?? "").trim();
  const marketScope = String(formData.get("market_scope") ?? "").trim().toUpperCase();
  const wordingOwner = String(formData.get("wording_owner_principal_id") ?? identity.principalId).trim();
  const approvedBy = String(formData.get("approved_by_principal_id") ?? identity.principalId).trim();
  const expiryDate = String(formData.get("expiry_review_date") ?? "").trim();

  if (!capabilityId || !claimText || !wordingOwner || !approvedBy) {
    return {
      status: "error",
      action: "create_claim",
      message: "capability_id, claim_text, wording_owner_principal_id, and approved_by_principal_id are required.",
      idempotencyKey,
    };
  }

  const input: CreateCapabilityClaimInput = {
    claim_text: claimText,
    market_scope: marketScope || undefined,
    wording_owner_principal_id: wordingOwner,
    approved_by_principal_id: approvedBy,
    expiry_review_date: expiryDate || undefined,
  };

  const res = await createCapabilityClaim(capabilityId, input, identity, idempotencyKey);
  if (!res.ok) {
    return {
      status: "error",
      action: "create_claim",
      message: res.error.message || "Failed to record marketing claim.",
      error: res.error.message,
      idempotencyKey,
    };
  }

  const listRes = await listCapabilityClaims(capabilityId, identity);

  revalidatePath("/admin/capabilities");
  return {
    status: "success",
    action: "create_claim",
    idempotencyKey: randomUUID(),
    message: `Marketing Claim Recorded: ID=${res.data.claim_id}, Scope=${res.data.market_scope ?? "GLOBAL"}, ApprovedBy=${res.data.approved_by_principal_id}`,
    claim: res.data,
    claims: listRes.ok ? listRes.data : [res.data],
  };
}

export async function resolveCapabilityAction(
  _previous: CapabilityActionState,
  formData: FormData
): Promise<CapabilityActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const capabilityCode = String(formData.get("capability_code") ?? "").trim().toUpperCase();
  const market = String(formData.get("market_code") ?? "").trim().toUpperCase();

  if (!capabilityCode) {
    return {
      status: "error",
      action: "resolve_capability",
      message: "capability_code is required for resolution.",
    };
  }

  // capability-registry-svc's ResolveCapability has no per-provider scoping
  // (see domain/types.go's CapabilityResolution doc comment) — it evaluates
  // integration readiness across all providers attached to the capability.
  // There is no provider_code query param to send.
  const res = await resolveCapability(capabilityCode, { market: market || undefined }, identity);

  if (!res.ok) {
    return {
      status: "error",
      action: "resolve_capability",
      message: res.error.message || `Failed to resolve capability '${capabilityCode}'`,
      error: res.error.message,
    };
  }

  return {
    status: "success",
    action: "resolve_capability",
    message: `Resolved Capability '${res.data.capability_code}': Enabled=${res.data.enabled}, Reason=${res.data.reason_code}${res.data.detail ? ` (${res.data.detail})` : ""}`,
    resolution: res.data,
  };
}
