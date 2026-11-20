// The jurisdiction register (REF-01): jurisdictions, how they nest, their
// versioned history, aliases and external code mappings, and maker-checker
// imports of a source standard.
//
// Reads used to be unauthenticated and are still admitted with headers only
// (IDENTITY_VERIFY=warn, marked X-Identity-Assertion: missing); every
// administrative write needs the verified envelope (J-01) and is authorized
// against the platform scope, because "GB" is not owned by a legal entity.
//
// A deactivated jurisdiction stays in the list but no longer RESOLVES: a lookup
// by id answers 404, so every service validating against this register fails
// closed on it (obligations-svc, tenant-entity-registry-svc).

import { apiGet, type ApiResult, type ApiWriteResult, type Identity } from "../client";
import { JR, etagOf, get, listAll, post, seg, type Caller } from "./core";

/** Wire shape (Go json tags). */
export type Jurisdiction = {
  jurisdiction_id: string;
  jurisdiction_code: string;
  jurisdiction_name: string;
  jurisdiction_type: string;
  parent_jurisdiction_id: string | null;
  authority_type: string;
  effective_from: string;
  effective_to: string | null;
  active_flag: boolean;
  created_at: string;
  created_by_principal_id: string;
  updated_at?: string | null;
  updated_by_principal_id?: string | null;
  row_version?: number;
  retirement_reason?: string | null;
  retirement_evidence_ref?: string | null;
  superseded_by_jurisdiction_id?: string | null;
};

/**
 * Every jurisdiction (the legacy bare-array answer), active ones first then by
 * code. Kept for the obligations picker, which validates against this register.
 */
export async function listJurisdictions(identity?: Identity): Promise<ApiResult<Jurisdiction[]>> {
  const result = await apiGet<Jurisdiction[]>(JR, "/v1/jurisdictions", { identity });
  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return { ok: false, error: { kind: "malformed", message: "jurisdiction-rules-svc returned a non-array jurisdiction list" } };
  }
  return { ok: true, data: sortJurisdictions(result.data) };
}

/** Every jurisdiction through API-4 cursors, active first then by code. */
export async function listAllJurisdictions(identity?: Identity, filters: { type?: string } = {}): Promise<ApiResult<Jurisdiction[]>> {
  const r = await listAll<Jurisdiction>("/v1/jurisdictions", identity, { type: filters.type });
  return r.ok ? { ok: true, data: sortJurisdictions(r.data) } : r;
}

function sortJurisdictions(list: Jurisdiction[]): Jurisdiction[] {
  return [...list].sort((a, b) => {
    if (a.active_flag !== b.active_flag) return a.active_flag ? -1 : 1;
    return a.jurisdiction_code.localeCompare(b.jurisdiction_code);
  });
}

/** "United Kingdom (GB)" — what a picker option should read as. */
export function describeJurisdiction(jurisdiction: Jurisdiction): string {
  const label = `${jurisdiction.jurisdiction_name} (${jurisdiction.jurisdiction_code})`;
  return jurisdiction.active_flag ? label : `${label} — inactive`;
}

/** Ids to codes, for registers that store only the jurisdiction UUID. */
export function jurisdictionCodesById(jurisdictions: Jurisdiction[]): Map<string, string> {
  return new Map(jurisdictions.map((j) => [j.jurisdiction_id, j.jurisdiction_code]));
}

/** Free text in the service (at most 64 characters); offered as suggestions. */
export const JURISDICTION_TYPES = [
  "COUNTRY", "SUBDIVISION", "STATE_PROVINCE", "SUPRANATIONAL", "TAX_AUTHORITY", "FILING_AUTHORITY", "LABOR_LAW_BOUNDARY", "DATA_RESIDENCY_BOUNDARY",
] as const;
export const AUTHORITY_TYPES = ["NATIONAL", "FEDERAL", "STATE", "MUNICIPAL", "SUPRANATIONAL"] as const;

/** One jurisdiction by id. 404 when it does not exist or is not in force. */
export function getJurisdiction(id: string, identity?: Identity): Promise<ApiResult<Jurisdiction>> {
  return get<Jurisdiction>(`/v1/jurisdictions/${seg(id)}`, identity);
}

/** A jurisdiction's ancestors, nearest first. */
export function getAncestors(id: string, identity?: Identity): Promise<ApiResult<Jurisdiction[]>> {
  return get<Jurisdiction[]>(`/v1/jurisdictions/${seg(id)}/ancestors`, identity);
}

export type JurisdictionAsOf = {
  jurisdiction_id: string;
  jurisdiction_code: string;
  jurisdiction_name: string;
  jurisdiction_type: string;
  parent_jurisdiction_id: string | null;
  authority_type: string;
  as_of: string;
  version_no: number;
  valid_from: string;
  valid_to: string | null;
  retired: boolean;
  retired_at: string | null;
  retirement_reason: string | null;
  superseded_by_jurisdiction_id: string | null;
};

/** GetJurisdictionAsOf: the jurisdiction as the register knew it at an instant. */
export function getJurisdictionAsOf(id: string, asOf: string | undefined, identity?: Identity): Promise<ApiResult<JurisdictionAsOf>> {
  return get<JurisdictionAsOf>(`/v1/jurisdictions/${seg(id)}/as-of`, identity, { as_of: asOf });
}

export type HierarchyNode = {
  jurisdiction_id: string;
  jurisdiction_code: string;
  jurisdiction_name: string;
  jurisdiction_type: string;
  authority_type: string;
  depth: number;
  children: HierarchyNode[] | null;
};

/** GetHierarchy: the jurisdiction and everything nested inside it. */
export function getHierarchy(id: string, identity?: Identity): Promise<ApiResult<{ as_of: string; root: HierarchyNode | null; count: number }>> {
  return get(`/v1/jurisdictions/${seg(id)}/hierarchy`, identity);
}

export type JurisdictionAlias = {
  alias_id: string;
  jurisdiction_id: string;
  alias_system: string;
  alias_code: string;
  source_standard: string;
  source_version: string;
  mapping_rationale: string;
  evidence_ref: string | null;
  valid_from: string;
  valid_to: string | null;
  created_by: string;
  created_at: string;
  ended_by: string | null;
  ended_at: string | null;
  end_reason: string | null;
};

export function listAliases(id: string, identity?: Identity): Promise<ApiResult<JurisdictionAlias[]>> {
  return get<JurisdictionAlias[]>(`/v1/jurisdictions/${seg(id)}/aliases`, identity);
}

export type CodeResolution = {
  jurisdiction_id: string;
  jurisdiction_code: string;
  jurisdiction_name: string;
  jurisdiction_type: string;
  authority_type: string;
  parent_jurisdiction_id: string | null;
  as_of: string;
  version_no: number;
  matched_via: string;
  alias: JurisdictionAlias | null;
};

/** ResolveJurisdiction: a code to exactly one jurisdiction at an instant. */
export function resolveJurisdictionCode(
  input: { code: string; system?: string; type?: string; asOf?: string },
  identity?: Identity,
): Promise<ApiResult<CodeResolution>> {
  return get<CodeResolution>("/v1/jurisdiction-resolutions", identity, { code: input.code, system: input.system, type: input.type, as_of: input.asOf });
}

/** MapExternalJurisdictionCode: an external system's code to a jurisdiction. */
export function mapExternalCode(input: { system: string; code: string; asOf?: string }, identity?: Identity): Promise<ApiResult<CodeResolution>> {
  return get<CodeResolution>("/v1/jurisdiction-code-mappings", identity, { system: input.system, code: input.code, as_of: input.asOf });
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export type CreateJurisdictionInput = {
  jurisdictionCode: string;
  jurisdictionName: string;
  jurisdictionType: string;
  authorityType: string;
  effectiveFrom: string;
  parentJurisdictionId?: string;
  effectiveTo?: string;
};

/** AddInternalJurisdiction. 201 new; the same Idempotency-Key replays the first answer. */
export function createJurisdiction(input: CreateJurisdictionInput, identity: Caller): Promise<ApiWriteResult<Jurisdiction>> {
  return post<Jurisdiction>(
    "/v1/admin/jurisdictions",
    {
      jurisdiction_code: input.jurisdictionCode,
      jurisdiction_name: input.jurisdictionName,
      jurisdiction_type: input.jurisdictionType,
      authority_type: input.authorityType,
      effective_from: input.effectiveFrom,
      ...(input.parentJurisdictionId ? { parent_jurisdiction_id: input.parentJurisdictionId } : {}),
      ...(input.effectiveTo ? { effective_to: input.effectiveTo } : {}),
    },
    identity,
  );
}

/**
 * RetireJurisdiction. Not a delete: it end-dates the row, keeps its history,
 * and from then on the id no longer resolves. A reason and its evidence are
 * recorded on the version history.
 */
export function retireJurisdiction(
  j: Pick<Jurisdiction, "jurisdiction_id" | "row_version">,
  input: { reason: string; evidenceRef?: string; supersededBy?: string },
  identity: Caller,
): Promise<ApiWriteResult<Jurisdiction>> {
  return post<Jurisdiction>(
    `/v1/admin/jurisdictions/${seg(j.jurisdiction_id)}/deactivate`,
    {
      reason: input.reason,
      ...(input.evidenceRef ? { evidence_ref: input.evidenceRef } : {}),
      ...(input.supersededBy ? { superseded_by_jurisdiction_id: input.supersededBy } : {}),
    },
    identity,
    { ifMatch: etagOf(j.row_version) },
  );
}

export type AliasInput = {
  aliasSystem: string;
  aliasCode: string;
  sourceStandard: string;
  sourceVersion: string;
  mappingRationale: string;
  evidenceRef?: string;
  validFrom: string;
  validTo?: string;
  replacesAliasId?: string;
};

/** AmendJurisdictionAlias: an external code (ISO 3166, a tax authority's own) mapped to this jurisdiction. */
export function addAlias(jurisdictionId: string, input: AliasInput, identity: Caller): Promise<ApiWriteResult<JurisdictionAlias>> {
  return post<JurisdictionAlias>(
    `/v1/admin/jurisdictions/${seg(jurisdictionId)}/aliases`,
    {
      alias_system: input.aliasSystem,
      alias_code: input.aliasCode,
      source_standard: input.sourceStandard,
      source_version: input.sourceVersion,
      mapping_rationale: input.mappingRationale,
      valid_from: input.validFrom,
      ...(input.evidenceRef ? { evidence_ref: input.evidenceRef } : {}),
      ...(input.validTo ? { valid_to: input.validTo } : {}),
      ...(input.replacesAliasId ? { replaces_alias_id: input.replacesAliasId } : {}),
    },
    identity,
  );
}

export function endAlias(jurisdictionId: string, aliasId: string, input: { validTo: string; reason: string }, identity: Caller): Promise<ApiWriteResult<JurisdictionAlias>> {
  return post<JurisdictionAlias>(
    `/v1/admin/jurisdictions/${seg(jurisdictionId)}/aliases/${seg(aliasId)}/end`,
    { valid_to: input.validTo, reason: input.reason },
    identity,
  );
}

// ─── Imports (maker-checker) ─────────────────────────────────────────────────

export type ImportItemInput = {
  action: "ADD" | "UPDATE" | "RETIRE";
  target: { jurisdiction_id?: string; code?: string; type?: string };
  jurisdiction_name?: string;
  authority_type?: string;
  parent?: { jurisdiction_id?: string; code?: string; type?: string } | null;
  effective_from?: string;
  successor?: { jurisdiction_id?: string; code?: string; type?: string } | null;
  note?: string;
};

export type ImportBatch = {
  batch_id: string;
  source_standard: string;
  source_version: string;
  import_hash: string;
  evidence_ref: string;
  summary: string;
  status: "PROPOSED" | "APPROVED" | "REJECTED" | string;
  item_count: number;
  invalid_count: number;
  proposed_by: string;
  proposed_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  added_count: number | null;
  updated_count: number | null;
  retired_count: number | null;
  unchanged_count: number | null;
  items?: { item_no: number; validation_errors: string[] | null; outcome: string | null; jurisdiction_id: string | null }[];
};

export function listImports(identity: Identity, status?: string): Promise<ApiResult<ImportBatch[]>> {
  return listAll<ImportBatch>("/v1/admin/jurisdiction-imports", identity, { status });
}

export function getImport(batchId: string, identity: Identity): Promise<ApiResult<ImportBatch>> {
  return get<ImportBatch>(`/v1/admin/jurisdiction-imports/${seg(batchId)}`, identity);
}

/** ImportJurisdictionUpdate: proposed by one person, applied only when a second approves. */
export function proposeImport(
  input: { sourceStandard: string; sourceVersion: string; evidenceRef: string; summary: string; items: ImportItemInput[] },
  identity: Caller,
): Promise<ApiWriteResult<ImportBatch>> {
  return post<ImportBatch>(
    "/v1/admin/jurisdiction-imports",
    { source_standard: input.sourceStandard, source_version: input.sourceVersion, evidence_ref: input.evidenceRef, summary: input.summary, items: input.items },
    identity,
  );
}

export function decideImport(batchId: string, decision: "approve" | "reject", reason: string, identity: Caller): Promise<ApiWriteResult<ImportBatch>> {
  return post<ImportBatch>(`/v1/admin/jurisdiction-imports/${seg(batchId)}/${decision}`, { reason }, identity);
}
