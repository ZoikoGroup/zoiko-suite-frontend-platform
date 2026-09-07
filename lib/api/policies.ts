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
    identity: { tenantId: scope.callerTenantId },
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
  callerTenantId: string,
): Promise<ApiResult<PolicyVersion[]>> {
  const result = await apiGet<PolicyVersion[]>(
    "policy",
    `/v1/policies/${encodeURIComponent(policyId)}/versions`,
    { identity: { tenantId: callerTenantId } },
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
        principalId: input.principalId,
        tenantId: input.callerTenantId,
        legalEntityId: input.callerLegalEntityId,
      },
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
    { activated_by_principal_id: input.identity.principalId },
    { identity: input.identity },
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
