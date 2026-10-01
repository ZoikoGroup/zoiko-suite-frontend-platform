// metric-registry-svc (:8149) — the platform authority for executive metric definitions.
//
// Docs/original_doc/zoiko_suite_doc7.txt §27 REP-01:
// "Executive metrics are defined, versioned, source-traceable and labeled so
// operational intelligence is not misrepresented as financial/legal assurance."
//
// This service defines what a metric IS and MEANS; it does not compute or store
// metric values itself. metric_code and definition_status are data-only strings.
// Every metric is versioned by appending a new row, never an in-place update.
// At most one row per metric_code is ACTIVE at any time.

import {
  apiGet,
  apiPost,
  type ApiResult,
  type ApiWriteResult,
  type Identity,
} from "./client";

const SERVICE = "metricRegistry" as const;

export type DefinitionStatus = "ACTIVE" | "SUPERSEDED" | "RETIRED" | "DRAFT";

export type ReportMetricDefinition = {
  metric_definition_id: string;
  metric_code: string;
  metric_name: string;
  formula_description: string;
  data_sources: string[];
  owner_principal_id: string;
  intelligence_disclaimer: string;
  version: number;
  definition_status: DefinitionStatus;
  effective_from: string;
  created_at: string;
  created_by_principal_id: string;
};

export type CreateReportMetricInput = {
  metric_code: string;
  metric_name: string;
  formula_description: string;
  data_sources?: string[];
  owner_principal_id: string;
  effective_from: string;
  correlation_id: string;
};

export type PublishMetricVersionInput = {
  metric_code: string;
  metric_name: string;
  formula_description: string;
  data_sources?: string[];
  owner_principal_id: string;
  effective_from: string;
  correlation_id: string;
};

/**
 * List all currently ACTIVE executive metric definitions.
 */
export async function listActiveMetrics(
  identity?: Identity,
): Promise<ApiResult<ReportMetricDefinition[]>> {
  return apiGet<ReportMetricDefinition[]>(SERVICE, "/v1/report-metrics", {
    identity,
  });
}

/**
 * Fetch the currently ACTIVE definition for a single metric_code.
 */
export async function getActiveMetricDefinition(
  metricCode: string,
  identity?: Identity,
): Promise<ApiResult<ReportMetricDefinition>> {
  return apiGet<ReportMetricDefinition>(
    SERVICE,
    `/v1/report-metrics/${encodeURIComponent(metricCode)}`,
    { identity },
  );
}

/**
 * Fetch the complete version history for a metric_code, in descending order (newest first).
 */
export async function listMetricVersions(
  metricCode: string,
  identity?: Identity,
): Promise<ApiResult<ReportMetricDefinition[]>> {
  return apiGet<ReportMetricDefinition[]>(
    SERVICE,
    `/v1/report-metrics/${encodeURIComponent(metricCode)}/versions`,
    { identity },
  );
}

/**
 * Create Version 1 of a new executive metric.
 * Fails with 409 Conflict if metric_code already exists.
 */
export async function createMetricDefinition(
  input: CreateReportMetricInput,
  identity?: Identity,
): Promise<ApiWriteResult<ReportMetricDefinition>> {
  return apiPost<ReportMetricDefinition>(
    SERVICE,
    "/v1/report-metrics",
    {
      metric_code: input.metric_code,
      metric_name: input.metric_name,
      formula_description: input.formula_description,
      data_sources: input.data_sources ?? [],
      owner_principal_id: input.owner_principal_id,
      effective_from: input.effective_from,
      correlation_id: input.correlation_id,
    },
    {
      identity,
      idempotencyKey: input.correlation_id,
    },
  );
}

/**
 * Publish Version N+1 of an existing metric.
 * Atomically transitions whatever version was ACTIVE to SUPERSEDED and installs the new version.
 */
export async function publishMetricVersion(
  input: PublishMetricVersionInput,
  identity?: Identity,
): Promise<ApiWriteResult<ReportMetricDefinition>> {
  return apiPost<ReportMetricDefinition>(
    SERVICE,
    `/v1/report-metrics/${encodeURIComponent(input.metric_code)}/versions`,
    {
      metric_name: input.metric_name,
      formula_description: input.formula_description,
      data_sources: input.data_sources ?? [],
      owner_principal_id: input.owner_principal_id,
      effective_from: input.effective_from,
      correlation_id: input.correlation_id,
    },
    {
      identity,
      idempotencyKey: input.correlation_id,
    },
  );
}

/**
 * Helper to parse comma- or newline-separated sources list into an array of clean strings.
 */
export function parseDataSources(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function explainMetricError(raw: string): string {
  if (/metric_code already exists/i.test(raw)) {
    return "This metric code already exists. Metric codes are permanent identifiers; to update it, publish a new version instead.";
  }
  if (/report metric not found/i.test(raw)) {
    return "This metric was not found. Create Version 1 before attempting to publish revisions.";
  }
  if (/not authorized/i.test(raw)) {
    return "Permission denied. Your role lacks REPORT_METRIC_CREATE or REPORT_METRIC_PUBLISH on the platform scope.";
  }
  if (/effective_from must be RFC3339/i.test(raw)) {
    return "Effective from date must be formatted in RFC3339 timestamp (e.g. YYYY-MM-DD).";
  }
  return raw || "An unexpected error occurred in metric-registry-svc.";
}
