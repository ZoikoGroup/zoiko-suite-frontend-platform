// jurisdiction-rules-svc (:8082) — the platform's jurisdiction register, the
// applicability rules attached to each jurisdiction, and the resolution of both
// into a runtime rule pack.
//
// This was a read-only client for one purpose, and its own comment said so:
// "deliberately NOT a full client for this service… wrapping endpoints nobody
// calls would imply a coverage this console does not have." That was honest
// while the only consumer was the obligations picker. It also meant the one
// service everything else defers to for "which law applies here" had no page:
// its rules, their effective dates, their legal drift state, and the resolution
// chain behind any governed decision were reachable only by curl.
//
// The picker's original reason still holds, and is why the list endpoint sorts
// the way it does: obligations-svc validates jurisdiction_id against this
// service on the write path and FAILS CLOSED — an unknown id is 404
// `jurisdiction_not_found`, an unreachable service is 503
// `jurisdiction_service_unavailable`, and neither is a silently accepted
// obligation.
//
// Four properties shape the page and are easy to get wrong:
//
//  1. JURISDICTIONS NEST, AND THE NESTING IS LOAD-BEARING. A rule on GB applies
//     within GB-SCT unless GB-SCT overrides it. The rule pack is where that is
//     resolved, and `resolved_from` names the chain it walked.
//  2. RULES ARE EFFECTIVE-DATED, SO "THE RULES" IS ALWAYS "THE RULES AT A DATE".
//     The pack endpoint takes an effective_at for exactly this reason; a
//     register showing only today's answer could not explain a decision made
//     last year.
//  3. LEGAL DRIFT IS A SEPARATE AXIS FROM RULE STATUS. A rule can be ACTIVE and
//     DRIFTED at once — still in force, and known to have diverged from the law
//     it encodes. That combination is the most important thing this register
//     can surface, and its history is append-only.
//  4. RULE PAYLOADS ARE APPLICABILITY METADATA ONLY. Thresholds and rates live
//     in the Tax and Payroll services. A payload here says who a rule applies
//     to and how often they file — never how much.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

/** Wire shape. Field names match the Go json tags exactly. */
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
};

/**
 * List jurisdictions, active ones first then by code.
 *
 * Inactive rows are kept rather than filtered out, but NOT for the reason this
 * comment used to give. It said an obligation "CAN be bound to an inactive
 * jurisdiction" because "obligations-svc's validator only checks that the id
 * resolves to 200". Verified against the running service, that is backwards:
 * `GET /v1/jurisdictions/{id}` is an active-only lookup and answers **404** for
 * a deactivated jurisdiction — deliberately, so every caller validating against
 * this register fails closed on it (see the service's own ErrJurisdictionNotFound:
 * "returned when the jurisdiction_id does not exist OR IS INACTIVE").
 *
 * So the list and the lookup disagree on purpose, and that is worth knowing:
 * a deactivated jurisdiction is still visible here — which is why the register
 * can show it and why `describeJurisdiction` labels it — while being
 * unbindable and unvalidatable everywhere else. Filtering it out of the list
 * would hide a row that still exists and still explains historical records.
 */
export async function listJurisdictions(): Promise<ApiResult<Jurisdiction[]>> {
  const result = await apiGet<Jurisdiction[]>("jurisdictionRules", "/v1/jurisdictions");

  if (!result.ok) return result;

  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "jurisdiction-rules-svc returned a non-array jurisdiction list",
      },
    };
  }

  return {
    ok: true,
    data: [...result.data].sort((a, b) => {
      if (a.active_flag !== b.active_flag) return a.active_flag ? -1 : 1;
      return a.jurisdiction_code.localeCompare(b.jurisdiction_code);
    }),
  };
}

/** "United Kingdom (GB)" — what a picker option should read as. */
export function describeJurisdiction(jurisdiction: Jurisdiction): string {
  const label = `${jurisdiction.jurisdiction_name} (${jurisdiction.jurisdiction_code})`;
  return jurisdiction.active_flag ? label : `${label} — inactive`;
}

/**
 * Resolve ids to codes for the register.
 *
 * An obligation stores only the jurisdiction UUID, so a register that rendered it
 * raw would show a column of indistinguishable UUIDs. Unresolved ids are left to
 * the caller to render as the id, not dropped.
 */
export function jurisdictionCodesById(
  jurisdictions: Jurisdiction[],
): Map<string, string> {
  return new Map(jurisdictions.map((j) => [j.jurisdiction_id, j.jurisdiction_code]));
}

// ─── Rules, drift, and resolution ────────────────────────────────────────────

/** Wire shape. Field names match the Go json tags exactly. */
export type JurisdictionRule = {
  jurisdiction_rule_id: string;
  jurisdiction_id: string;
  /** PAYROLL, TAX, EMPLOYMENT, FILING, RETENTION, BENEFITS — data, not an enum. */
  rule_domain: string;
  rule_code: string;
  rule_name: string;
  effective_from: string;
  effective_to: string | null;
  /** Applicability metadata only — never thresholds or rates. */
  rule_payload: unknown;
  source_reference: string | null;
  external_feed_reference: string | null;
  /** ACTIVE, SUPERSEDED, DRAFT, RETIRED. */
  rule_status: string;
  /** CURRENT, DRIFTED, UNDER_REVIEW — orthogonal to rule_status. */
  legal_drift_state: string;
  data_classification: string;
  created_at: string;
  created_by_principal_id: string;
  schema_version: string;
  updated_at?: string;
  updated_by_principal_id?: string;
};

/** One append-only entry in a rule's legal-drift history. */
export type DriftEvent = {
  drift_event_id: string;
  jurisdiction_rule_id: string;
  from_state: string;
  to_state: string;
  reason: string | null;
  effective_at: string;
  recorded_by_principal_id: string;
  correlation_id: string | null;
  schema_version: string;
};

/**
 * The resolved rule set for a jurisdiction at a point in time.
 *
 * `resolved_from` is the jurisdiction chain the pack was assembled from, self
 * first then outward to the root. It is the reason this endpoint exists rather
 * than the caller joining rules themselves: exactly one rule wins per
 * (rule_domain, rule_code) — most specific jurisdiction first, then latest
 * effective_from within a jurisdiction — and the chain is what lets a governed
 * decision explain its own basis afterwards.
 */
export type RulePack = {
  jurisdiction_id: string;
  effective_at: string;
  resolved_from: string[];
  rules: JurisdictionRule[];
};

/** The status values a rule can hold, and the drift states it can be in. */
export const RULE_STATUSES = ["DRAFT", "ACTIVE", "SUPERSEDED", "RETIRED"] as const;
export const DRIFT_STATES = ["CURRENT", "DRIFTED", "UNDER_REVIEW"] as const;

/**
 * The rule domains and jurisdiction/authority types the platform uses today.
 *
 * Offered as suggestions, never as a closed set the console enforces: every one
 * of these is a VARCHAR in the service specifically so a new value arrives by
 * data migration without a code change. A `<select>` here would quietly make
 * this console the thing that has to be redeployed for a new rule domain.
 */
export const RULE_DOMAINS = ["PAYROLL", "TAX", "EMPLOYMENT", "FILING", "RETENTION", "BENEFITS"] as const;
export const JURISDICTION_TYPES = [
  "COUNTRY", "STATE_PROVINCE", "TAX_AUTHORITY",
  "LABOR_LAW_BOUNDARY", "FILING_AUTHORITY", "DATA_RESIDENCY_BOUNDARY",
] as const;
export const AUTHORITY_TYPES = ["FEDERAL", "STATE", "MUNICIPAL", "SUPRANATIONAL"] as const;

/** A rule still in force that is known to have diverged from the law it encodes. */
export function isDriftedInForce(rule: JurisdictionRule): boolean {
  return rule.rule_status === "ACTIVE" && rule.legal_drift_state !== "CURRENT";
}

/** One jurisdiction by id. 404 when it does not exist. */
export function getJurisdiction(id: string, identity?: Identity): Promise<ApiResult<Jurisdiction>> {
  return apiGet<Jurisdiction>("jurisdictionRules", `/v1/jurisdictions/${encodeURIComponent(id)}`, { identity });
}

/** A jurisdiction's ancestors, nearest first. Empty for a root jurisdiction. */
export function getAncestors(id: string, identity?: Identity): Promise<ApiResult<Jurisdiction[]>> {
  return apiGet<Jurisdiction[]>(
    "jurisdictionRules", `/v1/jurisdictions/${encodeURIComponent(id)}/ancestors`, { identity });
}

/**
 * Every rule recorded ON this jurisdiction — not the resolved set.
 *
 * The distinction matters: this omits everything inherited from an ancestor,
 * so a jurisdiction with no rules of its own is not a jurisdiction with no
 * rules. Use the rule pack for the question "what applies here".
 */
export function getRules(id: string, identity?: Identity): Promise<ApiResult<JurisdictionRule[]>> {
  return apiGet<JurisdictionRule[]>(
    "jurisdictionRules", `/v1/jurisdictions/${encodeURIComponent(id)}/rules`, { identity });
}

/** The resolved pack for a jurisdiction, at `effectiveAt` (RFC3339) or now. */
export function getRulePack(
  id: string,
  effectiveAt?: string,
  identity?: Identity,
): Promise<ApiResult<RulePack>> {
  return apiGet<RulePack>("jurisdictionRules", `/v1/jurisdictions/${encodeURIComponent(id)}/rule-pack`, {
    query: effectiveAt ? { effective_at: effectiveAt } : undefined,
    identity,
  });
}

/** The append-only drift history for one rule, which the rule row cannot show. */
export function getDriftEvents(ruleId: string, identity?: Identity): Promise<ApiResult<DriftEvent[]>> {
  return apiGet<DriftEvent[]>(
    "jurisdictionRules", `/v1/rules/${encodeURIComponent(ruleId)}/drift-events`, { identity });
}

// ─── Writes ──────────────────────────────────────────────────────────────────
//
// Every write below is authorized against AUTHZ_PLATFORM_SCOPE_ID, not a legal
// entity: "GB" is not owned by one. The console still sends its session
// identity — the principal is what the service authorizes, and it stamps
// created_by from the header rather than the body.

export type CreateJurisdictionInput = {
  identity: Identity & { principalId: string };
  jurisdictionCode: string;
  jurisdictionName: string;
  jurisdictionType: string;
  authorityType: string;
  effectiveFrom: string;
  parentJurisdictionId?: string;
  effectiveTo?: string;
};

/**
 * Register a jurisdiction.
 *
 * 201 for a new one, **200 for an idempotent replay** — the same dedup key with
 * the same attributes is not an error and writes nothing. A dedup key that
 * matches with DIFFERENT attributes is 409, because that is someone redefining
 * an existing jurisdiction rather than re-submitting one.
 */
export function createJurisdiction(
  input: CreateJurisdictionInput,
): Promise<ApiWriteResult<Jurisdiction>> {
  return apiPost<Jurisdiction>("jurisdictionRules", "/v1/admin/jurisdictions", {
    jurisdiction_code: input.jurisdictionCode,
    jurisdiction_name: input.jurisdictionName,
    jurisdiction_type: input.jurisdictionType,
    authority_type: input.authorityType,
    effective_from: input.effectiveFrom,
    ...(input.parentJurisdictionId ? { parent_jurisdiction_id: input.parentJurisdictionId } : {}),
    ...(input.effectiveTo ? { effective_to: input.effectiveTo } : {}),
  }, { identity: input.identity });
}

/**
 * Deactivate a jurisdiction.
 *
 * Not a delete — there are none in this platform. It clears active_flag and
 * end-dates the row, so everything already bound to it still resolves.
 */
export function deactivateJurisdiction(
  id: string,
  identity: Identity & { principalId: string },
): Promise<ApiWriteResult<Jurisdiction>> {
  return apiPost<Jurisdiction>(
    "jurisdictionRules", `/v1/admin/jurisdictions/${encodeURIComponent(id)}/deactivate`, {}, { identity });
}

export type CreateRuleInput = {
  identity: Identity & { principalId: string };
  jurisdictionId: string;
  ruleDomain: string;
  ruleCode: string;
  ruleName: string;
  effectiveFrom: string;
  effectiveTo?: string;
  rulePayload: unknown;
  sourceReference?: string;
  ruleStatus?: string;
};

/**
 * Record a rule against a jurisdiction.
 *
 * rule_status is accepted but constrained by the service's own state machine —
 * a rule cannot be created directly into a terminal state, which is why the
 * form offers DRAFT and ACTIVE only.
 */
export function createRule(input: CreateRuleInput): Promise<ApiWriteResult<JurisdictionRule>> {
  return apiPost<JurisdictionRule>(
    "jurisdictionRules",
    `/v1/admin/jurisdictions/${encodeURIComponent(input.jurisdictionId)}/rules`,
    {
      rule_domain: input.ruleDomain,
      rule_code: input.ruleCode,
      rule_name: input.ruleName,
      effective_from: input.effectiveFrom,
      ...(input.effectiveTo ? { effective_to: input.effectiveTo } : {}),
      rule_payload: input.rulePayload,
      ...(input.sourceReference ? { source_reference: input.sourceReference } : {}),
      ...(input.ruleStatus ? { rule_status: input.ruleStatus } : {}),
    },
    { identity: input.identity },
  );
}

/**
 * Move a rule to a new status.
 *
 * The allowed prior states are the service's, never the caller's — a transition
 * the state machine forbids is refused rather than applied. `effectiveTo` states
 * when a closing transition (SUPERSEDED, RETIRED) took effect; omitted means
 * now, and it is ignored when the rule already carries an end date.
 *
 * This matters more than a status field usually would: a SUPERSEDED rule whose
 * effective_to stayed NULL keeps matching every point-in-time query beside its
 * own replacement, so the rule pack would resolve two winners for one code.
 */
export function transitionRule(
  ruleId: string,
  newStatus: string,
  identity: Identity & { principalId: string },
  effectiveTo?: string,
): Promise<ApiWriteResult<JurisdictionRule>> {
  return apiPost<JurisdictionRule>(
    "jurisdictionRules", `/v1/admin/rules/${encodeURIComponent(ruleId)}/transition`,
    { new_status: newStatus, ...(effectiveTo ? { effective_to: effectiveTo } : {}) },
    { identity },
  );
}

/**
 * Record a legal-drift transition against a rule.
 *
 * The reason is the evidence: the regulatory update that diverged from the
 * stored rule, or the review conclusion that closed it. The drift history is
 * append-only, so this never overwrites — it adds the next entry and moves the
 * rule's current state.
 */
export function recordDrift(
  ruleId: string,
  driftState: string,
  reason: string,
  identity: Identity & { principalId: string },
): Promise<ApiWriteResult<JurisdictionRule>> {
  return apiPost<JurisdictionRule>(
    "jurisdictionRules", `/v1/admin/rules/${encodeURIComponent(ruleId)}/drift`,
    { drift_state: driftState, reason },
    { identity },
  );
}

/** Human-readable reason for a refused jurisdiction-registry call. */
export function explainJurisdictionError(message: string): string {
  if (message.includes("jurisdiction_not_found")) {
    return "No jurisdiction with that id exists. Nothing was written — obligations-svc and tenant-entity-registry-svc both validate against this register and fail closed, so an id that does not resolve here resolves nowhere.";
  }
  if (message.includes("rule_not_found")) {
    return "No rule with that id exists in this register.";
  }
  if (message.includes("parent_not_found")) {
    return "The parent jurisdiction does not exist. A jurisdiction can only nest inside one already registered here.";
  }
  if (message.includes("invalid_effective_period")) {
    return "effective_to must be after effective_from. An inverted period would end-date the record before it began.";
  }
  if (message.includes("invalid_transition") || message.includes("transition_not_allowed")) {
    return "The registry's state machine does not allow that transition from the rule's current status. The allowed prior states are the service's, not the caller's — this is refused rather than applied.";
  }
  if (message.includes("missing_field")) {
    return `A required field was empty: ${message.replace(/.*missing_field:?\s*/, "") || "see the service response"}.`;
  }
  if (message.includes("conflict") || message.includes("409")) {
    return "A jurisdiction with this dedup key already exists with different attributes. Re-submitting an identical one is a no-op and answers 200; changing its attributes under the same key is refused, because that redefines a jurisdiction other records are already bound to.";
  }
  if (message.includes("forbidden") || message.includes("denied")) {
    return "authorization-svc refused this write. The principal needs the matching JURISDICTION_* grant on the platform scope — jurisdictions are platform-wide reference data, so the grant is not scoped to a legal entity.";
  }
  if (message.includes("identity") || message.includes("401")) {
    return "The registry received no verified principal and refused the write. Sign in again.";
  }
  if (message.includes("unavailable")) {
    return "The registry could not obtain an authorization decision or reach its store, so it refused rather than guessing. Nothing was written.";
  }
  return message;
}
