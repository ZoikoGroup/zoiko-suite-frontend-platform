// Jurisdiction packs (ZS-JUR-001 waves 0–7): the source register, regimes and
// interpretations that rules cite; packs and their versions; compile, sign
// and verify; the certification harness; release, deployment by ring and
// region, rollback, withdrawal, emergency block and hotfix; source-change
// notices; and the operations feed.
//
// Every governing step is maker-checker in the service: a source's reviewer,
// an interpretation's approver and a pack's reviewers are never its author.
// The console hides the checker's buttons from the maker; the service still
// refuses (403 segregation_of_duties).

import type { ApiResult, ApiWriteResult, Identity } from "../client";
import { get, getVersioned, listAll, post, seg, type Caller, type Versioned } from "./core";

// ─── Sources, regimes, interpretations ───────────────────────────────────────

export type Regime = {
  regime_id: string;
  regime_code: string;
  regime_name: string;
  description: string | null;
  active_flag: boolean;
  created_at: string;
  created_by_principal_id: string;
};

export type RegulatorySource = {
  source_id: string;
  jurisdiction_id: string;
  authority: string;
  source_type: string;
  authority_level: string;
  title: string;
  official_identifier: string | null;
  published_on: string | null;
  effective_on: string | null;
  location: string;
  snapshot_hash: string;
  snapshot_ref: string | null;
  language: string;
  translation_ref: string | null;
  interpretation_notes: string | null;
  reviewed_by_principal_id: string | null;
  reviewed_at: string | null;
  superseded_by_source_id: string | null;
  superseded_at: string | null;
  created_at: string;
  created_by_principal_id: string;
};

export type Interpretation = {
  interpretation_id: string;
  jurisdiction_id: string;
  regime_id: string | null;
  subject: string;
  decision: string;
  rationale: string;
  status: string;
  source_ids: string[] | null;
  approved_by_principal_id: string | null;
  approved_at: string | null;
  created_at: string;
  created_by_principal_id: string;
};

export const SOURCE_TYPES = ["STATUTE", "REGULATION", "GUIDANCE", "CASE_LAW", "TECHNICAL_SPECIFICATION", "CODE_LIST", "TREATY"] as const;
export const AUTHORITY_LEVELS = ["BINDING_LAW", "OFFICIAL_GUIDANCE", "AUTHORITY_PRACTICE", "INDUSTRY_PRACTICE"] as const;

/** A source no second person has reviewed yet (and that is still in force). */
export function sourceAwaitingReview(s: Pick<RegulatorySource, "reviewed_at" | "superseded_by_source_id">): boolean {
  return !s.reviewed_at && !s.superseded_by_source_id;
}

export function listRegimes(identity?: Identity): Promise<ApiResult<Regime[]>> {
  return listAll<Regime>("/v1/regimes", identity);
}

export function createRegime(input: { regimeCode: string; regimeName: string; description?: string }, identity: Caller): Promise<ApiWriteResult<Regime>> {
  return post<Regime>("/v1/admin/regimes", { regime_code: input.regimeCode, regime_name: input.regimeName, ...(input.description ? { description: input.description } : {}) }, identity);
}

export function listSources(identity?: Identity, filters: { jurisdictionId?: string; authority?: string } = {}): Promise<ApiResult<RegulatorySource[]>> {
  return listAll<RegulatorySource>("/v1/sources", identity, { jurisdiction_id: filters.jurisdictionId, authority: filters.authority });
}

export function getSource(id: string, identity?: Identity): Promise<ApiResult<Versioned<RegulatorySource>>> {
  return getVersioned<RegulatorySource>(`/v1/sources/${seg(id)}`, identity);
}

export type CreateSourceInput = {
  jurisdictionId: string;
  authority: string;
  sourceType: string;
  authorityLevel: string;
  title: string;
  location: string;
  snapshotHash: string;
  officialIdentifier?: string;
  publishedOn?: string;
  effectiveOn?: string;
  language?: string;
  interpretationNotes?: string;
};

/** Capture a source with the sha256 of its snapshot. Content is immutable afterwards. */
export function createSource(input: CreateSourceInput, identity: Caller): Promise<ApiWriteResult<RegulatorySource>> {
  return post<RegulatorySource>(
    "/v1/admin/sources",
    {
      jurisdiction_id: input.jurisdictionId,
      authority: input.authority,
      source_type: input.sourceType,
      authority_level: input.authorityLevel,
      title: input.title,
      location: input.location,
      snapshot_hash: input.snapshotHash,
      language: input.language || "en",
      ...(input.officialIdentifier ? { official_identifier: input.officialIdentifier } : {}),
      ...(input.publishedOn ? { published_on: input.publishedOn } : {}),
      ...(input.effectiveOn ? { effective_on: input.effectiveOn } : {}),
      ...(input.interpretationNotes ? { interpretation_notes: input.interpretationNotes } : {}),
    },
    identity,
  );
}

/** The independent review of a captured source (never by its author). */
export function reviewSource(id: string, etag: string | undefined, identity: Caller): Promise<ApiWriteResult<RegulatorySource>> {
  return post<RegulatorySource>(`/v1/admin/sources/${seg(id)}/review`, undefined, identity, { ifMatch: etag });
}

export function supersedeSource(id: string, replacementSourceId: string, etag: string | undefined, identity: Caller): Promise<ApiWriteResult<RegulatorySource>> {
  return post<RegulatorySource>(`/v1/admin/sources/${seg(id)}/supersede`, { replacement_source_id: replacementSourceId }, identity, { ifMatch: etag });
}

export function getInterpretation(id: string, identity?: Identity): Promise<ApiResult<Versioned<Interpretation>>> {
  return getVersioned<Interpretation>(`/v1/interpretations/${seg(id)}`, identity);
}

export function createInterpretation(
  input: { jurisdictionId: string; regimeId?: string; subject: string; decision: string; rationale: string; sourceIds: string[] },
  identity: Caller,
): Promise<ApiWriteResult<Interpretation>> {
  return post<Interpretation>(
    "/v1/admin/interpretations",
    {
      jurisdiction_id: input.jurisdictionId,
      subject: input.subject,
      decision: input.decision,
      rationale: input.rationale,
      source_ids: input.sourceIds,
      ...(input.regimeId ? { regime_id: input.regimeId } : {}),
    },
    identity,
  );
}

export function approveInterpretation(id: string, etag: string | undefined, identity: Caller): Promise<ApiWriteResult<Interpretation>> {
  return post<Interpretation>(`/v1/admin/interpretations/${seg(id)}/approve`, undefined, identity, { ifMatch: etag });
}

// ─── Packs and versions ──────────────────────────────────────────────────────

export type Pack = {
  pack_id: string;
  pack_ref: string;
  pack_name: string;
  owner: string;
  support_owner: string | null;
  created_at: string;
  created_by_principal_id: string;
};

export type PackManifest = {
  pack_id: string;
  pack_version: string;
  jurisdiction_ids: string[];
  regimes: string[];
  effective_from: string;
  effective_to?: string | null;
  dependencies?: { ref: string; version: string }[];
  source_register_version?: number | null;
  rule_modules?: string[];
  calendar_modules?: string[];
  obligation_modules?: string[];
};

/** DRAFT → REVIEW → CERTIFIED → RELEASED, then SUPERSEDED, WITHDRAWN or EMERGENCY_BLOCKED. */
export type PackVersion = {
  pack_version_id: string;
  pack_id: string;
  pack_ref: string;
  version: string;
  status: string;
  effective_from: string;
  effective_to: string | null;
  manifest: PackManifest | null;
  manifest_digest: string;
  artifact_digest: string | null;
  test_bundle_digest: string | null;
  signature: string | null;
  signature_key_ref: string | null;
  source_register_version: number | null;
  created_at: string;
  created_by_principal_id: string;
  updated_at?: string | null;
  updated_by_principal_id?: string | null;
};

export const PACK_STATUSES = ["DRAFT", "REVIEW", "CERTIFIED", "RELEASED", "SUPERSEDED", "WITHDRAWN", "EMERGENCY_BLOCKED"] as const;

export function listPacks(identity?: Identity): Promise<ApiResult<Pack[]>> {
  return listAll<Pack>("/v1/packs", identity);
}

export function getPack(ref: string, identity?: Identity): Promise<ApiResult<Pack>> {
  return get<Pack>(`/v1/packs/${seg(ref)}`, identity);
}

export function listPackVersions(ref: string, identity?: Identity): Promise<ApiResult<PackVersion[]>> {
  return listAll<PackVersion>(`/v1/packs/${seg(ref)}/versions`, identity);
}

export function getPackVersion(ref: string, version: string, identity?: Identity): Promise<ApiResult<Versioned<PackVersion>>> {
  return getVersioned<PackVersion>(`/v1/packs/${seg(ref)}/versions/${seg(version)}`, identity);
}

export function createPack(input: { packRef: string; packName: string; owner: string; supportOwner?: string }, identity: Caller): Promise<ApiWriteResult<Pack>> {
  return post<Pack>(
    "/v1/admin/packs",
    { pack_ref: input.packRef, pack_name: input.packName, owner: input.owner, ...(input.supportOwner ? { support_owner: input.supportOwner } : {}) },
    identity,
  );
}

/** A new DRAFT version: the manifest names its jurisdictions, regimes, modules and dependencies. */
export function createPackVersion(ref: string, manifest: PackManifest, identity: Caller): Promise<ApiWriteResult<PackVersion>> {
  return post<PackVersion>(`/v1/admin/packs/${seg(ref)}/versions`, manifest, identity);
}

export type PackArtifact = {
  pack_version_id: string;
  pack_ref: string;
  version: string;
  artifact_digest: string;
  compiler_name: string;
  compiler_version: string;
  report: { errors: number; warnings: number; findings: { severity: string; code: string; message: string; subject: string }[] | null };
  compiled_at: string;
  compiled_by_principal_id: string;
  signature: string | null;
  signature_key_ref: string | null;
  signed_at: string | null;
  signed_by_principal_id: string | null;
};

export type Verification = { verified: boolean; reasons: string[] | null; computed_digest: string; stored_digest: string; signature_key_ref: string | null };

export function getArtifact(ref: string, version: string, identity?: Identity): Promise<ApiResult<PackArtifact>> {
  return get<PackArtifact>(`/v1/packs/${seg(ref)}/versions/${seg(version)}/artifact`, identity);
}

/** Version steps that take no body beyond an optional reason and evidence. */
export type PackStep = "submit-review" | "compile" | "sign" | "certify" | "publish" | "withdraw" | "block" | "unblock" | "test-runs";

export function packStep<T = unknown>(
  ref: string,
  version: string,
  step: PackStep,
  identity: Caller,
  body?: { reason?: string; evidence_ref?: string },
  etag?: string,
): Promise<ApiWriteResult<T>> {
  return post<T>(`/v1/admin/packs/${seg(ref)}/versions/${seg(version)}/${step}`, body, identity, { ifMatch: etag });
}

export function verifyPack(ref: string, version: string, identity: Caller): Promise<ApiWriteResult<Verification | { verification: Verification }>> {
  return post(`/v1/packs/${seg(ref)}/versions/${seg(version)}/verify`, undefined, identity);
}

export function supersedePack(
  ref: string,
  version: string,
  input: { supersededBy: string; reason: string; evidenceRef: string },
  identity: Caller,
): Promise<ApiWriteResult<unknown>> {
  return post(`/v1/admin/packs/${seg(ref)}/versions/${seg(version)}/supersede`, { superseded_by: input.supersededBy, reason: input.reason, evidence_ref: input.evidenceRef }, identity);
}

// ─── Certification harness ───────────────────────────────────────────────────

export type TestBundleRecord = { bundle_id: string; pack_version_id: string; revision: number; bundle: unknown; bundle_digest: string; submitted_by: string; submitted_at: string };
export type TestRunRecord = {
  run_id: string;
  bundle_digest: string;
  artifact_digest: string;
  passed: boolean;
  result: { passed: boolean; total: number; failed: number; coverage_complete: boolean; results: { id: string; class: string; passed: boolean; expected: string; actual: string }[] | null };
  harness_version: string;
  executed_by: string;
  executed_at: string;
};
export type ReviewRecord = { review_id: string; artifact_digest: string; reviewer: string; role: string; decision: string; findings: string; created_at: string };
export type CertificationRecord = { certification_id: string; artifact_digest: string; bundle_digest: string; test_run_id: string; min_reviews: number; certified_by: string; certified_at: string };

const versionPath = (ref: string, v: string) => `/v1/packs/${seg(ref)}/versions/${seg(v)}`;

export function getTestBundle(ref: string, v: string, identity?: Identity): Promise<ApiResult<TestBundleRecord>> {
  return get<TestBundleRecord>(`${versionPath(ref, v)}/test-bundle`, identity);
}
export function listTestRuns(ref: string, v: string, identity?: Identity): Promise<ApiResult<TestRunRecord[]>> {
  return listAll<TestRunRecord>(`${versionPath(ref, v)}/test-runs`, identity);
}
export function listReviews(ref: string, v: string, identity?: Identity): Promise<ApiResult<ReviewRecord[]>> {
  return listAll<ReviewRecord>(`${versionPath(ref, v)}/reviews`, identity);
}
export function getCertification(ref: string, v: string, identity?: Identity): Promise<ApiResult<CertificationRecord>> {
  return get<CertificationRecord>(`${versionPath(ref, v)}/certification`, identity);
}

/** The test bundle the version must pass (ZS-JUR §22): `{bundle_version, cases[]}`. */
export function submitTestBundle(ref: string, v: string, bundle: unknown, identity: Caller): Promise<ApiWriteResult<TestBundleRecord>> {
  return post<TestBundleRecord>(`/v1/admin/packs/${seg(ref)}/versions/${seg(v)}/test-bundle`, bundle, identity);
}

/** An independent review of the compiled artifact. A rejection needs findings. */
export function addReview(ref: string, v: string, input: { role: string; decision: "APPROVE" | "REJECT"; findings: string }, identity: Caller): Promise<ApiWriteResult<ReviewRecord>> {
  return post<ReviewRecord>(`/v1/admin/packs/${seg(ref)}/versions/${seg(v)}/reviews`, input, identity);
}

// ─── Signing keys ────────────────────────────────────────────────────────────

export type SigningKey = { key_ref: string; algorithm: string; public_key: string; status: string; status_reason: string | null; created_by_principal_id: string };

export function listSigningKeys(identity?: Identity): Promise<ApiResult<SigningKey[]>> {
  return listAll<SigningKey>("/v1/pack-signing-keys", identity);
}

export function registerSigningKey(input: { keyRef: string; publicKey: string; algorithm?: string }, identity: Caller): Promise<ApiWriteResult<SigningKey>> {
  return post<SigningKey>("/v1/admin/pack-signing-keys", { key_ref: input.keyRef, public_key: input.publicKey, algorithm: input.algorithm || "ed25519" }, identity);
}

export function setSigningKeyStatus(keyRef: string, to: "retire" | "revoke", reason: string, identity: Caller): Promise<ApiWriteResult<SigningKey>> {
  return post<SigningKey>(`/v1/admin/pack-signing-keys/${seg(keyRef)}/${to}`, { reason }, identity);
}

// ─── Release operations ──────────────────────────────────────────────────────

export type Ring = { ring_code: string; ordinal: number; min_soak_seconds: number; description: string | null; created_at: string };
export type Region = { region_code: string; description: string | null; created_at: string };
export type Deployment = {
  deployment_id: string;
  pack_ref: string;
  version: string;
  ring_code: string;
  region_code: string;
  status: string;
  deployed_at: string;
  deployed_by: string;
  exception_reason: string | null;
  rolled_back_at: string | null;
  rolled_back_by: string | null;
  rollback_reason: string | null;
};
export type Hotfix = {
  pack_ref: string;
  version: string;
  severity: string;
  scope_summary: string;
  incident_ref: string;
  incident_commander: string;
  rollback_target_version: string;
  declared_by: string;
  declared_at: string;
  retro_due_at: string;
  retro_completed_at: string | null;
  retro_note: string | null;
};
export type ReleaseResult = { pack_ref: string; version: string; from_status: string; to_status: string; changed: boolean; remediation_case_id: string | null; remediation_opened: boolean };

export function listRings(identity?: Identity): Promise<ApiResult<Ring[]>> {
  return listAll<Ring>("/v1/deployment-rings", identity);
}
export function listRegions(identity?: Identity): Promise<ApiResult<Region[]>> {
  return listAll<Region>("/v1/deployment-regions", identity);
}
export function createRing(input: { ringCode: string; ordinal: number; minSoakSeconds: number; description?: string }, identity: Caller): Promise<ApiWriteResult<Ring>> {
  return post<Ring>("/v1/admin/deployment-rings", { ring_code: input.ringCode, ordinal: input.ordinal, min_soak_seconds: input.minSoakSeconds, ...(input.description ? { description: input.description } : {}) }, identity);
}
export function createRegion(input: { regionCode: string; description?: string }, identity: Caller): Promise<ApiWriteResult<Region>> {
  return post<Region>("/v1/admin/deployment-regions", { region_code: input.regionCode, ...(input.description ? { description: input.description } : {}) }, identity);
}

export function listDeployments(ref: string, v: string, identity?: Identity): Promise<ApiResult<Deployment[]>> {
  return listAll<Deployment>(`${versionPath(ref, v)}/deployments`, identity);
}
export function getHotfix(ref: string, v: string, identity?: Identity): Promise<ApiResult<Hotfix>> {
  return get<Hotfix>(`${versionPath(ref, v)}/hotfix`, identity);
}

export function deployPack(ref: string, v: string, input: { ring: string; region: string; exceptionReason?: string }, identity: Caller): Promise<ApiWriteResult<Deployment>> {
  return post<Deployment>(`/v1/admin/packs/${seg(ref)}/versions/${seg(v)}/deploy`, { ring: input.ring, region: input.region, ...(input.exceptionReason ? { exception_reason: input.exceptionReason } : {}) }, identity);
}

export function rollbackPack(ref: string, v: string, input: { ring: string; region: string; restoreVersion: string; reason: string }, identity: Caller): Promise<ApiWriteResult<unknown>> {
  return post(`/v1/admin/packs/${seg(ref)}/versions/${seg(v)}/rollback`, { ring: input.ring, region: input.region, restore_version: input.restoreVersion, reason: input.reason }, identity);
}

export function declareHotfix(
  ref: string,
  v: string,
  input: { severity: "P0" | "P1"; scopeSummary: string; incidentRef: string; incidentCommander: string; rollbackTargetVersion: string },
  identity: Caller,
): Promise<ApiWriteResult<Hotfix>> {
  return post<Hotfix>(
    `/v1/admin/packs/${seg(ref)}/versions/${seg(v)}/hotfix`,
    { severity: input.severity, scope_summary: input.scopeSummary, incident_ref: input.incidentRef, incident_commander: input.incidentCommander, rollback_target_version: input.rollbackTargetVersion },
    identity,
  );
}

export function completeRetrospective(ref: string, v: string, note: string, identity: Caller): Promise<ApiWriteResult<Hotfix>> {
  return post<Hotfix>(`/v1/admin/packs/${seg(ref)}/versions/${seg(v)}/hotfix/retrospective`, { note }, identity);
}

// ─── Source-change notices ───────────────────────────────────────────────────

export type SourceChangeNotice = {
  notice_id: string;
  jurisdiction_id: string | null;
  authority: string;
  change_type: string;
  title: string;
  location: string | null;
  observed_hash: string | null;
  affected_source_id: string | null;
  detail: string | null;
  status: "OPEN" | "UNDER_REVIEW" | "CLOSED" | string;
  created_at: string;
  created_by_principal_id: string;
  reviewer: string | null;
  review_started_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  outcome: string | null;
  outcome_note: string | null;
  linked_interpretation_id: string | null;
};

export const NOTICE_CHANGE_TYPES = [
  "FUTURE_DATED_LAW", "SCHEMA_OR_CODE_LIST_UPDATE", "CLARIFICATION", "RETROACTIVE_CHANGE", "AUTHORITY_PROCESS_CHANGE", "SOURCE_WITHDRAWN", "DISPUTED_INTERPRETATION",
] as const;
export const NOTICE_OUTCOMES = ["NO_CHANGE", "INTERPRETATION_RECORDED", "RULE_CHANGE_PLANNED", "CAPABILITY_BLOCKED"] as const;

export function listNotices(identity?: Identity, status?: "open" | "under_review" | "closed"): Promise<ApiResult<SourceChangeNotice[]>> {
  return listAll<SourceChangeNotice>("/v1/source-change-notices", identity, { status });
}
export function getNotice(id: string, identity?: Identity): Promise<ApiResult<Versioned<SourceChangeNotice>>> {
  return getVersioned<SourceChangeNotice>(`/v1/source-change-notices/${seg(id)}`, identity);
}
export function createNotice(
  input: { jurisdictionId?: string; authority: string; changeType: string; title: string; location?: string; observedHash?: string; affectedSourceId?: string; detail?: string },
  identity: Caller,
): Promise<ApiWriteResult<SourceChangeNotice>> {
  return post<SourceChangeNotice>(
    "/v1/admin/source-change-notices",
    {
      authority: input.authority,
      change_type: input.changeType,
      title: input.title,
      ...(input.jurisdictionId ? { jurisdiction_id: input.jurisdictionId } : {}),
      ...(input.location ? { location: input.location } : {}),
      ...(input.observedHash ? { observed_hash: input.observedHash } : {}),
      ...(input.affectedSourceId ? { affected_source_id: input.affectedSourceId } : {}),
      ...(input.detail ? { detail: input.detail } : {}),
    },
    identity,
  );
}
export function startNoticeReview(id: string, etag: string | undefined, identity: Caller): Promise<ApiWriteResult<SourceChangeNotice>> {
  return post<SourceChangeNotice>(`/v1/admin/source-change-notices/${seg(id)}/review`, undefined, identity, { ifMatch: etag });
}
export function closeNotice(
  id: string,
  input: { outcome: string; note: string; linkedInterpretationId?: string },
  etag: string | undefined,
  identity: Caller,
): Promise<ApiWriteResult<SourceChangeNotice>> {
  return post<SourceChangeNotice>(
    `/v1/admin/source-change-notices/${seg(id)}/close`,
    { outcome: input.outcome, note: input.note, ...(input.linkedInterpretationId ? { linked_interpretation_id: input.linkedInterpretationId } : {}) },
    identity,
    { ifMatch: etag },
  );
}

// ─── Coverage and the operations feed ────────────────────────────────────────

export type CoverageEntry = { pack_ref: string; version: string; status: string; effective_from: string; effective_to: string | null; in_force: boolean };

export function getPackCoverage(jurisdictionCode: string, identity?: Identity): Promise<ApiResult<{ jurisdiction: string; effective_at: string; packs: CoverageEntry[] | null }>> {
  return get(`/v1/pack-coverage`, identity, { jurisdiction: jurisdictionCode });
}

export type OpsMetrics = {
  generated_at: string;
  window_hours: number;
  resolutions_by_outcome: Record<string, number> | null;
  upcoming_effective_changes: { pack_ref: string; version: string; status: string; effective_from: string }[] | null;
  deployment_skew: { pack_ref: string; ring_code: string; skewed: boolean }[] | null;
  released_but_not_deployed: { pack_ref: string; version: string }[] | null;
  pack_versions_by_status: Record<string, number> | null;
  source_changes_open: number;
  source_changes_under_review: number;
  hotfix_retrospectives_overdue: { pack_ref: string; version: string; retro_due_at: string }[] | null;
  not_measured: string[] | null;
};

export function getOpsMetrics(identity: Identity): Promise<ApiResult<OpsMetrics>> {
  return get<OpsMetrics>("/v1/ops/metrics", identity);
}
