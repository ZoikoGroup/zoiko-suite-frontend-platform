// Client for authorization-svc (:8089) — the live authorization plane.
//
// WHY THIS SITS BESIDE access-control.ts RATHER THAN INSIDE IT.
//
// access-control.ts talks to access-control-svc (:8137), which owns *role
// definitions* — the governed, auditable record that a role exists and what
// it is allowed to permit. It exposes exactly six routes, all under
// /v1/role-definitions, and it forwards each write on to authorization-svc.
//
// It does NOT expose role assignments, SoD rules, or delegations. So the
// three capabilities below are unreachable through it, and this module talks
// to authorization-svc directly. `authorization` has been in the service
// registry (config.ts) all along; nothing was calling it.
//
// The distinction matters when reading the console: a role defined through
// access-control-svc GRANTS NOTHING until it is assigned here. That was the
// functional gap this module closes — the console could previously define
// roles it had no way to hand to anyone.
//
// EVERY READ HERE IS SENSITIVE. An assignment names a principal and the role
// they hold; a SoD rule names where the segregation tripwires are. Both
// endpoints require a verified principal and tenant, and the backend takes
// the tenant from the envelope header, never from a query param — see
// list_admin_test.go's TestListRoleAssignments_TenantComesFromHeaderNotQuery.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

const SERVICE = "authorization" as const;

// ── types ───────────────────────────────────────────────────────────────────

/**
 * A live grant: this principal holds this role, in this entity, over this
 * window. `legal_entity_id` is null for a tenant-wide assignment, which
 * authorization-svc only accepts when the role's own scope type is TENANT.
 *
 * `effective_to` null means "still in force". A revoke sets it to now()
 * rather than deleting the row — the history is the audit trail.
 */
export type RoleAssignment = {
  principal_role_assignment_id: string;
  principal_id: string;
  role_id: string;
  legal_entity_id: string | null;
  effective_from: string;
  effective_to: string | null;
  assigned_by: string;
  created_at: string;
};

/**
 * A Separation-of-Duties conflict pair. Holding both `action_a` and
 * `action_b` makes a request for either one answer DENIED.
 *
 * `tenant_id` null means a globally-applicable rule: it binds every tenant
 * and cannot be edited from inside one. The list endpoint returns those
 * alongside the tenant's own, deliberately — they deny just as hard, and
 * hiding them would make a denial unexplainable from the console.
 */
export type SoDRule = {
  sod_rule_id: string;
  domain_code: string;
  action_a: string;
  action_b: string;
  conflict_type: string;
  jurisdiction_id: string | null;
  tenant_id: string | null;
  active_flag: boolean;
  created_at: string;
};

// ── reads ───────────────────────────────────────────────────────────────────

export type ListAssignmentsOptions = {
  principalId?: string;
  roleId?: string;
  /**
   * Include revoked and not-yet-effective rows. Default false, because the
   * list exists to support a revoke decision and a revoked row is not
   * revocable.
   */
  includeExpired?: boolean;
};

export async function listRoleAssignments(
  identity: Identity,
  options: ListAssignmentsOptions = {},
): Promise<ApiResult<RoleAssignment[]>> {
  return apiGet<RoleAssignment[]>(SERVICE, "/v1/admin/role-assignments", {
    identity,
    query: {
      principal_id: options.principalId,
      role_id: options.roleId,
      // Only send the flag when opting in — apiGet drops undefined, and the
      // backend defaults to active-only.
      include_expired: options.includeExpired ? "true" : undefined,
    },
  });
}

export async function listSoDRules(identity: Identity): Promise<ApiResult<SoDRule[]>> {
  return apiGet<SoDRule[]>(SERVICE, "/v1/admin/sod-rules", { identity });
}

// ── writes ──────────────────────────────────────────────────────────────────

export type AssignRoleInput = {
  identity: Identity;
  principalId: string;
  roleId: string;
  /** Omit for a tenant-wide assignment (role must be TENANT-scoped). */
  legalEntityId?: string;
  /** ISO-8601. authorization-svc requires it — there is no implicit "now". */
  effectiveFrom: string;
  correlationId: string;
};

/**
 * Assign a role to a principal. This is the call that actually grants access;
 * defining a role and attaching a bundle does not.
 *
 * `assignment_id` is generated client-side so the write is idempotent under
 * the correlation id the caller already holds, matching how
 * createRoleDefinition works.
 */
export async function assignRole(input: AssignRoleInput): Promise<ApiWriteResult<RoleAssignment>> {
  return apiPost<RoleAssignment>(
    SERVICE,
    "/v1/admin/role-assignments",
    {
      principal_role_assignment_id: crypto.randomUUID(),
      principal_id: input.principalId,
      role_id: input.roleId,
      // Empty string, not null and not omitted. The handler treats "" as
      // "tenant-wide" (`if req.LegalEntityID != ""`), and only accepts that
      // when the role's own scope_type is TENANT.
      legal_entity_id: input.legalEntityId ?? "",
      effective_from: input.effectiveFrom,
      // NOTE: no tenant_id and no assigned_by here on purpose. The handler
      // takes both from the verified envelope — actor from X-Principal-Id,
      // tenant from X-Tenant-Id — and then refuses if the named role does
      // not belong to that tenant. Sending them in the body would be
      // decorative at best and, if the handler ever started reading them,
      // would reintroduce exactly the defect that hardening removed:
      // tenant and actor arriving as caller-supplied data.
    },
    { identity: input.identity },
  );
}

export type RevokeAssignmentInput = {
  identity: Identity;
  assignmentId: string;
  correlationId: string;
};

/**
 * End a grant. Sets effective_to = now() rather than deleting — everyone who
 * held the role keeps a record of having held it.
 *
 * A second revoke on the same assignment answers 404, not 200: the store
 * matches only rows still in force, which is the correct one-way-transition
 * behaviour and worth surfacing to the operator rather than swallowing.
 */
export async function revokeRoleAssignment(
  input: RevokeAssignmentInput,
): Promise<ApiWriteResult<RoleAssignment>> {
  return apiPost<RoleAssignment>(
    SERVICE,
    `/v1/admin/role-assignments/${encodeURIComponent(input.assignmentId)}/revoke`,
    {},
    { identity: input.identity },
  );
}

export type CreateSoDRuleInput = {
  identity: Identity;
  domainCode: string;
  actionA: string;
  actionB: string;
  conflictType: string;
  correlationId: string;
};

export async function createSoDRule(
  input: CreateSoDRuleInput,
): Promise<ApiWriteResult<SoDRule>> {
  return apiPost<SoDRule>(
    SERVICE,
    "/v1/admin/sod-rules",
    {
      sod_rule_id: crypto.randomUUID(),
      // tenant_id IS sent here, unlike on assignRole — and it must be. For
      // sod_rules the field is genuinely optional in the contract, and
      // OMITTING it creates a rule with tenant_id NULL, which binds EVERY
      // tenant on the platform. A console action must never silently author
      // a global rule, so the caller's own tenant is stated explicitly.
      tenant_id: input.identity.tenantId,
      domain_code: input.domainCode,
      action_a: input.actionA,
      action_b: input.actionB,
      conflict_type: input.conflictType,
    },
    { identity: input.identity },
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** An assignment is live if it has started and has not been revoked. */
export function isAssignmentActive(a: RoleAssignment, now: Date = new Date()): boolean {
  const from = new Date(a.effective_from);
  if (from > now) return false;
  if (!a.effective_to) return true;
  return new Date(a.effective_to) > now;
}

/**
 * Turn authorization-svc's error codes into something an operator can act on.
 * Mirrors explainAccessControlError's job for the other service — the raw
 * codes name internals ("no_grant") that read as failures rather than answers.
 */
export function explainAuthorizationError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("missing_tenant_scope")) {
    return "No tenant scope on the request. Sign in again — the gateway sets this from a verified session.";
  }
  if (m.includes("missing_principal")) {
    return "No principal on the request. Sign in again.";
  }
  if (m.includes("role_assignment_not_found")) {
    return "That assignment is already revoked, or belongs to another tenant. The list below is current as of the last refresh.";
  }
  if (m.includes("role_not_found")) {
    return "That role does not exist in this tenant. Define it first — a role must exist before it can be assigned.";
  }
  if (m.includes("legal_entity") && m.includes("tenant")) {
    return "A tenant-wide assignment requires a TENANT-scoped role. This role is scoped to a legal entity, so name one.";
  }
  if (m.includes("store_unavailable")) {
    return "authorization-svc could not reach its database. Nothing was written. This is not a denial — retry.";
  }
  if (m.includes("envelope_incomplete")) {
    return "The request was missing required envelope headers. This is a console bug, not a permissions problem.";
  }
  return message;
}
