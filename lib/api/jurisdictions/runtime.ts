// The runtime side: rule resolution with recorded decision evidence, the
// JUR-1 jurisdiction determination, the applicability evaluators (F20),
// regulatory submissions, the entity-applicability projection and its J-10
// backfill, the console summary, async operations and parked outbox events.
//
// Every runtime answer names its outcome (RESOLVED, AMBIGUOUS, NO_RULE,
// UNSUPPORTED_JURISDICTION, …) and never guesses: an ambiguous or missing
// rule is an answer the caller must handle, not an error to retry.

import type { ApiResult, ApiWriteResult, Identity } from "../client";
import { get, listAll, post, seg, type Caller } from "./core";

// ─── Summary (JR-FE-1) ───────────────────────────────────────────────────────

export type JurisdictionSummary = {
  generated_at: string;
  kpis: {
    active_jurisdictions: number;
    rules_draft: number;
    rules_under_review: number;
    pack_versions_released: number;
    rollouts_in_progress: number;
    open_drift_and_remediation: number;
  };
  pack_pipeline: { draft: number; review: number; certified: number; signed: number; released: number; deployed: number; withdrawn: number; emergency_blocked: number };
  attention: {
    drifted_rules: number;
    open_source_change_notices: number;
    open_remediation_cases: number;
    proposed_imports: number;
    parked_outbox_events: number;
    hotfix_retrospectives_outstanding: number;
  };
};

export function getSummary(identity: Identity): Promise<ApiResult<JurisdictionSummary>> {
  return get<JurisdictionSummary>("/v1/jurisdiction-summary", identity);
}

// ─── Rule resolution and decision evidence ───────────────────────────────────

export type ResolverDecision = {
  outcome: string;
  effective_at: string;
  jurisdiction: string;
  rule_domain: string;
  rule_code: string;
  pack: { pack_ref: string; version: string; status: string; artifact_digest: string; certification_id: string } | null;
  rule: { rule_id: string; rule_name: string; jurisdiction_code: string; content_digest: string; effective_from: string; effective_to: string | null; payload?: unknown; parameters?: unknown } | null;
  sources: { source_id: string; authority: string; title: string; authority_level: string }[] | null;
  basis: string;
  considered_rule_ids: string[] | null;
  packs_consulted: { pack_ref: string; version: string; outcome: string; rule_id: string }[] | null;
  explanation: string[] | null;
  decision_id?: string;
};

export type StoredDecision = {
  decision_id: string;
  requested_by: string;
  request_digest: string;
  outcome: string;
  pack_ref: string | null;
  pack_version: string | null;
  artifact_digest: string | null;
  rule_id: string | null;
  created_at: string;
  response: unknown;
};

/** Resolve one rule from the released, verified packs; the decision is recorded as evidence. */
export function resolveRule(
  input: { jurisdiction: string; ruleDomain: string; ruleCode: string; effectiveAt?: string; packRef?: string; packVersion?: string },
  identity: Caller,
): Promise<ApiWriteResult<ResolverDecision>> {
  return post<ResolverDecision>(
    "/v1/rule-resolutions:resolve",
    {
      jurisdiction: input.jurisdiction,
      rule_domain: input.ruleDomain,
      rule_code: input.ruleCode,
      ...(input.effectiveAt ? { effective_at: input.effectiveAt } : {}),
      ...(input.packRef ? { pack_ref: input.packRef, pack_version: input.packVersion } : {}),
    },
    identity,
  );
}

export function getRuleDecision(id: string, identity: Identity): Promise<ApiResult<StoredDecision>> {
  return get<StoredDecision>(`/v1/rule-decisions/${seg(id)}`, identity);
}

export function invalidateResolverCache(identity: Caller): Promise<ApiWriteResult<unknown>> {
  return post("/v1/admin/resolver-cache:invalidate", undefined, identity);
}

// ─── Jurisdiction determination (JUR-1) ──────────────────────────────────────

export type Determination = {
  outcome: string;
  purpose: string;
  effective_at: string;
  basis: string;
  jurisdiction: { jurisdiction_id: string; jurisdiction_code: string; applicability_types: string[] | null; support: string } | null;
  candidates: { jurisdiction_id: string; jurisdiction_code: string; applicability_types: string[] | null; support: string }[] | null;
  claim: { claimed: string; status: string };
  explanation: string[] | null;
  decision_id?: string;
};

export const DETERMINATION_PURPOSES = ["TAX", "FILING", "ANY"] as const;

export function determineJurisdiction(
  input: { legalEntityId: string; purpose: string; effectiveAt?: string; claimedJurisdiction?: string },
  identity: Caller,
): Promise<ApiWriteResult<Determination>> {
  return post<Determination>(
    "/v1/jurisdiction-decisions:resolve",
    {
      legal_entity_id: input.legalEntityId,
      purpose: input.purpose,
      ...(input.effectiveAt ? { effective_at: input.effectiveAt } : {}),
      ...(input.claimedJurisdiction ? { claimed_jurisdiction: input.claimedJurisdiction } : {}),
    },
    identity,
  );
}

// ─── Applicability evaluators (F20) ──────────────────────────────────────────

/** Each evaluator answers `{outcome, resolution?, <result>…}`; the explanation lists its steps. */
export type Evaluation = { outcome?: string; explanation?: string[] | null; resolution?: ResolverDecision | null; [k: string]: unknown };

export const EVALUATORS = {
  "registration-obligations": { path: "/v1/registration-obligations:resolve", label: "Registration obligations" },
  "registration-identifier": { path: "/v1/registration-identifiers:validate", label: "Validate a registration identifier" },
  licence: { path: "/v1/licences:evaluate", label: "Evaluate a licence" },
  "scheme-election": { path: "/v1/scheme-elections:evaluate", label: "Scheme eligibility" },
  "threshold-monitor": { path: "/v1/threshold-monitors:evaluate", label: "Threshold monitor" },
  "submission-profile": { path: "/v1/submission-profiles:resolve", label: "Submission profile" },
  "payroll-parameters": { path: "/v1/payroll-statutory-parameters:resolve", label: "Payroll statutory parameters" },
  retention: { path: "/v1/retention-rules:resolve", label: "Retention rule" },
  "accounting-mapping": { path: "/v1/accounting-mappings:resolve", label: "Accounting mapping" },
  calculation: { path: "/v1/regulatory-calculations:execute", label: "Regulatory calculation" },
  obligation: { path: "/v1/obligation-calculations:calculate", label: "Obligation due date" },
} as const;

export type EvaluatorKey = keyof typeof EVALUATORS;

export function evaluate(kind: EvaluatorKey, body: Record<string, unknown>, identity: Caller): Promise<ApiWriteResult<Evaluation>> {
  return post<Evaluation>(EVALUATORS[kind].path, body, identity);
}

// ─── Regulatory submissions (F21) ────────────────────────────────────────────

export type Submission = {
  submission_id: string;
  submission_kind: string;
  jurisdiction_code: string;
  profile_code: string;
  subject_ref: string;
  payload_hash: string;
  status: string;
  is_terminal: boolean;
  last_event_occurred_at: string | null;
  effective_at: string;
  pack_version_id: string;
  artifact_digest: string;
  rule_id: string;
  submitted_by: string;
  created_at: string;
  updated_at: string;
  events?: { provider_event_id: string; reported_status: string; receipt_id: string | null; occurred_at: string; received_at: string; disposition: string; status_after: string }[];
};

export function getSubmission(id: string, identity: Identity): Promise<ApiResult<Submission | { submission: Submission; events: Submission["events"] }>> {
  return get(`/v1/regulatory-submissions/${seg(id)}`, identity);
}

export function registerSubmission(
  input: { jurisdiction: string; kind: string; profileCode: string; effectiveAt?: string; subjectRef: string; payloadHash: string },
  identity: Caller,
): Promise<ApiWriteResult<Submission | { submission: Submission }>> {
  return post(
    "/v1/regulatory-submissions",
    {
      jurisdiction: input.jurisdiction,
      kind: input.kind,
      profile_code: input.profileCode,
      subject_ref: input.subjectRef,
      payload_hash: input.payloadHash,
      ...(input.effectiveAt ? { effective_at: input.effectiveAt } : {}),
    },
    identity,
  );
}

export function recordSubmissionEvent(
  id: string,
  input: { providerEventId: string; status: string; receiptId?: string; occurredAt: string },
  identity: Caller,
): Promise<ApiWriteResult<unknown>> {
  return post(
    `/v1/regulatory-submissions/${seg(id)}/events`,
    { provider_event_id: input.providerEventId, status: input.status, occurred_at: input.occurredAt, ...(input.receiptId ? { receipt_id: input.receiptId } : {}) },
    identity,
  );
}

// ─── Entity applicability (F22) ──────────────────────────────────────────────

export type EntityApplicability = {
  applicability_id: string;
  tenant_id: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  applicability_type: string;
  effective_from: string;
  effective_to: string | null;
  source_object_version: number;
  source_event_type: string;
  source_event_id: string;
  recorded_at: string;
};

export function getEntityJurisdictions(
  legalEntityId: string,
  identity: Identity,
): Promise<ApiResult<{ legal_entity_id: string; effective_at: string; jurisdictions: EntityApplicability[] | null }>> {
  return get(`/v1/entities/${seg(legalEntityId)}/jurisdictions`, identity);
}

export type BackfillResult = {
  tenant_id: string;
  entities_scanned: number;
  mappings_read: number;
  applied: number;
  unchanged: number;
  skipped: { legal_entity_id: string; id: string; reason: string }[] | null;
};

/** J-10: re-read the registry and restore projections whose events left Kafka retention. */
export function backfillApplicability(legalEntityId: string | undefined, identity: Caller): Promise<ApiWriteResult<BackfillResult>> {
  return post<BackfillResult>("/v1/admin/entity-applicability:backfill", legalEntityId ? { legal_entity_id: legalEntityId } : {}, identity);
}

// ─── Async operations (API-5) and parked outbox events (J-16) ────────────────

export type Operation = { id: string; type: string; state: string; resource_ref?: string; cancelable: boolean; created_at: string; error?: unknown };

export function getOperation(id: string, identity: Identity): Promise<ApiResult<Operation>> {
  return get<Operation>(`/v1/operations/${seg(id)}`, identity);
}

export function cancelOperation(id: string, identity: Caller): Promise<ApiWriteResult<Operation>> {
  return post<Operation>(`/v1/operations/${seg(id)}/cancel`, undefined, identity);
}

export type ParkedEvent = {
  outbox_id: string;
  event_type: string;
  topic: string;
  partition_key: string | null;
  created_at: string;
  publish_attempts: number;
  last_error: string | null;
  requeues: { requeue_id: string; reason: string; requested_by: string; requested_at: string }[] | null;
};

export function listParkedEvents(identity: Identity): Promise<ApiResult<ParkedEvent[]>> {
  return listAll<ParkedEvent>("/v1/admin/outbox/parked", identity);
}

export function requeueEvent(outboxId: string, input: { reason: string; evidenceRef?: string }, identity: Caller): Promise<ApiWriteResult<{ requeue_id: string; attempts_before: number }>> {
  return post(`/v1/admin/outbox/${seg(outboxId)}/requeue`, { reason: input.reason, ...(input.evidenceRef ? { evidence_ref: input.evidenceRef } : {}) }, identity);
}
