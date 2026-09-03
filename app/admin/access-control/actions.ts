"use server";

// Server Actions for access-control-svc (:8137).
//
// Server Actions are reachable by direct POST, not only through this UI, so the
// session is verified inside every action rather than relying on the /admin
// proxy matcher. That matters here because these actions author the roles the
// rest of the platform is authorized by.
//
// Two service properties shape everything below:
//
//  - Writes are authorized against the LEGAL ENTITY, not the platform scope. A
//    denial means the principal holds no ROLE_MANAGE grant on that entity.
//  - Creating a role or bundle provisions it into authorization-svc
//    synchronously, and a status change propagates there before it is recorded.
//    All three fail closed, so a 503 means nothing was written — and for a
//    retirement it means the role is still being enforced.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createPermissionBundle,
  createRoleDefinition,
  explainAccessControlError,
  parsePermittedActions,
  updateRoleDefinition,
  type RoleScopeType,
  type RoleStatus,
} from "@/lib/api/access-control";
import {
  assignRole,
  createSoDRule,
  explainAuthorizationError,
  revokeRoleAssignment,
} from "@/lib/api/authorization";
import {
  type AssignRoleState,
  type CreateBundleState,
  type CreateRoleState,
  type CreateSoDRuleState,
  type RevokeAssignmentState,
  type UpdateRoleState,
} from "./state";

async function requireIdentity(): Promise<SessionIdentity & { principalId: string }> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };
}

const EXPIRED = "Your session has expired — sign in again.";

/** Role and bundle codes are the strings every service's authz check names, so
 *  they are compared exactly. Normalising here rather than at the service means
 *  a lower-case entry becomes the code the author meant instead of a grant that
 *  matches nothing. */
function asCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

// ─── Define a role ───────────────────────────────────────────────────────────

export async function createRoleAction(
  _prev: CreateRoleState,
  formData: FormData,
): Promise<CreateRoleState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const legalEntityId =
    String(formData.get("legal_entity_id") ?? "").trim() || identity.legalEntityId;
  const roleCode = asCode(String(formData.get("role_code") ?? ""));
  const roleName = String(formData.get("role_name") ?? "").trim();
  const roleScopeType = String(formData.get("role_scope_type") ?? "").trim() as RoleScopeType;
  const correlationId = String(formData.get("correlation_id") ?? "").trim();

  if (!legalEntityId) {
    return {
      status: "error",
      message:
        "A legal entity is required — role definitions are authorized per entity, so there is no entity-less way to create one.",
    };
  }
  if (!roleCode) return { status: "error", message: "A role code is required." };
  if (!roleName) return { status: "error", message: "A role name is required." };
  if (roleScopeType !== "LEGAL_ENTITY" && roleScopeType !== "TENANT") {
    return { status: "error", message: "Scope must be LEGAL_ENTITY or TENANT." };
  }
  if (!correlationId) {
    return {
      status: "error",
      message: "A correlation id is required; it is the idempotency key for this definition.",
    };
  }

  const result = await createRoleDefinition({
    identity: { ...identity, principalId: identity.principalId, tenantId: identity.tenantId },
    legalEntityId,
    roleCode,
    roleName,
    roleScopeType,
    correlationId,
  });

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 401) return { status: "unauthorized", message: explainAccessControlError(message) };
    if (status === 403) return { status: "refused", message: explainAccessControlError(message) };
    return { status: "error", message: explainAccessControlError(message) };
  }

  refresh();

  // 201 is a new definition; 200 is a replay of the one this correlation_id
  // already created. Both provisioned into authorization-svc — the replay
  // because the original did.
  if (result.status === 200) {
    return {
      status: "replayed",
      role: result.data,
      message: `This correlation id already created ${result.data.role_code}. Nothing was written again; the original definition is shown.`,
    };
  }
  return {
    status: "created",
    role: result.data,
    message: `${result.data.role_code} defined and provisioned into authorization-svc. It grants nothing until a permission bundle is attached.`,
  };
}

// ─── Retire, reactivate, or rename ───────────────────────────────────────────

export async function updateRoleAction(
  _prev: UpdateRoleState,
  formData: FormData,
): Promise<UpdateRoleState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const roleDefinitionId = String(formData.get("role_definition_id") ?? "").trim();
  const legalEntityId =
    String(formData.get("legal_entity_id") ?? "").trim() || identity.legalEntityId;
  const roleName = String(formData.get("role_name") ?? "").trim();
  const rawStatus = String(formData.get("status") ?? "").trim();

  if (!roleDefinitionId) return { status: "error", message: "A role definition id is required." };
  if (!legalEntityId) {
    return { status: "error", message: "A legal entity is required — this write is authorized against it." };
  }
  if (rawStatus && rawStatus !== "ACTIVE" && rawStatus !== "RETIRED") {
    return { status: "error", message: "Status must be ACTIVE or RETIRED." };
  }
  if (!roleName && !rawStatus) {
    return { status: "error", message: "Nothing to change — supply a new name, a new status, or both." };
  }

  const status = (rawStatus || undefined) as RoleStatus | undefined;

  const result = await updateRoleDefinition({
    identity: { ...identity, principalId: identity.principalId, tenantId: identity.tenantId },
    legalEntityId,
    roleDefinitionId,
    roleName: roleName || undefined,
    status,
  });

  if (!result.ok) {
    const { status: code, message } = result.error;
    if (code === 401) return { status: "unauthorized", message: explainAccessControlError(message) };
    if (code === 403) return { status: "refused", message: explainAccessControlError(message) };

    // A 503 on a STATUS change is not an ordinary outage. The service
    // propagates to authorization-svc before recording, and fails closed — so
    // the role is unchanged and still enforced exactly as before. A reader who
    // took this for a generic error might believe the role had been switched
    // off. The distinction only exists when a status was actually requested; a
    // failed rename changes nothing anyone is relying on.
    if (code === 503 && status) {
      return { status: "notEnforced", message: explainAccessControlError(message) };
    }
    return { status: "error", message: explainAccessControlError(message) };
  }

  refresh();

  const role = result.data;
  const message =
    status === "RETIRED"
      ? `${role.role_code} is retired. authorization-svc has cleared its active flag, so it now grants nothing to anyone holding it — the assignments remain, so reactivating restores exactly the access this suspended.`
      : status === "ACTIVE"
        ? `${role.role_code} is active again. The assignments were never removed, so everyone who held it has their access back.`
        : `${role.role_code} renamed. Nothing about what it grants has changed.`;

  return { status: "updated", role, message };
}

// ─── Attach a permission bundle ──────────────────────────────────────────────

export async function createBundleAction(
  _prev: CreateBundleState,
  formData: FormData,
): Promise<CreateBundleState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const roleDefinitionId = String(formData.get("role_definition_id") ?? "").trim();
  const legalEntityId =
    String(formData.get("legal_entity_id") ?? "").trim() || identity.legalEntityId;
  const bundleCode = asCode(String(formData.get("bundle_code") ?? ""));
  const permittedActions = parsePermittedActions(String(formData.get("permitted_actions") ?? ""));
  const correlationId = String(formData.get("correlation_id") ?? "").trim();

  if (!roleDefinitionId) return { status: "error", message: "Choose a role to attach the bundle to." };
  if (!legalEntityId) {
    return { status: "error", message: "A legal entity is required — this write is authorized against it." };
  }
  if (!bundleCode) return { status: "error", message: "A bundle code is required." };
  if (permittedActions.length === 0) {
    return {
      status: "error",
      message:
        "List at least one action. A bundle with no actions is accepted by the service and grants nothing, which is the quietest way for a role to do less than intended.",
    };
  }
  if (!correlationId) {
    return { status: "error", message: "A correlation id is required; it is the idempotency key for this bundle." };
  }

  const result = await createPermissionBundle({
    identity: { ...identity, principalId: identity.principalId, tenantId: identity.tenantId },
    legalEntityId,
    roleDefinitionId,
    bundleCode,
    permittedActions,
    correlationId,
  });

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 401) return { status: "unauthorized", message: explainAccessControlError(message) };
    if (status === 403) return { status: "refused", message: explainAccessControlError(message) };
    return { status: "error", message: explainAccessControlError(message) };
  }

  refresh();

  if (result.status === 200) {
    return {
      status: "replayed",
      bundle: result.data,
      message: `This correlation id already created ${result.data.bundle_code}. Nothing was written again.`,
    };
  }
  return {
    status: "created",
    bundle: result.data,
    message: `${result.data.bundle_code} attached and provisioned into authorization-svc — ${result.data.permitted_actions.length} action(s) now granted by this role.`,
  };
}

// ═══ authorization-svc actions ═══════════════════════════════════════════════
//
// Everything above talks to access-control-svc, which owns role DEFINITIONS.
// Everything below talks to authorization-svc (:8089), which owns the live
// plane: who holds what, and which combinations are forbidden.
//
// The split is not cosmetic. A role defined above grants nothing until
// assignRoleAction below succeeds — that was the functional gap in this
// console, and it is why the success message here talks about access rather
// than records.

// ─── Assign a role to a principal ────────────────────────────────────────────

export async function assignRoleAction(
  _prev: AssignRoleState,
  formData: FormData,
): Promise<AssignRoleState> {
  let identity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "unauthorized", message: EXPIRED };
  }

  const principalId = String(formData.get("principal_id") ?? "").trim();
  const roleId = String(formData.get("role_id") ?? "").trim();
  const legalEntityId = String(formData.get("legal_entity_id") ?? "").trim();
  const effectiveFromRaw = String(formData.get("effective_from") ?? "").trim();
  const correlationId = String(formData.get("correlation_id") ?? "").trim();

  if (!principalId) {
    return { status: "error", message: "A principal id is required — this is who receives the access." };
  }
  if (!roleId) return { status: "error", message: "Choose the role to assign." };

  // authorization-svc requires effective_from; there is no implicit "now".
  // An empty field means the operator meant now, so state that explicitly
  // rather than sending nothing and getting a missing_field back.
  let effectiveFrom: string;
  if (effectiveFromRaw) {
    const parsed = new Date(effectiveFromRaw);
    if (Number.isNaN(parsed.getTime())) {
      return { status: "error", message: "That effective-from date could not be read. Use the date picker." };
    }
    effectiveFrom = parsed.toISOString();
  } else {
    effectiveFrom = new Date().toISOString();
  }

  const result = await assignRole({
    identity: { ...identity, principalId: identity.principalId, tenantId: identity.tenantId },
    principalId,
    roleId,
    legalEntityId: legalEntityId || undefined,
    effectiveFrom,
    correlationId,
  });

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 401) return { status: "unauthorized", message: explainAuthorizationError(message) };
    if (status === 403) return { status: "refused", message: explainAuthorizationError(message) };
    // 404 is role_not_found, which the handler also returns when the role
    // exists but belongs to another tenant — deliberately indistinguishable at
    // the API so a probe cannot confirm a foreign role_id. The operator still
    // needs both possibilities spelled out, because "not found" alone sends
    // them looking for a typo that may not exist.
    if (status === 404) {
      return {
        status: "scopeMismatch",
        message:
          "That role was not found in your tenant. Either it does not exist, or it belongs to another tenant — the service answers both the same way on purpose. Check the role catalogue below.",
      };
    }
    return { status: "error", message: explainAuthorizationError(message) };
  }

  refresh();

  const scope = result.data.legal_entity_id
    ? `legal entity ${result.data.legal_entity_id}`
    : "every legal entity in this tenant";
  return {
    status: "granted",
    assignment: result.data,
    message: `${principalId} now holds this role across ${scope}, effective ${new Date(result.data.effective_from).toUTCString()}. This grant is live — the next authorization check for its actions resolves against it.`,
  };
}

// ─── Revoke an assignment ────────────────────────────────────────────────────

export async function revokeAssignmentAction(
  _prev: RevokeAssignmentState,
  formData: FormData,
): Promise<RevokeAssignmentState> {
  let identity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "unauthorized", message: EXPIRED };
  }

  const assignmentId = String(formData.get("assignment_id") ?? "").trim();
  const correlationId = String(formData.get("correlation_id") ?? "").trim();
  if (!assignmentId) return { status: "error", message: "No assignment selected." };

  const result = await revokeRoleAssignment({
    identity: { ...identity, principalId: identity.principalId, tenantId: identity.tenantId },
    assignmentId,
    correlationId,
  });

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 401) return { status: "unauthorized", message: explainAuthorizationError(message) };
    if (status === 403) return { status: "refused", message: explainAuthorizationError(message) };
    // The store matches only assignments still in force, so a 404 means it is
    // already revoked (or was never this tenant's). The intent is satisfied
    // either way — reporting a failure would invite a pointless retry.
    if (status === 404) {
      return {
        status: "alreadyRevoked",
        message: "That assignment was already revoked, so nothing changed. The principal does not hold it.",
      };
    }
    return { status: "error", message: explainAuthorizationError(message) };
  }

  refresh();
  const endedAt = new Date(result.data.effective_to ?? Date.now()).toUTCString();
  return {
    status: "revoked",
    assignment: result.data,
    message: `Revoked. ${result.data.principal_id} no longer holds this role — the next authorization check resolves without it. The row is kept, ended at ${endedAt}, so the history stays auditable.`,
  };
}

// ─── Create a Separation-of-Duties rule ──────────────────────────────────────

export async function createSoDRuleAction(
  _prev: CreateSoDRuleState,
  formData: FormData,
): Promise<CreateSoDRuleState> {
  let identity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "unauthorized", message: EXPIRED };
  }

  const domainCode = asCode(String(formData.get("domain_code") ?? ""));
  const actionA = asCode(String(formData.get("action_a") ?? ""));
  const actionB = asCode(String(formData.get("action_b") ?? ""));
  const conflictType = asCode(String(formData.get("conflict_type") ?? "") || "HARD");
  const correlationId = String(formData.get("correlation_id") ?? "").trim();

  if (!domainCode) return { status: "error", message: "A domain code is required, e.g. PAYMENTS." };
  if (!actionA || !actionB) return { status: "error", message: "Both conflicting actions are required." };
  if (actionA === actionB) {
    // The evaluator compares the candidate action against the OTHER actions a
    // principal holds, so a self-pair can never match. It would sit in the
    // register looking like a control while enforcing nothing.
    return {
      status: "error",
      message:
        "The two actions must differ. A rule pairing an action with itself can never trigger, so it would be a control in name only.",
    };
  }

  const result = await createSoDRule({
    identity: { ...identity, principalId: identity.principalId, tenantId: identity.tenantId },
    domainCode,
    actionA,
    actionB,
    conflictType,
    correlationId,
  });

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 401) return { status: "unauthorized", message: explainAuthorizationError(message) };
    if (status === 403) return { status: "refused", message: explainAuthorizationError(message) };
    return { status: "error", message: explainAuthorizationError(message) };
  }

  refresh();
  return {
    status: "created",
    rule: result.data,
    message: `${actionA} and ${actionB} are now in conflict for this tenant. This is live and retroactive in effect: any principal who already holds both is denied BOTH actions from the next check onward, with basis sod:conflict_with. Nothing has to be re-run for it to bite.`,
  };
}
