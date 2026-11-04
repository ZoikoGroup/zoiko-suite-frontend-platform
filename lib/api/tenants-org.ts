// ORG-02 (Tenant) and ORG-03 (Legal Entity) surfaces of
// tenant-entity-registry-svc (:8081).
//
// Split from tenants.ts because these are a coherent set the specification
// names, and because that file is already long enough that a reader looking for
// "what does the registry expose" should not have to hold both halves at once.
//
// Five things about these endpoints shape the console and are easy to get wrong:
//
//  1. LIFECYCLE COMMANDS ARE NAMED, NOT GENERIC. There is still a generic
//     POST /v1/tenants/{id}/lifecycle taking a target state, and the console no
//     longer uses it for anything a command covers. The reason is not style:
//     the evidence record stores the COMMAND, so a suspension applied through
//     the generic route is indistinguishable afterwards from the reversal of a
//     mistaken activation.
//
//  2. TERMINATION NEEDS A SECOND PERSON. InitiateTermination and
//     CompleteTermination are refused (422) unless approved_by_principal_id is
//     present AND different from the acting principal. Suspension deliberately
//     is not — it is an incident action. The console asks for an approver only
//     where one is required, because a field that is usually ignorable stops
//     being read.
//
//  3. EXPECTED_VERSION IS OPTIONAL BUT NOT DECORATIVE. Omitting it does not
//     skip the check: the service substitutes the version it reads, so a
//     concurrent writer is still caught. Sending the version the OPERATOR saw
//     is stronger — it catches a change made between the page rendering and the
//     button being pressed. The console sends it.
//
//  4. A SUSPENDED TENANT REFUSES WRITES WITH 409, NOT 403. That distinction is
//     the whole point: 403 sends an operator to the RBAC console, where they
//     will find nothing wrong. 409 means the tenant's own state forbids it and
//     no grant will change that.
//
//  5. AS-OF IS BUSINESS TIME. /as-of answers "what was this entity's legal name
//     on that date", not "what did we believe on that date". A backdated
//     correction changes the answer for a past date and leaves today alone.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";
import type { LegalEntity, Tenant } from "./tenants";

// ── ORG-02 §4.2: named commands ─────────────────────────────────────────────

/**
 * The five lifecycle commands, in the order a tenant meets them.
 *
 * Ordered rather than alphabetical so a picker reads as a lifecycle rather than
 * as a list of verbs.
 */
export const TENANT_COMMANDS = [
  "ActivateTenant",
  "SuspendTenant",
  "ResumeTenant",
  "InitiateTermination",
  "CompleteTermination",
] as const;

export type TenantCommand = (typeof TENANT_COMMANDS)[number];

/**
 * Which commands are reachable from a given lifecycle state.
 *
 * Mirrors the service's own table. Duplicated deliberately: the console uses it
 * to avoid offering a button that can only fail, and the service enforces it
 * regardless — a client-side table that drifts produces a confusing 422, not a
 * wrong write.
 */
export const COMMANDS_BY_STATE: Record<string, readonly TenantCommand[]> = {
  ONBOARDING: ["ActivateTenant"],
  ACTIVE: ["SuspendTenant", "InitiateTermination"],
  SUSPENDED: ["ResumeTenant", "InitiateTermination"],
  OFFBOARDING: ["CompleteTermination"],
  TERMINATED: [],
};

/** Commands the service refuses without an independent approver. */
export const COMMANDS_REQUIRING_APPROVAL: readonly TenantCommand[] = [
  "InitiateTermination",
  "CompleteTermination",
];

export function commandRequiresApproval(command: string): boolean {
  return (COMMANDS_REQUIRING_APPROVAL as readonly string[]).includes(command);
}

/**
 * Plain-English labels.
 *
 * The console shows these instead of the wire names. The wire name is still
 * shown alongside wherever an operator may need to quote it in a ticket or
 * match it against the lifecycle history.
 */
export const TENANT_COMMAND_LABELS: Record<string, string> = {
  ActivateTenant: "Activate",
  SuspendTenant: "Suspend",
  ResumeTenant: "Resume",
  InitiateTermination: "Begin termination",
  CompleteTermination: "Complete termination",
  CreateTenant: "Created",
  ChangeDefaultLocale: "Changed defaults",
};

/**
 * What each command does, in a sentence an operator can act on.
 *
 * These are consequences, not restatements of the name: an operator about to
 * suspend a tenant needs to know what stops working, not that suspending
 * suspends.
 */
export const TENANT_COMMAND_CONSEQUENCES: Record<string, string> = {
  ActivateTenant:
    "Ends onboarding. The tenant can transact normally from this point.",
  SuspendTenant:
    "Blocks every write for this tenant across the platform — new entities, workspaces, jurisdiction assignments and profile changes all begin refusing. Reads keep working so you can investigate. Reversible with Resume.",
  ResumeTenant: "Lifts a suspension. Writes begin working again immediately.",
  InitiateTermination:
    "Begins offboarding. Writes stop and do not resume — the only way out is Complete termination. Needs a second approver.",
  CompleteTermination:
    "Final. The tenant moves to TERMINATED and cannot be reactivated. Governed records are retained, not deleted. Needs a second approver.",
};

export type TenantCommandResult = {
  from_state: string;
  to_state: string;
  record_version: number;
  status: string;
};

export type ExecuteTenantCommandInput = {
  reason: string;
  expected_version?: number;
  approved_by_principal_id?: string;
  correlation_id?: string;
};

export function executeTenantCommand(
  tenantId: string,
  command: string,
  input: ExecuteTenantCommandInput,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<TenantCommandResult>> {
  return apiPost<TenantCommandResult>(
    "tenantRegistry",
    `/v1/tenants/${tenantId}/commands/${command}`,
    input,
    { identity, correlationId },
  );
}

export type ChangeDefaultLocaleInput = {
  primary_locale?: string;
  primary_timezone?: string;
  reason: string;
  expected_version?: number;
  correlation_id?: string;
};

export function changeDefaultLocale(
  tenantId: string,
  input: ChangeDefaultLocaleInput,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<Tenant>> {
  return apiPost<Tenant>("tenantRegistry", `/v1/tenants/${tenantId}/defaults`, input, {
    identity,
    correlationId,
  });
}

// ── ORG-02 §4.2: read surfaces ──────────────────────────────────────────────

export type TenantLifecycleEvent = {
  lifecycle_event_id: string;
  tenant_id: string;
  from_state: string | null;
  to_state: string;
  command_name: string;
  reason: string;
  actor_principal_id: string;
  approved_by_principal_id: string | null;
  correlation_id: string | null;
  occurred_at: string;
};

export function listTenantLifecycleHistory(
  tenantId: string,
  identity: Identity,
): Promise<ApiResult<TenantLifecycleEvent[]>> {
  return apiGet<TenantLifecycleEvent[]>(
    "tenantRegistry",
    `/v1/tenants/${tenantId}/lifecycle-history`,
    { identity },
  );
}

export type TenantDefaults = {
  tenant_id: string;
  default_currency_code: string;
  primary_timezone: string;
  primary_locale: string;
  default_data_residency_policy_id: string;
  record_version: number;
};

export function getTenantDefaults(
  tenantId: string,
  identity: Identity,
): Promise<ApiResult<TenantDefaults>> {
  return apiGet<TenantDefaults>("tenantRegistry", `/v1/tenants/${tenantId}/defaults`, {
    identity,
  });
}

// ── ORG-02 §4.2: host bindings ──────────────────────────────────────────────

export type TenantHostBinding = {
  host_binding_id: string;
  hostname: string;
  tenant_id: string;
  is_primary: boolean;
  active_flag: boolean;
  created_at: string;
  created_by_principal_id: string;
};

export function listTenantHostBindings(
  tenantId: string,
  identity: Identity,
): Promise<ApiResult<TenantHostBinding[]>> {
  return apiGet<TenantHostBinding[]>(
    "tenantRegistry",
    `/v1/tenants/${tenantId}/host-bindings`,
    { identity },
  );
}

export function bindTenantHost(
  tenantId: string,
  input: { hostname: string; is_primary?: boolean; correlation_id?: string },
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<TenantHostBinding>> {
  return apiPost<TenantHostBinding>(
    "tenantRegistry",
    `/v1/tenants/${tenantId}/host-bindings`,
    input,
    { identity, correlationId },
  );
}

// ── ORG-03 §4.3: profile versions ───────────────────────────────────────────

export type LegalEntityProfileVersion = {
  profile_version_id: string;
  tenant_id: string;
  legal_entity_id: string;
  version_number: number;
  legal_name: string;
  trading_name: string | null;
  legal_form_code: string | null;
  legal_form_source: string | null;
  legal_form_local_text: string | null;
  registration_number: string | null;
  registry_authority: string | null;
  registered_office: string | null;
  incorporation_jurisdiction_id: string | null;
  default_currency_code: string | null;
  /** Business time — when the fact was true in the world. */
  effective_from: string;
  effective_to: string | null;
  /** Record time — when this platform learned it. Differs when backdated. */
  recorded_at: string;
  superseded_at: string | null;
  change_reason: string;
  source_evidence_ref: string | null;
  created_by_principal_id: string;
  approved_by_principal_id: string | null;
};

export const PROFILE_CHANGE_REASONS = [
  "AMENDMENT",
  "LEGAL_NAME_CHANGE",
  "REGISTERED_OFFICE_CHANGE",
  "CORRECTION",
] as const;

/**
 * Why each reason exists, phrased as the downstream consequence.
 *
 * AMENDMENT and CORRECTION are the pair operators get wrong, and the cost of
 * getting it wrong is real: a correction means reports already issued against
 * the prior version were misstated, and somebody has to decide whether to
 * restate them.
 */
export const PROFILE_CHANGE_REASON_HELP: Record<string, string> = {
  AMENDMENT: "The facts changed. The previous version was correct for its period.",
  LEGAL_NAME_CHANGE: "The entity renamed itself. History keeps the old name.",
  REGISTERED_OFFICE_CHANGE: "The registered office moved.",
  CORRECTION:
    "The previous version was WRONG, not superseded. Anything already reported against it was misstated and may need restating.",
  INITIAL: "Recorded when the entity was created.",
  INITIAL_BACKFILL:
    "Reconstructed by a migration for an entity that predates profile versioning — not a recorded creation.",
};

/** Fields the service refuses to change without an independent approver. */
export const APPROVAL_REQUIRED_FIELDS = [
  "legal_name",
  "registration_number",
  "incorporation_jurisdiction_id",
] as const;

export type AmendLegalProfileInput = {
  legal_name?: string;
  trading_name?: string;
  legal_form_code?: string;
  legal_form_source?: string;
  legal_form_local_text?: string;
  registration_number?: string;
  registry_authority?: string;
  registered_office?: string;
  incorporation_jurisdiction_id?: string;
  default_currency_code?: string;
  effective_from?: string;
  change_reason?: string;
  source_evidence_ref?: string;
  approved_by_principal_id?: string;
  expected_version?: number;
  correlation_id?: string;
};

/** True when this amendment touches a field under segregation of duties. */
export function amendmentRequiresApproval(input: AmendLegalProfileInput): boolean {
  return APPROVAL_REQUIRED_FIELDS.some(
    (f) => input[f] !== undefined && input[f] !== "",
  );
}

export function amendLegalProfile(
  entityId: string,
  input: AmendLegalProfileInput,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<LegalEntityProfileVersion>> {
  return apiPost<LegalEntityProfileVersion>(
    "tenantRegistry",
    `/v1/entities/${entityId}/profile-amendments`,
    input,
    { identity, correlationId },
  );
}

export function changeLegalName(
  entityId: string,
  input: {
    legal_name: string;
    effective_from?: string;
    source_evidence_ref?: string;
    approved_by_principal_id?: string;
    expected_version?: number;
    correlation_id?: string;
  },
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<LegalEntityProfileVersion>> {
  return apiPost<LegalEntityProfileVersion>(
    "tenantRegistry",
    `/v1/entities/${entityId}/legal-name`,
    input,
    { identity, correlationId },
  );
}

export function changeRegisteredOffice(
  entityId: string,
  input: {
    registered_office: string;
    effective_from?: string;
    source_evidence_ref?: string;
    approved_by_principal_id?: string;
    expected_version?: number;
    correlation_id?: string;
  },
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<LegalEntityProfileVersion>> {
  return apiPost<LegalEntityProfileVersion>(
    "tenantRegistry",
    `/v1/entities/${entityId}/registered-office`,
    input,
    { identity, correlationId },
  );
}

export function listEntityVersions(
  entityId: string,
  identity: Identity,
): Promise<ApiResult<LegalEntityProfileVersion[]>> {
  return apiGet<LegalEntityProfileVersion[]>(
    "tenantRegistry",
    `/v1/entities/${entityId}/versions`,
    { identity },
  );
}

export type EntityAsOf = {
  legal_entity_id: string;
  tenant_id: string;
  entity_code: string;
  entity_type: string;
  entity_status: string;
  as_of: string;
  /** Null when the entity existed but had no recorded profile then. */
  profile: LegalEntityProfileVersion | null;
};

/**
 * Reconstruct an entity at a business instant.
 *
 * `asOf` accepts a bare YYYY-MM-DD, which is what a financial reconstruction
 * actually asks for ("as the books stood on 2026-03-31"). The service reads a
 * bare date as midnight UTC.
 */
export function getLegalEntityAsOf(
  entityId: string,
  asOf: string,
  identity: Identity,
): Promise<ApiResult<EntityAsOf>> {
  const query = asOf ? `?as_of=${encodeURIComponent(asOf)}` : "";
  return apiGet<EntityAsOf>("tenantRegistry", `/v1/entities/${entityId}/as-of${query}`, {
    identity,
  });
}

export function findByRegistryNumber(
  registrationNumber: string,
  jurisdictionId: string,
  identity: Identity,
): Promise<ApiResult<LegalEntity[]>> {
  const params = new URLSearchParams({ registration_number: registrationNumber });
  if (jurisdictionId) params.set("jurisdiction_id", jurisdictionId);
  return apiGet<LegalEntity[]>(
    "tenantRegistry",
    `/v1/entities/by-registry-number?${params.toString()}`,
    { identity },
  );
}

// ── ORG-03 §8 NP5: registry conflict quarantine ─────────────────────────────

export type EntityRegistryConflict = {
  conflict_id: string;
  tenant_id: string;
  registration_number: string;
  jurisdiction_id: string;
  existing_legal_entity_id: string;
  attempted_payload: Record<string, unknown>;
  status: string;
  resolution_note: string | null;
  resolved_by_principal_id: string | null;
  resolved_at: string | null;
  detected_at: string;
  detected_by_principal_id: string;
  correlation_id: string | null;
};

export const CONFLICT_RESOLUTIONS = [
  "RESOLVED_DISTINCT",
  "RESOLVED_DUPLICATE",
  "DISMISSED",
] as const;

export const CONFLICT_RESOLUTION_LABELS: Record<string, string> = {
  RESOLVED_DISTINCT: "Genuinely different entities",
  RESOLVED_DUPLICATE: "The same entity recorded twice",
  DISMISSED: "Not worth pursuing",
  OPEN: "Awaiting a decision",
};

export const CONFLICT_RESOLUTION_HELP: Record<string, string> = {
  RESOLVED_DISTINCT:
    "Two real entities happen to share a registry number — common across registry authorities inside one jurisdiction. Nothing further happens.",
  RESOLVED_DUPLICATE:
    "Records the conclusion only. It does NOT merge anything: destructive merge is prohibited, so acting on this is a separate governed operation.",
  DISMISSED: "Closes the item without a finding either way.",
};

export function listRegistryConflicts(
  identity: Identity,
  includeResolved = false,
): Promise<ApiResult<EntityRegistryConflict[]>> {
  const query = includeResolved ? "?status=all" : "";
  return apiGet<EntityRegistryConflict[]>(
    "tenantRegistry",
    `/v1/registry-conflicts${query}`,
    { identity },
  );
}

export function resolveRegistryConflict(
  conflictId: string,
  input: { status: string; resolution_note: string; correlation_id?: string },
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<void>> {
  return apiPost<void>(
    "tenantRegistry",
    `/v1/registry-conflicts/${conflictId}/resolution`,
    input,
    { identity, correlationId },
  );
}
