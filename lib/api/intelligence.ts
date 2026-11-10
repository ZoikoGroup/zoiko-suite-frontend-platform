// lib/api/intelligence.ts
// Server-side typed API client for Group 8: Intelligence & Reporting services.
// All functions return ApiResult<T> and never throw; a failed read is returned
// as an error for the caller to show, never as an empty list.
//
// Routes, query parameters and response shapes are the services' own
// (fix/blocks-6-10-final; docs/architecture/blocks-8-10-frontend-contract-handoff.md
// in the backend repo), checked against the running services. The tenant comes
// from the X-Tenant-Id header the identity sets: a tenant_id query parameter is
// ignored by every one of these services.

import { apiGet, apiPost, type ApiResult, type Identity } from "./client";

/** Unwrap a list envelope's array, or fail if the service answered another shape. */
function listOf<T>(res: ApiResult<Record<string, unknown>>, key: string, label: string): ApiResult<T[]> {
  if (!res.ok) return res;
  const items = res.data?.[key];
  if (!Array.isArray(items)) {
    return { ok: false, error: { kind: "malformed", message: `${label} answered without a "${key}" list` } };
  }
  return { ok: true, data: items as T[] };
}

const entityQuery = (identity: Identity) => ({ legal_entity_id: identity.legalEntityId });

// ── Anomaly Detection ────────────────────────────────────────────────────────

export type AnomalyStatus = "OPEN" | "UNDER_INVESTIGATION" | "CONFIRMED_ANOMALY" | "FALSE_POSITIVE" | "RESOLVED";

export type Anomaly = {
  anomaly_id: string;
  tenant_id: string;
  legal_entity_id: string;
  domain_name: string;
  source_entity_id: string;
  rule_id: string;
  severity: string;
  anomaly_score: number;
  observed_value: number;
  expected_value: number;
  description: string;
  status: AnomalyStatus;
  assurance_state: string;
  detected_at: string;
  created_at: string;
};

export async function listAnomalies(identity: Identity) {
  const res = await apiGet<Record<string, unknown>>("anomalyDetection", "/v1/anomalies", {
    identity,
    query: entityQuery(identity),
  });
  return listOf<Anomaly>(res, "anomalies", "anomaly-detection-svc");
}

// ── Forecasting ──────────────────────────────────────────────────────────────

export type ForecastStatus = "CALCULATED" | "REVIEWED" | "APPROVED" | "PUBLISHED" | "SUPERSEDED" | "ARCHIVED";

export type Forecast = {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  model_name: string;
  domain: string;
  scenario_type: string;
  algorithm_type: string;
  granularity: string;
  horizon_periods: number;
  historical_start_date: string;
  historical_end_date: string;
  status: ForecastStatus;
  version: number;
  confidence_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export async function listForecasts(identity: Identity) {
  const res = await apiGet<Record<string, unknown>>("forecasting", "/v1/forecasts", {
    identity,
    query: entityQuery(identity),
  });
  return listOf<Forecast>(res, "data", "forecasting-svc");
}

// ── Compliance Risk Scoring ──────────────────────────────────────────────────

export type RiskTier = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export type RiskScore = {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  subject_type: string;
  subject_id: string;
  assessment_name: string;
  /** Decimal string, e.g. "53.75". */
  composite_risk_score: string;
  risk_tier: RiskTier;
  model_version: string;
  requires_human_review: boolean;
  review_status: string;
  status: string;
  evaluated_at: string;
  created_at: string;
};

export async function listRiskScores(identity: Identity) {
  const res = await apiGet<Record<string, unknown>>("complianceRiskScoring", "/v1/risk-scores", {
    identity,
    query: entityQuery(identity),
  });
  return listOf<RiskScore>(res, "data", "compliance-risk-scoring-svc");
}

// ── Reconciliation Intelligence ───────────────────────────────────────────────

export type ReconciliationJob = {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  job_name: string;
  bank_reconciliation_run_id: string;
  source_system_a: string;
  total_processed_count: number;
  unmatched_count: number;
  status: string;
  requested_by: string;
  version: number;
  analyzed_at: string;
  created_at: string;
};

export async function listReconciliations(identity: Identity) {
  const res = await apiGet<Record<string, unknown>>("reconciliationIntelligence", "/v1/reconciliations", {
    identity,
    query: entityQuery(identity),
  });
  return listOf<ReconciliationJob>(res, "data", "reconciliation-intelligence-svc");
}

// ── Reporting Orchestration ───────────────────────────────────────────────────

export type ReportDefinition = {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  report_name: string;
  report_type: string;
  output_format: string;
  data_sources: string[];
  is_scheduled: boolean;
  status: string;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/** Report definitions. Runs (/v1/reports/runs) are recorded NOT_IMPLEMENTED by the service for now. */
export async function listReportDefinitions(identity: Identity) {
  const res = await apiGet<Record<string, unknown>>("reportingOrchestration", "/v1/reports/definitions", {
    identity,
    query: entityQuery(identity),
  });
  return listOf<ReportDefinition>(res, "data", "reporting-orchestration-svc");
}

// ── Decision Support ──────────────────────────────────────────────────────────

export type Recommendation = {
  recommendation_id: string;
  tenant_id: string;
  legal_entity_id: string;
  subject_type: string;
  subject_reference: string;
  action_type: string;
  recommended_action: string;
  confidence_score: number;
  rationale: string;
  source: string;
  assurance_state: string;
  oversight_class: string;
  requires_independent_reviewer: boolean;
  status: string;
  version: number;
  expires_at: string;
  created_at: string;
};

export async function listRecommendations(identity: Identity) {
  const res = await apiGet<Record<string, unknown>>("decisionSupport", "/v1/recommendations", {
    identity,
    query: entityQuery(identity),
  });
  return listOf<Recommendation>(res, "items", "decision-support-svc");
}

// ── Migration Integrity ───────────────────────────────────────────────────────

export type MigrationJob = {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  migration_name: string;
  source_system: string;
  target_service: string;
  total_records_count: number;
  valid_records_count: number;
  invalid_records_count: number;
  integrity_score: number;
  integrity_score_threshold: number;
  blocker_count: number;
  status: string;
  started_at: string;
  completed_at?: string;
  created_at: string;
};

export async function listMigrationJobs(identity: Identity) {
  const res = await apiGet<Record<string, unknown>>("migrationIntegrity", "/v1/migrations/", {
    identity,
    query: entityQuery(identity),
  });
  return listOf<MigrationJob>(res, "data", "migration-integrity-svc");
}

// ── Writes ─────────────────────────────────────────────────────────────────────
//
// Bodies carry only what the reader entered plus the session's legal entity;
// optional fields the reader left blank are omitted, so the service applies
// (and records) its own documented default rather than one invented here.
// Routes and bodies checked live against the zv stack on 2026-11-06.

/** Drop undefined and empty-string members, so a blank optional field is not sent. */
function compact<T extends Record<string, unknown>>(body: T): T {
  return Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined && v !== "")) as T;
}

export type AnomalyRule = {
  rule_id: string;
  tenant_id: string;
  rule_name: string;
  domain_name: string;
  metric_type: string;
  threshold_value: number;
  z_score_cutoff: number;
  is_active: boolean;
  version: number;
  created_by: string;
  created_at: string;
};

export async function listAnomalyRules(identity: Identity) {
  const res = await apiGet<Record<string, unknown>>("anomalyDetection", "/v1/anomalies/rules", {
    identity,
    query: entityQuery(identity),
  });
  return listOf<AnomalyRule>(res, "rules", "anomaly-detection-svc");
}

export async function createAnomalyRule(
  identity: Identity,
  body: { rule_name: string; domain_name: string; metric_type: string; threshold_value: number; z_score_cutoff: number },
) {
  return apiPost<AnomalyRule>("anomalyDetection", "/v1/anomalies/rules", body, { identity });
}

/** Records an OPEN anomaly from an observation; the service scores it and sets its severity. */
export async function detectAnomaly(
  identity: Identity,
  body: {
    domain_name: string;
    source_entity_id: string;
    metric_type: string;
    observed_value: number;
    expected_value: number;
    std_deviation?: number;
    description?: string;
    rule_id?: string;
  },
) {
  return apiPost<Anomaly>("anomalyDetection", "/v1/anomalies/detect", compact({ ...body, legal_entity_id: identity.legalEntityId }), {
    identity,
  });
}

export async function generateForecast(
  identity: Identity,
  body: {
    model_name: string;
    domain: string;
    historical_data: number[];
    historical_start_date: string;
    horizon_periods?: number;
    scenario_type?: string;
    algorithm_type?: string;
    granularity?: string;
  },
) {
  return apiPost<Forecast>("forecasting", "/v1/forecasts/generate", compact({ ...body, legal_entity_id: identity.legalEntityId }), {
    identity,
  });
}

export async function calculateRiskScore(
  identity: Identity,
  body: {
    assessment_name: string;
    subject_type?: string;
    subject_id?: string;
    open_obligations_count: number;
    policy_violations_count: number;
    audit_exceptions_count: number;
    privacy_incidents_count: number;
    tax_penalties_count: number;
    source_references?: string[];
  },
) {
  return apiPost<RiskScore>(
    "complianceRiskScoring",
    "/v1/risk-scores/calculate",
    compact({ ...body, legal_entity_id: identity.legalEntityId }),
    { identity },
  );
}

export async function analyzeReconciliation(identity: Identity, body: { job_name: string; bank_reconciliation_run_id: string }) {
  return apiPost<ReconciliationJob>(
    "reconciliationIntelligence",
    "/v1/reconciliations/analyze",
    { ...body, legal_entity_id: identity.legalEntityId },
    { identity },
  );
}

/** A definition lands DRAFT; runs are recorded NOT_IMPLEMENTED by the service for now. */
export async function createReportDefinition(
  identity: Identity,
  body: { report_name: string; report_type: string; output_format: string; data_sources: string[] },
) {
  return apiPost<ReportDefinition>(
    "reportingOrchestration",
    "/v1/reports/definitions",
    { ...body, legal_entity_id: identity.legalEntityId },
    { identity },
  );
}

/**
 * Ask decision-support-svc for a precedent-engine recommendation on a subject.
 *
 * No `proposal` is sent. A proposal is an upstream AI producer's own output
 * (model id, version, confidence); a person typing those into the console
 * would be recording a model output that no model produced. Without one the
 * service derives the recommendation from governance-decision-log-svc, or
 * records NO_HISTORY with zero confidence when it has no basis.
 */
export async function requestRecommendation(
  identity: Identity,
  body: { subject_type: string; subject_reference: string; action_type: string; oversight_class: string; evidence_refs?: string[] },
) {
  return apiPost<Recommendation & { history_status?: string }>(
    "decisionSupport",
    "/v1/recommendations",
    compact({ ...body, legal_entity_id: identity.legalEntityId }),
    { identity },
  );
}
