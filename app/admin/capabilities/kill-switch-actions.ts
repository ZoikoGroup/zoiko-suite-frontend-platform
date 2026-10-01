"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  engageKillSwitch,
  disengageKillSwitch,
  resolveKillSwitch,
  listKillSwitchStates,
  listKillSwitchHistory,
  type KillSwitchEvent,
  type KillSwitchState,
  type KillSwitchResolution,
} from "@/lib/api/kill-switch";

export type KillSwitchActionState = {
  status: "idle" | "success" | "error";
  action?: "engage" | "disengage" | "resolve" | "history" | "list";
  message?: string;
  event?: KillSwitchEvent;
  states?: KillSwitchState[];
  resolution?: KillSwitchResolution;
  history?: KillSwitchEvent[];
  error?: string;
};

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const decoded = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!decoded) throw new Error("unauthenticated");
  return decoded;
}

const EXPIRED: KillSwitchActionState = {
  status: "error",
  message: "Session expired — please log in again.",
};

export async function engageKillSwitchAction(
  _previous: KillSwitchActionState,
  formData: FormData
): Promise<KillSwitchActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const plane = String(formData.get("plane") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  const providerCode = String(formData.get("provider_code") ?? "").trim();
  const tenantScoped = formData.get("tenant_scoped") === "true";
  const reason = String(formData.get("reason") ?? "").trim();
  const reconciliationProcedureRef = String(formData.get("reconciliation_procedure_ref") ?? "").trim();
  const approvedByPrincipalId = String(formData.get("approved_by_principal_id") ?? identity.principalId).trim();

  if (!reason) {
    return { status: "error", action: "engage", message: "Audit reason is required to engage a kill switch." };
  }
  if (!reconciliationProcedureRef) {
    return { status: "error", action: "engage", message: "Reconciliation procedure runbook reference is required." };
  }
  if (!approvedByPrincipalId) {
    return { status: "error", action: "engage", message: "Approved-by principal ID is required." };
  }

  const res = await engageKillSwitch(
    {
      plane: plane || undefined,
      domain: domain || undefined,
      provider_code: providerCode || undefined,
      tenant_id: tenantScoped ? identity.tenantId : undefined,
      reason,
      reconciliation_procedure_ref: reconciliationProcedureRef,
      approved_by_principal_id: approvedByPrincipalId,
    },
    identity
  );

  if (!res.ok) {
    return {
      status: "error",
      action: "engage",
      message: res.error.message || "Failed to engage kill switch.",
      error: res.error.message,
    };
  }

  revalidatePath("/admin/capabilities");
  return {
    status: "success",
    action: "engage",
    message: `Kill switch ENGAGED successfully on kill-switch-registry-svc (:8147)! Event ID: ${res.data.kill_switch_event_id}`,
    event: res.data,
  };
}

export async function disengageKillSwitchAction(
  _previous: KillSwitchActionState,
  formData: FormData
): Promise<KillSwitchActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const plane = String(formData.get("plane") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  const providerCode = String(formData.get("provider_code") ?? "").trim();
  const tenantScoped = formData.get("tenant_scoped") === "true";
  const reason = String(formData.get("reason") ?? "").trim();
  const approvedByPrincipalId = String(formData.get("approved_by_principal_id") ?? identity.principalId).trim();

  if (!reason) {
    return { status: "error", action: "disengage", message: "Disengagement rationale is required." };
  }
  if (!approvedByPrincipalId) {
    return { status: "error", action: "disengage", message: "Approved-by principal ID is required." };
  }

  const res = await disengageKillSwitch(
    {
      plane: plane || undefined,
      domain: domain || undefined,
      provider_code: providerCode || undefined,
      tenant_id: tenantScoped ? identity.tenantId : undefined,
      reason,
      approved_by_principal_id: approvedByPrincipalId,
    },
    identity
  );

  if (!res.ok) {
    return {
      status: "error",
      action: "disengage",
      message: res.error.message || "Failed to disengage kill switch.",
      error: res.error.message,
    };
  }

  revalidatePath("/admin/capabilities");
  return {
    status: "success",
    action: "disengage",
    message: `Kill switch DISENGAGED successfully on kill-switch-registry-svc (:8147)! Event ID: ${res.data.kill_switch_event_id}`,
    event: res.data,
  };
}

export async function resolveKillSwitchAction(
  _previous: KillSwitchActionState,
  formData: FormData
): Promise<KillSwitchActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const plane = String(formData.get("plane") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  const providerCode = String(formData.get("provider_code") ?? "").trim();
  const tenantScoped = formData.get("tenant_scoped") === "true";

  const res = await resolveKillSwitch(
    {
      plane: plane || undefined,
      domain: domain || undefined,
      provider_code: providerCode || undefined,
      tenant_id: tenantScoped ? identity.tenantId : undefined,
    },
    identity
  );

  if (!res.ok) {
    return {
      status: "error",
      action: "resolve",
      message: res.error.message || "Failed to resolve kill switch state.",
      error: res.error.message,
    };
  }

  const isBlocked = res.data.blocked;
  const ev = res.data.matched_event || res.data.matching_event;
  return {
    status: "success",
    action: "resolve",
    message: isBlocked
      ? `BLOCKED: Kill switch is ACTIVE for this scope! Action=${ev?.action ?? "ENGAGE"}, Reason='${ev?.reason ?? "Incident active"}'`
      : "CLEAR: No active kill switch blocks this scope. Operations permitted.",
    resolution: res.data,
  };
}

export async function listKillSwitchStatesAction(): Promise<KillSwitchState[]> {
  try {
    const identity = await requireIdentity();
    const res = await listKillSwitchStates(identity);
    return res.ok ? res.data : [];
  } catch {
    return [];
  }
}

export async function listKillSwitchHistoryAction(
  _previous: KillSwitchActionState,
  formData: FormData
): Promise<KillSwitchActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const plane = String(formData.get("plane") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  const providerCode = String(formData.get("provider_code") ?? "").trim();
  const tenantScoped = formData.get("tenant_scoped") === "true";

  const res = await listKillSwitchHistory(
    {
      plane: plane || undefined,
      domain: domain || undefined,
      provider_code: providerCode || undefined,
      tenant_id: tenantScoped ? identity.tenantId : undefined,
    },
    identity
  );

  if (!res.ok) {
    return {
      status: "error",
      action: "history",
      message: res.error.message || "Failed to fetch kill switch history.",
      error: res.error.message,
    };
  }

  return {
    status: "success",
    action: "history",
    message: `Retrieved ${res.data.length} transition history events from kill-switch-registry-svc (:8147).`,
    history: res.data,
  };
}
