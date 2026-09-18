// lib/api/intelligence.ts
// Server-side typed API client for Group 8: Intelligence & Reporting services.
// All functions return ApiResult<T> — never throw — so individual panels degrade
// to empty state if a service is unavailable without taking down the page.

import { apiGet, apiPost } from "./client";

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

export async function listAnomalies(tenantId: string) {
  return apiGet<AnomalyListResponse>("anomalyDetection", "/api/v1/anomalies", {
    query: { tenant_id: tenantId },
  });
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

export async function listForecasts(tenantId: string) {
  return apiGet<ForecastListResponse>("forecasting", "/api/v1/forecasts", {
    query: { tenant_id: tenantId },
  });
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

export async function listRiskScores(tenantId: string) {
  return apiGet<RiskScoreListResponse>("complianceRiskScoring", "/api/v1/scores", {
    query: { tenant_id: tenantId },
  });
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

export async function listReconciliations(tenantId: string) {
  return apiGet<ReconciliationListResponse>(
    "reconciliationIntelligence",
    "/api/v1/reconciliations",
    { query: { tenant_id: tenantId } }
  );
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

export async function listReports(tenantId: string) {
  return apiGet<ReportListResponse>("reportingOrchestration", "/api/v1/reports", {
    query: { tenant_id: tenantId },
  });
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

export async function listRecommendations(tenantId: string) {
  return apiGet<RecommendationListResponse>(
    "decisionSupport",
    "/api/v1/recommendations",
    { query: { tenant_id: tenantId } }
  );
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

export async function listMigrationJobs(tenantId: string) {
  return apiGet<MigrationJobListResponse>(
    "migrationIntegrity",
    "/api/v1/jobs",
    { query: { tenant_id: tenantId } }
  );
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
