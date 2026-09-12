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
  ABAC_OPERATORS,
  assignRole,
  authorize,
  createABACRule,
  createDelegatedAuthority,
  createSoDRule,
  describeABACRule,
  describeDecisionOutcome,
  describeDelegationScope,
  explainAuthorizationError,
  explainDecisionBasis,
  getAccessDecision,
  PLATFORM_SCOPE_SENTINEL,
  revokeDelegatedAuthority,
  revokeRoleAssignment,
  setABACRuleActive,
  setPermissionBundleActive,
  setRoleActive,
  setSoDRuleActive,
  type AccessDecision,
} from "@/lib/api/authorization";
import type { LookupState } from "@/components/admin/shared/lookup";
import {
  type AbacRuleEnforcementState,
  type AssignRoleState,
  type CreateAbacRuleState,
  type CreateBundleState,
  type CreateRoleState,
  type CreateSoDRuleState,
  type DelegateAuthorityState,
  type EvaluateAccessState,
  type RevokeAssignmentState,
  type BundleEnforcementState,
  type DetachBundleState,
  type RoleEnforcementState,
  type SoDRuleEnforcementState,
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

// ─── authorization-svc: the evaluation plane ─────────────────────────────────
//
// The questions the service exists to answer, and the two admin surfaces it
// shipped without a console.
//
// One property shapes all of these and is stated in the UI rather than hidden:
// asking /v1/authorize is NOT a dry run. Every evaluation is written to the
// decision log before the response returns — that is the critical constraint
// the service is built around, not a side effect — so an operator testing a
// grant from this console leaves the same artifact a service call would.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Action codes are the strings every service's authz check names, compared
 *  exactly. Normalised here for the same reason role codes are: a lower-case
 *  entry becomes the code the author meant instead of one that matches
 *  nothing. */
function asActionCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

/**
 * Ask the authorization plane whether a principal may perform an action.
 *
 * The three outcomes are kept apart deliberately, and this is the whole point
 * of the action:
 *
 *  - 200 GRANTED / 200 DENIED — the service evaluated and answered. A denial
 *    is not a failure; it is the answer, it carries a basis explaining itself,
 *    and it was recorded.
 *  - 503 — the service could NOT evaluate. Nothing was recorded, and nobody
 *    has been told anything either way. Reporting this as a denial would be a
 *    lie in the most consequential direction available on this page.
 */
export async function evaluateAccessAction(
  _prev: EvaluateAccessState,
  formData: FormData,
): Promise<EvaluateAccessState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "unauthorized", message: EXPIRED };
  }

  const principalId = String(formData.get("subject_principal_id") ?? "").trim();
  const legalEntityRaw = String(formData.get("evaluation_legal_entity_id") ?? "").trim();
  const actionType = asActionCode(String(formData.get("evaluation_action_type") ?? ""));
  const resourceOwner = String(formData.get("resource_owner_principal_id") ?? "").trim();
  const attributesRaw = String(formData.get("evaluation_attributes") ?? "").trim();

  if (!principalId) {
    return { status: "refused", message: "Say who the question is about — the person whose access is being checked." };
  }
  if (!isUuid(principalId)) {
    return {
      status: "refused",
      message:
        "The person has to be named by their reference, and this is not one. Copy it from the grants register — references are 36 characters of letters, numbers and dashes.",
    };
  }
  if (!actionType) {
    return {
      status: "refused",
      message:
        "Name the action being asked about. It has to match the action code the calling service uses exactly — nothing normalises it at the point of the check, so a near-miss reads as no grant.",
    };
  }
  if (!legalEntityRaw) {
    return {
      status: "refused",
      message:
        "Name the company this applies to, or choose platform-wide. An omitted company is refused rather than quietly treated as platform-wide, because an omission is far more often a mistake than an intent.",
    };
  }
  if (legalEntityRaw !== PLATFORM_SCOPE_SENTINEL && !isUuid(legalEntityRaw)) {
    return {
      status: "refused",
      message:
        "The company has to be named by its reference, and this is not one. A malformed reference dies inside the database driver and comes back looking like an outage, so it is rejected here first.",
    };
  }
  if (resourceOwner && !isUuid(resourceOwner)) {
    return {
      status: "refused",
      message: "The person who prepared the item has to be named by their reference, and this is not one. Leave it blank to skip that check.",
    };
  }

  // Attributes are entered as JSON because they are arbitrary — the conditions
  // in force decide which keys matter, and this console cannot know them. A
  // malformed entry is rejected here with wording about the box the operator
  // typed in, rather than reaching the service and coming back as invalid_json.
  // The service decodes this into map[string]string, so every value has to
  // reach it as a string. Sending a JSON number answers 400 invalid_json —
  // found by driving the running service, not by reading the struct. Scalars
  // are converted here rather than demanding the operator quote numbers,
  // because "amount": 5000 is what anybody would type and it is unambiguous;
  // a nested object or list is not convertible and is refused instead of being
  // silently stringified into something no comparison could match.
  let attributes: Record<string, string> | undefined;
  if (attributesRaw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(attributesRaw);
    } catch {
      return {
        status: "refused",
        message:
          'The request details could not be read. They go in as named values — {"amount": 5000, "channel": "web"} — with double quotes around every name. Leave the box empty if there are none.',
      };
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        status: "refused",
        message:
          'The request details have to be a set of named values, like {"amount": 5000}. A bare list or a single value gives the conditions nothing to look up by name.',
      };
    }

    const converted: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") {
        converted[key] = value;
      } else if (typeof value === "number" || typeof value === "boolean") {
        converted[key] = String(value);
      } else if (value === null) {
        return {
          status: "refused",
          message: `“${key}” has no value. Give it one, or leave it out — an attribute a condition needs and cannot find counts as not met, which is a refusal either way.`,
        };
      } else {
        return {
          status: "refused",
          message: `“${key}” is a list or a nested set of values, and a condition can only compare a single value. Send the one field the condition actually looks at.`,
        };
      }
    }
    attributes = converted;
  }

  const result = await authorize({
    identity,
    principalId,
    legalEntityId: legalEntityRaw,
    actionType,
    ...(resourceOwner ? { resourceOwnerPrincipalId: resourceOwner } : {}),
    ...(attributes ? { attributes } : {}),
  });

  if (!result.ok) {
    // 503 is "could not evaluate", and it is the one failure on this page that
    // must never be reported as an answer. Everything else is a malformed or
    // refused request.
    if (result.error.status === 503 || result.error.kind === "unreachable" || result.error.kind === "timeout") {
      return {
        status: "unevaluated",
        message: explainAuthorizationError(result.error.message, { status: result.error.status }),
      };
    }
    if (result.error.status === 403) {
      return {
        status: "unauthorized",
        message: explainAuthorizationError(result.error.message, { status: result.error.status }),
      };
    }
    return {
      status: "refused",
      message: explainAuthorizationError(result.error.message, { status: result.error.status }),
    };
  }

  const decision = result.data;
  const outcome = describeDecisionOutcome(decision.decision_outcome);
  const basis = explainDecisionBasis(decision.decision_basis);

  // An unrecognised outcome is reported as unevaluated rather than as an
  // answer. describeDecisionOutcome already refuses to call it granted; this
  // stops the console presenting it as a denial either, since it is neither.
  if (outcome.unmapped) {
    return {
      status: "unevaluated",
      message:
        `The service answered with an outcome this console does not recognise ("${outcome.raw}"), ` +
        "so it cannot say what was decided. A decision was recorded — quote " +
        `${decision.access_decision_id} to whoever operates the service.`,
    };
  }

  return {
    status: outcome.granted ? "granted" : "denied",
    decision,
    message: outcome.granted
      ? `Yes — ${basis.label.toLowerCase()}. This answer has been recorded as a decision in its own right.`
      : `No — ${basis.label.toLowerCase()}. This is an answer, not a failure: the service evaluated the request and recorded the refusal.`,
  };
}

/** Read one recorded decision back by reference. */
export async function lookupAccessDecisionAction(
  _prev: LookupState<AccessDecision>,
  formData: FormData,
): Promise<LookupState<AccessDecision>> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const decisionId = String(formData.get("access_decision_id") ?? "").trim();
  if (!decisionId) return { status: "error", message: "Enter a decision reference." };
  if (!isUuid(decisionId)) {
    return {
      status: "error",
      message:
        "A decision reference is 36 characters of letters, numbers and dashes. Copy it from the answer the check gave you, or from the service that was refused.",
    };
  }

  const result = await getAccessDecision(decisionId, identity);

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "missing",
        // Worth stating plainly: the service answers 404 for another
        // organisation's decision as well as for one that does not exist, on
        // purpose, so that a probe cannot confirm a reference exists.
        message:
          "No decision with that reference exists for your organisation. A decision belonging to another organisation reads exactly the same way — that is deliberate — so this does not tell you it exists elsewhere.",
      };
    }
    return {
      status: "error",
      message: explainAuthorizationError(result.error.message, { status: result.error.status }),
    };
  }

  return { status: "found", record: result.data, message: "" };
}

/** Retire or reactivate a role in the evaluation plane. */
export async function setRoleEnforcementAction(
  _prev: RoleEnforcementState,
  formData: FormData,
): Promise<RoleEnforcementState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "unauthorized", message: EXPIRED };
  }

  const roleId = String(formData.get("role_id") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "true";

  if (!roleId || !isUuid(roleId)) {
    return { status: "refused", message: "It is not clear which role this applies to. Reload the page and try again." };
  }

  const result = await setRoleActive({ identity, roleId, active });

  if (!result.ok) {
    if (result.error.status === 403) {
      return {
        status: "unauthorized",
        message: explainAuthorizationError(result.error.message, { status: result.error.status }),
      };
    }
    return {
      status: "refused",
      message: explainAuthorizationError(result.error.message, { status: result.error.status }),
    };
  }

  refresh();

  const role = result.data;
  return active
    ? {
        status: "reactivated",
        role,
        message: `${role.role_code} grants its actions again — to everybody who still holds it. Nobody had to be re-granted anything: retiring suspended the role, it did not remove the grants, so this restores exactly the access that was suspended.`,
      }
    : {
        status: "retired",
        role,
        message: `${role.role_code} now grants nothing, to anybody. The grants themselves are untouched and still listed, which is why this is reversible — but until it is reactivated, everybody who held this role has lost the actions it permitted.`,
      };
}

/**
 * Withdraw or restore ONE of a role's permission sets.
 *
 * Distinct from setRoleEnforcementAction, and the messages say how. Retiring
 * the ROLE suspends everything it grants; this withdraws one set's actions and
 * leaves the role's others in force — which is the only way to take back part
 * of a role's permissions, since re-authoring the set with a shorter list
 * overwrites it and destroys the record of what was removed.
 *
 * The flag is read by both evaluation layers, so the message has to name both
 * populations: people holding the role directly, and people who were lent it.
 */
export async function setBundleEnforcementAction(
  _prev: BundleEnforcementState,
  formData: FormData,
): Promise<BundleEnforcementState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "unauthorized", message: EXPIRED };
  }

  const permissionBundleId = String(formData.get("permission_bundle_id") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "true";

  if (!permissionBundleId || !isUuid(permissionBundleId)) {
    return {
      status: "refused",
      message: "It is not clear which permission set this applies to. Reload the page and try again.",
    };
  }

  const result = await setPermissionBundleActive({ identity, permissionBundleId, active });

  if (!result.ok) {
    if (result.error.status === 403) {
      return {
        status: "unauthorized",
        message: explainAuthorizationError(result.error.message, { status: result.error.status }),
      };
    }
    return {
      status: "refused",
      message: explainAuthorizationError(result.error.message, { status: result.error.status }),
    };
  }

  refresh();

  const bundle = result.data;
  const count = bundle.permitted_actions.length;
  const noun = count === 1 ? "action" : "actions";

  return active
    ? {
        status: "restored",
        bundle,
        message: `"${bundle.bundle_code}" grants its ${count} ${noun} again — to everybody holding this role, and to anybody who was lent it. Nothing had to be re-granted: switching the set off suspended those actions, it did not remove them from the set.`,
      }
    : {
        status: "withdrawn",
        bundle,
        message: `"${bundle.bundle_code}" now grants nothing. Its ${count} ${noun} ${count === 1 ? "is" : "are"} gone from everybody holding this role and from anybody who was lent it, from their next request. The role's other sets are untouched, and this is reversible — the set keeps its contents.`,
      };
}

/** Declare an attribute condition. Deny-only, and immediate. */
export async function createAbacRuleAction(
  _prev: CreateAbacRuleState,
  formData: FormData,
): Promise<CreateAbacRuleState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "unauthorized", message: EXPIRED };
  }

  const ruleCode = asCode(String(formData.get("rule_code") ?? ""));
  const actionType = asActionCode(String(formData.get("abac_action_type") ?? ""));
  const effect = String(formData.get("effect") ?? "").trim();
  const attributeKey = String(formData.get("attribute_key") ?? "").trim();
  const operator = String(formData.get("operator") ?? "").trim();
  const attributeValue = String(formData.get("attribute_value") ?? "").trim();

  if (!ruleCode) {
    return {
      status: "refused",
      message:
        "Give the condition a code. It is what a refusal names when this condition causes one, so without it a denial could not be traced back to the rule that produced it.",
    };
  }
  if (!actionType) {
    return { status: "refused", message: "Name the action this condition guards." };
  }
  if (effect !== "REQUIRE" && effect !== "FORBID") {
    return {
      status: "refused",
      message: "Choose whether the condition requires something to be true or forbids it. There is no third option.",
    };
  }
  if (!attributeKey) {
    return {
      status: "refused",
      message:
        "Name the attribute the condition looks at. It has to be a name the calling service actually sends — a REQUIRE condition on an attribute nobody sends refuses its action for everybody.",
    };
  }

  const chosen = ABAC_OPERATORS.find((o) => o.raw === operator);
  if (!chosen) {
    return {
      status: "refused",
      message: "Choose one of the comparisons offered. The service refuses any other, because a comparison it cannot carry out would refuse its action for everybody.",
    };
  }
  if (chosen.takesValue && !attributeValue) {
    return {
      status: "refused",
      message: `“${chosen.label}” needs something to compare against. Enter the value, or pick a comparison that takes none.`,
    };
  }
  if (!chosen.takesValue && attributeValue) {
    // Refused here, not by the service — it stores the value and never reads
    // it, which leaves a condition whose written form says one thing and whose
    // behaviour says another. Verified against the running service: it answers
    // 201 to `exists` carrying a value.
    return {
      status: "refused",
      message: `“${chosen.label}” only asks whether the attribute is there at all, so a value would be stored and never used — the condition would not mean what it appears to say. Clear the value, or pick a comparison that uses one.`,
    };
  }

  const result = await createABACRule({
    identity,
    ruleCode,
    actionType,
    effect,
    attributeKey,
    operator,
    ...(chosen.takesValue ? { attributeValue } : {}),
  });

  if (!result.ok) {
    if (result.error.status === 403) {
      return {
        status: "unauthorized",
        message: explainAuthorizationError(result.error.message, { status: result.error.status }),
      };
    }
    return {
      status: "refused",
      message: explainAuthorizationError(result.error.message, { status: result.error.status }),
    };
  }

  refresh();

  const rule = result.data;
  return {
    status: "created",
    rule,
    // Blunt on purpose. This is in force from now, it can only take access
    // away, and the most common way to get it wrong — naming an attribute
    // nothing sends — fails closed for everybody at once.
    message:
      `${rule.rule_code} is in force now. ${describeABACRule(rule)} Nobody has to do anything for ` +
      "that to start happening. If the attribute it names is not something the calling service " +
      "actually sends, a REQUIRE condition will refuse this action for everyone — check that " +
      "before relying on it.",
  };
}

/** Retire or reactivate an attribute condition. */
export async function setAbacRuleEnforcementAction(
  _prev: AbacRuleEnforcementState,
  formData: FormData,
): Promise<AbacRuleEnforcementState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "unauthorized", message: EXPIRED };
  }

  const abacRuleId = String(formData.get("abac_rule_id") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "true";

  if (!abacRuleId || !isUuid(abacRuleId)) {
    return { status: "refused", message: "It is not clear which condition this applies to. Reload the page and try again." };
  }

  const result = await setABACRuleActive({ identity, abacRuleId, active });

  if (!result.ok) {
    if (result.error.status === 403) {
      return {
        status: "unauthorized",
        // A platform-wide condition cannot be retired from one organisation's
        // console, and that is a 403 with a specific cause worth naming.
        message:
          explainAuthorizationError(result.error.message, { status: result.error.status }) +
          " A condition that applies to every organisation can only be changed by whoever administers the platform, not from here.",
      };
    }
    return {
      status: "refused",
      message: explainAuthorizationError(result.error.message, { status: result.error.status }),
    };
  }

  refresh();

  const rule = result.data;
  return active
    ? {
        status: "reactivated",
        rule,
        message: `${rule.rule_code} is being applied again. ${describeABACRule(rule)}`,
      }
    : {
        status: "retired",
        rule,
        message: `${rule.rule_code} is no longer applied, so it can no longer refuse anything. Whatever it was taking away is now available again to everybody who was otherwise granted it — which is the point, and worth being sure of.`,
      };
}

/** Lend one principal's authority to another. */
export async function delegateAuthorityAction(
  _prev: DelegateAuthorityState,
  formData: FormData,
): Promise<DelegateAuthorityState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "unauthorized", message: EXPIRED };
  }

  const delegateId = String(formData.get("delegate_principal_id") ?? "").trim();
  const scopeType = String(formData.get("scope_type") ?? "").trim();
  const legalEntityId = String(formData.get("delegation_legal_entity_id") ?? "").trim();
  const actionsRaw = String(formData.get("delegated_actions") ?? "").trim();
  const effectiveFrom = String(formData.get("delegation_effective_from") ?? "").trim();
  const effectiveTo = String(formData.get("delegation_effective_to") ?? "").trim();

  if (!delegateId || !isUuid(delegateId)) {
    return {
      status: "refused",
      message: "Name the person borrowing the authority, by their reference. Copy it from the grants register.",
    };
  }
  // The service refuses a delegation whose delegator is not the caller, so the
  // console does not offer the field at all: you lend your own authority. An
  // input for it could only ever produce a refusal, and would imply the
  // platform lets one person hand out another's access.
  if (delegateId === identity.principalId) {
    return {
      status: "refused",
      message: "You cannot lend your authority to yourself — you already hold it. Name somebody else.",
    };
  }
  if (scopeType !== "FULL" && scopeType !== "ACTION_SUBSET") {
    return { status: "refused", message: "Choose how much authority is being lent." };
  }
  if (legalEntityId && !isUuid(legalEntityId)) {
    return {
      status: "refused",
      message: "The company has to be named by its reference, and this is not one. Leave it blank to lend across the whole organisation.",
    };
  }
  if (!effectiveFrom) {
    return { status: "refused", message: "Give the date the delegation starts. There is no implicit “now”." };
  }
  if (effectiveTo && effectiveTo <= effectiveFrom) {
    return {
      status: "refused",
      message: "The delegation has to end after it starts. A backwards window confers nothing and would look like a live delegation in the register.",
    };
  }

  const delegatedActions = actionsRaw
    .split(/[\n,]+/)
    .map((a) => asActionCode(a))
    .filter(Boolean);

  if (scopeType === "ACTION_SUBSET" && delegatedActions.length === 0) {
    return {
      status: "refused",
      message:
        "Lending named actions means naming at least one. Leaving the list empty would lend nothing while looking like a restriction — choose “everything I can do” if that is what you mean.",
    };
  }

  const result = await createDelegatedAuthority({
    identity,
    delegatorPrincipalId: identity.principalId,
    delegatePrincipalId: delegateId,
    scopeType,
    ...(legalEntityId ? { legalEntityId } : {}),
    ...(scopeType === "ACTION_SUBSET" ? { delegatedActions } : {}),
    effectiveFrom: `${effectiveFrom}T00:00:00Z`,
    ...(effectiveTo ? { effectiveTo: `${effectiveTo}T00:00:00Z` } : {}),
  });

  if (!result.ok) {
    if (result.error.status === 403) {
      return {
        status: "unauthorized",
        message: explainAuthorizationError(result.error.message, { status: result.error.status }),
      };
    }
    return {
      status: "refused",
      message: explainAuthorizationError(result.error.message, { status: result.error.status }),
    };
  }

  refresh();

  const delegation = result.data;
  return {
    status: "lent",
    delegation,
    message:
      `Authority lent. ${describeDelegationScope(delegation)} It confers only what you still hold ` +
      "yourself, so it shrinks automatically if your own access does — and you are the only person " +
      "who can withdraw it.",
  };
}

/** Withdraw a delegation. One-way and final. */
export async function withdrawAuthorityAction(
  _prev: DelegateAuthorityState,
  formData: FormData,
): Promise<DelegateAuthorityState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "unauthorized", message: EXPIRED };
  }

  const delegationId = String(formData.get("delegated_authority_id") ?? "").trim();
  if (!delegationId || !isUuid(delegationId)) {
    return { status: "refused", message: "It is not clear which delegation this applies to. Reload the page and try again." };
  }

  const result = await revokeDelegatedAuthority({ identity, delegationId });

  if (!result.ok) {
    // 409 is the one-way transition working: it was already withdrawn, so the
    // operator's intent is already satisfied.
    if (result.error.status === 409 || result.error.message.includes("already_revoked")) {
      return {
        status: "alreadyWithdrawn",
        message:
          "This delegation had already been withdrawn, so nothing changed. Withdrawing is one-way and final — it cannot be done twice, and it cannot be undone.",
      };
    }
    if (result.error.status === 403) {
      return {
        status: "unauthorized",
        message: explainAuthorizationError(result.error.message, { status: result.error.status }),
      };
    }
    return {
      status: "refused",
      message: explainAuthorizationError(result.error.message, { status: result.error.status }),
    };
  }

  refresh();

  return {
    status: "withdrawn",
    delegation: result.data,
    message:
      "Authority withdrawn. The borrower has lost whatever this was lending them, immediately. " +
      "It cannot be reinstated — if they need it again, lend it again.",
  };
}

/**
 * Retire or reactivate a conflict rule.
 *
 * Both messages are blunt in opposite directions. Retiring one removes a
 * control: whoever held both conflicting actions and was being refused either
 * of them can now do both, from the next decision onward, with nobody having
 * to grant them anything. That is the whole effect and it needs saying.
 */
export async function setSoDRuleEnforcementAction(
  _prev: SoDRuleEnforcementState,
  formData: FormData,
): Promise<SoDRuleEnforcementState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "unauthorized", message: EXPIRED };
  }

  const sodRuleId = String(formData.get("sod_rule_id") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "true";

  if (!sodRuleId || !isUuid(sodRuleId)) {
    return { status: "refused", message: "It is not clear which rule this applies to. Reload the page and try again." };
  }

  const result = await setSoDRuleActive({ identity, sodRuleId, active });

  if (!result.ok) {
    if (result.error.status === 404) {
      // The store's predicate has no IS NULL branch, so a platform-wide rule
      // is absent from a tenant's scope. That is by far the likelier cause
      // here than a mistyped reference, since the reference came from the
      // table the operator is looking at.
      return {
        status: "refused",
        message:
          "That rule was not changed. A rule that applies to every organisation cannot be retired from one organisation's console — only whoever administers the platform can, and that is deliberate: a control binding every organisation must not be disableable by any one of them.",
      };
    }
    if (result.error.status === 403) {
      return {
        status: "unauthorized",
        message: explainAuthorizationError(result.error.message, { status: result.error.status }),
      };
    }
    return {
      status: "refused",
      message: explainAuthorizationError(result.error.message, { status: result.error.status }),
    };
  }

  refresh();

  const rule = result.data;
  return active
    ? {
        status: "reactivated",
        rule,
        message: `Being enforced again: nobody may hold both ${rule.action_a} and ${rule.action_b}. Anybody who currently holds both is refused either one from their next request onward.`,
      }
    : {
        status: "retired",
        rule,
        message: `No longer enforced. Holding both ${rule.action_a} and ${rule.action_b} is now permitted — anybody who already held both, and was being refused, can do both from their next request onward, with nobody having granted them anything. The rule is kept rather than deleted, so past refusals it caused stay explainable.`,
      };
}
