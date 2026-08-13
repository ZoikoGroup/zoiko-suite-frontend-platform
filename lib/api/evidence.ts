// evidence-requirements-svc (:8130, /evidence-requirements-svc through the
// gateway) — the gate that decides whether the evidence required before an
// action may complete actually exists.
//
// Two halves. A catalog of effective-dated requirements, keyed on
// (domain_code, action_type), each saying what artifact must be present. And an
// evaluator that takes a list of asserted artifacts and answers SATISFIED,
// MISSING, or NO_REQUIREMENTS_DEFINED.
//
// THREE OUTCOMES, NOT TWO — and this is the whole point of the service. An empty
// requirement catalog is a legitimate data state, and reporting it as SATISFIED
// would make "nobody has configured this yet" indistinguishable from "verified
// complete". NO_REQUIREMENTS_DEFINED exists so a caller cannot mistake the first
// for the second, and the console never merges the two into a green tick.
//
// This is the strictest service in the suite about its own boundaries, and every
// one of these is a real behaviour rather than a claim:
//
//   - Catalog writes are authorization-gated against authorization-svc, and the
//     check fails CLOSED: an unreachable authorization-svc refuses the write.
//   - A missing X-Tenant-Id is a 400, never defaulted to a placeholder tenant.
//   - A missing X-Principal-Id is a 401.
//   - A body tenant_id that disagrees with the header is a 403, so a caller
//     cannot write into another tenant's catalog.
//   - Artifacts of type SUPPORTING_DOCUMENT are verified against
//     document-vault-svc, and an unreachable vault yields 503 rather than a
//     MISSING verdict — writing a false fact into an append-only ledger is worse
//     than admitting the determination could not be made.
//
// Evaluations are append-only records, so the gate's own decisions are auditable
// evidence too.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

export type EvidenceOutcome = "SATISFIED" | "MISSING" | "NO_REQUIREMENTS_DEFINED";

export type TenantIdentity = Identity & { tenantId: string };
export type WriteIdentity = Identity & { principalId: string; tenantId: string };

/** Wire shape. Field names match the Go json tags exactly. */
export type EvidenceRequirement = {
  evidence_requirement_id: string;
  tenant_id: string;
  /** null / absent means the requirement applies tenant-wide. */
  legal_entity_id?: string | null;
  domain_code: string;
  action_type: string;
  evidence_type: string;
  /** Sufficiency parameters as data — see RequirementSpec. */
  requirement_payload: unknown;
  effective_from: string;
  /** Set means retired. There is no delete route and no is_deleted flag. */
  effective_to?: string | null;
  created_at: string;
  created_by_principal_id: string;
  correlation_id: string;
};

/** The decoded shape of requirement_payload. Every field optional; a completely
 *  empty payload means "one artifact of this evidence_type must be present". */
export type RequirementSpec = {
  /** Absent or zero is treated as 1. */
  minimum_count?: number;
  /** When set, matching artifacts must also declare this subtype. */
  artifact_subtype?: string;
  /** Surfaced in the unmet reason, so a blocked caller learns what to produce. */
  description?: string;
};

export type UnmetRequirement = {
  evidence_requirement_id: string;
  evidence_type: string;
  /** Why this requirement did not count. Individually reported — a bare boolean
   *  is not explainable evidence. */
  reason: string;
};

export type EvidenceEvaluationResult = {
  evaluation_id: string;
  outcome: EvidenceOutcome;
  unmet: UnmetRequirement[] | null;
  evaluated_at: string;
  correlation_id: string;
};

/** The stored evaluation record, as returned by the lookup route. Carries the
 *  payloads frozen at decision time, so it stays truthful after the catalog
 *  changes underneath it. */
export type EvidenceEvaluation = {
  evaluation_id: string;
  tenant_id: string;
  legal_entity_id: string;
  domain_code: string;
  action_type: string;
  outcome: EvidenceOutcome;
  unmet_payload: unknown;
  present_artifacts_payload: unknown;
  evaluated_at: string;
  evaluated_for_principal_id: string;
  correlation_id: string;
};

/** One artifact the caller asserts exists. */
export type PresentArtifact = {
  evidence_type: string;
  /** For SUPPORTING_DOCUMENT this is a document-vault-svc document_id and IS
   *  verified. Other types are taken on the caller's word. */
  reference_id: string;
  artifact_subtype?: string;
};

/** The one evidence type whose references are verifiable against another
 *  service. Not a business constant — a reference-resolution rule. */
export const VERIFIED_EVIDENCE_TYPE = "SUPPORTING_DOCUMENT";

/** Evidence types the console offers when creating a requirement. Free-form data
 *  in the service — nothing there enumerates a permitted set. */
export const EVIDENCE_TYPES = [
  "SUPPORTING_DOCUMENT",
  "SIGNATURE",
  "APPROVAL_RECORD",
  "RECONCILIATION_PROOF",
  "THIRD_PARTY_CONFIRMATION",
] as const;

export type RequirementFilters = {
  /** Required by the service — 400 without it. */
  tenantId: string;
  legalEntityId?: string;
  domainCode?: string;
  actionType?: string;
  /**
   * "now" for currently-effective only, an RFC3339 instant for a point-in-time
   * view, or omitted for EVERYTHING including retired requirements.
   *
   * Omitted is the auditor's view and it is the console's default here: a
   * catalog listing that silently hid retired rows would misrepresent what the
   * gate used to require.
   */
  asOf?: string;
};

/**
 * The requirement catalog.
 *
 * Note the identity asymmetry: tenant_id is a QUERY PARAMETER here, not read
 * from the header, so this read is scoped by what the caller asks for. The
 * console always passes the session tenant.
 */
export async function listEvidenceRequirements(
  filters: RequirementFilters,
  identity: TenantIdentity,
): Promise<ApiResult<EvidenceRequirement[]>> {
  const result = await apiGet<EvidenceRequirement[]>(
    "evidence",
    "/v1/evidence-requirements/",
    {
      query: {
        tenant_id: filters.tenantId,
        legal_entity_id: filters.legalEntityId,
        domain_code: filters.domainCode,
        action_type: filters.actionType,
        as_of: filters.asOf,
      },
      identity,
    },
  );

  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "evidence-requirements-svc returned a non-array requirement list",
      },
    };
  }

  // Effective-from descending, retired rows last — the order an operator reads
  // a catalog in. The service promises no ordering on this route.
  const sorted = [...result.data].sort((a, b) => {
    const retired = Number(Boolean(a.effective_to)) - Number(Boolean(b.effective_to));
    if (retired !== 0) return retired;
    return new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime();
  });
  return { ok: true, data: sorted };
}

/** One requirement by id. Requires the tenant header — a 400 means it never
 *  arrived, which is a different problem from a 404. */
export async function getEvidenceRequirement(
  requirementId: string,
  identity: TenantIdentity,
): Promise<ApiResult<EvidenceRequirement>> {
  return apiGet<EvidenceRequirement>(
    "evidence",
    `/v1/evidence-requirements/${encodeURIComponent(requirementId)}`,
    { identity },
  );
}

export type CreateRequirementInput = {
  identity: WriteIdentity;
  domainCode: string;
  actionType: string;
  evidenceType: string;
  /** Optional. Omitted means "one artifact of this type must be present". */
  spec?: RequirementSpec;
  /** Scope. Omit to apply the requirement tenant-wide, which also widens the
   *  authorization check to the tenant itself. */
  legalEntityId?: string;
  /** RFC3339. Defaults to now server-side when omitted. */
  effectiveFrom?: string;
  correlationId: string;
};

/**
 * Add a requirement to the catalog.
 *
 * Authorization-gated on EVIDENCE_REQUIREMENT_CREATE, checked against the legal
 * entity when the requirement is entity-scoped and against the tenant when it is
 * tenant-wide — the broader scope for the broader rule. The check fails closed.
 *
 * The body's tenant_id must equal the header's; the service answers 403
 * `tenant_scope_mismatch` otherwise, so this always sends the session tenant.
 */
export async function createEvidenceRequirement(
  input: CreateRequirementInput,
): Promise<ApiWriteResult<EvidenceRequirement>> {
  return apiPost<EvidenceRequirement>(
    "evidence",
    "/v1/admin/evidence-requirements/",
    {
      tenant_id: input.identity.tenantId,
      ...(input.legalEntityId ? { legal_entity_id: input.legalEntityId } : {}),
      domain_code: input.domainCode,
      action_type: input.actionType,
      evidence_type: input.evidenceType,
      ...(input.spec ? { requirement_payload: input.spec } : {}),
      ...(input.effectiveFrom ? { effective_from: input.effectiveFrom } : {}),
      correlation_id: input.correlationId,
    },
    { identity: input.identity, correlationId: input.correlationId },
  );
}

/**
 * Retire a requirement by end-dating it.
 *
 * There is no DELETE route and no soft-delete flag anywhere in this service —
 * retirement is effective end-dating, and the retired row stays readable so a
 * past evaluation remains explicable.
 *
 * A reason is mandatory. End-dating one that already carries an effective_to is
 * 422 `already_retired`, never a silent no-op.
 */
export async function retireEvidenceRequirement(input: {
  requirementId: string;
  identity: WriteIdentity;
  reason: string;
  /** RFC3339. Defaults to now server-side. */
  effectiveTo?: string;
}): Promise<ApiWriteResult<EvidenceRequirement>> {
  return apiPost<EvidenceRequirement>(
    "evidence",
    `/v1/admin/evidence-requirements/${encodeURIComponent(input.requirementId)}/end-date`,
    {
      reason: input.reason,
      ...(input.effectiveTo ? { effective_to: input.effectiveTo } : {}),
    },
    { identity: input.identity },
  );
}

export type EvaluateEvidenceInput = {
  identity: WriteIdentity;
  legalEntityId: string;
  domainCode: string;
  actionType: string;
  presentArtifacts: PresentArtifact[];
  /** Required. Also the replay key — a repeat evaluation returns the ORIGINAL
   *  determination rather than re-deciding against a changed catalog. */
  correlationId: string;
};

/**
 * Determine whether the required evidence exists.
 *
 * Always answers 200 on a completed determination — MISSING is a verdict, not an
 * error, so `ok: true` here does NOT mean the action may proceed. Read `outcome`.
 *
 * A replayed correlation_id returns the stored determination unchanged. That is
 * deliberate: the recorded decision must not be rewritten because the catalog
 * moved, so a replay can legitimately disagree with what a fresh evaluation
 * would now say.
 */
export async function evaluateEvidence(
  input: EvaluateEvidenceInput,
): Promise<ApiWriteResult<EvidenceEvaluationResult>> {
  return apiPost<EvidenceEvaluationResult>(
    "evidence",
    "/v1/evidence/evaluate",
    {
      legal_entity_id: input.legalEntityId,
      domain_code: input.domainCode,
      action_type: input.actionType,
      present_artifacts: input.presentArtifacts,
      correlation_id: input.correlationId,
    },
    { identity: input.identity, correlationId: input.correlationId },
  );
}

/** One stored evaluation by id. */
export async function getEvidenceEvaluation(
  evaluationId: string,
  identity: TenantIdentity,
): Promise<ApiResult<EvidenceEvaluation>> {
  return apiGet<EvidenceEvaluation>(
    "evidence",
    `/v1/evidence/evaluations/${encodeURIComponent(evaluationId)}`,
    { identity },
  );
}

// ─── Derived views ───────────────────────────────────────────────────────────

export type CatalogStats = {
  effective: number;
  retired: number;
  /** Distinct (domain_code, action_type) pairs the catalog gates. */
  gatedActions: number;
};

export function summariseCatalog(
  requirements: EvidenceRequirement[],
  now = Date.now(),
): CatalogStats {
  const actions = new Set<string>();
  let effective = 0;
  let retired = 0;

  for (const requirement of requirements) {
    actions.add(`${requirement.domain_code}::${requirement.action_type}`);
    const endsAt = requirement.effective_to
      ? new Date(requirement.effective_to).getTime()
      : null;
    if (endsAt !== null && endsAt <= now) retired += 1;
    else effective += 1;
  }

  return { effective, retired, gatedActions: actions.size };
}

/** Whether a requirement is in force right now. Retirement is a date, not a flag,
 *  so a future effective_to still counts as in force. */
export function isRequirementEffective(
  requirement: EvidenceRequirement,
  now = Date.now(),
): boolean {
  if (new Date(requirement.effective_from).getTime() > now) return false;
  if (!requirement.effective_to) return true;
  return new Date(requirement.effective_to).getTime() > now;
}

/** Decode requirement_payload defensively — it is free-form JSON in the column. */
export function readSpec(payload: unknown): RequirementSpec {
  if (typeof payload !== "object" || payload === null) return {};
  const spec = payload as RequirementSpec;
  return {
    minimum_count: typeof spec.minimum_count === "number" ? spec.minimum_count : undefined,
    artifact_subtype:
      typeof spec.artifact_subtype === "string" ? spec.artifact_subtype : undefined,
    description: typeof spec.description === "string" ? spec.description : undefined,
  };
}

/** How a requirement reads as a sentence. */
export function describeRequirement(requirement: EvidenceRequirement): string {
  const spec = readSpec(requirement.requirement_payload);
  const count = spec.minimum_count && spec.minimum_count > 0 ? spec.minimum_count : 1;
  const subtype = spec.artifact_subtype ? ` of subtype ${spec.artifact_subtype}` : "";
  const plural = count === 1 ? "artifact" : "artifacts";
  return `${count} ${requirement.evidence_type} ${plural}${subtype}`;
}

/** Turn a backend failure into something an operator can act on. */
export function explainEvidenceError(message: string): string {
  if (message.includes("authorization_denied")) {
    return "Authorization denied — this principal does not hold the required permission on this scope. Tenant-wide requirements are checked against the tenant, entity-scoped ones against the entity.";
  }
  if (message.includes("authorization_service_unavailable")) {
    return "Could not verify authorization, so the write was refused. authorization-svc is unreachable — this is a fail-closed refusal, not a denial.";
  }
  if (message.includes("tenant_scope_mismatch")) {
    return "The tenant in the request body does not match the caller's verified tenant scope, so the write was refused. This guard is what stops a caller writing into another tenant's catalog.";
  }
  if (message.includes("missing_tenant")) {
    return "No tenant scope reached the service. It refuses to default to a placeholder tenant, so the request was rejected rather than silently applied somewhere.";
  }
  if (message.includes("identity_missing")) {
    return "No caller identity reached the service, so it failed closed. Sign in again.";
  }
  if (message.includes("already_retired")) {
    return "That requirement is already retired. Re-retiring is reported rather than silently accepted, so the original retirement date stands.";
  }
  if (message.includes("requirement_not_found")) {
    return "That evidence requirement does not exist.";
  }
  if (message.includes("evaluation_not_found")) {
    return "No evaluation with that id exists.";
  }
  if (message.includes("document_service_unavailable")) {
    return "document-vault-svc could not be reached, so the asserted documents could not be verified and no determination was made. Refusing to answer is deliberate — recording MISSING off the back of an outage would write a false fact into an append-only ledger.";
  }
  if (message.includes("as_of")) {
    return "The as-of filter must be an RFC3339 timestamp or the literal \"now\".";
  }
  if (message.includes("missing_field")) {
    return `A required field was empty: ${message.split("missing_field").pop()?.trim() || "check the form"}.`;
  }
  if (message.includes("store_unavailable")) {
    return "evidence-requirements-svc could not reach its database. Nothing was written.";
  }
  return message;
}
