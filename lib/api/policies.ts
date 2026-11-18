// policy-svc (:8085, /policy-svc through the gateway) — named policies, their
// effective-dated versions, and evaluation of an action against them.
//
// Two-level model. A Policy is an immutable named container carrying no rule
// content; the content lives on PolicyVersion rows. A version is created DRAFT
// and must be activated separately — DRAFT -> ACTIVE -> SUPERSEDED, or RETIRED.
// Activating a version supersedes whichever version previously held that scope,
// so "activate" is the only write that changes what the system enforces.
//
// Everything is idempotent on a natural key and distinguishes replay from
// conflict, which is the part most worth carrying into the UI:
//
//   201 → created
//   200 → the same thing already existed, identically; nothing was written
//   409 → the key exists but the attributes differ. NOT a retry — someone is
//         trying to redefine a policy under a name already in use.
//
// Collapsing 200 and 409 into "already exists" would hide an attempted
// redefinition of a governance rule, so they stay apart all the way to the page.
//
// Note on scope: policy_type is required on the applicable-set read and on
// evaluate. There is no "list all policies" endpoint — the service is built to
// answer "what applies here", not "what exists".

import {
  apiGet,
  apiPost,
  type ApiResult,
  type ApiWriteResult,
  type Identity,
} from "./client";
import { formatMoney } from "../format";
import { humanizeCode, humanizeKey } from "../humanize";

/**
 * Who a read is made as. A bare tenant id is still accepted, but policy-svc
 * authorizes every read (401 without X-Principal-Id), so console pages pass the
 * session identity: principal, tenant and the signed envelope.
 */
export type Caller = string | Identity;

function who(caller: Caller): Identity {
  return typeof caller === "string" ? { tenantId: caller } : caller;
}

/** Paged list response (API-4). */
export type PagedList<T> = {
  items: T[];
  next_cursor?: string;
  page_size: number;
};

/**
 * Policy types the console offers.
 *
 * The column is a VARCHAR tag and the service adds new types by data, never by
 * code — so this list constrains the console's forms only. Evaluation logic,
 * however, exists for exactly one of them: see EVALUABLE_POLICY_TYPES.
 */
export const POLICY_TYPES = [
  "APPROVAL_THRESHOLD",
  "SPEND_CONTROL",
  "SOD_RULE",
  "SIGNATORY_MATRIX",
] as const;

export type PolicyType = (typeof POLICY_TYPES)[number];

/**
 * The policy types POST /v1/policies/evaluate can actually decide.
 *
 * Everything else answers 501. This is a real limit, not a rollout gap: the
 * evaluation switch implements APPROVAL_THRESHOLD only. A policy of another type
 * can be created, versioned, and activated — and will then be enforced by
 * nothing, because no caller can evaluate against it.
 */
export const EVALUABLE_POLICY_TYPES: readonly string[] = ["APPROVAL_THRESHOLD"];

/**
 * The types policy-svc certifies before activation (V-001 PDC-05, PDC-I-24):
 * the ones it has an evaluator for. APPROVAL_THRESHOLD is evaluated, and
 * SIGNATORY_MATRIX is resolved, here; the others report EXEMPT_NO_EVALUATOR.
 */
export const CERTIFIED_POLICY_TYPES: readonly string[] = ["APPROVAL_THRESHOLD", "SIGNATORY_MATRIX"];

/** The GOV-05 version states. */
export type VersionStatus =
  | "DRAFT"
  | "REVIEW"
  | "APPROVED"
  | "SCHEDULED"
  | "ACTIVE"
  | "SUSPENDED"
  | "SUPERSEDED"
  | "RETIRED";

/** Summary KPI row from GET /v1/policies/summary. */
export type PolicySummary = {
  tenant_id: string;
  as_of: string;
  policy_families: number;
  versions_draft: number;
  versions_in_review: number;
  versions_approved: number;
  versions_scheduled: number;
  versions_active: number;
  versions_suspended: number;
  suspensions_awaiting_review: number;
  evaluations_24h: number;
  evaluations_approval_required_24h: number;
  evidence_pending: number;
  evidence_failed: number;
  control_test_definitions: number;
  control_tests_failing: number;
  attestations_active: number;
  attestations_revoked: number;
};

/** Get the console KPI summary. */
export async function getPolicySummary(
  caller: Caller,
): Promise<ApiResult<PolicySummary>> {
  return apiGet<PolicySummary>("policy", "/v1/policies/summary", {
    identity: who(caller),
  });
}

/** Wire shape. Field names match the Go json tags exactly. */
export type Policy = {
  policy_id: string;
  policy_code: string;
  policy_name: string;
  policy_type: string;
  created_at: string;
  created_by_principal_id: string;
};

export type PolicyVersion = {
  policy_version_id: string;
  policy_id: string;
  /** null means the version applies to every tenant. */
  tenant_id: string | null;
  /** null means the version applies to the whole tenant. */
  legal_entity_id: string | null;
  rule_payload: unknown;
  effective_from: string;
  effective_to: string | null;
  version_status: VersionStatus | string;
  /** Set once, at first activation, and never overwritten — including when this
   *  version is later superseded. Its own activation history stands. */
  activated_by_principal_id: string | null;
  activated_at: string | null;
  created_at: string;
  created_by_principal_id: string;
  // Lifecycle provenance (GOV-05). Older payloads may omit them.
  /** GLOBAL | TENANT | LEGAL_ENTITY, derived from the two ids above. */
  scope_type?: string;
  version_number?: number;
  source?: string;
  rationale?: string;
  artifact_digest?: string;
  known_from?: string;
  row_version?: number;
  submitted_by_principal_id?: string;
  submitted_at?: string;
  approved_by_principal_id?: string;
  approved_at?: string;
  approval_reference?: string;
  withdrawn_at?: string;
  superseded_at?: string;
  superseded_by_version_id?: string;
  suspended_by_principal_id?: string;
  suspension_reviewed_by_principal_id?: string;
  suspension_reviewed_at?: string;
  suspension_review_outcome?: string;
};

/** A version plus its owning policy's code, as returned by the applicable-set
 *  read. Saves a second round trip when building a rule basis. */
export type ApplicablePolicyVersion = PolicyVersion & { policy_code: string };

/** Policy register: platform families and the caller tenant's own. */
export type PolicyFamily = Policy & {
  tenant_id: string | null;
  policy_status: string;
  versioning_mode: string;
  record_version: number;
  retired_by_principal_id?: string;
  retired_at?: string;
  retirement_reason?: string;
};

export type PolicyPage = PagedList<PolicyFamily>;

/** Version register across every visible family. */
export type PolicyVersionPage = PagedList<PolicyVersion>;

/** Evaluation evidence register. */
export type Evaluation = {
  evidence_id: string;
  tenant_id: string;
  decision_id: string;
  legal_entity_id: string;
  policy_type: string;
  requested_by_principal_id: string;
  input_fingerprint: string;
  action_context: unknown;
  as_of: string;
  known_at: string;
  result: string;
  outcome: string;
  policy_id: string;
  policy_version_id: string;
  policy_code: string;
  artifact_digest: string;
  rule_basis: string;
  selected_rule_ids: string[];
  evaluator_version: string;
  correlation_id: string;
  causation_id: string;
  request_id: string;
  evaluated_at: string;
  ledger_status: string;
};

export type EvaluationPage = PagedList<Evaluation>;

/** Control test definition register. */
export type ControlTestDefinition = {
  control_test_definition_id: string;
  tenant_id: string | null;
  control_ref: string;
  test_code: string;
  title: string;
  methodology: string;
  sample_approach?: string;
  test_frequency?: string;
  design_status: string;
  created_at: string;
  created_by_principal_id: string;
};

export type ControlTestDefinitionPage = PagedList<ControlTestDefinition>;

/** Attestation register. */
export type Attestation = {
  attestation_id: string;
  tenant_id: string | null;
  statement: string;
  statement_version: string;
  subject_ref: string;
  period_start: string;
  period_end: string;
  signer_principal_id: string;
  signer_role: string;
  signed_at: string;
  evidence_refs: string[];
  expires_at?: string;
  attestation_status: string;
  revocation_reason?: string;
  created_at: string;
  created_by_principal_id: string;
};

export type AttestationPage = PagedList<Attestation>;

/** Policy register (GET /v1/policy-families). */
export async function listPolicyFamilies(
  caller: Caller,
  filters?: { policy_type?: string; scope?: "TENANT" | "GLOBAL"; policy_status?: string },
  pageSize?: number,
  cursor?: string,
): Promise<ApiResult<PolicyPage>> {
  const query: Record<string, string> = {};
  if (filters?.policy_type) query["filter[policy_type]"] = filters.policy_type;
  if (filters?.scope) query["filter[scope]"] = filters.scope;
  if (filters?.policy_status) query["filter[policy_status]"] = filters.policy_status;
  if (pageSize) query.page_size = String(pageSize);
  if (cursor) query.cursor = cursor;

  return apiGet<PolicyPage>("policy", "/v1/policy-families", {
    query,
    identity: who(caller),
  });
}

/** Version register (GET /v1/policy-versions). */
export async function listPolicyVersions(
  caller: Caller,
  filters?: { policy_id?: string; policy_type?: string; version_status?: string; legal_entity_id?: string },
  pageSize?: number,
  cursor?: string,
): Promise<ApiResult<PolicyVersionPage>> {
  const query: Record<string, string> = {};
  if (filters?.policy_id) query["filter[policy_id]"] = filters.policy_id;
  if (filters?.policy_type) query["filter[policy_type]"] = filters.policy_type;
  if (filters?.version_status) query["filter[version_status]"] = filters.version_status;
  if (filters?.legal_entity_id) query["filter[legal_entity_id]"] = filters.legal_entity_id;
  if (pageSize) query.page_size = String(pageSize);
  if (cursor) query.cursor = cursor;

  return apiGet<PolicyVersionPage>("policy", "/v1/policy-versions", {
    query,
    identity: who(caller),
  });
}

/** Evaluation evidence register (GET /v1/policy-evaluations). */
export async function listEvaluations(
  caller: Caller,
  filters?: { policy_type?: string; result?: string; legal_entity_id?: string; decision_id?: string; policy_version_id?: string },
  pageSize?: number,
  cursor?: string,
): Promise<ApiResult<EvaluationPage>> {
  const query: Record<string, string> = {};
  if (filters?.policy_type) query["filter[policy_type]"] = filters.policy_type;
  if (filters?.result) query["filter[result]"] = filters.result;
  if (filters?.legal_entity_id) query["filter[legal_entity_id]"] = filters.legal_entity_id;
  if (filters?.decision_id) query["filter[decision_id]"] = filters.decision_id;
  if (filters?.policy_version_id) query["filter[policy_version_id]"] = filters.policy_version_id;
  if (pageSize) query.page_size = String(pageSize);
  if (cursor) query.cursor = cursor;

  return apiGet<EvaluationPage>("policy", "/v1/policy-evaluations", {
    query,
    identity: who(caller),
  });
}

/** Control test definition register (GET /v1/control-test-definitions). */
export async function listControlTestDefinitions(
  caller: Caller,
  filters?: { control_ref?: string; design_status?: string },
  pageSize?: number,
  cursor?: string,
): Promise<ApiResult<ControlTestDefinitionPage>> {
  const query: Record<string, string> = {};
  if (filters?.control_ref) query["filter[control_ref]"] = filters.control_ref;
  if (filters?.design_status) query["filter[design_status]"] = filters.design_status;
  if (pageSize) query.page_size = String(pageSize);
  if (cursor) query.cursor = cursor;

  return apiGet<ControlTestDefinitionPage>("policy", "/v1/control-test-definitions", {
    query,
    identity: who(caller),
  });
}

/** Attestation register (GET /v1/attestations). */
export async function listAttestations(
  caller: Caller,
  filters?: { subject_ref?: string; attestation_status?: string; signer_principal_id?: string },
  pageSize?: number,
  cursor?: string,
): Promise<ApiResult<AttestationPage>> {
  const query: Record<string, string> = {};
  if (filters?.subject_ref) query["filter[subject_ref]"] = filters.subject_ref;
  if (filters?.attestation_status) query["filter[attestation_status]"] = filters.attestation_status;
  if (filters?.signer_principal_id) query["filter[signer_principal_id]"] = filters.signer_principal_id;
  if (pageSize) query.page_size = String(pageSize);
  if (cursor) query.cursor = cursor;

  return apiGet<AttestationPage>("policy", "/v1/attestations", {
    query,
    identity: who(caller),
  });
}

/** Single policy family (GET /v1/policies/{policy_id}). */
export async function getPolicy(
  policyId: string,
  caller: Caller,
): Promise<ApiResult<Policy>> {
  return apiGet<Policy>(
    "policy",
    `/v1/policies/${encodeURIComponent(policyId)}`,
    { identity: who(caller) },
  );
}

/** Single policy version (GET /v1/policy-versions/{version_id}). */
export async function getPolicyVersionByID(
  versionId: string,
  caller: Caller,
  callerLegalEntityId?: string,
): Promise<ApiResult<PolicyVersion>> {
  return apiGet<PolicyVersion>(
    "policy",
    `/v1/policy-versions/${encodeURIComponent(versionId)}`,
    { identity: { ...who(caller), ...(callerLegalEntityId ? { legalEntityId: callerLegalEntityId } : {}) } },
  );
}

/** Compare two versions (GET /v1/policy-versions/compare). */
export type Comparison = {
  base: PolicyVersion;
  target: PolicyVersion;
  same_content: boolean;
  field_changes: { field: string; base: unknown; target: unknown }[];
  payload_changes: { path: string; change: "added" | "removed" | "changed"; base: unknown; target: unknown }[];
};

export async function comparePolicyVersions(
  baseVersionId: string,
  targetVersionId: string,
  caller: Caller,
): Promise<ApiResult<Comparison>> {
  return apiGet<Comparison>("policy", "/v1/policy-versions/compare", {
    query: { base: baseVersionId, target: targetVersionId },
    identity: who(caller),
  });
}

/** Version transitions (GET /v1/policy-versions/{version_id}/transitions). */
export type VersionTransition = {
  transition_id: string;
  policy_version_id: string;
  from_status: string | null;
  to_status: string;
  actor_id: string;
  reason: string;
  approval_reference?: string;
  correlation_id: string;
  occurred_at: string;
};

export type VersionTransitionPage = PagedList<VersionTransition>;

export async function listTransitions(
  versionId: string,
  caller: Caller,
  pageSize?: number,
  cursor?: string,
): Promise<ApiResult<VersionTransitionPage>> {
  const query: Record<string, string> = {};
  if (pageSize) query.page_size = String(pageSize);
  if (cursor) query.cursor = cursor;

  return apiGet<VersionTransitionPage>(
    "policy",
    `/v1/policy-versions/${encodeURIComponent(versionId)}/transitions`,
    { query, identity: who(caller) },
  );
}

/** Single evaluation evidence (GET /v1/policy-evaluations/{evidence_id}). */
export async function getEvaluation(
  evidenceId: string,
  caller: Caller,
): Promise<ApiResult<Evaluation>> {
  return apiGet<Evaluation>(
    "policy",
    `/v1/policy-evaluations/${encodeURIComponent(evidenceId)}`,
    { identity: who(caller) },
  );
}

/**
 * Re-queue evidence the ledger refused (POST /v1/policy-evaluations/{evidence_id}/redeliver).
 * Only a FAILED row can be re-driven; the caller's full identity goes with it.
 */
export async function redeliverPolicyEvidence(
  evidenceId: string,
  reasonCode: string,
  identity: Identity & { principalId: string },
  reason?: string,
): Promise<ApiWriteResult<Evaluation>> {
  return apiPost<Evaluation>(
    "policy",
    `/v1/policy-evaluations/${encodeURIComponent(evidenceId)}/redeliver`,
    { reason_code: reasonCode, reason },
    { identity },
  );
}

/** Retire a policy family (POST /v1/policies/{policy_id}/retire). */
export async function retirePolicyFamily(
  policyId: string,
  reasonCode: string,
  reason: string | undefined,
  expectedVersion: number | undefined,
  identity: Identity,
): Promise<ApiWriteResult<Policy>> {
  return apiPost<Policy>(
    "policy",
    `/v1/policies/${encodeURIComponent(policyId)}/retire`,
    { reason_code: reasonCode, reason, expected_version: expectedVersion },
    { identity },
  );
}

export type ApplicableScope = {
  policyType: string;
  /** Omit for global-only scope. */
  tenantId?: string;
  legalEntityId?: string;
  /**
   * The caller's own verified tenant, sent as X-Tenant-Id. Distinct from
   * `tenantId`, which is the SCOPE being asked about — a global-only read has
   * no scope tenant but still has a caller.
   *
   * Required: policy-svc used to take `?tenant_id=` as the scope outright, so
   * any caller could read the policy set another tenant is governed by. It now
   * refuses a read with no verified scope, and a `tenantId` naming a different
   * tenant is a 403.
   */
  callerTenantId: string;
  /**
   * The caller's full identity: principal, legal entity and the signed
   * envelope. policy-svc authorizes every read (POLICY_READ) and, under
   * POLICY_IDENTITY_VERIFY=enforce, refuses bare identity headers 401, so a
   * read sent with the tenant alone is refused. Preferred over callerTenantId.
   */
  caller?: Identity;
};

/**
 * The currently-ACTIVE versions of a policy type that apply to a scope,
 * most-specific first.
 *
 * "Most specific first" is the service's ordering and it matters: evaluation
 * uses the first match, so an entity-scoped version outranks a tenant-scoped
 * one, which outranks a global one. An empty list means nothing is active for
 * this type and scope — the service does not fall back and does not invent a
 * default.
 */
export async function listApplicablePolicyVersions(
  scope: ApplicableScope,
): Promise<ApiResult<ApplicablePolicyVersion[]>> {
  const result = await apiGet<ApplicablePolicyVersion[]>("policy", "/v1/policies", {
    query: {
      policy_type: scope.policyType,
      tenant_id: scope.tenantId,
      legal_entity_id: scope.legalEntityId,
    },
    identity: scope.caller ?? { tenantId: scope.callerTenantId },
  });

  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: { kind: "malformed", message: "policy-svc returned a non-array policy list" },
    };
  }
  return { ok: true, data: result.data };
}

/**
 * Every version of one policy, whatever its status.
 *
 * This is the audit view — it includes DRAFT versions that were never activated
 * and SUPERSEDED ones that no longer apply. 404 means the policy_id itself does
 * not exist, which is different from a policy that exists with no versions.
 */
export async function listPolicyVersionHistory(
  policyId: string,
  /**
   * The caller's verified tenant, sent as X-Tenant-Id.
   *
   * Required, and it was missing: this call passed no identity at all, so
   * policy-svc's requireTenant refused every request with 401
   * `tenant_scope_missing` and the version-history panel could never render
   * anything but its error state. The tenant is also what scopes the result —
   * the service returns this tenant's versions plus any global ones, so a read
   * with no tenant would have no defined answer even if it were allowed.
   */
  caller: Caller,
): Promise<ApiResult<PolicyVersion[]>> {
  const result = await apiGet<PolicyVersion[]>(
    "policy",
    `/v1/policies/${encodeURIComponent(policyId)}/versions`,
    { identity: who(caller) },
  );

  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: { kind: "malformed", message: "policy-svc returned a non-array version list" },
    };
  }

  // Newest first. The service does not promise an order on this route, and a
  // history that jumps around is unreadable.
  const sorted = [...result.data].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return { ok: true, data: sorted };
}

export type CreatePolicyInput = {
  /** Stable human-readable identifier AND the idempotency key. Reusing a code
   *  with a different name or type is a 409, not an update. */
  policyCode: string;
  policyName: string;
  policyType: string;
  /**
   * The full caller identity, not just the principal.
   *
   * This took a principalId alone, so the envelope carried X-Principal-Id and
   * neither X-Tenant-Id nor X-Legal-Entity-Id — and policy-svc enforces the
   * same canonical contract every service does, refusing the write with
   * "canonical input contract violated: legal_entity_id, tenant_id". Every
   * policy created from this console was rejected before it reached the
   * service.
   */
  identity: Identity;
  /** Optional client-supplied id. The service generates one when omitted. */
  policyId?: string;
};

/** Create a named policy container. Carries no rule content — that needs a version. */
export async function createPolicy(input: CreatePolicyInput): Promise<ApiWriteResult<Policy>> {
  return apiPost<Policy>(
    "policy",
    "/v1/policies",
    {
      ...(input.policyId ? { policy_id: input.policyId } : {}),
      policy_code: input.policyCode,
      policy_name: input.policyName,
      policy_type: input.policyType,
      created_by_principal_id: input.identity.principalId,
    },
    { identity: input.identity },
  );
}

export type CreatePolicyVersionInput = {
  policyId: string;
  /** Parsed JSON. For APPROVAL_THRESHOLD this must contain a numeric
   *  `threshold_amount` — without it, evaluation of this version answers 500
   *  `invalid_policy_payload` rather than failing at creation time. */
  rulePayload: unknown;
  /** RFC3339. Required — the service rejects a zero timestamp. */
  effectiveFrom: string;
  effectiveTo?: string;
  /** Omit both to make the version global. */
  tenantId?: string;
  legalEntityId?: string;
  principalId: string;
  /**
   * The caller's own verified tenant, sent as X-Tenant-Id. Distinct from
   * `tenantId`, which is the SCOPE the version binds — a global version binds
   * no tenant but is still published BY one.
   *
   * Required: `tenant_id` in the body used to be written straight through, so a
   * principal holding POLICY_VERSION_CREATE on one legal entity could publish a
   * version binding another tenant entirely. The service now files the version
   * under the verified scope and answers 403 when the body disagrees.
   */
  callerTenantId: string;
  /**
   * The caller's own legal entity, sent as X-Legal-Entity-Id.
   *
   * Distinct from `legalEntityId`, which is the SCOPE the version binds — a
   * tenant-wide or global version binds no entity but is still published FROM
   * one, and policy-svc declares `LegalEntityID: RequiredOnWrite`, so it
   * refuses any write that does not carry the caller's.
   *
   * Required, and it was absent: this call sent only principal and tenant, so
   * every attempt to add a version was refused 400 `envelope_incomplete`
   * before it reached the service's own logic. Nothing about the form or the
   * values entered could have made it succeed.
   */
  callerLegalEntityId: string;
  policyVersionId?: string;
  /**
   * The caller's session identity, carried for its signed envelope. Rebuilding
   * the identity from the three ids above dropped the envelope, and under
   * POLICY_IDENTITY_VERIFY=enforce policy-svc answered every version draft 401.
   */
  caller?: Identity;
};

/**
 * Add a DRAFT version to a policy.
 *
 * Always DRAFT — there is no way to create an already-active version, which is
 * what makes activation a separate, attributable act.
 */
export async function createPolicyVersion(
  input: CreatePolicyVersionInput,
): Promise<ApiWriteResult<PolicyVersion>> {
  return apiPost<PolicyVersion>(
    "policy",
    `/v1/policies/${encodeURIComponent(input.policyId)}/versions`,
    {
      ...(input.policyVersionId ? { policy_version_id: input.policyVersionId } : {}),
      ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
      ...(input.legalEntityId ? { legal_entity_id: input.legalEntityId } : {}),
      rule_payload: input.rulePayload,
      effective_from: input.effectiveFrom,
      ...(input.effectiveTo ? { effective_to: input.effectiveTo } : {}),
      created_by_principal_id: input.principalId,
    },
    {
      identity: {
        ...input.caller,
        principalId: input.principalId,
        tenantId: input.callerTenantId,
        legalEntityId: input.callerLegalEntityId,
      },
    },
  );
}

/**
 * Activate an APPROVED version, superseding whatever held its scope before
 * (or scheduling it, when its effective_from is in the future).
 *
 * The single write in this service that changes what gets enforced. GOV-05:
 * only an APPROVED version can go live (409 APPROVAL_REQUIRED otherwise), its
 * author cannot activate it (403 SOD_CONFLICT), and an evaluable type must be
 * certified against its family's test suite first (409 CERTIFICATION_REQUIRED).
 * Activating a version already ACTIVE answers 200 and changes nothing.
 */
export async function activatePolicyVersion(input: {
  policyId: string;
  versionId: string;
  /**
   * The version's row_version, read just before. policy-svc refuses a
   * lifecycle command that names no version (428) and one that names a stale
   * version (412): a command never applies to "whatever is there now".
   */
  expectedVersion: number;
  /**
   * The full caller identity, not just the principal.
   *
   * This took a principalId alone, so the request carried neither
   * X-Tenant-Id nor X-Legal-Entity-Id — and policy-svc refused it 401 before
   * any handler ran, because a missing tenant is an authentication failure
   * rather than a validation one. Activation is the one write on this page
   * that changes what the platform enforces, and it could not be performed
   * from the console at all.
   */
  identity: Identity & { principalId: string };
}): Promise<ApiWriteResult<PolicyVersion>> {
  return apiPost<PolicyVersion>(
    "policy",
    `/v1/policies/${encodeURIComponent(input.policyId)}/versions/${encodeURIComponent(
      input.versionId,
    )}/activate`,
    // activated_by_principal_id is not sent: policy-svc takes the activator
    // from the authenticated principal and ignores the body field.
    { expected_version: input.expectedVersion },
    { identity: input.identity },
  );
}

/** Submit a version for review (POST /v1/policies/{policy_id}/versions/{version_id}/submit-review). */
export async function submitPolicyVersionForReview(
  policyId: string,
  versionId: string,
  expectedVersion: number | undefined,
  identity: Identity & { principalId: string },
): Promise<ApiWriteResult<PolicyVersion>> {
  return apiPost<PolicyVersion>(
    "policy",
    `/v1/policies/${encodeURIComponent(policyId)}/versions/${encodeURIComponent(versionId)}/submit-review`,
    { expected_version: expectedVersion },
    { identity },
  );
}

/** Approve a version (POST /v1/policies/{policy_id}/versions/{version_id}/approve). */
export async function approvePolicyVersion(
  policyId: string,
  versionId: string,
  expectedVersion: number | undefined,
  approvalReference?: string,
  identity?: Identity & { principalId: string },
): Promise<ApiWriteResult<PolicyVersion>> {
  return apiPost<PolicyVersion>(
    "policy",
    `/v1/policies/${encodeURIComponent(policyId)}/versions/${encodeURIComponent(versionId)}/approve`,
    { expected_version: expectedVersion, approval_reference: approvalReference },
    { identity: identity! },
  );
}

/** Schedule a version (POST /v1/policies/{policy_id}/versions/{version_id}/schedule). */
export async function schedulePolicyVersion(
  policyId: string,
  versionId: string,
  expectedVersion: number | undefined,
  identity: Identity & { principalId: string },
): Promise<ApiWriteResult<PolicyVersion>> {
  return apiPost<PolicyVersion>(
    "policy",
    `/v1/policies/${encodeURIComponent(policyId)}/versions/${encodeURIComponent(versionId)}/schedule`,
    { expected_version: expectedVersion },
    { identity },
  );
}

/** Suspend a version (POST /v1/policies/{policy_id}/versions/{version_id}/suspend). */
export async function suspendPolicyVersion(
  policyId: string,
  versionId: string,
  expectedVersion: number | undefined,
  reasonCode: string,
  identity: Identity & { principalId: string },
  reason?: string,
): Promise<ApiWriteResult<PolicyVersion>> {
  return apiPost<PolicyVersion>(
    "policy",
    `/v1/policies/${encodeURIComponent(policyId)}/versions/${encodeURIComponent(versionId)}/suspend`,
    { expected_version: expectedVersion, reason_code: reasonCode, reason },
    { identity },
  );
}

/** Retire a version (POST /v1/policies/{policy_id}/versions/{version_id}/retire). */
export async function retirePolicyVersion(
  policyId: string,
  versionId: string,
  expectedVersion: number | undefined,
  reasonCode: string,
  identity: Identity & { principalId: string },
  reason?: string,
): Promise<ApiWriteResult<PolicyVersion>> {
  return apiPost<PolicyVersion>(
    "policy",
    `/v1/policies/${encodeURIComponent(policyId)}/versions/${encodeURIComponent(versionId)}/retire`,
    { expected_version: expectedVersion, reason_code: reasonCode, reason },
    { identity },
  );
}

/** Review a suspension (POST /v1/policies/{policy_id}/versions/{version_id}/review-suspension). */
export async function reviewPolicyVersionSuspension(
  policyId: string,
  versionId: string,
  expectedVersion: number | undefined,
  reasonCode: string,
  outcome: "UPHELD" | "OVERTURNED",
  identity: Identity & { principalId: string },
  reason?: string,
): Promise<ApiWriteResult<PolicyVersion>> {
  return apiPost<PolicyVersion>(
    "policy",
    `/v1/policies/${encodeURIComponent(policyId)}/versions/${encodeURIComponent(versionId)}/review-suspension`,
    { expected_version: expectedVersion, reason_code: reasonCode, reason, outcome },
    { identity },
  );
}

export type EvaluateResult = {
  /** For APPROVAL_THRESHOLD: WITHIN_THRESHOLD or APPROVAL_REQUIRED. */
  result: string;
  policy_version_id: string;
  /** "<policy_code>:<policy_version_id>" — the basis recorded as evidence. */
  rule_basis: string;
};

export type EvaluateInput = {
  policyType: string;
  /** For APPROVAL_THRESHOLD this must carry a numeric `amount`. */
  actionContext: unknown;
  identity: Identity & { principalId: string };
  /** Caller-supplied idempotency key, forwarded to the evidence log so a
   *  retried evaluation does not record a second decision. Required. */
  decisionId: string;
  tenantId?: string;
  legalEntityId?: string;
};

/**
 * Evaluate an action against the applicable policy.
 *
 * Also records the evaluation into governance-decision-log-svc as evidence —
 * best-effort, and deliberately so: this endpoint's availability does not depend
 * on the evidence store's. A successful 200 therefore does NOT guarantee the
 * decision was logged. Nothing in the response distinguishes the two, so the
 * console cross-checks the log rather than assuming.
 *
 * 404 means no ACTIVE policy applies to that type and scope. The service returns
 * it rather than guessing, and explicitly leaves fail-open vs fail-closed to the
 * caller — so the console reports it as an unenforceable action, not as a pass.
 */
export async function evaluatePolicy(
  input: EvaluateInput,
): Promise<ApiWriteResult<EvaluateResult>> {
  return apiPost<EvaluateResult>(
    "policy",
    "/v1/policies/evaluate",
    {
      policy_type: input.policyType,
      ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
      ...(input.legalEntityId ? { legal_entity_id: input.legalEntityId } : {}),
      action_context: input.actionContext,
      evaluated_by_principal_id: input.identity.principalId,
      decision_id: input.decisionId,
    },
    { identity: input.identity, correlationId: input.decisionId },
  );
}

// ─── Control Test Definitions ────────────────────────────────────────────────

export type CreateControlTestDefinitionInput = {
  controlRef: string;
  testCode: string;
  title: string;
  methodology: string;
  sampleApproach?: string;
  testFrequency?: string;
  controlTestDefinitionId?: string;
  identity: Identity;
};

export async function createControlTestDefinition(
  input: CreateControlTestDefinitionInput,
): Promise<ApiWriteResult<ControlTestDefinition>> {
  return apiPost<ControlTestDefinition>(
    "policy",
    "/v1/control-test-definitions",
    {
      control_ref: input.controlRef,
      test_code: input.testCode,
      title: input.title,
      methodology: input.methodology,
      sample_approach: input.sampleApproach,
      test_frequency: input.testFrequency,
      ...(input.controlTestDefinitionId ? { control_test_definition_id: input.controlTestDefinitionId } : {}),
    },
    { identity: input.identity },
  );
}

export async function getControlTestDefinition(
  id: string,
  caller: Caller,
): Promise<ApiResult<ControlTestDefinition>> {
  return apiGet<ControlTestDefinition>(
    "policy",
    `/v1/control-test-definitions/${encodeURIComponent(id)}`,
    { identity: who(caller) },
  );
}

// ─── Control Test Executions ────────────────────────────────────────────────

export type CreateControlTestExecutionInput = {
  controlTestDefinitionId: string;
  periodStart: string;
  periodEnd: string;
  populationDescription?: string;
  sampleDescription?: string;
  procedureNotes?: string;
  evidenceRefs?: string[];
  result: string;
  exceptionsNoted?: string;
  reviewerPrincipalId?: string;
  controlTestExecutionId?: string;
  identity: Identity & { principalId: string };
  callerTenantId: string;
};

export type ControlTestExecution = {
  control_test_execution_id: string;
  tenant_id: string | null;
  control_test_definition_id: string;
  period_start: string;
  period_end: string;
  population_description?: string;
  sample_description?: string;
  procedure_notes?: string;
  evidence_refs: string[];
  tester_principal_id: string;
  result: string;
  exceptions_noted?: string;
  reviewer_principal_id?: string;
  reviewed_at?: string;
  created_at: string;
  created_by_principal_id: string;
};

export type ControlTestExecutionPage = PagedList<ControlTestExecution>;

export async function createControlTestExecution(
  input: CreateControlTestExecutionInput,
): Promise<ApiWriteResult<ControlTestExecution>> {
  return apiPost<ControlTestExecution>(
    "policy",
    `/v1/control-test-definitions/${encodeURIComponent(input.controlTestDefinitionId)}/executions`,
    {
      period_start: input.periodStart,
      period_end: input.periodEnd,
      population_description: input.populationDescription,
      sample_description: input.sampleDescription,
      procedure_notes: input.procedureNotes,
      evidence_refs: input.evidenceRefs,
      result: input.result,
      exceptions_noted: input.exceptionsNoted,
      reviewer_principal_id: input.reviewerPrincipalId,
      ...(input.controlTestExecutionId ? { control_test_execution_id: input.controlTestExecutionId } : {}),
    },
    { identity: input.identity },
  );
}

export async function listControlTestExecutions(
  definitionId: string,
  caller: Caller,
  pageSize?: number,
  cursor?: string,
): Promise<ApiResult<ControlTestExecutionPage>> {
  const query: Record<string, string> = {};
  if (pageSize) query.page_size = String(pageSize);
  if (cursor) query.cursor = cursor;

  return apiGet<ControlTestExecutionPage>(
    "policy",
    `/v1/control-test-definitions/${encodeURIComponent(definitionId)}/executions`,
    { query, identity: who(caller) },
  );
}

// ─── Control Effectiveness ──────────────────────────────────────────────────

export type ControlEffectiveness = {
  control_ref: string;
  design_status: string;
  operating_effectiveness: string;
  as_of: string;
  latest_execution_id: string;
};

export async function getControlEffectiveness(
  controlRef: string,
  caller: Caller,
): Promise<ApiResult<ControlEffectiveness>> {
  return apiGet<ControlEffectiveness>(
    "policy",
    `/v1/controls/${encodeURIComponent(controlRef)}/effectiveness`,
    { identity: who(caller) },
  );
}

// ─── Attestations ────────────────────────────────────────────────────────────

export type CreateAttestationInput = {
  statement: string;
  statementVersion: string;
  subjectRef: string;
  periodStart: string;
  periodEnd: string;
  signerRole: string;
  evidenceRefs?: string[];
  expiresAt?: string;
  attestationId?: string;
  identity: Identity & { principalId: string };
  callerTenantId: string;
};

export async function createAttestation(
  input: CreateAttestationInput,
): Promise<ApiWriteResult<Attestation>> {
  return apiPost<Attestation>(
    "policy",
    "/v1/attestations",
    {
      statement: input.statement,
      statement_version: input.statementVersion,
      subject_ref: input.subjectRef,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      signer_role: input.signerRole,
      evidence_refs: input.evidenceRefs,
      expires_at: input.expiresAt,
      ...(input.attestationId ? { attestation_id: input.attestationId } : {}),
    },
    { identity: input.identity },
  );
}

export async function getAttestation(
  id: string,
  caller: Caller,
): Promise<ApiResult<Attestation>> {
  return apiGet<Attestation>(
    "policy",
    `/v1/attestations/${encodeURIComponent(id)}`,
    { identity: who(caller) },
  );
}

/**
 * Revoke an attestation (ACTIVE or CHALLENGED → REVOKED; a second revocation
 * is 409). Takes the caller's full identity: a material write carries the
 * legal entity and the signed envelope, not just tenant and principal.
 */
export async function revokeAttestation(
  id: string,
  identity: Identity & { principalId: string },
  reason?: string,
): Promise<ApiWriteResult<Attestation>> {
  return apiPost<Attestation>(
    "policy",
    `/v1/attestations/${encodeURIComponent(id)}/revoke`,
    { reason },
    { identity },
  );
}

// ─── Resolution & Explain ────────────────────────────────────────────────────

export type Resolution = {
  status: "RESOLVED" | "NOT_APPLICABLE" | "CONFLICTED";
  as_of: string;
  known_at: string;
  selected?: ApplicablePolicyVersion;
  conflicting?: ApplicablePolicyVersion[];
  trace?: {
    policy_version_id: string;
    policy_id: string;
    policy_code: string;
    version_number: number;
    scope_type: string;
    version_status: string;
    governs: boolean;
    reason: string;
  }[];
};

export async function resolveEffectivePolicy(
  scope: ApplicableScope,
  asOf?: string,
  knownAt?: string,
): Promise<ApiResult<Resolution>> {
  const query: Record<string, string> = {};
  if (asOf) query.as_of = asOf;
  if (knownAt) query.known_at = knownAt;

  return apiGet<Resolution>("policy", "/v1/policies/resolve", {
    query: {
      policy_type: scope.policyType,
      tenant_id: scope.tenantId,
      legal_entity_id: scope.legalEntityId,
      ...query,
    },
    identity: scope.caller ?? { tenantId: scope.callerTenantId },
  });
}

export async function explainPolicyResolution(
  scope: ApplicableScope,
  asOf?: string,
  knownAt?: string,
): Promise<ApiResult<Resolution>> {
  const query: Record<string, string> = {};
  if (asOf) query.as_of = asOf;
  if (knownAt) query.known_at = knownAt;

  return apiGet<Resolution>("policy", "/v1/policies/explain", {
    query: {
      policy_type: scope.policyType,
      tenant_id: scope.tenantId,
      legal_entity_id: scope.legalEntityId,
      ...query,
    },
    identity: scope.caller ?? { tenantId: scope.callerTenantId },
  });
}

// ─── Accounting Policies (REF-07) ────────────────────────────────────────────

/**
 * The policy_type of every accounting policy family. Its versions move through
 * /v1/accounting-policies/versions/{id}/…, never the GOV-05 routes (policy-svc
 * refuses those with `accounting_policy_endpoint_required`).
 */
export const ACCOUNTING_POLICY_TYPE = "ACCOUNTING_POLICY";

export type ImpactAnalysis = {
  summary: string;
  affected_periods: "FUTURE_ONLY" | "OPEN_PERIODS";
  closed_history_unchanged: boolean;
  retroactive_justification?: string;
  notes?: string;
};

export type RuleMapping = {
  ref_kind: string;
  ref: string;
  ref_version: string;
  rationale: string;
  maps_to?: string;
  depends_on_version_id?: string;
};

export type DraftAccountingPolicyInput = {
  policyDomain: string;
  framework: string;
  bookId?: string;
  jurisdictionId?: string;
  legalEntityId?: string;
  semanticVersion: string;
  precedence: number;
  frameworkSource: string;
  policyTextRef: string;
  ruleMappings?: RuleMapping[];
  impactAnalysis: ImpactAnalysis;
  effectiveFrom: string;
  effectiveTo?: string;
  rationale: string;
  identity: Identity;
  callerTenantId: string;
  callerLegalEntityId?: string;
};

export type AccountingApplicability = {
  policy_id: string;
  policy_domain: string;
  framework: string;
  book_id?: string;
  jurisdiction_id?: string;
  created_at: string;
};

export type AccountingVersionDetails = {
  semantic_version: string;
  precedence: number;
  framework_source: string;
  policy_text_ref: string;
  impact_analysis: ImpactAnalysis;
};

export type AccountingPolicyVersion = PolicyVersion & {
  policy_code: string;
  applicability: AccountingApplicability;
  details: AccountingVersionDetails;
  rule_mappings: RuleMapping[];
};

export type AccountingPin = {
  policy_id: string;
  policy_version_id: string;
  version_number: number;
  semantic_version: string;
  artifact_digest: string;
  row_version: number;
};

export type AccountingVersionSummary = {
  pin: AccountingPin;
  policy_domain: string;
  framework: string;
  book_id?: string;
  jurisdiction_id?: string;
  legal_entity_id?: string;
  scope_type: string;
  precedence: number;
  version_status: string;
  effective_from: string;
  effective_to?: string;
};

export type AccountingResolution = {
  status: "RESOLVED" | "NOT_APPLICABLE" | "CONFLICTED";
  blocks_calculation: boolean;
  policy_domain: string;
  as_of: string;
  known_at: string;
  pin?: AccountingPin;
  selected?: AccountingVersionSummary;
  conflicting?: AccountingVersionSummary[];
  trace?: {
    policy_version_id: string;
    policy_id: string;
    policy_code: string;
    version_number: number;
    scope_type: string;
    version_status: string;
    governs: boolean;
    reason: string;
    policy_domain: string;
    book_id?: string;
    jurisdiction_id?: string;
    semantic_version: string;
    precedence: number;
  }[];
};

export type ResolvedAccountingPolicy = {
  status: "RESOLVED";
  blocks_calculation: false;
  policy_domain: string;
  as_of: string;
  known_at: string;
  pin: AccountingPin;
  policy: AccountingPolicyVersion;
};

export async function draftAccountingPolicy(
  input: DraftAccountingPolicyInput,
): Promise<ApiWriteResult<AccountingPolicyVersion>> {
  return apiPost<AccountingPolicyVersion>(
    "policy",
    "/v1/accounting-policies",
    {
      policy_domain: input.policyDomain,
      framework: input.framework,
      book_id: input.bookId,
      jurisdiction_id: input.jurisdictionId,
      legal_entity_id: input.legalEntityId,
      semantic_version: input.semanticVersion,
      precedence: input.precedence,
      framework_source: input.frameworkSource,
      policy_text_ref: input.policyTextRef,
      rule_mappings: input.ruleMappings,
      impact_analysis: input.impactAnalysis,
      effective_from: input.effectiveFrom,
      effective_to: input.effectiveTo,
      rationale: input.rationale,
    },
    {
      // Spread first so the signed envelope travels with the explicit ids.
      identity: {
        ...input.identity,
        principalId: input.identity.principalId,
        tenantId: input.callerTenantId,
        legalEntityId: input.callerLegalEntityId,
      },
    },
  );
}

export async function listApplicableAccountingPolicies(
  identity: Identity,
  policyDomain?: string,
  bookId?: string,
  jurisdictionId?: string,
  legalEntityId?: string,
  asOf?: string,
  knownAt?: string,
): Promise<ApiResult<{ as_of: string; known_at: string; policies: AccountingResolution[] }>> {
  const query: Record<string, string> = {};
  if (policyDomain) query.policy_domain = policyDomain;
  if (bookId) query.book_id = bookId;
  if (jurisdictionId) query.jurisdiction_id = jurisdictionId;
  if (legalEntityId) query.legal_entity_id = legalEntityId;
  if (asOf) query.as_of = asOf;
  if (knownAt) query.known_at = knownAt;

  return apiGet<{ as_of: string; known_at: string; policies: AccountingResolution[] }>(
    "policy",
    "/v1/accounting-policies",
    { query, identity },
  );
}

export async function resolveAccountingPolicy(
  identity: Identity,
  policyDomain: string,
  bookId?: string,
  jurisdictionId?: string,
  legalEntityId?: string,
  asOf?: string,
  knownAt?: string,
): Promise<ApiResult<ResolvedAccountingPolicy>> {
  const query: Record<string, string> = { policy_domain: policyDomain };
  if (bookId) query.book_id = bookId;
  if (jurisdictionId) query.jurisdiction_id = jurisdictionId;
  if (legalEntityId) query.legal_entity_id = legalEntityId;
  if (asOf) query.as_of = asOf;
  if (knownAt) query.known_at = knownAt;

  return apiGet<ResolvedAccountingPolicy>("policy", "/v1/accounting-policies/resolve", {
    query,
    identity,
  });
}

export async function explainAccountingResolution(
  identity: Identity,
  policyDomain: string,
  bookId?: string,
  jurisdictionId?: string,
  legalEntityId?: string,
  asOf?: string,
  knownAt?: string,
): Promise<ApiResult<AccountingResolution>> {
  const query: Record<string, string> = { policy_domain: policyDomain };
  if (bookId) query.book_id = bookId;
  if (jurisdictionId) query.jurisdiction_id = jurisdictionId;
  if (legalEntityId) query.legal_entity_id = legalEntityId;
  if (asOf) query.as_of = asOf;
  if (knownAt) query.known_at = knownAt;

  return apiGet<AccountingResolution>("policy", "/v1/accounting-policies/explain", {
    query,
    identity,
  });
}

export async function getAccountingPolicyVersion(
  versionId: string,
  identity: Identity,
): Promise<ApiResult<AccountingPolicyVersion>> {
  return apiGet<AccountingPolicyVersion>(
    "policy",
    `/v1/accounting-policies/versions/${encodeURIComponent(versionId)}`,
    { identity },
  );
}

export type AccountingLifecycleInput = {
  versionId: string;
  expectedVersion?: number;
  reasonCode?: string;
  reason?: string;
  approvalReference?: string;
  outcome?: "UPHELD" | "OVERTURNED";
  supersedesVersionId?: string;
  breakGlassSessionId?: string;
  identity: Identity & { principalId: string };
};

async function accountingLifecycle(
  route: "submit-review" | "approve" | "activate" | "supersede" | "emergency-suspend" | "review-suspension",
  input: AccountingLifecycleInput,
): Promise<ApiWriteResult<AccountingPolicyVersion>> {
  const body: Record<string, unknown> = {};
  if (input.expectedVersion !== undefined) body.expected_version = input.expectedVersion;
  if (input.reasonCode) body.reason_code = input.reasonCode;
  if (input.reason) body.reason = input.reason;
  if (input.approvalReference) body.approval_reference = input.approvalReference;
  if (input.outcome) body.outcome = input.outcome;
  if (input.supersedesVersionId) body.supersedes_version_id = input.supersedesVersionId;

  const headers: Record<string, string> = {};
  if (input.breakGlassSessionId) headers["X-Break-Glass-Session-Id"] = input.breakGlassSessionId;

  return apiPost<AccountingPolicyVersion>(
    "policy",
    `/v1/accounting-policies/versions/${encodeURIComponent(input.versionId)}/${route}`,
    body,
    { identity: input.identity, extraHeaders: headers },
  );
}

export async function submitAccountingPolicy(input: AccountingLifecycleInput): Promise<ApiWriteResult<AccountingPolicyVersion>> {
  return accountingLifecycle("submit-review", input);
}

export async function approveAccountingPolicyVersion(input: AccountingLifecycleInput): Promise<ApiWriteResult<AccountingPolicyVersion>> {
  return accountingLifecycle("approve", input);
}

export async function activateAccountingPolicyVersion(input: AccountingLifecycleInput): Promise<ApiWriteResult<AccountingPolicyVersion>> {
  return accountingLifecycle("activate", input);
}

export async function supersedeAccountingPolicyVersion(input: AccountingLifecycleInput): Promise<ApiWriteResult<AccountingPolicyVersion>> {
  return accountingLifecycle("supersede", input);
}

export async function emergencySuspendAccountingPolicy(input: AccountingLifecycleInput): Promise<ApiWriteResult<AccountingPolicyVersion>> {
  return accountingLifecycle("emergency-suspend", input);
}

export async function reviewAccountingPolicySuspension(input: AccountingLifecycleInput): Promise<ApiWriteResult<AccountingPolicyVersion>> {
  return accountingLifecycle("review-suspension", input);
}

export type ImpactVersionRef = {
  policy_version_id: string;
  policy_id: string;
  policy_domain: string;
  semantic_version: string;
  version_status: string;
  precedence: number;
  book_id?: string;
  jurisdiction_id?: string;
  legal_entity_id?: string;
  effective_from: string;
  effective_to?: string;
};

export type AccountingImpact = {
  version: AccountingPolicyVersion;
  retroactive: boolean;
  would_supersede?: ImpactVersionRef;
  predecessor_governs_until?: string;
  pending_schedule?: ImpactVersionRef;
  ambiguous_with: ImpactVersionRef[];
  depended_on_by: ImpactVersionRef[];
  activation_blockers: string[];
};

export async function getAccountingPolicyImpact(
  versionId: string,
  identity: Identity,
): Promise<ApiResult<AccountingImpact>> {
  return apiGet<AccountingImpact>(
    "policy",
    `/v1/accounting-policies/versions/${encodeURIComponent(versionId)}/impact`,
    { identity },
  );
}

// ─── PDC-05 Certification & Simulation ─────────────────────────────────────

export type TestCase = {
  test_case_id: string;
  policy_id: string;
  tenant_id: string;
  test_code: string;
  layer: "UNIT" | "BOUNDARY" | "REGRESSION";
  mandatory: boolean;
  description: string;
  action_context: unknown;
  expected_result: string;
  test_status: "ACTIVE" | "RETIRED";
  created_at: string;
  created_by_principal_id: string;
  retired_at?: string;
  retired_by_principal_id?: string;
};

export type TestCasePage = PagedList<TestCase>;

export type CaseResult = {
  test_case_id: string;
  test_code: string;
  mandatory: boolean;
  expected: string;
  actual: string;
  error?: string;
  passed: boolean;
};

export type TestRun = {
  test_run_id: string;
  tenant_id: string;
  policy_id: string;
  policy_version_id: string;
  artifact_digest: string;
  suite_hash: string;
  evaluator_version: string;
  run_status: "PASS" | "FAIL";
  case_count: number;
  failed_count: number;
  static_findings: string[];
  results: CaseResult[];
  run_by_principal_id: string;
  run_at: string;
};

export type TestRunPage = PagedList<TestRun>;

export type Certification = {
  policy_version_id: string;
  status: "CERTIFIED" | "WAIVED" | "FAILED" | "NOT_RUN" | "STALE" | "EXEMPT_NO_EVALUATOR";
  suite_hash: string;
  test_run_id?: string;
  unwaived_failed_test_case_ids: string[];
  reason?: string;
};

export type Waiver = {
  waiver_id: string;
  tenant_id: string;
  policy_version_id: string;
  test_case_id: string;
  reason_code: string;
  justification: string;
  expires_at: string;
  waiver_status: "REQUESTED" | "APPROVED" | "REVOKED";
  requested_by_principal_id: string;
  requested_at: string;
  approved_by_principal_id?: string;
  approved_at?: string;
  revoked_by_principal_id?: string;
  revoked_at?: string;
  revocation_reason?: string;
};

export type WaiverPage = PagedList<Waiver>;

export type SimulationRun = {
  simulation_id: string;
  tenant_id: string;
  policy_type: string;
  candidate_version_id: string;
  baseline_version_id?: string;
  sim_status: "COMPLETE" | "PARTIAL" | "FAILED";
  corpus_from: string;
  corpus_to: string;
  corpus_limit: number;
  corpus_size: number;
  changed_count: number;
  error_count: number;
  requested_by_principal_id: string;
  created_at: string;
  completed_at?: string;
};

export type SimulationDiff = {
  evaluation_id: string;
  decision_id: string;
  baseline_result: string;
  candidate_result: string;
  candidate_error?: string;
};

export type SimulationDiffPage = PagedList<SimulationDiff>;

export async function createPolicyTestCase(
  policyId: string,
  input: {
    testCode: string;
    layer: "UNIT" | "BOUNDARY" | "REGRESSION";
    mandatory?: boolean;
    description: string;
    actionContext: unknown;
    expectedResult: string;
    testCaseId?: string;
    identity: Identity & { principalId: string };
  },
): Promise<ApiWriteResult<TestCase>> {
  return apiPost<TestCase>(
    "policy",
    `/v1/policies/${encodeURIComponent(policyId)}/test-cases`,
    {
      test_code: input.testCode,
      layer: input.layer,
      mandatory: input.mandatory ?? true,
      description: input.description,
      action_context: input.actionContext,
      expected_result: input.expectedResult,
      ...(input.testCaseId ? { test_case_id: input.testCaseId } : {}),
    },
    { identity: input.identity },
  );
}

export async function listPolicyTestCases(
  policyId: string,
  identity: Identity,
  pageSize?: number,
  cursor?: string,
): Promise<ApiResult<TestCasePage>> {
  const query: Record<string, string> = {};
  if (pageSize) query.page_size = String(pageSize);
  if (cursor) query.cursor = cursor;

  return apiGet<TestCasePage>(
    "policy",
    `/v1/policies/${encodeURIComponent(policyId)}/test-cases`,
    { query, identity },
  );
}

export async function retirePolicyTestCase(
  policyId: string,
  testCaseId: string,
  identity: Identity & { principalId: string },
): Promise<ApiWriteResult<TestCase>> {
  return apiPost<TestCase>(
    "policy",
    `/v1/policies/${encodeURIComponent(policyId)}/test-cases/${encodeURIComponent(testCaseId)}/retire`,
    {},
    { identity },
  );
}

export async function runPolicyTestSuite(
  versionId: string,
  identity: Identity & { principalId: string },
  testRunId?: string,
): Promise<ApiWriteResult<TestRun>> {
  return apiPost<TestRun>(
    "policy",
    `/v1/policy-versions/${encodeURIComponent(versionId)}/test-runs`,
    { ...(testRunId ? { test_run_id: testRunId } : {}) },
    { identity },
  );
}

export async function listPolicyTestRuns(
  versionId: string,
  identity: Identity,
  pageSize?: number,
  cursor?: string,
): Promise<ApiResult<TestRunPage>> {
  const query: Record<string, string> = {};
  if (pageSize) query.page_size = String(pageSize);
  if (cursor) query.cursor = cursor;

  return apiGet<TestRunPage>(
    "policy",
    `/v1/policy-versions/${encodeURIComponent(versionId)}/test-runs`,
    { query, identity },
  );
}

export async function getPolicyTestRun(
  testRunId: string,
  identity: Identity,
): Promise<ApiResult<TestRun>> {
  return apiGet<TestRun>(
    "policy",
    `/v1/policy-test-runs/${encodeURIComponent(testRunId)}`,
    { identity },
  );
}

export async function getPolicyVersionCertification(
  versionId: string,
  identity: Identity,
): Promise<ApiResult<Certification>> {
  return apiGet<Certification>(
    "policy",
    `/v1/policy-versions/${encodeURIComponent(versionId)}/certification`,
    { identity },
  );
}

export async function requestPolicyTestWaiver(
  versionId: string,
  input: {
    testCaseId: string;
    reasonCode: string;
    justification: string;
    expiresAt: string;
    waiverId?: string;
    identity: Identity & { principalId: string };
  },
): Promise<ApiWriteResult<Waiver>> {
  return apiPost<Waiver>(
    "policy",
    `/v1/policy-versions/${encodeURIComponent(versionId)}/waivers`,
    {
      test_case_id: input.testCaseId,
      reason_code: input.reasonCode,
      justification: input.justification,
      expires_at: input.expiresAt,
      ...(input.waiverId ? { waiver_id: input.waiverId } : {}),
    },
    { identity: input.identity },
  );
}

export async function listPolicyTestWaivers(
  versionId: string,
  identity: Identity,
  pageSize?: number,
  cursor?: string,
): Promise<ApiResult<WaiverPage>> {
  const query: Record<string, string> = {};
  if (pageSize) query.page_size = String(pageSize);
  if (cursor) query.cursor = cursor;

  return apiGet<WaiverPage>(
    "policy",
    `/v1/policy-versions/${encodeURIComponent(versionId)}/waivers`,
    { query, identity },
  );
}

export async function approvePolicyTestWaiver(
  waiverId: string,
  identity: Identity & { principalId: string },
): Promise<ApiWriteResult<Waiver>> {
  return apiPost<Waiver>(
    "policy",
    `/v1/policy-waivers/${encodeURIComponent(waiverId)}/approve`,
    {},
    { identity },
  );
}

export async function revokePolicyTestWaiver(
  waiverId: string,
  identity: Identity & { principalId: string },
  reason?: string,
): Promise<ApiWriteResult<Waiver>> {
  return apiPost<Waiver>(
    "policy",
    `/v1/policy-waivers/${encodeURIComponent(waiverId)}/revoke`,
    { reason },
    { identity },
  );
}

export async function simulatePolicyVersion(
  input: {
    candidateVersionId: string;
    tenantId?: string;
    baselineVersionId?: string;
    corpusFrom?: string;
    corpusTo?: string;
    corpusLimit?: number;
    simulationId?: string;
    identity: Identity & { principalId: string };
  },
): Promise<ApiWriteResult<SimulationRun>> {
  return apiPost<SimulationRun>(
    "policy",
    "/v1/simulations",
    {
      candidate_version_id: input.candidateVersionId,
      ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
      ...(input.baselineVersionId ? { baseline_version_id: input.baselineVersionId } : {}),
      ...(input.corpusFrom ? { corpus_from: input.corpusFrom } : {}),
      ...(input.corpusTo ? { corpus_to: input.corpusTo } : {}),
      ...(input.corpusLimit !== undefined ? { corpus_limit: input.corpusLimit } : {}),
      ...(input.simulationId ? { simulation_id: input.simulationId } : {}),
    },
    { identity: input.identity },
  );
}

export async function getPolicySimulation(
  simulationId: string,
  identity: Identity,
): Promise<ApiResult<SimulationRun>> {
  return apiGet<SimulationRun>(
    "policy",
    `/v1/simulations/${encodeURIComponent(simulationId)}`,
    { identity },
  );
}

export async function listPolicySimulationDifferences(
  simulationId: string,
  identity: Identity,
  pageSize?: number,
  cursor?: string,
): Promise<ApiResult<SimulationDiffPage>> {
  const query: Record<string, string> = {};
  if (pageSize) query.page_size = String(pageSize);
  if (cursor) query.cursor = cursor;

  return apiGet<SimulationDiffPage>(
    "policy",
    `/v1/simulations/${encodeURIComponent(simulationId)}/differences`,
    { query, identity },
  );
}

export async function draftPolicyRollback(
  versionId: string,
  input: {
    rationale: string;
    effectiveFrom?: string;
    identity: Identity & { principalId: string };
  },
): Promise<ApiWriteResult<PolicyVersion>> {
  return apiPost<PolicyVersion>(
    "policy",
    `/v1/policy-versions/${encodeURIComponent(versionId)}/rollback-draft`,
    {
      rationale: input.rationale,
      ...(input.effectiveFrom ? { effective_from: input.effectiveFrom } : {}),
    },
    { identity: input.identity },
  );
}


// ---------------------------------------------------------------------------
// Reading policy-svc in plain English.
//
// Everything below turns what the service stores into something a person who
// does not work on it can read. The console used to render these records as
// JSON, and their fields as the codes the database holds — APPROVAL_THRESHOLD,
// DRAFT, WITHIN_THRESHOLD — which asks the reader to already know the model
// they came to this page to find out about.
//
// The rule these follow is the one lib/humanize.ts sets out: labels are
// presentation, values are evidence. Every explanation carries the stored code
// alongside it as `raw`, and every call site shows that code, because the plain
// wording is this console's reading of the record and not the record itself.
// Someone quoting a policy to an auditor needs the value the service holds.

/** Read `threshold_amount` out of a rule payload, for display. Returns null when
 *  the payload has no usable threshold — which for an APPROVAL_THRESHOLD version
 *  is a latent 500 waiting to happen, so the UI flags it rather than showing a
 *  blank. */
export function thresholdAmount(rulePayload: unknown): number | null {
  if (typeof rulePayload !== "object" || rulePayload === null) return null;
  const value = (rulePayload as { threshold_amount?: unknown }).threshold_amount;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A rule payload's threshold, formatted for reading. Null when the payload
 *  carries no usable threshold, which the call sites report rather than hide. */
export function formatThreshold(rulePayload: unknown): string | null {
  const amount = thresholdAmount(rulePayload);
  if (amount === null) return null;

  // policy-svc compares bare numbers and the payload has no currency column, so
  // a currency symbol appears only when the payload itself carries one. A
  // default would put a currency on a limit for which nobody chose one.
  const currency = (rulePayload as { currency?: unknown })?.currency;
  if (typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency)) {
    return formatMoney(amount, currency.toUpperCase());
  }
  return amount.toLocaleString("en-GB");
}

/**
 * Whether a version is dated to start later than now.
 *
 * Worth singling out because policy-svc does NOT gate on this date. Its
 * applicable-set query filters on status and scope only — `effective_from`
 * orders the results and nothing else — so a version activated with a date
 * years away starts deciding immediately. Someone who sets a future date and
 * activates it will believe the limit is not live yet, and the console has to
 * say otherwise rather than print the date as though it were honoured.
 */
export function startsInFuture(version: { effective_from: string }): boolean {
  const from = new Date(version.effective_from).getTime();
  return Number.isFinite(from) && from > Date.now();
}

/** How a version's scope reads in one line. Both nulls mean global. */
export function describeScope(version: {
  tenant_id: string | null;
  legal_entity_id: string | null;
}): string {
  if (version.legal_entity_id) return "One legal entity";
  if (version.tenant_id) return "This organisation";
  return "Every organisation";
}

/** The same scope as a sentence, for a summary — where there is room to say what
 *  the badge only implies, including which rule wins when two overlap. */
export function describeScopeMeaning(version: {
  tenant_id: string | null;
  legal_entity_id: string | null;
}): string {
  if (version.legal_entity_id) {
    return "Applies to one legal entity only, and takes precedence over a rule set for the whole organisation.";
  }
  if (version.tenant_id) {
    return "Applies across this organisation, except where a legal entity has a rule of its own.";
  }
  return "Applies to every organisation on the platform, except where a narrower rule covers the case.";
}

export type PolicyTypeExplanation = {
  /** The type in prose, e.g. "Approval threshold". */
  label: string;
  /** One line on what a rule of this type is for. */
  meaning: string;
  /** Whether the platform can actually decide anything with it. */
  enforceable: boolean;
  /** The code as stored. Always shown alongside the label. */
  raw: string;
};

const POLICY_TYPE_COPY: Record<string, { label: string; meaning: string }> = {
  APPROVAL_THRESHOLD: {
    label: "Approval threshold",
    meaning:
      "Sets the amount above which something has to be approved by a person before it can go ahead.",
  },
  SPEND_CONTROL: {
    label: "Spend control",
    meaning: "Meant to cap how much can be spent.",
  },
  SOD_RULE: {
    label: "Separation of duties",
    meaning:
      "Meant to stop one person carrying out both halves of a task that is supposed to take two.",
  },
  SIGNATORY_MATRIX: {
    label: "Signatory matrix",
    meaning: "Meant to record who is allowed to sign for what.",
  },
};

/**
 * What a policy type is, and whether it decides anything.
 *
 * The second half matters more than the first. Three of the four types can be
 * created, versioned and activated, and are then applied to nothing, because
 * policy-svc implements no decision logic for them. Someone who has just set one
 * up cannot tell that from the record, so the explanation has to say it.
 */
export function describePolicyType(policyType: string): PolicyTypeExplanation {
  const stored = policyType?.trim() ?? "";
  const copy = POLICY_TYPE_COPY[stored];

  return {
    label: copy?.label || humanizeCode(stored) || stored,
    meaning:
      copy?.meaning ??
      "This console has no description for this type — it was added to the service after this page was written.",
    enforceable: EVALUABLE_POLICY_TYPES.includes(stored),
    raw: stored || "(empty)",
  };
}

/** The short label on its own, for a dropdown or a table cell. */
export function policyTypeLabel(policyType: string): string {
  return describePolicyType(policyType).label;
}

export type VersionStatusExplanation = {
  label: string;
  meaning: string;
  tone: "success" | "warning" | "danger" | "neutral" | "info";
  raw: string;
};

const VERSION_STATUS_COPY: Record<string, Omit<VersionStatusExplanation, "raw">> = {
  DRAFT: {
    label: "Not in force",
    meaning:
      "Written down but doing nothing. A draft changes no decision until someone activates it.",
    tone: "neutral",
  },
  ACTIVE: {
    label: "In force",
    meaning: "This is the version being applied to decisions right now.",
    tone: "success",
  },
  SUPERSEDED: {
    label: "Replaced",
    meaning:
      "This was in force until a newer version took over. It is kept so that past decisions can still be explained.",
    tone: "info",
  },
  RETIRED: {
    label: "Withdrawn",
    meaning: "Taken out of use. It is applied to nothing.",
    tone: "danger",
  },
};

/**
 * A version status, as a state a person can act on.
 *
 * An unrecognised status reads as "needs checking" rather than being passed
 * through — a status this console has not been taught is not evidence that
 * nothing is in force.
 */
export function describeVersionStatus(status: string): VersionStatusExplanation {
  const stored = status?.trim() ?? "";
  const copy = VERSION_STATUS_COPY[stored];

  if (!copy) {
    return {
      label: "Needs checking",
      meaning:
        "The service reported a status this console does not recognise. Do not assume it is either in force or harmless.",
      tone: "warning",
      raw: stored || "(empty)",
    };
  }
  return { ...copy, raw: stored };
}

export type EvaluationOutcome = "within" | "approval-required" | "unrecognised";

export type EvaluationExplanation = {
  /** The answer in one line, with the amount in it. */
  headline: string;
  /** What that answer means for whoever asked. */
  meaning: string;
  /** Two or three words, for a badge. */
  shortLabel: string;
  outcome: EvaluationOutcome;
  raw: string;
};

/**
 * What an evaluation actually decided.
 *
 * `result` comes back as WITHIN_THRESHOLD or APPROVAL_REQUIRED, which read as a
 * pass and a fail. The second is not a fail: it is a referral, and the
 * difference decides whether an operator raises an approval or abandons the
 * payment.
 *
 * An unrecognised value is never reported as a pass. An outcome this console has
 * not been taught could as easily mean "blocked", and reading it permissively is
 * the one mistake a governance console must not make.
 */
export function explainEvaluation(
  result: string,
  amount: number | null,
  threshold: number | null,
): EvaluationExplanation {
  const stored = result?.trim() ?? "";
  const money = amount === null ? null : amount.toLocaleString("en-GB");
  const limit = threshold === null ? null : threshold.toLocaleString("en-GB");

  if (stored === "WITHIN_THRESHOLD") {
    return {
      headline: money
        ? `${money} is within the limit — no approval needed`
        : "Within the limit — no approval needed",
      meaning:
        (limit ? `The limit in force is ${limit}, and this is at or under it. ` : "") +
        "It can go ahead without anyone approving it. An amount equal to the limit counts as within it.",
      shortLabel: "No approval needed",
      outcome: "within",
      raw: stored,
    };
  }

  if (stored === "APPROVAL_REQUIRED") {
    return {
      headline: money
        ? `${money} is over the limit — approval needed`
        : "Over the limit — approval needed",
      meaning:
        (limit ? `The limit in force is ${limit}, and this is above it. ` : "") +
        "That is not a refusal: someone with the authority to approve it has to do so before it goes ahead.",
      shortLabel: "Approval needed",
      outcome: "approval-required",
      raw: stored,
    };
  }

  return {
    headline: "The answer is not one this console recognises",
    meaning:
      `The service answered "${stored || "(empty)"}", which this console has not been taught to read. ` +
      "It is deliberately not being treated as approval — check with whoever operates the policy service before acting on it.",
    shortLabel: "Needs checking",
    outcome: "unrecognised",
    raw: stored || "(empty)",
  };
}

/**
 * Split a rule basis into the policy it came from and the version reference.
 *
 * policy-svc writes this as `<policy_code>:<policy_version_id>` — the exact
 * string it files as evidence. A value in any other shape comes back whole
 * rather than being forced into a split it does not have.
 */
export function splitRuleBasis(raw: string): { policyCode: string; versionId?: string } {
  const value = raw?.trim() ?? "";
  if (!value) return { policyCode: "" };

  const separator = value.lastIndexOf(":");
  if (separator <= 0 || separator === value.length - 1) return { policyCode: value };

  return {
    policyCode: value.slice(0, separator),
    versionId: value.slice(separator + 1),
  };
}

/**
 * Turn a backend failure into something an operator can act on.
 *
 * Each of these says what went wrong and what to do about it, in that order,
 * without naming a status code or a column. A person who cannot read
 * `invalid_transition` is exactly the person who has to decide what to do next.
 */
/** A reference as the service stores it: a bare UUID. */
const REFERENCE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a pasted value could be a rule or limit reference at all.
 *
 * Checked before the request goes out, because policy-svc casts these straight
 * to `uuid` in SQL and a value that will not cast comes back as 503
 * `store_unavailable` — reported to the reader as a database outage. Typing a
 * rule's CODE into a reference field is the obvious mistake to make (the code is
 * the thing a person chose and remembers), and it produced the one message on
 * this page guaranteed to send them looking in the wrong place.
 */
export function looksLikeReference(value: string): boolean {
  return REFERENCE_RE.test(value.trim());
}

/** Why a pasted reference cannot be one, in a form that says what to do next. */
export function explainBadReference(value: string, what: "rule" | "limit"): string {
  const trimmed = value.trim();

  if (trimmed.includes("…") || trimmed.includes("...")) {
    return `That reference is shortened — the “…” in the middle is there to make it fit on screen and is not part of the value. Click the ${what} reference in a table above to copy it whole.`;
  }

  // A code is short, has no dashes in UUID positions, and is usually the value
  // the person themselves chose — so it is worth naming as the likely mistake
  // rather than describing the correct format and leaving them to spot it.
  return `That is not a ${what} reference. References look like 5ccf655a-77b9-4e9f-9eb6-bc17b8329295 — 36 characters of letters, numbers and dashes, generated by the service. If you entered the ${what}’s own code instead, that is a different thing: click the ${what} reference in a table above to copy the right value.`;
}

export type PolicyErrorContext = {
  /** The HTTP status, when the failure had one. */
  status?: number;
  /** What a 409 means for this particular write. */
  conflict?: string;
  /** What a 404 means for this particular write. */
  notFound?: string;
};

export function explainPolicyError(
  message: string,
  context: PolicyErrorContext = {},
): string {
  // Both of these come from the authorization gate in front of every policy
  // write, and they are opposite problems with the same red banner: one is
  // "you may not", the other is "we could not find out". Separating them
  // matters, because the second is not something the reader did wrong and is
  // not fixed by asking for a permission they may already hold.
  if (message.includes("authorization_denied")) {
    return AUTHORIZATION_DENIED;
  }
  if (message.includes("authz_unavailable")) {
    return "Your permission to make this change could not be confirmed, so it was refused and nothing was saved. This is deliberate — an unreachable permission service refuses changes rather than allowing them. Try again shortly.";
  }
  if (message.includes("tenant_scope_mismatch")) {
    return "This change is scoped to a different organisation from the one you are signed in to, so it was refused. Nothing was saved.";
  }
  if (message.includes("tenant_scope_missing")) {
    return "Your session did not identify which organisation you are acting for, so the request was refused. Sign out and in again.";
  }
  if (message.includes("envelope_incomplete")) {
    return "The request was missing information the service requires on every change, so nothing was saved. This is a fault in the console rather than in what you entered — report it.";
  }
  if (message.includes("policy_conflict") || message.includes("conflict")) {
    return "A rule with that code already exists under a different name or type. This would redefine it rather than repeat it, so nothing was saved — choose a different code, or use the existing rule as it stands.";
  }
  if (message.includes("policy_version_conflict")) {
    return "A version already covers this scope from this date, and says something different. Nothing was saved — add a new version with a later start date instead of restating this one.";
  }
  if (message.includes("invalid_transition")) {
    return "Only a version that is not yet in force can be brought into force. This one has already been activated, replaced, or withdrawn — reload the page to see where it stands now.";
  }
  if (message.includes("policy_version_not_found")) {
    return "There is no version with that reference. Check it against the version list — it is easy to paste the rule's reference by mistake.";
  }
  if (message.includes("policy_not_found")) {
    return "There is no rule with that reference. Check it against the list above — it is easy to paste a version's reference by mistake.";
  }
  // Named, not numeric. This used to also match a bare "404" anywhere in the
  // message, which caught the generic "policy-svc returned 404 for
  // /v1/policies/…/versions" and reported a mistyped reference as "no rule is
  // in force for this scope" — a different problem with a different fix.
  // Status now decides that, further down, with wording the caller supplies.
  if (message.includes("no_applicable_policy")) {
    return NO_APPLICABLE_POLICY;
  }
  if (message.includes("not_implemented")) {
    return NOT_IMPLEMENTED;
  }
  if (message.includes("invalid_policy_payload")) {
    return "The rule that would have decided this has no usable limit recorded on it, so it could not be applied. It was saved without one and needs replacing with a version that sets a limit.";
  }
  if (message.includes("action_context.amount")) {
    return "Testing an approval threshold needs an amount to test. Enter a number and try again.";
  }
  if (message.includes("missing_field")) {
    // The service names the columns it wanted — `legal_entity_id, tenant_id`.
    // Those are the names of fields the reader filled in on a form, so they are
    // spelled out rather than passed through as they are stored.
    const named = (message.split("missing_field").pop() ?? "")
      .replace(/[^A-Za-z0-9_,\s-]/g, " ")
      .split(",")
      .map((field) => humanizeKey(field.trim()).toLowerCase())
      .filter(Boolean);

    return named.length > 0
      ? `Something required was left empty: ${named.join(", ")}. Nothing was saved.`
      : "Something required was left empty, so nothing was saved. Check every field on the form and try again.";
  }
  if (message.includes("store_unavailable")) {
    // Deliberately no longer states this as an outage. policy-svc returns
    // store_unavailable for ANY database error, including a reference that will
    // not cast to a uuid — so the confident "it is an outage, not something you
    // did" sent readers to check the database when the real problem was the
    // value in the box. The references are pre-checked now, so an outage is the
    // likely reading, but it is offered rather than asserted.
    return "The policy service could not save this, and nothing was written. It reports a problem with its database, which usually means an outage rather than anything you entered. If it keeps happening it needs looking into.";
  }

  // Transport failures. These messages are already sentences, but they name a
  // port and a URL, which tells the reader nothing they can act on.
  if (message.includes("is unreachable at")) {
    return "The policy service is not running, or cannot be reached from here. Nothing was saved — it needs to be started before this page can do anything.";
  }
  if (message.includes("did not respond within")) {
    return "The policy service did not answer in time, so nothing was saved. Try again; if it keeps happening the service is overloaded or stuck.";
  }
  if (message.includes("non-JSON body")) {
    return "The policy service sent back something the console could not read. Nothing here can be trusted until that is looked into — report it.";
  }

  // Status-based fallback.
  //
  // This is the branch that matters most in practice, because policy-svc
  // answers 409 and 404 with an EMPTY body — there is no error code to match
  // above, so without this the reader was shown "policy-svc returned 409 for
  // /v1/policies". A status alone cannot say which of several conflicts it is,
  // so the caller passes the wording for its own write and this only decides
  // when to use it.
  switch (context.status) {
    case 400:
      return "The service rejected this as invalid and saved nothing. Check the values entered and try again.";
    case 401:
      return "The service no longer accepts this session. Sign in again and repeat this.";
    case 403:
      return AUTHORIZATION_DENIED;
    case 404:
      return (
        context.notFound ??
        "Nothing on record matches the reference given. Check it against the tables above — references are long and easy to mistype."
      );
    case 409:
      return (
        context.conflict ??
        "This clashes with something already on record, so nothing was saved. Reload the page to see what is there now."
      );
    case 501:
      return NOT_IMPLEMENTED;
    case 503:
      return "Something the policy service depends on was unavailable, so the change was refused and nothing was saved. Try again shortly.";
    default:
      break;
  }
  if (context.status !== undefined && context.status >= 500) {
    return "The policy service failed while handling this, and nothing was saved. If it keeps happening it is a fault in the service rather than in what you entered.";
  }

  return message;
}

const NO_APPLICABLE_POLICY =
  "No rule of that kind is in force for this scope, so nothing could decide this. That is not an approval — the service will not invent a limit, so treat the action as undecided until a rule is put in force.";

const NOT_IMPLEMENTED =
  "Nothing on the platform can decide this kind of rule yet. Only an approval threshold can be tested; the other kinds can be recorded but are applied to nothing.";

const AUTHORIZATION_DENIED =
  "You do not have permission to make this change. Policy changes are checked against your permissions for the scope you are changing — ask whoever administers access to grant it for that scope.";
