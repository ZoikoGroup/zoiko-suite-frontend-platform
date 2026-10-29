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
  detachPermissionBundle,
  explainAccessControlError,
  parsePermittedActions,
  updatePermissionBundle,
  updateRoleDefinition,
  type RoleScopeType,
  type RoleStatus,
} from "@/lib/api/access-control";
import {
  type CreateBundleState,
  type CreateRoleState,
  type DetachBundleState,
  type UpdateBundleState,
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
    // access-control-svc forwards this envelope to authorization-svc when it
    // provisions in the caller's name (14 Oct, A-01).
    envelopeJwt: session.envelopeJwt,
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

// ─── Edit or detach a permission bundle ─────────────────────────────────────
//
// The two operations that were missing from this console: once a bundle
// existed, nothing here could change what it permits (re-attaching under the
// same code is how authorization-svc edits, but nothing surfaced that) and
// nothing could withdraw one set of a role's permissions without retiring the
// whole role. Both propagate to authorization-svc before being recorded and
// fail closed, for the same reason as every other write on this service: the
// register must never claim a state the platform is not enforcing.

/**
 * Edit ONE bundle's permitted actions.
 *
 * The bundle_code is deliberately read-only here. authorization-svc has no
 * rename, so a rename in this console could only be a label on a differently
 * enforced reality; detaching and re-attaching under a new code is the
 * supported rename, and that means using the detach form below and the attach
 * form above.
 */
export async function updateBundleAction(
  _prev: UpdateBundleState,
  formData: FormData,
): Promise<UpdateBundleState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const roleDefinitionId = String(formData.get("role_definition_id") ?? "").trim();
  const bundleId = String(formData.get("bundle_id") ?? "").trim();
  const legalEntityId =
    String(formData.get("legal_entity_id") ?? "").trim() || identity.legalEntityId;
  const permittedActions = parsePermittedActions(String(formData.get("permitted_actions") ?? ""));

  if (!roleDefinitionId || !bundleId) {
    return {
      status: "error",
      message: "It is not clear which bundle this applies to. Reload the page and try again.",
    };
  }
  if (!legalEntityId) {
    return { status: "error", message: "A legal entity is required — this write is authorized against it." };
  }
  if (permittedActions.length === 0) {
    return {
      status: "error",
      message:
        "A bundle must name at least one action. To withdraw every action from the role's principals, detach the bundle instead — an empty bundle would look like a grant while permitting nothing.",
    };
  }

  const result = await updatePermissionBundle({
    identity: { ...identity, principalId: identity.principalId, tenantId: identity.tenantId },
    legalEntityId,
    roleDefinitionId,
    bundleId,
    permittedActions,
    correlationId: crypto.randomUUID(),
  });

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 401) return { status: "unauthorized", message: explainAccessControlError(message) };
    if (status === 403) return { status: "refused", message: explainAccessControlError(message) };
    // 503 is the fail-closed propagation missing. Not an ordinary outage: the
    // edit was NOT made and the bundle is still enforcing its previous actions.
    if (status === 503) {
      return {
        status: "notEnforced",
        message:
          explainAccessControlError(message) +
          " The bundle is unchanged, and is still enforcing the actions it permitted before.",
      };
    }
    return { status: "error", message: explainAccessControlError(message) };
  }

  refresh();

  const bundle = result.data;
  const count = bundle.permitted_actions.length;
  return {
    status: "updated",
    bundle,
    message: `"${bundle.bundle_code}" now permits ${count} action${count === 1 ? "" : "s"}: ${bundle.permitted_actions.join(", ")}. This is enforced immediately — authorization-svc re-provisioned the set against the role before this was recorded.`,
  };
}

/**
 * Detach one bundle from its role — a withdrawal, not a deletion.
 *
 * The service answers both a fresh detach and a replay of an already-detached
 * bundle with the same withdrawn record, so the console cannot tell the two
 * apart and the state comments say why it does not pretend to. Whatever the
 * read returned, intent is satisfied: the bundle grants nothing to this role's
 * principals either way.
 */
export async function detachBundleAction(
  _prev: DetachBundleState,
  formData: FormData,
): Promise<DetachBundleState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "unauthorized", message: EXPIRED };
  }

  const roleDefinitionId = String(formData.get("role_definition_id") ?? "").trim();
  const bundleId = String(formData.get("bundle_id") ?? "").trim();
  const legalEntityId =
    String(formData.get("legal_entity_id") ?? "").trim() || identity.legalEntityId;

  if (!roleDefinitionId || !bundleId) {
    return {
      status: "error",
      message: "It is not clear which bundle this applies to. Reload the page and try again.",
    };
  }
  if (!legalEntityId) {
    return { status: "error", message: "A legal entity is required — this write is authorized against it." };
  }

  const result = await detachPermissionBundle({
    identity: { ...identity, principalId: identity.principalId, tenantId: identity.tenantId },
    legalEntityId,
    roleDefinitionId,
    bundleId,
    correlationId: crypto.randomUUID(),
  });

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 401) return { status: "unauthorized", message: explainAccessControlError(message) };
    if (status === 403) return { status: "refused", message: explainAccessControlError(message) };
    // 503 is the fail-closed retirement missing. The bundle is NOT detached —
    // it is still active, in both registers, granting its actions to this
    // role's principals. Reported as its own state for the same reason a
    // failed retirement is at the role level.
    if (status === 503) {
      return {
        status: "notEnforced",
        message:
          explainAccessControlError(message) +
          " The bundle is unchanged: it is still active, and still granting its actions to this role's principals.",
      };
    }
    return { status: "error", message: explainAccessControlError(message) };
  }

  refresh();

  const bundle = result.data;
  return {
    status: "detached",
    bundle,
    // Works for both a fresh detach and a replay: the read came back withdrawn
    // either way, so "required" is the wrong word — the intent is met.
    message: `"${bundle.bundle_code}" is detached: it grants nothing to this role's principals, and it is retired in authorization-svc so the withdrawal is enforced. If it was already detached, this is a confirmation of state that was already true — the bundle keeps its contents, so re-attaching later restores the same actions.`,
  };
}

// Grants, separation of duties, conditions, delegation and the decision log
// belong to authorization-svc; their actions are in app/admin/authorization/actions.ts.
