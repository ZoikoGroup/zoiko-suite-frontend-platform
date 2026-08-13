// tenant-entity-registry-svc (:8081) — the authoritative registry of tenants,
// legal entities, their hierarchy, jurisdiction assignments, data residency
// policies and tax identity headers.
//
// This is the root of the platform's data model: a tenant_id from here scopes
// row-level security in every other service, and a legal_entity_id from here is
// the authorization scope authorization-svc evaluates grants against. Nothing
// else can be created until a tenant exists.
//
// Six properties of this service shape the console and are easy to get wrong:
//
//  1. RLS IS REAL, AND IT IS DRIVEN BY X-Tenant-Id. Every read is scoped to the
//     header the console sends. Omitting it does not error — it returns an empty
//     list or a 404, which reads as "nothing here" rather than "you didn't say
//     who you are". Every call below therefore sends the session identity.
//
//  2. STATUS AND LIFECYCLE ARE DIFFERENT FIELDS. A tenant has both `status`
//     (ACTIVE/SUSPENDED/ARCHIVED) and `lifecycle_state`
//     (ONBOARDING/ACTIVE/SUSPENDED/OFFBOARDING), and only the second has a
//     state machine and an endpoint. A tenant is created `status: ACTIVE` while
//     still `lifecycle_state: ONBOARDING`; showing one and calling it "the
//     status" misreports the other.
//
//  3. PROVISIONING ALWAYS CREATES A RESIDENCY POLICY, and that policy has NO
//     REGION. `default_data_residency_policy_id` in the request is accepted and
//     ignored — no policy can exist before the tenant does. The generated policy
//     has residency_region_id unset, so /residency-region answers 409
//     `region unresolved` until an operator assigns one. That 409 is a real
//     state, not a failure, and the page says so.
//
//  4. LIFECYCLE AND STATUS TRANSITIONS RETURN 204 WITH NO BODY. The write
//     succeeded and there is nothing to render — the caller must re-read to show
//     the new state.
//
//  5. END-DATING USES DELETE BUT DELETES NOTHING. Both /entity-hierarchies/{id}
//     and /entity-jurisdictions/{id} set effective_to from a required `end_date`
//     query parameter, per the no-hard-delete doctrine. The row remains.
//
//  6. JURISDICTION IDS ARE VALIDATED FAIL-CLOSED against jurisdiction-rules-svc
//     on assignment, entity creation and tax bundle creation. An unknown id is
//     400; an unreachable jurisdiction service is 503. The console offers a
//     picker reading the same register rather than a free-text UUID field.

import { apiDelete, apiGet, apiPost, type ApiResult, type ApiWriteResult } from "./client";
import type { Identity } from "./client";

// ── Wire shapes. Field names match the Go json tags exactly. ─────────────────

export type Tenant = {
  tenant_id: string;
  tenant_code: string;
  legal_name: string;
  trading_name: string | null;
  status: string;
  default_currency_code: string;
  primary_timezone: string;
  primary_locale: string;
  default_data_residency_policy_id: string;
  lifecycle_state: string;
  created_at: string;
  updated_at: string;
  created_by_principal_id: string;
  updated_by_principal_id: string;
};

export type LegalEntity = {
  legal_entity_id: string;
  tenant_id: string;
  entity_code: string;
  legal_name: string;
  trading_name: string | null;
  registration_number: string | null;
  /** Structural header only — the tax identifier itself lives in the Tax Service. */
  tax_identity_bundle_id: string | null;
  entity_type: string;
  incorporation_date: string | null;
  default_currency_code: string;
  fiscal_calendar_id: string;
  parent_legal_entity_id: string | null;
  entity_status: string;
  primary_jurisdiction_id: string;
  data_residency_policy_id: string;
  created_at: string;
  updated_at: string;
  created_by_principal_id: string;
  updated_by_principal_id: string;
};

export type EntityJurisdictionAssignment = {
  assignment_id: string;
  tenant_id: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  assignment_type: string;
  effective_from: string;
  /** null = open-ended. Set by the end-date route, which does not delete. */
  effective_to: string | null;
  source_basis: string;
  created_at: string;
  created_by_principal_id: string;
};

export type DataResidencyPolicy = {
  data_residency_policy_id: string;
  tenant_id: string;
  policy_name: string;
  policy_code: string;
  residency_mode: string;
  conflict_resolution_mode: string;
  residency_region_id: string | null;
  active_flag: boolean;
  created_at: string;
  created_by_principal_id: string;
};

export type ResidencyRegion = {
  residency_region_id: string;
  region_code: string;
  region_name: string;
};

export type ResolvedTenantRegion = {
  tenant_id: string;
  region_code: string;
  region_name: string;
};

export type TaxIdentityBundle = {
  tax_identity_bundle_id: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  status: string;
  effective_from: string;
  effective_to: string | null;
  data_classification: string;
  created_at: string;
  created_by_principal_id: string;
};

export type EntityStatusResponse = {
  entity_id: string;
  tenant_id: string;
  entity_status: string;
};

// ── State machines, mirrored from internal/domain/enums.go ──────────────────

/**
 * Tenant lifecycle, exactly as ValidTenantLifecycleTransitions enforces it.
 * OFFBOARDING is terminal. Note ONBOARDING can only go to ACTIVE — a tenant
 * cannot be suspended before it has been activated.
 */
export const TENANT_LIFECYCLE_TRANSITIONS: Record<string, readonly string[]> = {
  ONBOARDING: ["ACTIVE"],
  ACTIVE: ["SUSPENDED", "OFFBOARDING"],
  SUSPENDED: ["ACTIVE", "OFFBOARDING"],
  OFFBOARDING: [],
};

/** Entity status machine. DISSOLVED is terminal. */
export const ENTITY_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  ACTIVE: ["DORMANT", "SUSPENDED", "DISSOLVED"],
  DORMANT: ["ACTIVE", "DISSOLVED"],
  SUSPENDED: ["ACTIVE", "DISSOLVED"],
  DISSOLVED: [],
};

export const ENTITY_TYPES = ["SUBSIDIARY", "BRANCH", "HOLDING", "OPERATIONAL"] as const;
export const JURISDICTION_ASSIGNMENT_TYPES = ["PRIMARY", "SECONDARY", "TAX_ONLY", "FILING_ONLY"] as const;
export const RESIDENCY_MODES = ["STRICT_REGION", "PREFERRED_REGION", "FOLLOW_ENTITY"] as const;
export const CONFLICT_RESOLUTION_MODES = ["FAIL_CLOSED", "LOG_AND_PROCEED", "ESCALATE"] as const;
export const TAX_BUNDLE_STATUSES = ["PENDING", "ACTIVE", "EXPIRED", "SUPERSEDED"] as const;

/** Terminal states — nothing transitions out of these. */
export function isTenantTerminal(lifecycleState: string): boolean {
  return lifecycleState === "OFFBOARDING";
}

export function isEntityTerminal(status: string): boolean {
  return status === "DISSOLVED";
}

/**
 * A malformed UUID in a path reaches the pg driver and returns 500/503 rather
 * than 404 — the same trap purchase-order-svc and document-vault-svc have. The
 * console pre-validates so a typo does not read as an outage.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

// ── Reads ───────────────────────────────────────────────────────────────────

export function getTenant(tenantId: string, identity: Identity): Promise<ApiResult<Tenant>> {
  return apiGet<Tenant>("tenantRegistry", `/v1/tenants/${tenantId}`, { identity });
}

/**
 * There is no "list tenants" endpoint — the registry is scoped by RLS and a
 * caller only ever has one tenant. The console reads the session tenant.
 */
export function getSessionTenant(identity: Identity): Promise<ApiResult<Tenant>> {
  return getTenant(identity.tenantId ?? "", identity);
}

export function listEntities(tenantId: string, identity: Identity): Promise<ApiResult<LegalEntity[]>> {
  return apiGet<LegalEntity[]>("tenantRegistry", `/v1/tenants/${tenantId}/entities`, { identity });
}

export function getEntity(entityId: string, identity: Identity): Promise<ApiResult<LegalEntity>> {
  return apiGet<LegalEntity>("tenantRegistry", `/v1/entities/${entityId}`, { identity });
}

export function getEntityStatus(entityId: string, identity: Identity): Promise<ApiResult<EntityStatusResponse>> {
  return apiGet<EntityStatusResponse>("tenantRegistry", `/v1/entities/${entityId}/status`, { identity });
}

export function listEntityJurisdictions(
  entityId: string,
  identity: Identity,
): Promise<ApiResult<EntityJurisdictionAssignment[]>> {
  return apiGet<EntityJurisdictionAssignment[]>("tenantRegistry", `/v1/entities/${entityId}/jurisdictions`, {
    identity,
  });
}

export function listTaxIdentityBundles(
  entityId: string,
  identity: Identity,
): Promise<ApiResult<TaxIdentityBundle[]>> {
  return apiGet<TaxIdentityBundle[]>("tenantRegistry", `/v1/entities/${entityId}/tax-identity-bundles`, {
    identity,
  });
}

export function listResidencyRegions(identity: Identity): Promise<ApiResult<ResidencyRegion[]>> {
  return apiGet<ResidencyRegion[]>("tenantRegistry", "/v1/residency-regions", { identity });
}

export function getResidencyPolicy(policyId: string, identity: Identity): Promise<ApiResult<DataResidencyPolicy>> {
  return apiGet<DataResidencyPolicy>("tenantRegistry", `/v1/residency-policies/${policyId}`, { identity });
}

/**
 * Resolve the tenant's hosting region — the lookup GTRM's ingress uses.
 *
 * 409 is expected, not broken: provisioning always creates a residency policy
 * with no region, so this answers 409 until an operator assigns one. Callers
 * must render that as "no region assigned yet", never as an error.
 */
export function resolveTenantRegion(
  tenantId: string,
  identity: Identity,
): Promise<ApiResult<ResolvedTenantRegion>> {
  return apiGet<ResolvedTenantRegion>("tenantRegistry", `/v1/tenants/${tenantId}/residency-region`, { identity });
}

// ── Writes ──────────────────────────────────────────────────────────────────

export type ProvisionTenantInput = {
  tenant_code: string;
  legal_name: string;
  trading_name?: string;
  default_currency_code: string;
  primary_timezone: string;
  primary_locale: string;
};

/**
 * Provision a tenant. 201 on success.
 *
 * This is the one call with no tenant to scope to — it is what creates the
 * tenant — so the backend authorizes it against a configured platform scope
 * rather than a tenant. A principal needs TENANT_PROVISION granted against
 * that scope, not against any tenant.
 */
export function provisionTenant(
  input: ProvisionTenantInput,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<Tenant>> {
  return apiPost<Tenant>("tenantRegistry", "/v1/tenants", input, { identity, correlationId });
}

/** Lifecycle transition. Returns 204 with no body. */
export function transitionTenantLifecycle(
  tenantId: string,
  targetState: string,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<void>> {
  return apiPost<void>(
    "tenantRegistry",
    `/v1/tenants/${tenantId}/lifecycle`,
    { target_state: targetState, correlation_id: correlationId ?? "" },
    { identity, correlationId },
  );
}

export type CreateEntityInput = {
  tenant_id: string;
  entity_code: string;
  legal_name: string;
  trading_name?: string;
  entity_type: string;
  default_currency_code: string;
  fiscal_calendar_id: string;
  primary_jurisdiction_id: string;
  data_residency_policy_id: string;
  correlation_id?: string;
};

export function createEntity(
  input: CreateEntityInput,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<LegalEntity>> {
  return apiPost<LegalEntity>("tenantRegistry", "/v1/entities", input, { identity, correlationId });
}

/** Entity status transition. Returns 204 with no body. */
export function transitionEntityStatus(
  entityId: string,
  newStatus: string,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<void>> {
  return apiPost<void>(
    "tenantRegistry",
    `/v1/entities/${entityId}/status`,
    { new_status: newStatus, correlation_id: correlationId ?? "" },
    { identity, correlationId },
  );
}

export type AssignJurisdictionInput = {
  jurisdiction_id: string;
  assignment_type: string;
  effective_from: string;
  source_basis: string;
  correlation_id?: string;
};

/**
 * Assign a jurisdiction to an entity.
 *
 * jurisdiction_id is validated synchronously against jurisdiction-rules-svc and
 * fails closed: 400 for an unknown id, 503 when that service is unreachable.
 * Those are different facts and the console reports them apart.
 */
export function assignJurisdiction(
  entityId: string,
  input: AssignJurisdictionInput,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<EntityJurisdictionAssignment>> {
  return apiPost<EntityJurisdictionAssignment>(
    "tenantRegistry",
    `/v1/entities/${entityId}/jurisdictions`,
    input,
    { identity, correlationId },
  );
}

/**
 * End-date a jurisdiction assignment. DELETE, but nothing is deleted — the row
 * gets an effective_to and stays in the register.
 */
export function endDateJurisdictionAssignment(
  assignmentId: string,
  endDate: string,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<void>> {
  return apiDelete<void>("tenantRegistry", `/v1/entity-jurisdictions/${assignmentId}`, {
    query: { end_date: endDate },
    identity,
    correlationId,
  });
}

export type CreateResidencyPolicyInput = {
  tenant_id: string;
  policy_name: string;
  policy_code: string;
  residency_mode: string;
  conflict_resolution_mode: string;
  residency_region_id?: string;
  correlation_id?: string;
};

export function createResidencyPolicy(
  input: CreateResidencyPolicyInput,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<DataResidencyPolicy>> {
  return apiPost<DataResidencyPolicy>("tenantRegistry", "/v1/residency-policies", input, {
    identity,
    correlationId,
  });
}

export type CreateTaxIdentityBundleInput = {
  jurisdiction_id: string;
  effective_from: string;
  effective_to?: string;
  correlation_id?: string;
};

/**
 * Create a tax identity bundle HEADER. Deliberately carries no tax registration
 * number: the identifier itself and its evidence live in the Tax Service, so
 * regulated PII stays in one place. A form that asked for a tax number here
 * would have nowhere to put it.
 */
export function createTaxIdentityBundle(
  entityId: string,
  input: CreateTaxIdentityBundleInput,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<TaxIdentityBundle>> {
  return apiPost<TaxIdentityBundle>(
    "tenantRegistry",
    `/v1/entities/${entityId}/tax-identity-bundles`,
    input,
    { identity, correlationId },
  );
}

/** Tax bundle status transition. Returns 204 with no body. */
export function transitionTaxIdentityBundleStatus(
  bundleId: string,
  newStatus: string,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<void>> {
  return apiPost<void>(
    "tenantRegistry",
    `/v1/tax-identity-bundles/${bundleId}/status`,
    { new_status: newStatus, correlation_id: correlationId ?? "" },
    { identity, correlationId },
  );
}
