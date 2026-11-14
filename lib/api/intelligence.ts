// lib/api/intelligence.ts
// Server-side typed API client for Group 8: Intelligence & Reporting services.
// All functions return ApiResult<T> — never throw — so individual panels degrade
// to empty state if a service is unavailable without taking down the page.

import { apiGet, apiPost, type ApiResult, type Identity } from "./client";

// List reads go to the route each service actually serves (verified on the zv
// stack), with the caller's identity. The services answer in different envelopes
// ({ data }, { items }, or a named list); readList takes the named array and the
// wrapper keeps the shape the console already uses.
async function readList<T>(
  service: Parameters<typeof apiGet>[0],
  path: string,
  key: string,
  identity: Identity | undefined,
  query: Record<string, string | undefined> = {},
): Promise<ApiResult<T[]>> {
  const res = await apiGet<Record<string, unknown>>(service, path, { identity, query });
  if (!res.ok) return res;
  const list = res.data?.[key];
  if (list === null || list === undefined) return { ok: true, data: [] };
  if (!Array.isArray(list)) {
    return { ok: false, error: { kind: "malformed", message: `${path} did not return a "${key}" list` } };
  }
  return { ok: true, data: list as T[] };
}


// ── Anomaly Detection ────────────────────────────────────────────────────────

export type Anomaly = {
  anomaly_id: string;
  tenant_id: string;
  source_service: string;
  anomaly_type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  detected_at: string;
  created_at: string;
};

export type AnomalyListResponse = { anomalies: Anomaly[]; total: number };

export async function listAnomalies(tenantId: string, identity?: Identity): Promise<ApiResult<AnomalyListResponse>> {
  const res = await readList<AnomalyListResponse["anomalies"][number]>("anomalyDetection", "/v1/anomalies", "anomalies", identity, { tenant_id: tenantId });
  if (!res.ok) return res;
  return { ok: true, data: { anomalies: res.data, total: res.data.length } as AnomalyListResponse };
}

// ── Forecasting ──────────────────────────────────────────────────────────────

export type Forecast = {
  forecast_id: string;
  tenant_id: string;
  model_type: string;
  domain: string;
  period: string;
  accuracy_score: number;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  generated_at: string;
  created_at: string;
};

export type ForecastListResponse = { forecasts: Forecast[]; total: number };

export async function listForecasts(tenantId: string, identity?: Identity): Promise<ApiResult<ForecastListResponse>> {
  const res = await readList<ForecastListResponse["forecasts"][number]>("forecasting", "/v1/forecasts", "data", identity, { tenant_id: tenantId });
  if (!res.ok) return res;
  return { ok: true, data: { forecasts: res.data, total: res.data.length } as ForecastListResponse };
}

export async function runForecast(
  tenantId: string,
  body: { model_type: string; domain: string; period: string }
) {
  return apiPost<{ forecast: Forecast }>("forecasting", "/api/v1/forecasts", {
    tenant_id: tenantId,
    ...body,
  });
}

// ── Compliance Risk Scoring ──────────────────────────────────────────────────

export type RiskScore = {
  score_id: string;
  tenant_id: string;
  legal_entity_id: string;
  risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  factors: string[];
  evaluated_at: string;
  valid_until: string;
  created_at: string;
};

export type RiskScoreListResponse = { scores: RiskScore[]; total: number };

export async function listRiskScores(tenantId: string, identity?: Identity): Promise<ApiResult<RiskScoreListResponse>> {
  const res = await readList<RiskScoreListResponse["scores"][number]>("complianceRiskScoring", "/v1/risk-scores", "data", identity, { tenant_id: tenantId });
  if (!res.ok) return res;
  return { ok: true, data: { scores: res.data, total: res.data.length } as RiskScoreListResponse };
}

// ── Reconciliation Intelligence ───────────────────────────────────────────────

export type ReconciliationRecord = {
  reconciliation_id: string;
  tenant_id: string;
  source_a: string;
  source_b: string;
  match_status: "MATCHED" | "UNMATCHED" | "PARTIAL" | "EXCEPTION";
  discrepancy_amount: number;
  currency: string;
  resolved_at: string | null;
  created_at: string;
};

export type ReconciliationListResponse = {
  reconciliations: ReconciliationRecord[];
  total: number;
};

export async function listReconciliations(tenantId: string, identity?: Identity): Promise<ApiResult<ReconciliationListResponse>> {
  const res = await readList<ReconciliationListResponse["reconciliations"][number]>("reconciliationIntelligence", "/v1/reconciliations", "data", identity, { tenant_id: tenantId, legal_entity_id: identity?.legalEntityId });
  if (!res.ok) return res;
  return { ok: true, data: { reconciliations: res.data, total: res.data.length } as ReconciliationListResponse };
}

// ── Reporting Orchestration ───────────────────────────────────────────────────

export type Report = {
  report_id: string;
  tenant_id: string;
  report_type: string;
  title: string;
  status: "QUEUED" | "GENERATING" | "READY" | "FAILED";
  requested_by: string;
  scheduled_at: string;
  completed_at?: string;
  created_at: string;
};

export type ReportListResponse = { reports: Report[]; total: number };

export async function listReports(tenantId: string, identity?: Identity): Promise<ApiResult<ReportListResponse>> {
  const res = await readList<ReportListResponse["reports"][number]>("reportingOrchestration", "/v1/reports/runs", "data", identity, { tenant_id: tenantId });
  if (!res.ok) return res;
  return { ok: true, data: { reports: res.data, total: res.data.length } as ReportListResponse };
}

export async function requestReport(
  tenantId: string,
  body: { report_type: string; title: string }
) {
  return apiPost<{ report: Report }>("reportingOrchestration", "/api/v1/reports", {
    tenant_id: tenantId,
    ...body,
  });
}

// ── Decision Support ──────────────────────────────────────────────────────────

export type Recommendation = {
  recommendation_id: string;
  tenant_id: string;
  domain: string;
  action: string;
  confidence: number;
  rationale: string;
  status: "PENDING_REVIEW" | "ACCEPTED" | "DISMISSED";
  created_at: string;
};

export type RecommendationListResponse = {
  recommendations: Recommendation[];
  total: number;
};

export async function listRecommendations(tenantId: string, identity?: Identity): Promise<ApiResult<RecommendationListResponse>> {
  const res = await readList<RecommendationListResponse["recommendations"][number]>("decisionSupport", "/v1/recommendations", "items", identity, { tenant_id: tenantId });
  if (!res.ok) return res;
  return { ok: true, data: { recommendations: res.data, total: res.data.length } as RecommendationListResponse };
}

// ── Migration Integrity ───────────────────────────────────────────────────────

export type MigrationJob = {
  job_id: string;
  tenant_id: string;
  source_system: string;
  target_service: string;
  record_count: number;
  validated_count: number;
  failed_count: number;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  started_at: string;
  completed_at?: string;
  created_at: string;
};

export type MigrationJobListResponse = { jobs: MigrationJob[]; total: number };

export async function listMigrationJobs(tenantId: string, identity?: Identity): Promise<ApiResult<MigrationJobListResponse>> {
  const res = await readList<MigrationJobListResponse["jobs"][number]>("migrationIntegrity", "/v1/migrations", "data", identity, { tenant_id: tenantId });
  if (!res.ok) return res;
  return { ok: true, data: { jobs: res.data, total: res.data.length } as MigrationJobListResponse };
}

export async function createMigrationJob(
  tenantId: string,
  body: { source_system: string; target_service: string; record_count: number }
) {
  return apiPost<{ job: MigrationJob }>("migrationIntegrity", "/api/v1/jobs", {
    tenant_id: tenantId,
    ...body,
  });
}
