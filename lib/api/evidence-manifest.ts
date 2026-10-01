// evidence-manifest-svc (:8095) — assembles structured, checksummed evidence
// sets for audit/regulator/legal-discovery/compliance-review scenarios.
//
// Doc 03 §14.4. Four properties shape this page:
//
//  1. THERE IS NO LIST ENDPOINT for manifests themselves. The service exposes
//     only generate (create), get-one-by-id, and list-records-of-one — never
//     "every manifest for this tenant". That is the service's own real scope,
//     not a gap in this client: there is nothing to page here.
//  2. GENERATION FAILS CLOSED. If any requested source (governance-svc,
//     authorization-svc's access decisions, workflow-svc, or
//     workflow-history-svc for a requested workflow instance) cannot be
//     reached, the WHOLE manifest is marked FAILED — never a silent partial
//     one. A FAILED manifest cannot be resumed; the only recourse is to
//     generate again.
//  3. A MANIFEST IS IMMUTABLE ONCE TERMINAL. GENERATED and FAILED are both
//     terminal, and the records under a manifest are append-only at the
//     database level (a mutation trigger rejects even an UPDATE/DELETE from
//     the service's own superuser connection).
//  4. RECORD SNAPSHOTS ARRIVE BASE64-ENCODED. record_snapshot is stored as raw
//     JSON bytes on the Go side (`[]byte`), and Go's encoding/json marshals a
//     byte slice as a base64 string — not as an embedded JSON object. This
//     client decodes it back into the original object; render the decoded
//     result, never the raw field.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

export const SCENARIO_TYPES = ["AUDIT", "REGULATOR", "LEGAL_DISCOVERY", "COMPLIANCE_REVIEW"] as const;
export type ScenarioType = (typeof SCENARIO_TYPES)[number];

export const SOURCE_TYPES = [
  "GOVERNANCE_DECISION",
  "ACCESS_DECISION",
  "WORKFLOW_INSTANCE",
  "WORKFLOW_HISTORY",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** Wire shape. Field names match the Go json tags exactly. */
export type EvidenceManifest = {
  manifest_id: string;
  tenant_id: string;
  legal_entity_id: string;
  scenario_type: ScenarioType;
  requested_by: string;
  status: "PENDING" | "GENERATED" | "FAILED";
  checksum_sha256?: string | null;
  failure_reason?: string | null;
  requested_at: string;
  generated_at?: string | null;
};

/** One source record fixed into a manifest at generation time. */
export type ManifestRecord = {
  manifest_record_id: string;
  manifest_id: string;
  source_type: SourceType;
  source_record_id: string;
  /** Base64 of the raw JSON snapshot — decode with decodeRecordSnapshot. */
  record_snapshot: string;
  fetched_at: string;
};

/**
 * Generate a new evidence manifest.
 *
 * At least one of {governance date range, explicit governance decision IDs,
 * explicit access decision IDs, explicit workflow instance IDs} is required —
 * the service refuses a manifest with nothing to put in it. Every requested
 * workflow instance ID also auto-pulls that instance's full transition
 * history from workflow-history-svc; there is no separate field for that.
 */
export async function generateManifest(params: {
  identity: Identity;
  legalEntityId: string;
  scenarioType: ScenarioType;
  requestedBy?: string;
  governanceDecisionsFrom?: string;
  governanceDecisionsTo?: string;
  governanceDecisionIds?: string[];
  accessDecisionIds?: string[];
  workflowInstanceIds?: string[];
}): Promise<ApiWriteResult<EvidenceManifest>> {
  return apiPost<EvidenceManifest>(
    "evidenceManifest",
    "/v1/evidence-manifests",
    {
      tenant_id: params.identity.tenantId,
      legal_entity_id: params.legalEntityId,
      scenario_type: params.scenarioType,
      ...(params.requestedBy ? { requested_by: params.requestedBy } : {}),
      ...(params.governanceDecisionsFrom ? { governance_decisions_from: params.governanceDecisionsFrom } : {}),
      ...(params.governanceDecisionsTo ? { governance_decisions_to: params.governanceDecisionsTo } : {}),
      ...(params.governanceDecisionIds?.length ? { governance_decision_ids: params.governanceDecisionIds } : {}),
      ...(params.accessDecisionIds?.length ? { access_decision_ids: params.accessDecisionIds } : {}),
      ...(params.workflowInstanceIds?.length ? { workflow_instance_ids: params.workflowInstanceIds } : {}),
    },
    { identity: params.identity, purposeContext: "EVIDENCE_MANIFEST_GENERATION" },
  );
}

/** Read one manifest by id. 404 covers both "unknown" and "another tenant's". */
export async function getManifest(params: {
  identity: Identity;
  manifestId: string;
}): Promise<ApiResult<EvidenceManifest>> {
  return apiGet<EvidenceManifest>(
    "evidenceManifest",
    `/v1/evidence-manifests/${encodeURIComponent(params.manifestId)}`,
    { identity: params.identity },
  );
}

/** Every source record fixed into one manifest, oldest-fetched first. */
export async function listManifestRecords(params: {
  identity: Identity;
  manifestId: string;
}): Promise<ApiResult<ManifestRecord[]>> {
  return apiGet<ManifestRecord[]>(
    "evidenceManifest",
    `/v1/evidence-manifests/${encodeURIComponent(params.manifestId)}/records`,
    { identity: params.identity },
  );
}

/**
 * Decode a record's base64 snapshot back into the object the source service
 * originally answered. Tolerant of a snapshot this console cannot parse —
 * the record itself is real either way, so a decode failure is shown as
 * such rather than hidden.
 */
export function decodeRecordSnapshot(base64: string): { ok: true; data: unknown } | { ok: false; raw: string } {
  try {
    const json = Buffer.from(base64, "base64").toString("utf-8");
    return { ok: true, data: JSON.parse(json) };
  } catch {
    return { ok: false, raw: base64 };
  }
}

/**
 * Human-readable reason for a refused call.
 *
 * The service answers every refusal as {"error":"<code>","detail":"..."},
 * which the shared client folds into one string — matched here by the code.
 */
export function explainManifestError(message: string): string {
  if (message.includes("tenant_mismatch")) {
    return "The legal entity named in the request does not belong to the tenant your session is scoped to.";
  }
  if (message.includes("invalid_scenario_type")) {
    return "That is not a scenario this service recognises. Use AUDIT, REGULATOR, LEGAL_DISCOVERY or COMPLIANCE_REVIEW.";
  }
  if (message.includes("no_records_requested")) {
    return "A manifest needs at least one source: a governance decision date range, explicit governance decision IDs, explicit access decision IDs, or explicit workflow instance IDs.";
  }
  if (message.includes("missing_principal") || message.includes("caller identity missing")) {
    return "The service could not tell who was asking. Sign in again.";
  }
  if (message.includes("missing_field")) {
    return "A required field was left blank.";
  }
  if (message.includes("not_authorized")) {
    return "authorization-svc refused this. Generating a manifest needs EVIDENCE_MANIFEST_GENERATE on the named legal entity; reading one needs EVIDENCE_MANIFEST_READ on the entity it belongs to.";
  }
  if (message.includes("authorization_unavailable")) {
    return "authorization-svc could not be reached, so nothing could be checked. Nothing was generated — this service fails closed rather than guessing.";
  }
  if (message.includes("source_service_unavailable")) {
    return "A source this manifest needed — governance-svc, authorization-svc, workflow-svc, or workflow-history-svc — could not be reached. The manifest was created but marked FAILED rather than left partial; generate again once the source is back.";
  }
  if (message.includes("manifest_not_found")) {
    return "No manifest with that id in this tenant. IDs are exact — check for a typo or a copy-paste that dropped a character.";
  }
  if (message.includes("store_unavailable")) {
    return "The service could not reach its own store, so it refused rather than guessing. Nothing was written.";
  }
  if (message.includes("envelope_incomplete")) {
    return "The request was missing information every write on this platform must carry. Try again — if this repeats, sign in again.";
  }
  return message;
}
