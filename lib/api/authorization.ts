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
      // NO sod_rule_id, for the same reason createABACRule sends no
      // abac_rule_id: createSoDRuleRequest has no such field and the handler
      // builds CreateSoDRuleParams without one, so a supplied id was silently
      // dropped and the store generated its own. Worth knowing what that
      // means here, because unlike the ABAC table there is no unique
      // constraint to fall back on: this endpoint has NO deduplication at
      // all. Posting the same conflict pair twice stores it twice — verified
      // against the running service, which listed two identical HARD rules on
      // the same two actions. A resubmitted form duplicates the rule rather
      // than resolving to the original.
      //
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

/**
 * Retire or reactivate a conflict rule — the only way to stop an SoD rule
 * denying.
 *
 * This route did not exist until it was added alongside this console work.
 * `active_flag` has been in `CheckSoDConflict`'s predicate since the initial
 * schema, so it was always the intended off switch, and nothing could reach
 * it: a conflict rule could be created and never retired. That mattered more
 * here than on any sibling object, because an SoD rule denies its action to
 * every principal holding the pair the moment it is authored.
 *
 * Retiring does not delete. The rule stays readable because a denial recorded
 * with `sod:conflict_with=<action>` is only explainable while the rule that
 * caused it can still be looked up.
 *
 * A platform-wide rule answers 404 from a tenant's scope, deliberately — one
 * tenant must not be able to disable a control binding all of them.
 */
export async function setSoDRuleActive(input: {
  identity: Identity;
  sodRuleId: string;
  active: boolean;
}): Promise<ApiWriteResult<SoDRule>> {
  return apiPost<SoDRule>(
    SERVICE,
    `/v1/admin/sod-rules/${encodeURIComponent(input.sodRuleId)}/${input.active ? "reactivate" : "retire"}`,
    {},
    { identity: input.identity },
  );
}

// ─── The rest of the service ─────────────────────────────────────────────────
//
// Everything above talks to three of authorization-svc's fifteen routes. The
// rest were unreachable from this console — including the two that matter most.
//
//  - `POST /v1/authorize` is the service. Roles, bundles, assignments,
//    delegations, SoD pairs and ABAC rules all exist to change what it answers,
//    and there was no way to ask it anything. An operator could build a grant
//    and had to wait for some other service to exercise it to find out whether
//    it worked — and if the answer was DENIED, no way to see why.
//  - `GET /v1/access-decisions/{id}` is the rationale. Every evaluation is
//    recorded before the response returns, precisely so a decision can be
//    explained afterwards, and nothing could read one back.
//
// Also here: the role catalogue and the delegation register, which had no read
// endpoint at all until this pass added `GET /v1/admin/roles` and
// `GET /v1/admin/delegated-authorities`, and the ABAC admin surface.

/** A role in authorization-svc's own catalogue.
 *
 *  NOT the same record as access-control-svc's RoleDefinition. That service
 *  owns the governed authoring record — a role exists, and here is what it is
 *  allowed to permit — and forwards each write here. THIS is the row the
 *  evaluation engine joins through, and `active_flag` on it is what actually
 *  stops a role granting anything. A role marked retired in the catalogue
 *  upstream while this flag stays true is a retirement that is a label and
 *  not a control, which is why the console shows this copy. */
export type Role = {
  role_id: string;
  tenant_id: string;
  /** Stable identifier, unique per tenant, and the idempotent creation key.
   *  It is also what `decision_basis` names on an RBAC grant. */
  role_code: string;
  role_name: string;
  /** "TENANT" or "LEGAL_ENTITY" — data only to the service. A tenant-wide
   *  assignment is only accepted for a TENANT-scoped role. */
  role_scope_type: string;
  active_flag: boolean;
  created_at: string;
  created_by_principal_id: string;
};

/** The actions a role grants. A role with no bundle grants nothing — the
 *  bundle is where the permitted actions live, not the role. */
export type PermissionBundle = {
  permission_bundle_id: string;
  role_id: string;
  bundle_code: string;
  permitted_actions: string[];
  active_flag: boolean;
  created_at: string;
};

/** One principal acting within another's authority.
 *
 *  `delegated_actions` null means the delegator's FULL authority. Whatever it
 *  says, the evaluation intersects it with the delegator's LIVE grants, so a
 *  delegation can never confer an action its delegator does not currently
 *  hold — before that was fixed, a delegation recorded as restricted looked
 *  restricted here and was not.
 *
 *  `source_service` set means the row was projected from
 *  delegated-authority-svc's events rather than authored here. It is exactly
 *  as load-bearing either way, and an upstream event can never revoke a
 *  locally-authored row. */
export type DelegatedAuthority = {
  delegated_authority_id: string;
  tenant_id: string;
  delegator_principal_id: string;
  delegate_principal_id: string;
  /** "FULL" or "ACTION_SUBSET" — data only. */
  scope_type: string;
  legal_entity_id: string | null;
  authority_limit_type: string | null;
  authority_limit_value: string | null;
  delegated_actions: string[] | null;
  source_service: string | null;
  source_delegation_id: string | null;
  effective_from: string;
  effective_to: string | null;
  /** "ACTIVE" or "REVOKED". One-way — a revoked delegation is never
   *  reactivated, and a second revoke answers 409. */
  revocation_status: string;
  created_at: string;
};

/** An attribute condition that can take an action away.
 *
 *  Deny-only, structurally: a rule can remove an action RBAC or delegation
 *  granted, and can never add one. `tenant_id` null binds every tenant. */
export type ABACRule = {
  abac_rule_id: string;
  tenant_id: string | null;
  /** What `decision_basis` names when this rule denies, so the rule behind a
   *  refusal is findable from the log. */
  rule_code: string;
  action_type: string;
  /** "REQUIRE" — the condition must hold, or the action is denied.
   *  "FORBID" — it must not hold. */
  effect: string;
  attribute_key: string;
  operator: string;
  attribute_value: string | null;
  active_flag: boolean;
  created_at: string;
  created_by_principal_id: string;
};

/** What `POST /v1/authorize` answers. */
export type AuthorizeDecision = {
  /** "GRANTED" or "DENIED". */
  decision_outcome: string;
  /** Which layer produced the outcome — never a bare "denied". See
   *  `explainDecisionBasis`, which is what makes this readable. */
  decision_basis: string;
  /** The recorded artifact. Quote this to retrieve the rationale later. */
  access_decision_id: string;
};

/** One recorded decision, read back by id. */
export type AccessDecision = {
  access_decision_id: string;
  principal_id: string;
  legal_entity_id: string;
  action_type: string;
  decision_outcome: string;
  decision_basis: string;
  tenant_id?: string | null;
  correlation_id: string;
  decided_at: string;
};

/** The operators the evaluator implements, each with the words for it and
 *  whether it takes a comparison value.
 *
 *  Taken from the service's own `ABACOperators` map, which refuses anything
 *  outside it at authoring time — so a form offering a twelfth operator would
 *  be offering one the service will reject. The presence checks take no
 *  operand, and a form that demands one for them would be unusable. */
export const ABAC_OPERATORS = [
  { raw: "eq", label: "is exactly", takesValue: true },
  { raw: "ne", label: "is anything other than", takesValue: true },
  { raw: "in", label: "is one of", takesValue: true },
  { raw: "not_in", label: "is none of", takesValue: true },
  { raw: "lt", label: "is less than", takesValue: true },
  { raw: "lte", label: "is at most", takesValue: true },
  { raw: "gt", label: "is more than", takesValue: true },
  { raw: "gte", label: "is at least", takesValue: true },
  { raw: "contains", label: "contains", takesValue: true },
  { raw: "exists", label: "is present at all", takesValue: false },
  { raw: "not_exists", label: "is absent", takesValue: false },
] as const;

export type ABACOperator = (typeof ABAC_OPERATORS)[number]["raw"];

/** The role scope types the service accepts. Data only to it, but the choice
 *  decides whether the role can be assigned tenant-wide. */
export const ROLE_SCOPE_TYPES = [
  {
    raw: "LEGAL_ENTITY",
    label: "One company at a time",
    meaning:
      "Each grant of this role names the company it applies to. This is the ordinary case, " +
      "and the safer one: the same person can hold the role in one company and not another.",
  },
  {
    raw: "TENANT",
    label: "The whole organisation",
    meaning:
      "This role can be granted across the whole organisation at once, without naming a " +
      "company. Only a role scoped this way can be granted that broadly — and a grant like " +
      "that applies in every company the organisation has, including ones added later.",
  },
] as const;

// ── reads ───────────────────────────────────────────────────────────────────

/**
 * The tenant's role catalogue.
 *
 * Retired roles come back too, ordered last, because a retired role is the
 * reason access somebody used to hold is gone. `activeOnly` narrows it.
 */
export async function listRoles(
  identity: Identity,
  options: { activeOnly?: boolean } = {},
): Promise<ApiResult<Role[]>> {
  return apiGet<Role[]>(SERVICE, "/v1/admin/roles", {
    identity,
    query: { active_only: options.activeOnly ? "true" : undefined },
  });
}

/**
 * The delegation register — who is acting on whose behalf.
 *
 * `principalId` matches a principal on EITHER side, because "this person's
 * delegations" means both the authority they lent out and the authority they
 * were lent. Revoked and expired rows are included unless narrowed: a revoked
 * delegation is the evidence that authority was withdrawn.
 */
export async function listDelegatedAuthorities(
  identity: Identity,
  options: { principalId?: string; activeOnly?: boolean } = {},
): Promise<ApiResult<DelegatedAuthority[]>> {
  return apiGet<DelegatedAuthority[]>(SERVICE, "/v1/admin/delegated-authorities", {
    identity,
    query: {
      principal_id: options.principalId,
      active_only: options.activeOnly ? "true" : undefined,
    },
  });
}

/** The attribute conditions in force. Includes platform-wide rules (tenant_id
 *  null) alongside the tenant's own — both deny identically, and hiding the
 *  ones a tenant operator cannot edit would make a denial unexplainable. */
export async function listABACRules(
  identity: Identity,
  options: { actionType?: string } = {},
): Promise<ApiResult<ABACRule[]>> {
  return apiGet<ABACRule[]>(SERVICE, "/v1/admin/abac-rules", {
    identity,
    query: { action_type: options.actionType },
  });
}

/**
 * Retrieve a recorded decision by id — the rationale capability.
 *
 * A decision belonging to another tenant and a decision that does not exist
 * both answer 404, deliberately: a probe must not be able to confirm an id
 * exists. So "not found" here never means "it is somewhere else".
 */
export async function getAccessDecision(
  accessDecisionId: string,
  identity: Identity,
): Promise<ApiResult<AccessDecision>> {
  return apiGet<AccessDecision>(
    SERVICE,
    `/v1/access-decisions/${encodeURIComponent(accessDecisionId)}`,
    { identity },
  );
}

/**
 * Search the decision log.
 *
 * WHY THIS EXISTS, and it is not a convenience. The service's spec places two
 * evidence obligations on it: every decision logged with actor, action, basis
 * and outcome, and — separately — "denials must be evidentially retrievable".
 * The first has always held. The second did not, because `getAccessDecision`
 * was the only read, and retrieval by id only serves somebody who already has
 * the id. For a denial that id exists in exactly one place: the response handed
 * to the service that was refused. So answering "why was this person blocked
 * last Tuesday" meant going and reading another service's logs to find a UUID
 * to bring back here. `AccessDecisionLookup`'s own hint text said so.
 *
 * Every filter is optional and each one narrows. There is deliberately no
 * tenant filter: the scope comes from the caller's verified envelope header and
 * no parameter here can widen it.
 *
 * Newest first, keyset-paginated. Pass a previous page's `next_cursor` as
 * `cursor` to continue; its ABSENCE is the only correct test for "that was the
 * last page" — a short page is not proof of the end once a filter is applied.
 * The token is opaque and the service refuses one it did not issue rather than
 * silently restarting at page one.
 */
export type ListAccessDecisionsOptions = {
  principalId?: string;
  /** "GRANTED" or "DENIED". Anything else is refused with a 400 that names the
   *  field, rather than quietly matching nothing — an empty list caused by a
   *  typo is indistinguishable from a tenant that has denied nobody. */
  outcome?: "GRANTED" | "DENIED";
  actionType?: string;
  legalEntityId?: string;
  /** RFC3339, inclusive. */
  decidedFrom?: string;
  /** RFC3339, exclusive. */
  decidedTo?: string;
  /** 1..200. Above 200 is clamped by the service, not refused. */
  limit?: number;
  cursor?: string;
};

export type AccessDecisionPage = {
  decisions: AccessDecision[];
  /** Absent on the last page. */
  next_cursor?: string;
};

export async function listAccessDecisions(
  identity: Identity,
  options: ListAccessDecisionsOptions = {},
): Promise<ApiResult<AccessDecisionPage>> {
  return apiGet<AccessDecisionPage>(SERVICE, "/v1/access-decisions", {
    identity,
    query: {
      principal_id: options.principalId,
      decision_outcome: options.outcome,
      action_type: options.actionType,
      legal_entity_id: options.legalEntityId,
      decided_from: options.decidedFrom,
      decided_to: options.decidedTo,
      limit: options.limit ? String(options.limit) : undefined,
      cursor: options.cursor,
    },
  });
}

// ── the three pre-checks ────────────────────────────────────────────────────
//
// None of these records a decision artifact, and that is the point rather than
// an omission. The decision log means "one row per authorization of a material
// act"; these answer questions ABOUT the grant graph, and rows from them would
// make that meaning false — which is the meaning an auditor reads it for.
//
// So they are safe to call while somebody is filling in a form. `authorize` is
// not: every call to it writes a row an auditor will later read.

export type EntityScopeResult = {
  legal_entity_id: string;
  in_scope: boolean;
  /** Same vocabulary as `decision_basis`, so `explainDecisionBasis` reads it. */
  basis: string;
  /** Only returned when no `actionType` was asked for. */
  permitted_actions?: string[];
};

/**
 * "Which of these companies may this person act in?"
 *
 * One call for a whole list. Asking the same question through `authorize`
 * would be one call per company AND one row in the decision log per company —
 * twelve audit records written to grey out four buttons.
 *
 * Omit `actionType` for the broad question ("can they act here at all"), which
 * also returns everything they hold in each entity. Give it for the narrow one
 * ("can they do this specific thing here"), which suppresses the full list:
 * a caller asking about one action has not asked for the person's whole
 * permission map.
 *
 * Delegated authority counts as in scope — a delegate acting in a company is
 * in scope for it, and saying otherwise would grey out exactly the buttons a
 * delegation was created to enable.
 */
export async function validateEntityScope(input: {
  identity: Identity;
  principalId: string;
  /** Up to 100. Accepts PLATFORM_SCOPE_SENTINEL. */
  legalEntityIds: string[];
  actionType?: string;
}): Promise<ApiWriteResult<{ principal_id: string; action_type?: string; results: EntityScopeResult[] }>> {
  return apiPost(
    SERVICE,
    "/v1/entity-scope/validate",
    {
      principal_id: input.principalId,
      legal_entity_ids: input.legalEntityIds,
      ...(input.actionType ? { action_type: input.actionType } : {}),
    },
    { identity: input.identity },
  );
}

export type SoDConflict = {
  candidate_action: string;
  conflicts_with: string;
  /** "held" — the person already has the other action, so something has to be
   *  taken away first. "candidate" — the bundle conflicts with itself and has
   *  to be split. The remedy differs, which is why the field exists. */
  source: "held" | "candidate" | string;
};

export type SoDValidation = {
  conflict_free: boolean;
  conflicts: SoDConflict[];
  /** Actions a rule forbids performing on an item the person also prepared.
   *  NOT a conflict: the grant is fine, one use of it will be refused. */
  own_object_restricted?: string[];
};

/**
 * "Would granting this break separation of duties?" — asked BEFORE the grant
 * exists.
 *
 * This is the question `authorize` structurally cannot answer. Separation of
 * duties is violated by a COMBINATION, so the conflict only becomes visible
 * once the combination exists — meaning the only way to discover that a role
 * must not go to somebody was to grant it and then watch every use of it be
 * denied. The control worked; the operator was left holding a live assignment
 * that confers nothing, with no explanation until they read a decision log.
 *
 * Give `principalId` + `legalEntityId` for "may THIS person hold this role",
 * which checks the candidates against what they already hold (including by
 * delegation). Omit both for "is this bundle internally conflicted", which
 * checks the candidates against each other — the case somebody designing a
 * role needs before anybody holds it. A principal WITHOUT an entity is
 * refused rather than downgraded to the narrower question: grants are
 * entity-scoped, and answering the other question would return
 * `conflict_free: true` for a person who does conflict.
 *
 * `conflict_free` reflects conflicts only. An own-object restriction is
 * reported separately and does not block the grant.
 */
export async function validateSoDConflicts(input: {
  identity: Identity;
  /** Up to 200. */
  candidateActions: string[];
  principalId?: string;
  /** Required when principalId is given. */
  legalEntityId?: string;
}): Promise<ApiWriteResult<SoDValidation>> {
  return apiPost<SoDValidation>(
    SERVICE,
    "/v1/sod/validate",
    {
      candidate_actions: input.candidateActions,
      ...(input.principalId ? { principal_id: input.principalId } : {}),
      ...(input.legalEntityId ? { legal_entity_id: input.legalEntityId } : {}),
    },
    { identity: input.identity },
  );
}

export type DelegatedAccessEvaluation = {
  principal_id: string;
  legal_entity_id: string;
  has_delegated_access: boolean;
  basis: string;
  delegated_actions?: string[];
  /** Whether they ALSO hold the named action through their own roles. Only
   *  meaningful when an actionType was given. */
  held_directly?: boolean;
};

/**
 * "Is this person acting on their own authority, or somebody else's?"
 *
 * `authorize` collapses both paths into one GRANTED and names RBAC as the
 * basis when both apply — so a person who holds an action directly AND by
 * delegation reads as pure RBAC. For a four-eyes step that has to know whether
 * the delegate or the delegator satisfied it, that is the whole question, and
 * `held_directly` is the field that answers it.
 *
 * `delegated_actions` is already intersected with the lenders' LIVE grants by
 * the service, so it can never list something a lender no longer holds.
 */
export async function evaluateDelegatedAccess(input: {
  identity: Identity;
  principalId: string;
  legalEntityId: string;
  actionType?: string;
}): Promise<ApiWriteResult<DelegatedAccessEvaluation>> {
  return apiPost<DelegatedAccessEvaluation>(
    SERVICE,
    "/v1/delegated-access/evaluate",
    {
      principal_id: input.principalId,
      legal_entity_id: input.legalEntityId,
      ...(input.actionType ? { action_type: input.actionType } : {}),
    },
    { identity: input.identity },
  );
}

// ── the evaluation ──────────────────────────────────────────────────────────

/** `legal_entity_id: "PLATFORM"` resolves to the one configured platform-scope
 *  entity, so a platform-wide act is evaluated against the same id everywhere
 *  rather than against whichever synthetic uuid a caller invented. An
 *  unconfigured deployment answers 400 rather than inventing one. */
export const PLATFORM_SCOPE_SENTINEL = "PLATFORM";

export type AuthorizeInput = {
  identity: Identity;
  principalId: string;
  /** A legal entity id, or PLATFORM_SCOPE_SENTINEL. */
  legalEntityId: string;
  actionType: string;
  /** The principal who prepared the object being acted on, when there is one.
   *  Supplying it turns on the own-object check — "a preparer cannot approve
   *  their own object". Omitting it means no own-object check is attempted,
   *  which is the historical behaviour and not a safe default so much as the
   *  existing one. */
  resourceOwnerPrincipalId?: string;
  /**
   * The request and resource attributes the ABAC layer evaluates its declared
   * conditions against.
   *
   * `Record<string, string>`, not `unknown`, because that is the wire contract:
   * the service decodes this into `map[string]string` and answers 400
   * `invalid_json` — "cannot unmarshal number into Go struct field
   * authorizeRequest.attributes of type string" — on a JSON number. Values are
   * strings even when they represent numbers; the comparison operators parse
   * both sides numerically where they can, so "10000" still orders as a number
   * and a caller does not have to know which of its attributes a rule treats
   * as ordered.
   *
   * An attribute a rule names and this map omits DENIES a REQUIRE rule —
   * otherwise a caller could evade one by leaving a field out.
   */
  attributes?: Record<string, string>;
};

/**
 * Ask the authorization plane a question, and record the answer.
 *
 * NOT a dry run. Every evaluation is written to the decision log before the
 * response returns — that is the point of the service, not a side effect — so
 * asking from the console leaves the same artifact a service call would. That
 * is stated in the console rather than hidden: an operator testing a grant is
 * writing rows an auditor will later read.
 *
 * A 503 means "could not evaluate", which is NOT "denied". The service refuses
 * to guess an outcome when a store or dependency is unreachable, and the two
 * must never be conflated by anything reading this.
 */
export async function authorize(
  input: AuthorizeInput,
): Promise<ApiWriteResult<AuthorizeDecision>> {
  return apiPost<AuthorizeDecision>(
    SERVICE,
    "/v1/authorize",
    {
      principal_id: input.principalId,
      legal_entity_id: input.legalEntityId,
      action_type: input.actionType,
      ...(input.resourceOwnerPrincipalId
        ? { resource_owner_principal_id: input.resourceOwnerPrincipalId }
        : {}),
      ...(input.attributes && Object.keys(input.attributes).length > 0
        ? { attributes: input.attributes }
        : {}),
      // No tenant_id in the body, on purpose. The header wins and a body that
      // disagrees with it is refused, so sending it can only ever cause a
      // refusal — and the body field exists solely as a fallback for callers
      // that do not forward the header yet. This console does.
    },
    { identity: input.identity },
  );
}

// ── writes: roles, bundles, delegations, ABAC ───────────────────────────────

export type CreateRoleInput = {
  identity: Identity;
  roleCode: string;
  roleName: string;
  roleScopeType: string;
};

/**
 * Define a role in the evaluation plane. It grants nothing yet.
 *
 * 201 means a role was created; 200 means one with this `role_code` already
 * existed in the tenant and the service resolved to it rather than creating a
 * second — the code is the idempotent key, so a retried submit cannot produce
 * two roles that could then be assigned independently.
 *
 * ── THE CONSOLE DELIBERATELY DOES NOT CALL THIS ─────────────────────────────
 *
 * It is the one function in this module with no caller, and that is by design
 * rather than an oversight — worth saying, because an unused export on a module
 * where everything else is wired reads as something somebody forgot.
 *
 * access-control-svc owns role DEFINITIONS: the governed, auditable record that
 * a role exists and what it is permitted to permit. It forwards each write on to
 * authorization-svc itself, synchronously and fail-closed. So the console
 * defines roles through `createRoleDefinition` in `./access-control`, and this
 * route is still exercised on every one of those — one hop further along.
 *
 * Calling this directly would create a role in the evaluation plane with no
 * definition behind it: enforced, assignable, and absent from the register an
 * auditor reads. Kept because it is this service's real contract and a
 * non-console caller (a migration, a seeding script) legitimately needs it —
 * `deployments/scripts/seed-demo-rbac.ps1` is exactly that caller.
 */
export async function createRole(input: CreateRoleInput): Promise<ApiWriteResult<Role>> {
  return apiPost<Role>(
    SERVICE,
    "/v1/admin/roles",
    {
      role_id: crypto.randomUUID(),
      // tenant_id IS sent here. Unlike the assignment path, this service's
      // create-role handler reads it from the body, and the tenant a role
      // belongs to decides which tenant's principals can ever hold it.
      tenant_id: input.identity.tenantId,
      role_code: input.roleCode,
      role_name: input.roleName,
      role_scope_type: input.roleScopeType,
    },
    { identity: input.identity },
  );
}

/**
 * Retire or reactivate a role — the only way to stop a role granting anything
 * without revoking every assignment to it one at a time.
 *
 * Retiring leaves the assignments in place, so reactivating restores exactly
 * the access that was suspended. Idempotent: retiring an already-retired role
 * succeeds unchanged, because the intent is already satisfied.
 */
export async function setRoleActive(input: {
  identity: Identity;
  roleId: string;
  active: boolean;
}): Promise<ApiWriteResult<Role>> {
  return apiPost<Role>(
    SERVICE,
    `/v1/admin/roles/${encodeURIComponent(input.roleId)}/${input.active ? "reactivate" : "retire"}`,
    {},
    { identity: input.identity },
  );
}

/**
 * What a role actually permits.
 *
 * `listRoles` returns role_code, role_name, role_scope_type and active_flag
 * and NO actions, so without this the console listed role labels — and a
 * role_code is a name an operator chose, while the bundle is the control.
 *
 * Retired bundles come back too, ordered last, for the reason retired roles
 * do: a retired bundle is why an action the role used to grant is gone.
 *
 * A role that does not exist in this tenant answers `[]` rather than 404 —
 * the service will not confirm another tenant's role ids.
 */
export async function listPermissionBundles(
  identity: Identity,
  roleId: string,
): Promise<ApiResult<PermissionBundle[]>> {
  return apiGet<PermissionBundle[]>(
    SERVICE,
    `/v1/admin/roles/${encodeURIComponent(roleId)}/permission-bundles`,
    { identity },
  );
}

/**
 * Attach a set of permitted actions to a role. This is what makes a role grant
 * anything at all.
 *
 * READ THE STATUS. The service upserts on (role_id, bundle_code), so posting a
 * code that already exists REPLACES its permitted_actions wholesale — it can
 * narrow or empty what the role grants, and every principal holding the role
 * loses those actions from the next decision. The service distinguishes the
 * two: **201** created a new bundle, **200** replaced an existing one. Callers
 * must not report both as "attached"; `describeBundleWrite` below does it.
 *
 * No permission_bundle_id is sent, deliberately: createBundleRequest has no id
 * field and the handler builds its params without one, so a client-supplied id
 * is silently discarded and the store generates its own. Sending one would
 * imply this write is idempotent under a client-chosen id. It is not — the
 * dedup key is (role_id, bundle_code).
 */
export async function createPermissionBundle(input: {
  identity: Identity;
  roleId: string;
  bundleCode: string;
  permittedActions: string[];
}): Promise<ApiWriteResult<PermissionBundle>> {
  return apiPost<PermissionBundle>(
    SERVICE,
    `/v1/admin/roles/${encodeURIComponent(input.roleId)}/permission-bundles`,
    {
      bundle_code: input.bundleCode,
      permitted_actions: input.permittedActions,
    },
    { identity: input.identity },
  );
}

/**
 * Withdraw or restore ONE bundle's actions, leaving the role's other bundles
 * alone.
 *
 * Why this is not the same as retiring the role: retiring the role withdraws
 * every bundle it holds at once and suspends it for every principal assigned
 * it. The other workaround — reposting the bundle with a shorter action list —
 * destroys the record of what was withdrawn, because the write above
 * overwrites permitted_actions. Neither can take back one bundle and leave the
 * rest.
 *
 * The flag is read by both evaluation layers, so a retirement removes the
 * actions from direct holders AND from anyone who borrowed the role through a
 * delegation. Idempotent, and nothing is deleted: the bundle stays readable
 * because a grant recorded as `rbac:role=<code>` is only explainable while the
 * actions that role held can still be looked up.
 */
export async function setPermissionBundleActive(input: {
  identity: Identity;
  permissionBundleId: string;
  active: boolean;
}): Promise<ApiWriteResult<PermissionBundle>> {
  return apiPost<PermissionBundle>(
    SERVICE,
    `/v1/admin/permission-bundles/${encodeURIComponent(input.permissionBundleId)}/${
      input.active ? "reactivate" : "retire"
    }`,
    {},
    { identity: input.identity },
  );
}

export type CreateDelegationInput = {
  identity: Identity;
  delegatorPrincipalId: string;
  delegatePrincipalId: string;
  /** "FULL" or "ACTION_SUBSET". */
  scopeType: string;
  legalEntityId?: string;
  /** Only meaningful with ACTION_SUBSET. Whatever is named here is still
   *  intersected with the delegator's live grants. */
  delegatedActions?: string[];
  effectiveFrom: string;
  effectiveTo?: string;
};

export async function createDelegatedAuthority(
  input: CreateDelegationInput,
): Promise<ApiWriteResult<DelegatedAuthority>> {
  return apiPost<DelegatedAuthority>(
    SERVICE,
    "/v1/admin/delegated-authorities",
    {
      delegated_authority_id: crypto.randomUUID(),
      delegator_principal_id: input.delegatorPrincipalId,
      delegate_principal_id: input.delegatePrincipalId,
      scope_type: input.scopeType,
      ...(input.legalEntityId ? { legal_entity_id: input.legalEntityId } : {}),
      ...(input.delegatedActions?.length ? { delegated_actions: input.delegatedActions } : {}),
      effective_from: input.effectiveFrom,
      ...(input.effectiveTo ? { effective_to: input.effectiveTo } : {}),
    },
    { identity: input.identity },
  );
}

/** Revoke a delegation. One-way — a second revoke answers 409, which is the
 *  state machine working and worth reporting rather than swallowing. */
export async function revokeDelegatedAuthority(input: {
  identity: Identity;
  delegationId: string;
}): Promise<ApiWriteResult<DelegatedAuthority>> {
  return apiPost<DelegatedAuthority>(
    SERVICE,
    `/v1/admin/delegated-authorities/${encodeURIComponent(input.delegationId)}/revoke`,
    {},
    { identity: input.identity },
  );
}

export type CreateABACRuleInput = {
  identity: Identity;
  ruleCode: string;
  actionType: string;
  /** "REQUIRE" or "FORBID". */
  effect: string;
  attributeKey: string;
  operator: string;
  attributeValue?: string;
};

/**
 * Declare an attribute condition. Deny-only — it can take an action away and
 * can never add one.
 *
 * `tenant_id` is always sent. Omitting it authors a PLATFORM-WIDE rule that
 * binds every tenant and cannot be retired from any one tenant's console, and
 * that is gated behind a separate grant on the service. A console action must
 * never author one of those by accident, so the caller's own tenant is stated
 * explicitly — the same reasoning `createSoDRule` above already applies.
 */
export async function createABACRule(
  input: CreateABACRuleInput,
): Promise<ApiWriteResult<ABACRule>> {
  return apiPost<ABACRule>(
    SERVICE,
    "/v1/admin/abac-rules",
    {
      // NO abac_rule_id. createABACRuleRequest has no such field, so one sent
      // here is silently dropped and the service generates its own —
      // confirmed against the running service, which returned a different id
      // from the one supplied. Sending it implied this write was idempotent
      // under a client-chosen id, and it is not: the dedup key is rule_code,
      // which answers `abac_rule_code_conflict` on a collision. A retried
      // submit is therefore refused as a duplicate CODE rather than resolved
      // to the original record.
      tenant_id: input.identity.tenantId,
      rule_code: input.ruleCode,
      action_type: input.actionType,
      effect: input.effect,
      attribute_key: input.attributeKey,
      operator: input.operator,
      ...(input.attributeValue !== undefined && input.attributeValue !== ""
        ? { attribute_value: input.attributeValue }
        : {}),
    },
    { identity: input.identity },
  );
}

/** Retire or reactivate an attribute condition. */
export async function setABACRuleActive(input: {
  identity: Identity;
  abacRuleId: string;
  active: boolean;
}): Promise<ApiWriteResult<ABACRule>> {
  return apiPost<ABACRule>(
    SERVICE,
    `/v1/admin/abac-rules/${encodeURIComponent(input.abacRuleId)}/${input.active ? "reactivate" : "retire"}`,
    {},
    { identity: input.identity },
  );
}

// ─── Reading a decision without reading the schema ───────────────────────────
//
// `{"decision_outcome":"DENIED","decision_basis":"sod:conflict_with=PAYMENT_INITIATE"}`
// is the most important sentence this platform produces and one of the least
// readable. It is the answer to "why was I not allowed to do that", and the
// people who need it — the person refused, whoever administers their access, an
// auditor reconstructing a refusal months later — are not the people who wrote
// the service.
//
// The service is already careful here: it never records a bare "denied", and
// `decision_basis` always names the layer that produced the outcome. These
// helpers finish that work by saying what each basis MEANS and what to do about
// it, without dropping the stored value.

export type AuthzTone = "success" | "warning" | "danger" | "neutral" | "info";

export type BasisExplanation = {
  /** Short label for a badge — "Granted by a role", "Blocked: conflicting duties". */
  label: string;
  /** What produced this outcome, in plain words. */
  meaning: string;
  /** What to do next, if anything. */
  nextStep: string;
  tone: AuthzTone;
  /** The basis exactly as stored. */
  raw: string;
  /** The role code, delegator, conflicting action or rule code the basis
   *  names, when it names one — so a UI can link or highlight it. */
  subject?: string;
  /**
   * Which layer decided. "principal" is layer 0 — the account-status gate,
   * which runs before RBAC and refuses everything for an account that is not
   * active. It is listed first here because it decides first.
   */
  layer: "principal" | "rbac" | "delegated" | "sod" | "abac" | "none" | "unknown";
  unmapped: boolean;
};

/**
 * Say what a decision basis means.
 *
 * The nine forms the service emits, each `prefix:key=subject` or a bare word.
 * An unrecognised basis is described as unrecognised rather than guessed at,
 * and is deliberately never presented as a grant — the safe reading of a
 * decision we cannot interpret is that nothing was authorised.
 *
 * A basis form the service emits and this function does not match falls
 * through to "Reason not recognised", which is safe but useless — so every
 * new basis on the service side needs a branch here. `principal_status:` is
 * the case that made that concrete.
 */
export function explainDecisionBasis(rawBasis: string): BasisExplanation {
  const raw = rawBasis?.trim() || "(empty)";
  const subject = raw.includes("=") ? raw.slice(raw.indexOf("=") + 1).trim() : undefined;

  if (raw.startsWith("rbac:role=")) {
    return {
      label: "Allowed by a role",
      meaning:
        `The person holds the role ${subject}, that role permits this action, and the grant ` +
        "is in force for this company right now. Nothing was borrowed and nothing was " +
        "waived — this is the ordinary way access is held.",
      nextStep:
        "Nothing to do. To take this access away, either end that person's grant of the role " +
        "or retire the role itself — retiring it suspends it for everybody who holds it.",
      tone: "success",
      raw,
      subject,
      layer: "rbac",
      unmapped: false,
    };
  }

  if (raw.startsWith("delegated:from=")) {
    return {
      label: "Allowed by a delegation",
      meaning:
        "The person does not hold this access themselves. They are acting within authority " +
        `lent to them by ${subject}, who does hold it — and only for as long as that ` +
        "delegation is live and the lender still holds the access themselves.",
      nextStep:
        "Nothing to do. Be aware this access disappears the moment the delegation is revoked " +
        "or expires, or if the lender loses the access — a delegation can never confer more " +
        "than its lender currently has.",
      tone: "info",
      raw,
      subject,
      layer: "delegated",
      unmapped: false,
    };
  }

  if (raw === "no_grant") {
    return {
      label: "Not allowed — nothing grants it",
      meaning:
        "Nobody has given this person this access. No role they hold permits the action, and " +
        "no delegation lends it to them. This is a plain absence, not a block: nothing was " +
        "taken away, there was never anything there.",
      nextStep:
        "If they should have it, grant them a role that permits this action — and check the " +
        "role's permitted actions, because a role with no permission bundle grants nothing.",
      tone: "warning",
      raw,
      layer: "none",
      unmapped: false,
    };
  }

  if (raw.startsWith("sod:conflict_with=")) {
    return {
      label: "Blocked — conflicting duties",
      meaning:
        "This person WAS granted this action, and it was taken away again. They also hold " +
        `${subject}, and the two are recorded as duties one person must not combine — the ` +
        "classic case being the ability to both raise a payment and approve it.",
      nextStep:
        "This is the control working, not a fault. Either take one of the two actions away " +
        "from this person, or move one of the duties to somebody else. Do not resolve it by " +
        "deleting the conflict rule unless retiring that control is a decision somebody has " +
        "actually taken.",
      tone: "danger",
      raw,
      subject,
      layer: "sod",
      unmapped: false,
    };
  }

  if (raw === "sod:own_object_forbidden") {
    return {
      label: "Blocked — it is their own work",
      meaning:
        "This person holds the access in general, but not over this particular item, because " +
        "they are the one who prepared it. Approving your own work defeats the point of the " +
        "approval, so it is refused for this item and this item only.",
      nextStep:
        "Somebody else with the same access has to act on this item. The person's access to " +
        "everything else is unaffected — nothing needs granting or changing.",
      tone: "danger",
      raw,
      layer: "sod",
      unmapped: false,
    };
  }

  if (raw.startsWith("abac:forbidden=")) {
    return {
      label: "Blocked — a condition forbids it",
      meaning:
        "This person holds the access, and a condition on this action took it away for this " +
        `particular request. The rule is ${subject}, and it is written to forbid the action ` +
        "when something about the request is true — an amount, a channel, a classification.",
      nextStep:
        `Look up ${subject} in the conditions list to see exactly what it forbids. If the ` +
        "request genuinely should go through, it is the request that has to change, or the " +
        "rule — not the person's access, which is already sufficient.",
      tone: "danger",
      raw,
      subject,
      layer: "abac",
      unmapped: false,
    };
  }

  if (raw.startsWith("abac:require_failed=")) {
    return {
      label: "Blocked — a condition was not met",
      meaning:
        "This person holds the access, and a condition on this action requires something to " +
        `be true that was not. The rule is ${subject}. An attribute the rule names and the ` +
        "request did not supply counts as not met — that is deliberate, so a caller cannot " +
        "get past a required condition by leaving a field out.",
      nextStep:
        `Look up ${subject} to see what it requires. Most often the calling service is not ` +
        "sending the attribute at all, which is a fault in that service rather than in this " +
        "person's access.",
      tone: "danger",
      raw,
      subject,
      layer: "abac",
      unmapped: false,
    };
  }

  // Layer 0 — the principal-status gate. Must come BEFORE the fallback, and
  // it is the reason this function was revisited: without it every suspension
  // denial rendered as "Reason not recognised", which is the least useful
  // possible answer to "why was this person refused" when the answer is
  // "because their account has been stood down".
  if (raw.startsWith("principal_status:")) {
    const status = raw.slice("principal_status:".length).trim();
    const suspended = status === "SUSPENDED";
    const disabled = status === "DISABLED";
    const known = suspended || disabled;
    return {
      label: known
        ? `Blocked — the account is ${suspended ? "suspended" : "disabled"}`
        : "Blocked — the account is not active",
      meaning:
        "This has nothing to do with what the person is allowed to do. Their account itself " +
        `is recorded as ${status}, not active, and an account in that state may do nothing at ` +
        "all — every action is refused before any role or delegation is even looked at. " +
        (suspended
          ? "Suspended is normally a temporary hold somebody has applied deliberately."
          : disabled
            ? "Disabled is normally permanent — an account that has been closed."
            : "This platform does not recognise that state, so it is treated as not active, " +
              "which is the cautious reading.") +
        " Note that the roles they hold are untouched and still recorded: nothing was revoked.",
      nextStep:
        "Nothing here will fix it — granting more roles changes nothing while the account is " +
        "in this state. The account status is owned by the identity service, so it has to be " +
        "reinstated there; the moment it is, everything this person held works again exactly " +
        "as before.",
      tone: "danger",
      raw,
      subject: status,
      layer: "principal",
      unmapped: !known,
    };
  }

  if (raw.startsWith("abac:rule_unevaluable=")) {
    return {
      label: "Blocked — a condition could not be checked",
      meaning:
        `A condition on this action, ${subject}, could not be evaluated at all — it holds an ` +
        "operator or an effect this platform cannot execute. The action was refused, because " +
        "a condition nobody can check has not been met.",
      nextStep:
        "This needs a person: it is a broken rule, not a decision about anybody's access, and " +
        "it is denying this action for EVERYONE while it stands. Retire or correct " +
        `${subject}. Whoever operates the service should know it exists.`,
      tone: "danger",
      raw,
      subject,
      layer: "abac",
      unmapped: false,
    };
  }

  return {
    label: "Reason not recognised",
    meaning:
      `The decision was recorded with the reason "${raw}", which is not one this console ` +
      "knows how to read. It is deliberately not shown as allowed — nothing here can confirm " +
      "this access was granted.",
    nextStep:
      "Quote that reason to whoever operates the service. Do not rely on this decision either " +
      "way until it is explained.",
    tone: "warning",
    raw,
    subject,
    layer: "unknown",
    unmapped: true,
  };
}

export type OutcomeDescription = {
  label: string;
  tone: AuthzTone;
  raw: string;
  granted: boolean;
  unmapped: boolean;
};

/**
 * Say whether the answer was yes or no.
 *
 * An unrecognised outcome is never reported as granted. This is the value a
 * calling service gates a write on, and the safe reading of one we cannot
 * interpret is that nothing was authorised.
 */
export function describeDecisionOutcome(rawOutcome: string): OutcomeDescription {
  const raw = rawOutcome?.trim() || "(empty)";
  if (raw === "GRANTED") {
    return { label: "Allowed", tone: "success", raw, granted: true, unmapped: false };
  }
  if (raw === "DENIED") {
    return { label: "Not allowed", tone: "danger", raw, granted: false, unmapped: false };
  }
  return { label: "Needs review", tone: "warning", raw, granted: false, unmapped: true };
}

/** A whole decision in one line, for a banner or a table row. */
export function summariseDecision(decision: {
  decision_outcome: string;
  decision_basis: string;
  action_type?: string;
  principal_id?: string;
}): string {
  const outcome = describeDecisionOutcome(decision.decision_outcome);
  const basis = explainDecisionBasis(decision.decision_basis);
  const who = decision.principal_id ? `${decision.principal_id} ` : "";
  const what = decision.action_type ? `${decision.action_type}` : "this action";

  return outcome.granted
    ? `${who}may perform ${what} — ${basis.label.toLowerCase()}.`
    : `${who}may not perform ${what} — ${basis.label.toLowerCase()}.`;
}

export type RoleStatusDescription = {
  label: string;
  meaning: string;
  tone: AuthzTone;
  raw: string;
  enforcing: boolean;
};

/** Whether a role currently grants anything. */
export function describeRoleStatus(role: Role): RoleStatusDescription {
  return role.active_flag
    ? {
        label: "In force",
        meaning:
          "This role grants its permitted actions to everybody currently assigned to it. " +
          "Retiring it suspends that for all of them at once, without removing their grants.",
        tone: "success",
        raw: "active_flag=true",
        enforcing: true,
      }
    : {
        label: "Retired",
        meaning:
          "This role grants nothing, even to people who still hold it. Their grants have not " +
          "been removed, so reactivating it restores exactly the access that was suspended — " +
          "which is also why a retired role is worth keeping visible.",
        tone: "neutral",
        raw: "active_flag=false",
        enforcing: false,
      };
}

export type DelegationStatusDescription = {
  label: string;
  meaning: string;
  tone: AuthzTone;
  raw: string;
  /** True when this delegation is conferring authority right now. */
  live: boolean;
};

/**
 * Whether a delegation is conferring anything right now.
 *
 * Deliberately checks the dates as well as the revocation status, because the
 * evaluation path does: a delegation that is ACTIVE but past its end date
 * confers nothing, and calling it active here while `/v1/authorize` treats it
 * as expired would make the register disagree with the decisions.
 */
export function describeDelegationStatus(
  delegation: DelegatedAuthority,
  now: Date = new Date(),
): DelegationStatusDescription {
  if (delegation.revocation_status === "REVOKED") {
    return {
      label: "Withdrawn",
      meaning:
        "This delegation was revoked and confers nothing. It cannot be reinstated — a fresh " +
        "delegation would have to be made. The record is kept because the withdrawal of " +
        "borrowed authority is itself worth being able to prove.",
      tone: "neutral",
      raw: delegation.revocation_status,
      live: false,
    };
  }

  if (delegation.revocation_status !== "ACTIVE") {
    return {
      label: "Needs review",
      meaning:
        `The record holds the status "${delegation.revocation_status}", which is not one this ` +
        "console knows how to read. It is deliberately not shown as live.",
      tone: "warning",
      raw: delegation.revocation_status,
      live: false,
    };
  }

  if (new Date(delegation.effective_from) > now) {
    return {
      label: "Not started yet",
      meaning:
        "This delegation has been made but its start date has not arrived, so it confers " +
        "nothing yet. It will begin on its own, with nobody having to do anything.",
      tone: "info",
      raw: delegation.revocation_status,
      live: false,
    };
  }

  if (delegation.effective_to && new Date(delegation.effective_to) <= now) {
    return {
      label: "Expired",
      meaning:
        "This delegation has passed its end date and confers nothing. It was not withdrawn — " +
        "it simply ran out, which is what an end date is for.",
      tone: "neutral",
      raw: delegation.revocation_status,
      live: false,
    };
  }

  return {
    label: "Live",
    meaning:
      "This delegation is conferring authority right now. What it actually confers is limited " +
      "to what the lender currently holds themselves — it can never grant more than that, " +
      "and it shrinks automatically if the lender's own access does.",
    tone: "success",
    raw: delegation.revocation_status,
    live: true,
  };
}

/** What a delegation actually hands over, in words. */
export function describeDelegationScope(delegation: DelegatedAuthority): string {
  const where = delegation.legal_entity_id
    ? "in one company"
    : "across the whole organisation";

  if (delegation.delegated_actions && delegation.delegated_actions.length > 0) {
    const count = delegation.delegated_actions.length;
    return (
      `${count} named ${count === 1 ? "action" : "actions"}, ${where} — and only those the ` +
      "lender still holds themselves."
    );
  }

  return (
    `Everything the lender can do, ${where} — and it tracks their access, so it shrinks if ` +
    "theirs does."
  );
}

/** One attribute condition as a sentence, rather than five columns. */
export function describeABACRule(rule: ABACRule): string {
  const operator = ABAC_OPERATORS.find((o) => o.raw === rule.operator);
  const comparison = operator
    ? operator.takesValue
      ? `${operator.label} ${rule.attribute_value ?? "(nothing given)"}`
      : operator.label
    : `${rule.operator} ${rule.attribute_value ?? ""}`.trim();

  const scope = rule.tenant_id ? "" : " This rule applies to every organisation on the platform.";

  if (rule.effect === "REQUIRE") {
    return (
      `${rule.action_type} is refused unless ${rule.attribute_key} ${comparison}. ` +
      `A request that does not mention ${rule.attribute_key} at all is refused too.${scope}`
    );
  }
  if (rule.effect === "FORBID") {
    return (
      `${rule.action_type} is refused when ${rule.attribute_key} ${comparison}. ` +
      `A request that does not mention ${rule.attribute_key} is allowed through.${scope}`
    );
  }
  return (
    `This condition on ${rule.action_type} records an effect ("${rule.effect}") this console ` +
    `does not recognise. While it stands it may be refusing ${rule.action_type} for everyone — ` +
    `worth raising with whoever operates the service.${scope}`
  );
}

/**
 * One permission bundle as a sentence.
 *
 * Rendered rather than tabulated for the reason the attribute conditions are:
 * `default / true / ["PAYMENT_APPROVE","PAYMENT_VIEW"]` is three facts that
 * mean nothing apart and one thing together, and a reader should not have to
 * assemble it. The retired case is the one that has to be unmistakable — a
 * retired bundle looks exactly like a live one in a table with a boolean
 * column, and it is the difference between a role granting something and not.
 */
export function describePermissionBundle(bundle: PermissionBundle): string {
  const count = bundle.permitted_actions.length;

  if (count === 0) {
    return (
      `This set is empty, so it grants nothing. A role whose every set is empty ` +
      `permits no action at all, however it is named or assigned.`
    );
  }

  const actions = bundle.permitted_actions.join(", ");
  const noun = count === 1 ? "action" : "actions";

  if (!bundle.active_flag) {
    return (
      `Not in force. ${actions} — ${count} ${noun} the role would grant, and does not, ` +
      `because this set has been switched off. Nobody holding the role can do these, ` +
      `and nor can anyone who was lent the role. Restoring it grants them again.`
    );
  }

  return (
    `In force. ${actions} — ${count} ${noun} anyone holding this role may take, ` +
    `and anyone who has been lent this role may take too.`
  );
}

/** One SoD pair as a sentence. */
export function describeSoDRule(rule: SoDRule): string {
  const scope = rule.tenant_id
    ? ""
    : " This rule applies to every organisation on the platform and cannot be changed from here.";
  const where = rule.jurisdiction_id ? ` It applies only in ${rule.jurisdiction_id}.` : "";

  return (
    `Nobody may hold both ${rule.action_a} and ${rule.action_b}. Somebody who has been given ` +
    `both is refused either one, rather than being allowed the combination.${where}${scope}`
  );
}

/**
 * Say what a pre-flight separation-of-duties check came back with.
 *
 * Written as the sentence somebody about to click "grant" needs, because that
 * is when this runs. The two conflict sources get different words on purpose:
 * they need different remedies, and "there is a conflict" alone leaves the
 * operator to work out which.
 */
export function describeSoDValidation(
  result: SoDValidation,
  context: { subjectNamed: boolean } = { subjectNamed: false },
): { headline: string; detail: string; tone: AuthzTone } {
  const restricted = result.own_object_restricted ?? [];

  // Own-object restrictions are mentioned in every branch, including the
  // all-clear one: the grant is fine and one use of it will still be refused,
  // and finding that out later reads as a bug in the grant.
  const ownObjectNote =
    restricted.length === 0
      ? ""
      : ` Separately, and this does not block anything: ${restricted.join(", ")} ` +
        `${restricted.length === 1 ? "is" : "are"} refused on items this person prepared ` +
        "themselves. The access is real; approving your own work is what is not allowed.";

  if (result.conflict_free) {
    return {
      headline: restricted.length === 0 ? "No conflict — safe to grant" : "No conflict — safe to grant, with one caveat",
      detail:
        (context.subjectNamed
          ? "Nothing this person already holds conflicts with these actions, and the actions do not conflict with each other."
          : "These actions do not conflict with each other. Nobody was named, so this does not say whether a particular person can hold them.") +
        ownObjectNote,
      tone: restricted.length === 0 ? "success" : "info",
    };
  }

  const held = result.conflicts.filter((c) => c.source === "held");
  const internal = result.conflicts.filter((c) => c.source === "candidate");

  const parts: string[] = [];
  if (held.length > 0) {
    parts.push(
      "This person ALREADY HOLDS something that conflicts: " +
        held.map((c) => `${c.candidate_action} against ${c.conflicts_with}`).join("; ") +
        ". Granting this would leave them refused for both halves, not allowed the combination — " +
        "so something they currently hold has to be taken away first, or the duty has to go to " +
        "somebody else.",
    );
  }
  if (internal.length > 0) {
    parts.push(
      "These actions conflict WITH EACH OTHER: " +
        internal.map((c) => `${c.candidate_action} against ${c.conflicts_with}`).join("; ") +
        ". A role carrying both gives everybody who holds it two duties they may not combine, " +
        "and then refuses them both — so this set has to be split across two roles.",
    );
  }

  return {
    headline: "Conflict — do not grant this as it stands",
    detail: parts.join(" ") + ownObjectNote,
    tone: "danger",
  };
}

/**
 * Say what an entity-scope answer means for one company.
 *
 * Kept separate from `explainDecisionBasis` even though it reads the same
 * basis strings: that function explains a RECORDED DECISION about an action
 * somebody attempted, and this explains a capability nobody has exercised.
 * Reusing it would tell an operator their colleague "was refused" for a
 * question the console asked on its own.
 */
export function describeEntityScope(result: EntityScopeResult): string {
  if (!result.in_scope) {
    return (
      "Cannot act here. No role they hold covers this company, and no delegation lends them " +
      "anything in it — a plain absence rather than a block."
    );
  }
  const basis = explainDecisionBasis(result.basis);
  const via =
    basis.layer === "delegated"
      ? `on authority lent by ${basis.subject ?? "somebody else"}`
      : basis.layer === "rbac"
        ? `through the role ${basis.subject ?? "they hold"}`
        : "through a grant they hold";
  const count = result.permitted_actions?.length ?? 0;
  const what = count === 0 ? "" : ` ${count} ${count === 1 ? "action" : "actions"} available.`;
  return `Can act here ${via}.${what}`;
}

/**
 * Say whether authority is the person's own or borrowed.
 *
 * `held_directly` is the field worth surfacing, because the decision log
 * cannot: /v1/authorize names RBAC as the basis when both paths apply, so a
 * person holding an action both ways looks like ordinary role-based access.
 * For a four-eyes step that has to know who actually satisfied it, that is
 * the whole question.
 */
export function describeDelegatedAccess(
  result: DelegatedAccessEvaluation,
  options: { actionNamed: boolean } = { actionNamed: false },
): { headline: string; detail: string; tone: AuthzTone } {
  if (!result.has_delegated_access) {
    return {
      headline: "Nothing borrowed",
      detail: options.actionNamed
        ? "No live delegation lends this person this action in this company. If they can do it, " +
          "it is their own access."
        : "No live delegation lends this person anything in this company.",
      tone: "neutral",
    };
  }

  const basis = explainDecisionBasis(result.basis);
  const lender = basis.subject ?? "somebody else";
  const count = result.delegated_actions?.length ?? 0;

  if (options.actionNamed && result.held_directly) {
    return {
      headline: "Both — their own access and borrowed authority",
      detail:
        `This person can do this in their own right AND has it lent to them by ${lender}. ` +
        "That matters for any step that needs two different people: a check on the outcome " +
        "alone would report this as ordinary role-based access and could not tell you a " +
        "delegation was also in play. Revoking the delegation would not remove the access.",
      tone: "warning",
    };
  }

  return {
    headline: "Borrowed authority only",
    detail:
      `This person does not hold this themselves. They are acting within authority lent by ` +
      `${lender}, and it disappears the moment that delegation is revoked or expires, or if ` +
      `${lender} loses the access.` +
      (count > 0 ? ` ${count} ${count === 1 ? "action is" : "actions are"} lent in this company.` : ""),
    tone: "info",
  };
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
 * What an authorization failure carries beyond its message.
 *
 * The status is the only thing present in every case — this service answers
 * some refusals with a code the console can match on, and the envelope
 * middleware answers 401 ahead of the handler with something else entirely.
 */
export type AuthorizationErrorContext = {
  /** The HTTP status, when the failure had one. */
  status?: number;
  /** What a 404 means for this particular action. */
  notFound?: string;
};

/** Strip the console's own framing off a refusal, leaving the service's words. */
function authzDetail(message: string): string {
  const separator = message.indexOf(" — ");
  return separator === -1 ? message : message.slice(separator + 3).trim();
}

/** The service names its own fields; a reader named them differently on a form. */
const FIELD_WORDS: Record<string, string> = {
  principal_id: "who the question is about",
  legal_entity_id: "the company it applies to",
  action_type: "the action being asked about",
  role_code: "the role's code",
  role_name: "the role's name",
  role_scope_type: "how widely the role applies",
  bundle_code: "the set's code",
  permitted_actions: "the actions the role should permit",
  delegator_principal_id: "who is lending the authority",
  delegate_principal_id: "who is borrowing it",
  scope_type: "how much authority is being lent",
  effective_from: "the date it starts",
  domain_code: "which area the rule covers",
  action_a: "the first of the two conflicting actions",
  action_b: "the second of the two conflicting actions",
  conflict_type: "the kind of conflict",
  rule_code: "the condition's code",
  effect: "whether the condition requires or forbids",
  attribute_key: "which attribute the condition looks at",
  operator: "the comparison to make",
  tenant_id: "your organisation (which comes from your session)",
};

/**
 * Turn an authorization failure into something an operator can act on.
 *
 * IMPORTANT, and the reason this function is careful: on this service a
 * failure is NOT a denial. A denial is a 200 with `decision_outcome: DENIED`
 * and a basis that explains itself — that is the service working, and it goes
 * through `explainDecisionBasis`, not through here. Everything here is the
 * service failing to answer, and the distinction is the whole doctrine: "you
 * may not" and "we could not determine whether you may" must never read the
 * same, because the second means no decision was recorded at all.
 *
 * Nothing here returns the service's phrasing on its own. Where no wording
 * fits, the fallback says what happened and quotes the service's words as a
 * quotation, so the fact stays reportable without being the answer.
 */
export function explainAuthorizationError(
  message: string,
  context: AuthorizationErrorContext = {},
): string {
  // ── The request never reached the service ────────────────────────────────
  //
  // Matched first, and the wording matters more here than anywhere else in the
  // console: if the authorization plane is unreachable, every service that
  // guards a write behind it is refusing that write right now. That is worth
  // saying rather than reporting a port number.
  if (message.includes("is unreachable at")) {
    return "Nothing was changed. The authorization service is not running, or cannot be reached from here. While that is true, every other service that checks permissions before it writes is refusing to write — they are built to refuse rather than guess, so this shows up across the platform as permission failures. It needs to be started.";
  }
  if (message.includes("did not respond within")) {
    return "Nothing was changed. The authorization service did not answer in time. Requests that depend on a permission check are being refused while that is true, because refusing is safer than assuming — try again shortly.";
  }
  if (message.includes("non-JSON body")) {
    return "The authorization service sent back something this console could not read, so no decision can be shown. Nothing here should be relied on until that is looked into — report it.";
  }

  if (message.includes("envelope_incomplete")) {
    return "Nothing was changed. The request was missing information the service requires on every call. This is a fault in the console rather than in anything you entered — report it rather than retyping the form.";
  }

  // ── Scope and identity ──────────────────────────────────────────────────
  if (message.includes("missing_tenant_scope")) {
    return "Nothing was changed. The request carried no organisation, so the service refused it rather than guessing whose permissions to read. Sign in again.";
  }
  if (message.includes("missing_principal")) {
    return "Nothing was changed. The request did not say who was asking, so the service refused it. Sign in again.";
  }
  if (message.includes("tenant_scope_mismatch")) {
    return "Refused: this names a different organisation from the one you are signed in to. Nothing was changed — a request that could choose its own organisation would not be a scope at all.";
  }

  // ── This console's own permission to administer access ───────────────────
  //
  // authorization_denied here means the SERVICE refused this admin action —
  // not that the thing being asked about is denied. Conflating those two would
  // be the worst available error on this page.
  if (message.includes("authorization_denied")) {
    return "You do not have permission to make this change to access control. Note that this is about YOUR permission to administer access — it says nothing about the permission you were asking about. Whoever administers access can grant it.";
  }
  if (message.includes("authorization_service_unavailable")) {
    return "Nothing was changed. Your own permission to make this change could not be checked, so it was refused rather than allowed through unchecked. This is a safety refusal, not a decision about you.";
  }

  // ── Roles ───────────────────────────────────────────────────────────────
  if (message.includes("role_conflict")) {
    return "A role with that code already exists in this organisation. Role codes have to be unique, because the code is what a decision names when it explains itself — two roles sharing one would make those explanations ambiguous. Pick a different code, or use the role that already exists.";
  }
  if (message.includes("role_assignment_not_found")) {
    return (
      context.notFound ??
      "That grant has already ended, or belongs to another organisation. Reload the register — it may have been revoked since this list was drawn."
    );
  }
  if (message.includes("role_not_found")) {
    return "There is no role with that reference in this organisation. A role has to exist here before anybody can be given it — and a role defined in the upstream catalogue is not the same record as one here.";
  }
  if (message.includes("permission_bundle_not_found")) {
    return (
      context.notFound ??
      "There is no permission set with that reference in this organisation, so nothing was changed. A set belonging to another organisation reads as absent from here on purpose — one organisation cannot switch off another's permissions. Reload the role to see what it holds now."
    );
  }
  if (message.includes("legal_entity_id_required")) {
    return "Name the company this applies to. A grant that names no company is only accepted for a role scoped to the whole organisation, and this one is not — which is deliberate: an unscoped grant of a company-scoped role would apply everywhere, including companies added later.";
  }

  // ── Delegations ─────────────────────────────────────────────────────────
  if (message.includes("delegator_must_be_caller")) {
    return "Refused: you can only lend authority you hold yourself. This tried to lend somebody else's, and nothing lets one person hand out another person's access — that would make every grant on the platform forgeable.";
  }
  if (message.includes("only_delegator_may_revoke")) {
    return "Refused: only the person who lent the authority can withdraw it. Nothing was changed. If they are unavailable, the access has to be removed at its source instead — by ending the grant they are lending from.";
  }
  if (message.includes("already_revoked")) {
    return "This delegation was already withdrawn, so nothing was changed. Withdrawing is one-way and final: it cannot be done twice and it cannot be undone — a fresh delegation would have to be made.";
  }
  if (message.includes("delegated_authority_not_found")) {
    return (
      context.notFound ??
      "There is no delegation with that reference in this organisation. Reload the register to see what it holds now."
    );
  }

  // ── Attribute conditions ────────────────────────────────────────────────
  if (message.includes("unsupported_operator")) {
    return "That comparison is not one the platform can carry out, so the condition was not saved. The refusal is worth having: a condition nobody can evaluate would refuse its action for everybody, and catching it now is far cheaper than discovering it from a denial. Pick one of the comparisons offered.";
  }
  if (message.includes("unsupported_effect")) {
    return "A condition either requires something to be true or forbids it, and this was neither, so nothing was saved. Pick one of the two.";
  }
  if (message.includes("abac_rule_code_conflict")) {
    return "A condition with that code already exists. The code is what a refusal names when this condition causes it, so two conditions sharing one would make a refusal impossible to trace back. Pick a different code.";
  }
  if (message.includes("abac_rule_not_found")) {
    return (
      context.notFound ??
      "There is no condition with that reference in this organisation. Reload the list to see what it holds now."
    );
  }
  if (message.includes("invalid_abac_rule")) {
    return "The condition was rejected as incomplete or inconsistent, and nothing was saved. Check that the comparison has a value where one is needed — and none where it is not, which is the case for the two presence checks.";
  }

  // ── Jurisdiction validation on an SoD rule ──────────────────────────────
  if (message.includes("jurisdiction_not_found")) {
    return "That jurisdiction is not one the platform recognises, so the rule was not saved. The check is deliberate: a rule scoped to a jurisdiction nobody recognises would apply nowhere while looking like it applied somewhere.";
  }
  if (message.includes("jurisdiction_service_unavailable")) {
    return "Nothing was saved. The jurisdiction named on this rule could not be verified, so the rule was refused rather than stored unverified. Try again shortly, or leave the jurisdiction off to make the rule apply everywhere.";
  }

  // ── Platform scope ──────────────────────────────────────────────────────
  if (message.includes("platform_scope_not_configured")) {
    return "This asked about platform-wide access, and this deployment has not been told which entity represents the platform — so the service refused rather than inventing one. That is a configuration gap on the service, not anything you entered; whoever operates it needs to set it.";
  }

  // ── Malformed or missing ────────────────────────────────────────────────
  if (message.includes("access_decision_not_found")) {
    return (
      context.notFound ??
      "No decision with that reference exists for your organisation. A decision belonging to another organisation reads exactly the same way — that is on purpose, so nobody can confirm a reference exists by probing for it. Check it against the reference the decision reported."
    );
  }
  if (message.includes("missing_field")) {
    const named = authzDetail(message)
      .replace(/[^A-Za-z0-9_,\s-]/g, " ")
      .split(/[,\s]+/)
      .map((token) => FIELD_WORDS[token] ?? "")
      .filter(Boolean);
    return named.length > 0
      ? `Something required was left empty: ${named.join(", ")}. Nothing was saved.`
      : "Something required was left empty, so nothing was saved. Check every field and try again.";
  }
  if (message.includes("invalid_json")) {
    return "Nothing was saved. The service could not read the request this console sent — a fault in the console rather than in what you entered, so it is worth reporting rather than retyping.";
  }
  if (message.includes("store_unavailable")) {
    return "The authorization service could not reach its database, and nothing was written. This is NOT a denial — no decision was made either way, and anything waiting on one is being refused rather than allowed. Retry once it is back.";
  }

  // ── Status-based fallback ───────────────────────────────────────────────
  switch (context.status) {
    case 400:
      return "The service rejected this as invalid and saved nothing. Check what you entered and try again.";
    case 401:
      return "The service no longer accepts this session. Sign in again and repeat this.";
    case 403:
      return "Refused. Either you do not have permission to administer access here, or this named a different organisation from the one you are signed in to. Nothing was changed.";
    case 404:
      return (
        context.notFound ??
        "Nothing on record matches that reference. Check it against the registers on this page — references are long and easy to mistype."
      );
    case 409:
      return "This clashes with something already on record, so nothing was saved. Reload the page to see what is there now.";
    case 422:
      return "The service would not accept this as a valid change, and nothing was saved.";
    case 503:
      return "Nothing was changed. The authorization service, or something it depends on, was unavailable — so it refused rather than guessing. Nothing was recorded either way.";
    default:
      break;
  }
  if (context.status !== undefined && context.status >= 500) {
    return "The authorization service failed while handling this, and nothing should be assumed about the result. Reload the page and check the registers before retrying.";
  }

  return (
    "The authorization service refused this. It gave a reason this console does not have " +
    `wording for yet, repeated here as it was sent: “${authzDetail(message)}”. Reload the ` +
    "page to see where things stand, and report that wording if it keeps happening."
  );
}
