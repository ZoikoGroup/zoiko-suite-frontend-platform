// Effective-dated rules: authoring (DRAFT), activation by a second person on
// an approval workflow-svc confirms (J-02), legal drift (an axis separate from
// status: a rule can be ACTIVE and DRIFTED at once), the bitemporal status
// history, provenance (regime, interpretation, sources) and typed parameters.

import type { ApiResult, ApiWriteResult, Identity } from "../client";
import { etagOf, get, post, put, seg, type Caller } from "./core";

export type JurisdictionRule = {
  jurisdiction_rule_id: string;
  jurisdiction_id: string;
  rule_domain: string;
  rule_code: string;
  rule_name: string;
  effective_from: string;
  effective_to: string | null;
  rule_payload: unknown;
  source_reference: string | null;
  external_feed_reference: string | null;
  /** DRAFT, ACTIVE, SUPERSEDED, RETIRED. */
  rule_status: string;
  rule_version?: number;
  supersedes_rule_id?: string | null;
  precedence_level?: number;
  row_version?: number;
  /** CURRENT, DRIFTED, UNDER_REVIEW — orthogonal to rule_status. */
  legal_drift_state: string;
  data_classification: string;
  created_at: string;
  created_by_principal_id: string;
  schema_version: string;
  updated_at?: string | null;
  updated_by_principal_id?: string | null;
};

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

export type RuleStatusHistory = {
  history_id: string;
  jurisdiction_rule_id: string;
  rule_status: string;
  effective_from: string;
  effective_to: string | null;
  known_from: string;
  known_to: string | null;
  changed_by_principal_id: string;
  /** For an activation: the approval reference it rests on. */
  change_reason: string | null;
};

export type RuleProvenance = {
  jurisdiction_rule_id: string;
  regime_id: string | null;
  interpretation_id: string | null;
  supersedes_rule_id: string | null;
  precedence: number | null;
  published_on: string | null;
  source_ids: string[] | null;
};

export type RulePack = {
  jurisdiction_id: string;
  effective_at: string;
  resolved_from: string[];
  rules: JurisdictionRule[];
  conflicts?: { rule_domain: string; rule_code: string; rule_ids: string[] }[];
  insufficient?: string[];
  outcome?: string;
  pack_digest?: string;
};

export const RULE_STATUSES = ["DRAFT", "ACTIVE", "SUPERSEDED", "RETIRED"] as const;
export const DRIFT_STATES = ["CURRENT", "DRIFTED", "UNDER_REVIEW"] as const;
/** Data in the service, not an enum; offered as suggestions. */
export const RULE_DOMAINS = ["TAX", "PAYROLL", "EMPLOYMENT", "FILING", "RETENTION", "BENEFITS", "REGISTRATION"] as const;

/** A rule still in force that is known to have diverged from the law it encodes. */
export function isDriftedInForce(rule: Pick<JurisdictionRule, "rule_status" | "legal_drift_state">): boolean {
  return rule.rule_status === "ACTIVE" && rule.legal_drift_state !== "CURRENT";
}

/** Every rule recorded ON this jurisdiction (not the inherited, resolved set). */
export function listRules(jurisdictionId: string, identity?: Identity): Promise<ApiResult<JurisdictionRule[]>> {
  return get<JurisdictionRule[]>(`/v1/jurisdictions/${seg(jurisdictionId)}/rules`, identity);
}

export function getRule(ruleId: string, identity?: Identity): Promise<ApiResult<JurisdictionRule>> {
  return get<JurisdictionRule>(`/v1/rules/${seg(ruleId)}`, identity);
}

/** The resolved pack: rules from the jurisdiction and its ancestors, one winner per code. */
export function getRulePack(jurisdictionId: string, effectiveAt: string | undefined, identity?: Identity): Promise<ApiResult<RulePack>> {
  return get<RulePack>(`/v1/jurisdictions/${seg(jurisdictionId)}/rule-pack`, identity, { effective_at: effectiveAt });
}

export function listDriftEvents(ruleId: string, identity?: Identity): Promise<ApiResult<DriftEvent[]>> {
  return get<DriftEvent[]>(`/v1/rules/${seg(ruleId)}/drift-events`, identity);
}

export function listStatusHistory(ruleId: string, identity?: Identity): Promise<ApiResult<RuleStatusHistory[]>> {
  return get<RuleStatusHistory[]>(`/v1/rules/${seg(ruleId)}/status-history`, identity);
}

export function getProvenance(ruleId: string, identity?: Identity): Promise<ApiResult<RuleProvenance>> {
  return get<RuleProvenance>(`/v1/rules/${seg(ruleId)}/provenance`, identity);
}

/** Typed parameters (rate, bands, retention period …), or 404 when none are set. */
export function getParameters(ruleId: string, identity?: Identity): Promise<ApiResult<{ jurisdiction_rule_id?: string; parameters: unknown }>> {
  return get(`/v1/rules/${seg(ruleId)}/parameters`, identity);
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export type CreateRuleInput = {
  jurisdictionId: string;
  ruleDomain: string;
  ruleCode: string;
  ruleName: string;
  effectiveFrom: string;
  effectiveTo?: string;
  rulePayload: unknown;
  sourceReference?: string;
  externalFeedReference?: string;
  supersedesRuleId?: string;
  precedenceLevel?: number;
};

/** A rule is always created DRAFT here: activating it is a second person's step. */
export function createRule(input: CreateRuleInput, identity: Caller): Promise<ApiWriteResult<JurisdictionRule>> {
  return post<JurisdictionRule>(
    `/v1/admin/jurisdictions/${seg(input.jurisdictionId)}/rules`,
    {
      rule_domain: input.ruleDomain,
      rule_code: input.ruleCode,
      rule_name: input.ruleName,
      effective_from: input.effectiveFrom,
      rule_payload: input.rulePayload,
      rule_status: "DRAFT",
      ...(input.effectiveTo ? { effective_to: input.effectiveTo } : {}),
      ...(input.sourceReference ? { source_reference: input.sourceReference } : {}),
      ...(input.externalFeedReference ? { external_feed_reference: input.externalFeedReference } : {}),
      ...(input.supersedesRuleId ? { supersedes_rule_id: input.supersedesRuleId } : {}),
      ...(input.precedenceLevel !== undefined ? { precedence_level: input.precedenceLevel } : {}),
    },
    identity,
  );
}

/**
 * Move a rule to ACTIVE, SUPERSEDED or RETIRED. ACTIVE needs the approval it
 * rests on (X-Approval-Reference): an APPROVED workflow-svc workflow bound to
 * this rule and decided by someone other than its author. The author is
 * refused outright; workflow-svc unreachable fails closed (503).
 */
export function transitionRule(
  rule: Pick<JurisdictionRule, "jurisdiction_rule_id" | "row_version">,
  input: { newStatus: "ACTIVE" | "SUPERSEDED" | "RETIRED"; effectiveTo?: string; approvalReference?: string },
  identity: Caller,
): Promise<ApiWriteResult<JurisdictionRule>> {
  return post<JurisdictionRule>(
    `/v1/admin/rules/${seg(rule.jurisdiction_rule_id)}/transition`,
    { new_status: input.newStatus, ...(input.effectiveTo ? { effective_to: input.effectiveTo } : {}) },
    identity,
    { ifMatch: etagOf(rule.row_version), approvalReference: input.approvalReference },
  );
}

/** Record a legal-drift transition; the reason is the evidence. Append-only. */
export function recordDrift(
  rule: Pick<JurisdictionRule, "jurisdiction_rule_id" | "row_version">,
  driftState: string,
  reason: string,
  identity: Caller,
): Promise<ApiWriteResult<{ rule: JurisdictionRule; drift_event: DriftEvent; changed: boolean }>> {
  return post(`/v1/admin/rules/${seg(rule.jurisdiction_rule_id)}/drift`, { drift_state: driftState, reason }, identity, {
    ifMatch: etagOf(rule.row_version),
  });
}

export function setProvenance(
  ruleId: string,
  input: { regimeId?: string; interpretationId?: string; supersedesRuleId?: string; precedence?: number; publishedOn?: string; sourceIds: string[] },
  identity: Caller,
): Promise<ApiWriteResult<RuleProvenance>> {
  return put<RuleProvenance>(
    `/v1/admin/rules/${seg(ruleId)}/provenance`,
    {
      source_ids: input.sourceIds,
      ...(input.regimeId ? { regime_id: input.regimeId } : {}),
      ...(input.interpretationId ? { interpretation_id: input.interpretationId } : {}),
      ...(input.supersedesRuleId ? { supersedes_rule_id: input.supersedesRuleId } : {}),
      ...(input.precedence !== undefined ? { precedence: input.precedence } : {}),
      ...(input.publishedOn ? { published_on: input.publishedOn } : {}),
    },
    identity,
  );
}

export function setParameters(ruleId: string, parameters: unknown, identity: Caller): Promise<ApiWriteResult<unknown>> {
  return put(`/v1/admin/rules/${seg(ruleId)}/parameters`, { parameters }, identity);
}

// ─── Validate an action (J-06) ───────────────────────────────────────────────

export type ValidateActionResult = {
  permitted: boolean;
  detail: string;
  action_type: string;
  entity_type: string;
  rule: JurisdictionRule | null;
  resolved_from: string[] | null;
  conflicts: { rule_domain: string; rule_code: string; rule_ids: string[] }[] | null;
  insufficient: string[] | null;
  effective_at: string;
  pack_digest: string;
};

/**
 * Whether an action is permitted under the rules in force. 200 permitted;
 * the service answers a refusal (409) WITH the same body, so callers read it
 * from the problem body as well.
 */
export function validateAction(
  input: { actionType: string; jurisdictionId: string; entityType: string; effectiveAt?: string; payload?: unknown },
  identity: Caller,
): Promise<ApiWriteResult<ValidateActionResult>> {
  return post<ValidateActionResult>(
    "/v1/validate-action",
    {
      action_type: input.actionType,
      jurisdiction_id: input.jurisdictionId,
      entity_type: input.entityType,
      ...(input.effectiveAt ? { effective_at: input.effectiveAt } : {}),
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
    },
    identity,
  );
}
