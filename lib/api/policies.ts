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

export type VersionStatus = "DRAFT" | "ACTIVE" | "SUPERSEDED" | "RETIRED";

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
};

/** A version plus its owning policy's code, as returned by the applicable-set
 *  read. Saves a second round trip when building a rule basis. */
export type ApplicablePolicyVersion = PolicyVersion & { policy_code: string };

export type ApplicableScope = {
  policyType: string;
  /** Omit for global-only scope. */
  tenantId?: string;
  legalEntityId?: string;
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
): Promise<ApiResult<PolicyVersion[]>> {
  const result = await apiGet<PolicyVersion[]>(
    "policy",
    `/v1/policies/${encodeURIComponent(policyId)}/versions`,
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
  principalId: string;
  /** Optional client-supplied id. The service generates one when omitted. */
  policyId?: string;
};

/** Create a named policy container. Carries no rule content — that needs a version. */
export async function createPolicy(input: CreatePolicyInput): Promise<ApiWriteResult<Policy>> {
  return apiPost<Policy>("policy", "/v1/policies", {
    ...(input.policyId ? { policy_id: input.policyId } : {}),
    policy_code: input.policyCode,
    policy_name: input.policyName,
    policy_type: input.policyType,
    created_by_principal_id: input.principalId,
  });
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
  policyVersionId?: string;
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
  );
}

/**
 * Activate a DRAFT version, superseding whatever held its scope before.
 *
 * The single write in this service that changes what gets enforced. Legal only
 * from DRAFT: activating an ACTIVE or SUPERSEDED version is a 409, because
 * re-activation would rewrite the version's own activation attribution.
 */
export async function activatePolicyVersion(input: {
  policyId: string;
  versionId: string;
  principalId: string;
}): Promise<ApiWriteResult<PolicyVersion>> {
  return apiPost<PolicyVersion>(
    "policy",
    `/v1/policies/${encodeURIComponent(input.policyId)}/versions/${encodeURIComponent(
      input.versionId,
    )}/activate`,
    { activated_by_principal_id: input.principalId },
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

/** Read `threshold_amount` out of a rule payload, for display. Returns null when
 *  the payload has no usable threshold — which for an APPROVAL_THRESHOLD version
 *  is a latent 500 waiting to happen, so the UI flags it rather than showing a
 *  blank. */
export function thresholdAmount(rulePayload: unknown): number | null {
  if (typeof rulePayload !== "object" || rulePayload === null) return null;
  const value = (rulePayload as { threshold_amount?: unknown }).threshold_amount;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** How a version's scope reads in one line. Both nulls mean global. */
export function describeScope(version: {
  tenant_id: string | null;
  legal_entity_id: string | null;
}): string {
  if (version.legal_entity_id) return "Legal entity";
  if (version.tenant_id) return "Tenant";
  return "Global";
}

/** Turn a backend failure into something an operator can act on. */
export function explainPolicyError(message: string): string {
  if (message.includes("policy_conflict") || message.includes("conflict")) {
    return "That policy code already exists with a different name or type. This is a redefinition, not a retry — pick a new code, or reuse the existing policy as it stands.";
  }
  if (message.includes("policy_version_conflict")) {
    return "A version with this scope and effective date already exists with a different rule payload. Create a new version instead of restating this one.";
  }
  if (message.includes("invalid_transition")) {
    return "Only a DRAFT version can be activated. This one is already ACTIVE, SUPERSEDED, or RETIRED — reload to see its current status.";
  }
  if (message.includes("policy_version_not_found")) {
    return "That policy version does not exist.";
  }
  if (message.includes("policy_not_found")) {
    return "That policy does not exist.";
  }
  if (message.includes("no_applicable_policy") || message.includes("404")) {
    return "No ACTIVE policy version applies to that type and scope, so the action cannot be evaluated. policy-svc does not guess a default — treat this as unenforceable, not as approved.";
  }
  if (message.includes("501") || message.includes("not_implemented")) {
    return "policy-svc has no evaluation logic for that policy type. Only APPROVAL_THRESHOLD can be evaluated; other types can be stored but not enforced.";
  }
  if (message.includes("invalid_policy_payload")) {
    return "The matched policy version has no usable threshold_amount in its rule payload, so it cannot be evaluated. The version needs replacing — it was accepted at creation without validation.";
  }
  if (message.includes("action_context.amount")) {
    return "APPROVAL_THRESHOLD evaluation needs a numeric `amount` in the action context.";
  }
  if (message.includes("missing_field")) {
    return `A required field was empty: ${message.split("missing_field").pop()?.trim() || "check the form"}.`;
  }
  if (message.includes("store_unavailable")) {
    return "policy-svc could not reach its database. Nothing was written.";
  }
  return message;
}
