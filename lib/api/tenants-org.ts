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

// ── TER-FE-1: Registry Summary ────────────────────────────────────────────────

export type RegistrySummary = {
  active_tenants: number;
  active_legal_entities: number;
  approvals_awaiting_decision: number;
  open_registry_conflicts: number;
  open_party_resolution_cases: number;
};

/**
 * GetRegistrySummary returns KPIs for the console header.
 * TER-FE-1: Summary route for the Tenants & Entities console page.
 */
export function getRegistrySummary(
  tenantId: string,
  identity: Identity,
): Promise<ApiResult<RegistrySummary>> {
  return apiGet<RegistrySummary>("tenantRegistry", `/v1/registry/summary`, { identity });
}

// ── Approvals (ORG-02/03 Maker-Checker) ──────────────────────────────────────

export type ApprovalRequest = {
  approval_request_id: string;
  tenant_id: string;
  subject_type: string;
  subject_id: string;
  command_name: string;
  payload_fingerprint: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "STALE";
  requested_by_principal_id: string;
  requested_at: string;
  expires_at: string;
  decided_by_principal_id?: string;
  decided_at?: string;
  decision_note?: string;
};

export type ApproveRequestBody = {
  payload_fingerprint: string;
  decision_note?: string;
  correlation_id?: string;
};

export type RejectRequestBody = {
  payload_fingerprint: string;
  decision_note?: string;
  correlation_id?: string;
};

export function listApprovalRequests(
  identity: Identity,
  pendingOnly = false,
): Promise<ApiResult<ApprovalRequest[]>> {
  const query = pendingOnly ? "?status=pending" : "?status=all";
  return apiGet<ApprovalRequest[]>("tenantRegistry", `/v1/approval-requests${query}`, { identity });
}

export function getApprovalRequest(
  approvalRequestId: string,
  identity: Identity,
): Promise<ApiResult<ApprovalRequest>> {
  return apiGet<ApprovalRequest>("tenantRegistry", `/v1/approval-requests/${approvalRequestId}`, { identity });
}

export function approveApprovalRequest(
  approvalRequestId: string,
  input: ApproveRequestBody,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<void>> {
  return apiPost<void>("tenantRegistry", `/v1/approval-requests/${approvalRequestId}/approve`, input, { identity, correlationId });
}

export function rejectApprovalRequest(
  approvalRequestId: string,
  input: RejectRequestBody,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<void>> {
  return apiPost<void>("tenantRegistry", `/v1/approval-requests/${approvalRequestId}/reject`, input, { identity, correlationId });
}

// ── Ownership & Control (ORG-04) ──────────────────────────────────────────────

export type OwnershipRelationship = {
  relationship_id: string;
  tenant_id: string;
  parent_legal_entity_id: string;
  child_legal_entity_id: string;
  relationship_kind: string;
  ownership_pct: number;
  voting_pct: number;
  control_type: string;
  status: "PROPOSED" | "ACTIVE" | "SUPERSEDED" | "ENDED";
  valid_from: string;
  valid_to?: string;
  evidence_ref: string;
  reason: string;
  proposed_by_principal_id: string;
  decided_by_principal_id?: string;
  decided_at?: string;
  ended_by_principal_id?: string;
  ended_at?: string;
  record_version: number;
};

export type OwnershipGraph = {
  root_legal_entity_id: string;
  as_of: string;
  relationships: Array<{
    parent_legal_entity_id: string;
    child_legal_entity_id: string;
    ownership_pct: number;
    voting_pct: number;
    control_type: string;
    path: string[];
  }>;
};

export type ControlChain = {
  chains: Array<{
    path: string[];
    effective_ownership_pct: number;
    effective_voting_pct: number;
  }>;
};

export type SoDValidationRequest = {
  parent_legal_entity_id: string;
  child_legal_entity_id: string;
  relationship_kind: string;
  ownership_pct: number;
  voting_pct: number;
};

export type SoDValidationResult = {
  allowed: boolean;
  violations: string[];
};

export function listOwnershipRelationships(
  identity: Identity,
  asOf?: string,
): Promise<ApiResult<OwnershipRelationship[]>> {
  const query = asOf ? `?as_of=${asOf}` : "";
  return apiGet<OwnershipRelationship[]>("tenantRegistry", `/v1/ownership-relationships${query}`, { identity });
}

export function getOwnershipRelationship(
  relationshipId: string,
  identity: Identity,
): Promise<ApiResult<OwnershipRelationship>> {
  return apiGet<OwnershipRelationship>("tenantRegistry", `/v1/ownership-relationships/${relationshipId}`, { identity });
}

export function getOwnershipGraph(
  rootEntityId: string,
  asOf: string,
  identity: Identity,
): Promise<ApiResult<OwnershipGraph>> {
  return apiGet<OwnershipGraph>("tenantRegistry", `/v1/ownership-graph?as_of=${asOf}&root=${rootEntityId}`, { identity });
}

export function getEntityGroup(
  entityId: string,
  asOf: string,
  identity: Identity,
): Promise<ApiResult<{ group: { parent_legal_entity_id: string; child_legal_entity_id: string; ownership_pct: number }[] }>> {
  return apiGet("tenantRegistry", `/v1/entities/${entityId}/group?as_of=${asOf}`, { identity });
}

export function getEntityParents(
  entityId: string,
  asOf: string,
  identity: Identity,
): Promise<ApiResult<{ parents: { parent_legal_entity_id: string; ownership_pct: number }[] }>> {
  return apiGet("tenantRegistry", `/v1/entities/${entityId}/parents?as_of=${asOf}`, { identity });
}

export function getControlChain(
  entityId: string,
  asOf: string,
  identity: Identity,
): Promise<ApiResult<ControlChain>> {
  return apiGet<ControlChain>("tenantRegistry", `/v1/entities/${entityId}/control-chain?as_of=${asOf}`, { identity });
}

export function validateSoD(
  input: SoDValidationRequest,
  identity: Identity,
): Promise<ApiResult<SoDValidationResult>> {
  return apiPost<SoDValidationResult>("tenantRegistry", `/v1/sod/validate`, input, { identity });
}

// ── Parties & Golden Record (ORG-07/MDM-05) ──────────────────────────────────

export type Party = {
  party_id: string;
  tenant_id: string;
  party_kind: string;
  source_class: string;
  legal_name: string;
  golden_record_version: number;
  created_at: string;
  created_by_principal_id: string;
};

export type PartySummary = {
  party_id: string;
  party_kind: string;
  source_class: string;
  legal_name: string;
  current_version: number;
};

export type PartyView = {
  party: Party;
  version: any;
  facts: any[];
  identifiers: any[];
  roles: any[];
  contact_points: any[];
  addresses: any[];
  registrations: any[];
  establishments: any[];
  merge_history: any[];
};

export type CreatePartyRequest = {
  create_request_id?: string;
  party_kind: string;
  source_class: string;
  legal_name: string;
  correlation_id?: string;
};

export type PartySearchQuery = {
  text?: string;
  party_kind?: string;
  source_class?: string;
  limit?: number;
  after?: string;
};

export type PartyIdentifier = {
  identifier_id: string;
  scheme: string;
  value: string;
  issuer?: string;
  added_by_principal_id: string;
  added_at: string;
};

export type LinkIdentifierRequest = {
  scheme: string;
  value: string;
  issuer?: string;
  correlation_id?: string;
};

export type PartyRole = {
  role_id: string;
  role_type: string;
  entity_id: string;
  effective_from: string;
  effective_to?: string;
  added_by_principal_id: string;
  added_at: string;
};

export type AddPartyRoleRequest = {
  role_type: string;
  entity_id: string;
  effective_from: string;
  correlation_id?: string;
};

export function createParty(
  input: CreatePartyRequest,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<{ party_id: string; golden_record_version: number }>> {
  return apiPost("tenantRegistry", `/v1/parties`, input, { identity, correlationId });
}

export function getParty(
  partyId: string,
  identity: Identity,
  asOf?: string,
  knownAt?: string,
  revealSensitive?: boolean,
): Promise<ApiResult<PartyView>> {
  const params = new URLSearchParams();
  if (asOf) params.set("as_of", asOf);
  if (knownAt) params.set("known_at", knownAt);
  if (revealSensitive !== undefined) params.set("reveal_sensitive", String(revealSensitive));
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiGet<PartyView>("tenantRegistry", `/v1/parties/${partyId}${query}`, { identity });
}

export function listParties(
  identity: Identity,
  query?: PartySearchQuery,
): Promise<ApiResult<{ items: PartySummary[]; next_cursor: string }>> {
  const params = new URLSearchParams();
  if (query?.text) params.set("text", query.text);
  if (query?.party_kind) params.set("party_kind", query.party_kind);
  if (query?.source_class) params.set("source_class", query.source_class);
  if (query?.limit) params.set("limit", String(query.limit));
  if (query?.after) params.set("cursor", query.after);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiGet("tenantRegistry", `/v1/parties${qs}`, { identity });
}

export function findPartiesByIdentifier(
  scheme: string,
  value: string,
  identity: Identity,
): Promise<ApiResult<PartySummary[]>> {
  return apiPost<PartySummary[]>("tenantRegistry", `/v1/identifiers:find`, { identifiers: [{ scheme, value }] }, { identity });
}

export function proposePartyFact(
  partyId: string,
  input: { fact_type: string; value: string; evidence_ref: string; correlation_id?: string },
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<void>> {
  return apiPost<void>("tenantRegistry", `/v1/parties/${partyId}/facts:propose`, input, { identity, correlationId });
}

export function linkPartyIdentifier(
  partyId: string,
  input: LinkIdentifierRequest,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<void>> {
  return apiPost<void>("tenantRegistry", `/v1/parties/${partyId}/identifiers`, input, { identity, correlationId });
}

export function addPartyRole(
  partyId: string,
  input: AddPartyRoleRequest,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<void>> {
  return apiPost<void>("tenantRegistry", `/v1/parties/${partyId}/roles`, input, { identity, correlationId });
}

export function removePartyRole(
  partyId: string,
  roleId: string,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<void>> {
  return apiPost<void>("tenantRegistry", `/v1/parties/${partyId}/roles/${roleId}/remove`, { correlation_id: correlationId ?? "" }, { identity, correlationId });
}

// ── Party Resolution (ORG-07) ────────────────────────────────────────────────

export type ResolutionCase = {
  case_id: string;
  tenant_id: string;
  case_type: "DUPLICATE_REVIEW" | "SPLIT_REVIEW";
  status: "OPEN" | "MERGED" | "SPLIT" | "DISMISSED";
  candidate_party_ids: string[];
  survivor_party_id?: string;
  created_at: string;
  created_by_principal_id: string;
  decided_by_principal_id?: string;
  decided_at?: string;
  decision_note?: string;
};

export type ResolutionDecision = {
  decision: "MERGE" | "SPLIT" | "DISMISS";
  survivor_party_id?: string;
  new_party_ids?: string[];
  reason: string;
  correlation_id?: string;
};

export function listResolutionCases(
  identity: Identity,
  status?: "open" | "all",
  caseType?: string,
): Promise<ApiResult<ResolutionCase[]>> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (caseType) params.set("case_type", caseType);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiGet<ResolutionCase[]>("tenantRegistry", `/v1/resolution-cases${query}`, { identity });
}

export function decideResolutionCase(
  caseId: string,
  input: ResolutionDecision,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<void>> {
  return apiPost<void>("tenantRegistry", `/v1/resolution-cases/${caseId}/decide`, input, { identity, correlationId });
}

export function mergeParties(
  caseId: string,
  input: { survivor_party_id: string; correlation_id?: string },
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<void>> {
  return apiPost<void>("tenantRegistry", `/v1/resolution/${caseId}:merge`, input, { identity, correlationId });
}

export function splitParties(
  caseId: string,
  input: { new_party_ids: string[]; correlation_id?: string },
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<void>> {
  return apiPost<void>("tenantRegistry", `/v1/resolution/${caseId}:split`, input, { identity, correlationId });
}

export function getMergeHistory(
  partyId: string,
  identity: Identity,
): Promise<ApiResult<any[]>> {
  return apiGet("tenantRegistry", `/v1/parties/${partyId}/merge-history`, { identity });
}

// ── Tax Identity Bundles (ORG-03) ────────────────────────────────────────────

export type TaxIdentityBundle = {
  tax_identity_bundle_id: string;
  tenant_id: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  status: "PENDING" | "VERIFIED" | "ACTIVE" | "SUSPENDED" | "REVOKED";
  effective_from: string;
  effective_to?: string;
  data_classification: "PUBLIC" | "INTERNAL" | "RESTRICTED" | "CONFIDENTIAL";
  record_version: number;
  created_at: string;
  updated_at: string;
  created_by_principal_id: string;
  updated_by_principal_id: string;
};

export type TaxIdentityBundleDetail = TaxIdentityBundle & {
  facts: Array<{
    fact_type: string;
    value: string;
    evidence_ref: string;
    classification: string;
    recorded_at: string;
    recorded_by: string;
  }>;
};

export function listTaxIdentityBundles(
  entityId: string,
  identity: Identity,
  revealSensitive = false,
): Promise<ApiResult<TaxIdentityBundle[]>> {
  const query = revealSensitive ? "?reveal_sensitive=true" : "";
  return apiGet<TaxIdentityBundle[]>("tenantRegistry", `/v1/entities/${entityId}/tax-identity-bundles${query}`, { identity });
}

export function getTaxIdentityBundle(
  bundleId: string,
  identity: Identity,
  revealSensitive = false,
): Promise<ApiResult<TaxIdentityBundleDetail>> {
  const query = revealSensitive ? "?reveal_sensitive=true" : "";
  return apiGet<TaxIdentityBundleDetail>("tenantRegistry", `/v1/tax-identity-bundles/${bundleId}${query}`, { identity });
}

// ── Residency (GOV-02) ──────────────────────────────────────────────────────

export type ResidencyPolicy = {
  data_residency_policy_id: string;
  tenant_id: string;
  policy_name: string;
  policy_code: string;
  residency_mode: "STRICT" | "PREFER" | "DENY";
  conflict_resolution_mode: "REJECT" | "QUEUE" | "LOG";
  residency_region_id: string;
  active_flag: boolean;
  record_version: number;
};

export function listResidencyPolicies(
  identity: Identity,
): Promise<ApiResult<ResidencyPolicy[]>> {
  return apiGet<ResidencyPolicy[]>("tenantRegistry", `/v1/residency-policies`, { identity });
}

export function getResidencyPolicy(
  policyId: string,
  identity: Identity,
): Promise<ApiResult<ResidencyPolicy>> {
  return apiGet<ResidencyPolicy>("tenantRegistry", `/v1/residency-policies/${policyId}`, { identity });
}

export function createResidencyPolicy(
  input: {
    tenant_id: string;
    policy_name: string;
    policy_code: string;
    residency_mode: "STRICT" | "PREFER" | "DENY";
    conflict_resolution_mode: "REJECT" | "QUEUE" | "LOG";
    residency_region_id: string;
    active_flag: boolean;
    correlation_id?: string;
  },
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<ResidencyPolicy>> {
  return apiPost<ResidencyPolicy>("tenantRegistry", `/v1/residency-policies`, input, { identity, correlationId });
}

export function getTenantResidencyRegion(
  tenantId: string,
  identity: Identity,
): Promise<ApiResult<{ tenant_id: string; region_code: string }>> {
  return apiGet("tenantRegistry", `/v1/tenants/${tenantId}/residency-region`, { identity });
}
