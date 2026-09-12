// access-control-svc (:8137) — the governed authoring layer for RBAC role and
// permission-bundle DEFINITIONS.
//
// EVERY ROUTE IN THE PREVIOUS VERSION OF THIS FILE WAS WRONG. It called
// /v1/roles and /v1/roles/{id}/bundles; the service serves /v1/role-definitions
// and /v1/role-definitions/{id}/permission-bundles. Both 404'd, and because no
// page ever imported this client nothing surfaced it. It also carried a
// checkAccess() against /v1/check, which is not a route this service has at all
// — authorization-svc evaluates decisions, and it does so at POST /v1/authorize.
// That function is gone rather than repointed: the console has no business
// asking for an authorization decision it is not about to act on.
//
// WHAT THIS SERVICE IS, AND IS NOT. authorization-svc owns live RBAC and every
// other service's authz checks depend on it; this service does not shadow that
// data. It is the authoring front door: creating a role or bundle here makes a
// synchronous call into authorization-svc's admin API, so a definition recorded
// here has actually been provisioned for real enforcement. authorization-svc
// remains the enforcement source of truth. Per-principal role ASSIGNMENTS are
// out of scope — those live in authorization-svc and are not reachable here.
//
// THE ONE PROPERTY THAT MATTERS MOST TO A READER OF THIS REGISTER. status is not
// decoration. Retiring a role sets active_flag false in authorization-svc, and
// its authorize path joins through that flag, so a RETIRED role grants nothing
// to anyone from that moment. It is also reversible: assignments are left
// intact, so reactivating restores exactly the access that was suspended. Until
// recently the propagation did not happen at all and RETIRED was a label on a
// row — see the service's own history. The UI therefore reports a refused
// retirement as a refusal, never as a success, because the difference is whether
// the platform is still enforcing the role.

import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  type ApiResult,
  type ApiWriteResult,
  type Identity,
} from "./client";

export type RoleStatus = "ACTIVE" | "RETIRED";

/** LEGAL_ENTITY roles are scoped at assignment time; TENANT roles apply across
 *  the whole tenant. The service mirrors authorization-svc's own role model,
 *  where scoping happens on assignment and not on definition. */
export type RoleScopeType = "LEGAL_ENTITY" | "TENANT";

export type RoleDefinition = {
  role_definition_id: string;
  tenant_id: string;
  role_code: string;
  role_name: string;
  role_scope_type: RoleScopeType;
  status: RoleStatus;
  created_by_principal_id: string;
  /** The principal who last changed this def, when a change has happened.
   *  Present only after an update — creation stamps created_by_principal_id. */
  updated_by_principal_id?: string;
  correlation_id: string;
  created_at: string;
  updated_at: string;
};

export type PermissionBundleDef = {
  bundle_id: string;
  tenant_id: string;
  role_definition_id: string;
  bundle_code: string;
  permitted_actions: string[];
  active_flag: boolean;
  /** The principal who last changed this def, when a change has happened. */
  updated_by_principal_id?: string;
  correlation_id: string;
  created_at: string;
  updated_at: string;
};

const SERVICE = "accessControl" as const;
const BASE = "/v1/role-definitions";

// ── reads ────────────────────────────────────────────────────────────────────

/** Narrowing and paging for a role-catalogue read. Every field is optional and
 *  omitted filters are simply not applied — this service never silently
 *  truncates: a limit below 1 means "no cap", and a caller asks for paging. */
export type RoleListOptions = {
  status?: RoleStatus;
  scopeType?: RoleScopeType;
  /** A code/name substring search, matched case-insensitively. */
  search?: string;
  limit?: number;
  offset?: number;
};

/**
 * The role catalogue for the caller's tenant.
 *
 * Scoped by the verified X-Tenant-Id alone — the service takes no tenant_id
 * parameter and every store query carries an explicit predicate over the header,
 * so a dropped header is an error rather than an unscoped read.
 *
 * The trailing slash is deliberate: the service mounts this collection with
 * chi's Route("/v1/role-definitions") and registers "/" inside it, so
 * /v1/role-definitions without the slash is a redirect rather than a hit.
 */
export async function listRoleDefinitions(
  identity?: Identity,
  options?: RoleListOptions,
): Promise<ApiResult<RoleDefinition[]>> {
  return apiGet<RoleDefinition[]>(SERVICE, `${BASE}/`, {
    identity,
    query: {
      status: options?.status,
      scope_type: options?.scopeType,
      search: options?.search,
      limit: options?.limit,
      offset: options?.offset,
    },
  });
}

export async function getRoleDefinition(
  roleDefinitionId: string,
  identity?: Identity,
): Promise<ApiResult<RoleDefinition>> {
  return apiGet<RoleDefinition>(SERVICE, `${BASE}/${encodeURIComponent(roleDefinitionId)}`, {
    identity,
  });
}

/** The permission bundles attached to one role definition, newest first. */
export async function listPermissionBundles(
  roleDefinitionId: string,
  identity?: Identity,
): Promise<ApiResult<PermissionBundleDef[]>> {
  return apiGet<PermissionBundleDef[]>(
    SERVICE,
    `${BASE}/${encodeURIComponent(roleDefinitionId)}/permission-bundles`,
    { identity },
  );
}

/**
 * One permission bundle by id, resolved under its role.
 *
 * The bundle is matched under the role specifically: a bundle that exists on
 * another role reads as "not found" here (the service splits the two on
 * purpose, so a probe cannot confirm a foreign bundle id).
 */
export async function getPermissionBundle(
  roleDefinitionId: string,
  bundleId: string,
  identity?: Identity,
): Promise<ApiResult<PermissionBundleDef>> {
  return apiGet<PermissionBundleDef>(
    SERVICE,
    `${BASE}/${encodeURIComponent(roleDefinitionId)}/permission-bundles/${encodeURIComponent(bundleId)}`,
    { identity },
  );
}

/** Narrowing and paging for the flat permission-bundle catalogue. */
export type BundleListOptions = {
  roleId?: string;
  activeFlag?: boolean;
  /** A bundle-code substring search, matched case-insensitively. */
  search?: string;
  limit?: number;
  offset?: number;
};

/**
 * The tenant's whole permission-bundle catalogue in one read.
 *
 * This is the flat listing the role-scoped /permission-bundles route cannot
 * give: every role's bundles at once. A dashboard that shows bundles across
 * roles previously had to fan out one request per role; this is the endpoint
 * that read was written to avoid.
 */
export async function listAllPermissionBundles(
  identity?: Identity,
  options?: BundleListOptions,
): Promise<ApiResult<PermissionBundleDef[]>> {
  return apiGet<PermissionBundleDef[]>(SERVICE, "/v1/permission-bundles/", {
    identity,
    query: {
      role_id: options?.roleId,
      active_flag: options?.activeFlag === undefined ? undefined : String(options.activeFlag),
      search: options?.search,
      limit: options?.limit,
      offset: options?.offset,
    },
  });
}

// ── writes ───────────────────────────────────────────────────────────────────

export type CreateRoleInput = {
  identity: Identity & { principalId: string; tenantId: string };
  /** Authorized against this entity, not the platform scope. A denial means the
   *  principal holds no ROLE_MANAGE grant here. */
  legalEntityId: string;
  roleCode: string;
  roleName: string;
  roleScopeType: RoleScopeType;
  /** Idempotency key. The service is unique on (tenant_id, correlation_id) and
   *  a replay returns the original role, so the caller must generate this once
   *  per intent and reuse it on retry. */
  correlationId: string;
};

/**
 * Define a role, and provision it into authorization-svc.
 *
 * The remote call happens FIRST and fails closed: if authorization-svc is
 * unreachable the service answers 503 and records nothing, so the catalogue
 * never lists a role that was never actually provisioned. 201 is a new role;
 * 200 is a replay of one this correlation_id already created.
 */
export async function createRoleDefinition(
  input: CreateRoleInput,
): Promise<ApiWriteResult<RoleDefinition>> {
  return apiPost<RoleDefinition>(
    SERVICE,
    `${BASE}/`,
    {
      legal_entity_id: input.legalEntityId,
      role_code: input.roleCode,
      role_name: input.roleName,
      role_scope_type: input.roleScopeType,
      correlation_id: input.correlationId,
    },
    { identity: input.identity },
  );
}

export type UpdateRoleInput = {
  identity: Identity & { principalId: string; tenantId: string };
  legalEntityId: string;
  roleDefinitionId: string;
  /** Omit to leave the name alone — this is a partial update, and an empty
   *  string is treated by the service as "unchanged", not as a blank name. */
  roleName?: string;
  /** Omit to leave the status alone. Supplying a different one is what
   *  propagates to authorization-svc's active_flag. */
  status?: RoleStatus;
};

/**
 * Rename a role, retire it, or bring it back.
 *
 * A status change is propagated to authorization-svc before it is recorded, and
 * fails closed — so a 503 here means the retirement did NOT happen and the role
 * is still being enforced. That is the one outcome a reader must not mistake for
 * success, and it is why the UI reports it as its own state rather than folding
 * it into a generic error.
 *
 * A rename makes no remote call, and setting the status a role already has is a
 * no-op rather than a redundant round trip.
 */
export async function updateRoleDefinition(
  input: UpdateRoleInput,
): Promise<ApiWriteResult<RoleDefinition>> {
  const body: Record<string, string> = { legal_entity_id: input.legalEntityId };
  if (input.roleName) body.role_name = input.roleName;
  if (input.status) body.status = input.status;

  return apiPatch<RoleDefinition>(
    SERVICE,
    `${BASE}/${encodeURIComponent(input.roleDefinitionId)}`,
    body,
    { identity: input.identity },
  );
}

export type CreateBundleInput = {
  identity: Identity & { principalId: string; tenantId: string };
  legalEntityId: string;
  roleDefinitionId: string;
  bundleCode: string;
  /** The action codes this bundle permits, e.g. PO_ISSUE, PO_CLOSE. These are
   *  the same strings every service's authz check names, so a typo here is a
   *  grant that silently matches nothing rather than an error. */
  permittedActions: string[];
  correlationId: string;
};

/**
 * Attach a permission bundle to a role, and provision it into authorization-svc
 * against the role provisioned at creation time.
 *
 * Same fail-closed ordering and same idempotency as role creation.
 */
export async function createPermissionBundle(
  input: CreateBundleInput,
): Promise<ApiWriteResult<PermissionBundleDef>> {
  return apiPost<PermissionBundleDef>(
    SERVICE,
    `${BASE}/${encodeURIComponent(input.roleDefinitionId)}/permission-bundles`,
    {
      legal_entity_id: input.legalEntityId,
      bundle_code: input.bundleCode,
      permitted_actions: input.permittedActions,
      correlation_id: input.correlationId,
    },
    { identity: input.identity },
  );
}

export type UpdateBundleInput = {
  identity: Identity & { principalId: string; tenantId: string };
  /** Authorized against this entity, like every other write on this service. */
  legalEntityId: string;
  roleDefinitionId: string;
  bundleId: string;
  /** Omit to leave the actions alone. Supplying them is what propagates to
   *  authorization-svc as an upsert-replace, editing the granted actions. */
  permittedActions?: string[];
  /** Omit to leave the active state alone. A change is propagated to
   *  authorization-svc's retire/reactivate endpoints before it is recorded. */
  activeFlag?: boolean;
  correlationId?: string;
};

/**
 * Edit one permission bundle: its permitted actions and/or its active state.
 *
 * This is a partial update — an omitted field means "leave it alone", matching
 * how the service's role PATCH already behaves. Only the real transitions are
 * propagated: changing the actions upsert-replaces the bundle in
 * authorization-svc, changing the active state retires or reactivates it, and
 * a submission that changes nothing is answered with the current record and
 * makes no remote call.
 *
 * A bundle_code is intentionally not editable — authorization-svc has no
 * rename, so a rename here could only be a local label on a differently-enforced
 * reality. Detach and re-attach under a new code is the supported rename.
 */
export async function updatePermissionBundle(
  input: UpdateBundleInput,
): Promise<ApiWriteResult<PermissionBundleDef>> {
  const body: Record<string, unknown> = { legal_entity_id: input.legalEntityId };
  if (input.permittedActions !== undefined) body.permitted_actions = input.permittedActions;
  if (input.activeFlag !== undefined) body.active_flag = input.activeFlag;
  if (input.correlationId) body.correlation_id = input.correlationId;

  return apiPatch<PermissionBundleDef>(
    SERVICE,
    `${BASE}/${encodeURIComponent(input.roleDefinitionId)}/permission-bundles/${encodeURIComponent(input.bundleId)}`,
    body,
    { identity: input.identity },
  );
}

export type DetachBundleInput = {
  identity: Identity & { principalId: string; tenantId: string };
  legalEntityId: string;
  roleDefinitionId: string;
  bundleId: string;
  correlationId?: string;
};

/**
 * Detach one bundle from its role: retire it in authorization-svc by resolving
 * its code to the remote id, and clear its active flag here.
 *
 * Fail-closed and idempotent. A retirement that cannot be propagated refuses
 * the request, so a detached row here always means a withdrawn bundle there;
 * and a second detach of an already-detached bundle returns the current record
 * unchanged rather than erroring — the operator's intent is already satisfied.
 *
 * Nothing is hard-deleted, matching authorization-svc's own retire posture: a
 * grant recorded as "rbac:role=<code>" stays explainable only while the actions
 * that role once held remain readable.
 */
export async function detachPermissionBundle(
  input: DetachBundleInput,
): Promise<ApiWriteResult<PermissionBundleDef>> {
  return apiDelete<PermissionBundleDef>(
    SERVICE,
    `${BASE}/${encodeURIComponent(input.roleDefinitionId)}/permission-bundles/${encodeURIComponent(input.bundleId)}`,
    {
      identity: input.identity,
      query: {
        legal_entity_id: input.legalEntityId,
        correlation_id: input.correlationId,
      },
    },
  );
}

/**
 * Turn a service refusal into something an operator can act on.
 *
 * The mappings below are the strings this service actually emits, taken from its
 * handler and domain errors rather than guessed — a wrong guess here degrades
 * silently into passing the raw message through, which is the fallback anyway.
 *
 * The authz_admin_unavailable case is the important one and the reason this
 * helper exists at all: it is the only refusal where the state of the platform
 * differs from what the reader just asked for, and it must not read as a
 * transient blip.
 */
export function explainAccessControlError(message: string): string {
  if (message.includes("authorization-svc admin API unavailable")) {
    return "authorization-svc could not be reached, so nothing was changed. This matters more than a usual outage: a retirement recorded here without reaching authorization-svc would leave the role still granting every action it grants today, so the service refuses rather than recording a retirement it cannot enforce. Retry once authorization-svc is back.";
  }
  if (message.includes("authorization denied for this access control action")) {
    return "You hold no ROLE_MANAGE grant on this legal entity. Role definitions are authorized per entity, not platform-wide — ask an access administrator for the grant on this entity specifically.";
  }
  if (message.includes("authorization-svc unavailable")) {
    return "authorization-svc could not be reached, so your permission to do this could not be determined. Nothing was written — this service fails closed rather than assuming you are allowed.";
  }
  if (message.includes("status must be")) {
    return "A role definition is either ACTIVE or RETIRED. Anything else used to be stored as-is and then read back as neither, which made the role invisible to a status filter without being retired.";
  }
  if (message.includes("role definition not found")) {
    return "No role definition with that id in this tenant.";
  }
  if (message.includes("permission bundle not found")) {
    return "No permission bundle with that id on that role in this tenant. A bundle belonging to a different role reads exactly the same way — that is deliberate.";
  }
  if (message.includes("nothing_to_update")) {
    return "Nothing to change — supply permitted actions, a change to active state, or both.";
  }
  if (message.includes("empty_actions")) {
    return "A bundle must name at least one action. To withdraw every grant a bundle makes, detach it — emptying it would leave a row that looks like a control while granting nothing.";
  }
  if (message.includes("invalid_active_flag")) {
    return "The active-state filter must be true or false.";
  }
  if (message.includes("invalid_status")) {
    return "A role definition is either ACTIVE or RETIRED.";
  }
  if (message.includes("invalid_scope_type")) {
    return "The scope filter must be LEGAL_ENTITY or TENANT.";
  }
  if (message.includes("caller identity missing")) {
    return "The request carried no verified principal. Sign in again.";
  }
  if (message.includes("access control store unavailable")) {
    return "The role catalogue's database could not be reached. Nothing was changed.";
  }
  if (message.includes("are required")) {
    return `A required field was empty: ${message}`;
  }
  return message;
}

// ── derived views ────────────────────────────────────────────────────────────

export type RoleCatalogueStats = {
  total: number;
  active: number;
  retired: number;
};

export function summariseRoles(roles: RoleDefinition[]): RoleCatalogueStats {
  return roles.reduce<RoleCatalogueStats>(
    (acc, r) => {
      acc.total += 1;
      if (r.status === "ACTIVE") acc.active += 1;
      else if (r.status === "RETIRED") acc.retired += 1;
      return acc;
    },
    { total: 0, active: 0, retired: 0 },
  );
}

/**
 * Parse a comma- or newline-separated action list into the array the service
 * expects, dropping blanks so a trailing comma does not become an empty action.
 *
 * An empty action would be accepted and would then match nothing, which is the
 * quietest possible way for a bundle to grant less than its author intended.
 */
export function parsePermittedActions(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
}
