"use server";

// Server Actions that WRITE to the Block 8 intelligence services.
//
// The identity is the session's; the legal entity is never a form field. Each
// action checks the fields its service requires and refuses a missing one
// rather than filling it in, then returns the record the service wrote or its
// refusal verbatim. None of these services decides anything on the caller's
// behalf: an anomaly is recorded OPEN, a forecast CALCULATED, a report
// definition DRAFT, a recommendation PENDING human disposition.

import { refresh } from "next/cache";
import {
  createAnomalyRule,
  detectAnomaly,
  generateForecast,
  calculateRiskScore,
  analyzeReconciliation,
  createReportDefinition,
  requestRecommendation,
  listAnomalyRules,
  type AnomalyRule,
} from "@/lib/api/intelligence";
import type { CreateState } from "@/components/admin/intelligence/create-state";
import { sessionIdentity, expired, missing, invalid, text, numberOf, listOf, toState, show } from "./create-support";

export async function createAnomalyRuleAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);
  const refusal = missing(
    previous,
    fd,
    [["rule_name", "Rule name"], ["domain_name", "Domain"], ["metric_type", "Metric type"], ["threshold_value", "Threshold value"], ["z_score_cutoff", "Z-score cutoff"]],
    [["threshold_value", "Threshold value"], ["z_score_cutoff", "Z-score cutoff"]],
  );
  if (refusal) return refusal;
  const res = await createAnomalyRule(identity, {
    rule_name: text(fd, "rule_name"),
    domain_name: text(fd, "domain_name"),
    metric_type: text(fd, "metric_type"),
    threshold_value: numberOf(fd, "threshold_value")!,
    z_score_cutoff: numberOf(fd, "z_score_cutoff")!,
  });
  if (res.ok) refresh();
  return toState(previous, fd, res, "anomaly-detection-svc", (r) => [
    ["Rule ID", show(r.rule_id)],
    ["Active", show(r.is_active)],
    ["Rule", show(r.rule_name)],
    ["Threshold / z-score cutoff", `${show(r.threshold_value)} / ${show(r.z_score_cutoff)}`],
    ["Version", show(r.version)],
  ]);
}

export async function detectAnomalyAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);
  const refusal = missing(
    previous,
    fd,
    [["domain_name", "Domain"], ["source_entity_id", "Source entity"], ["metric_type", "Metric type"], ["observed_value", "Observed value"], ["expected_value", "Expected value"]],
    [["observed_value", "Observed value"], ["expected_value", "Expected value"], ["std_deviation", "Standard deviation"]],
  );
  if (refusal) return refusal;
  const res = await detectAnomaly(identity, {
    domain_name: text(fd, "domain_name"),
    source_entity_id: text(fd, "source_entity_id"),
    metric_type: text(fd, "metric_type"),
    observed_value: numberOf(fd, "observed_value")!,
    expected_value: numberOf(fd, "expected_value")!,
    std_deviation: numberOf(fd, "std_deviation"),
    description: text(fd, "description") || undefined,
    rule_id: text(fd, "rule_id") || undefined,
  });
  if (res.ok) refresh();
  return toState(previous, fd, res, "anomaly-detection-svc", (a) => [
    ["Anomaly ID", show(a.anomaly_id)],
    ["Status", show(a.status)],
    ["Severity (scored by the service)", show(a.severity)],
    ["Anomaly score", show(a.anomaly_score)],
    ["Assurance", show(a.assurance_state)],
  ]);
}

/** The entity's anomaly rules, for the rules list under the rule form. */
export async function loadAnomalyRules(): Promise<{ ok: true; rules: AnomalyRule[] } | { ok: false; message: string }> {
  const identity = await sessionIdentity();
  if (!identity) return { ok: false, message: "Your session has expired — sign in again." };
  const res = await listAnomalyRules(identity);
  return res.ok ? { ok: true, rules: res.data } : { ok: false, message: res.error.message };
}

export async function generateForecastAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);
  const refusal = missing(
    previous,
    fd,
    [["model_name", "Model name"], ["domain", "Domain"], ["historical_data", "Historical data"], ["historical_start_date", "Historical start date"]],
    [["horizon_periods", "Horizon periods"]],
  );
  if (refusal) return refusal;
  const series = listOf(fd, "historical_data").map(Number);
  if (series.some((n) => !Number.isFinite(n))) {
    return invalid(previous, fd, "Historical data must be numbers separated by commas.");
  }
  const res = await generateForecast(identity, {
    model_name: text(fd, "model_name"),
    domain: text(fd, "domain"),
    historical_data: series,
    historical_start_date: text(fd, "historical_start_date"),
    horizon_periods: numberOf(fd, "horizon_periods"),
    scenario_type: text(fd, "scenario_type") || undefined,
    algorithm_type: text(fd, "algorithm_type") || undefined,
    granularity: text(fd, "granularity") || undefined,
  });
  if (res.ok) refresh();
  return toState(previous, fd, res, "forecasting-svc", (f) => [
    ["Forecast ID", show(f.id)],
    ["Status", show(f.status)],
    ["Model", show(f.model_name)],
    ["Algorithm / scenario / granularity", `${show(f.algorithm_type)} / ${show(f.scenario_type)} / ${show(f.granularity)}`],
    ["Horizon periods", show(f.horizon_periods)],
  ]);
}

const RISK_COUNTS: [string, string][] = [
  ["open_obligations_count", "Open obligations"],
  ["policy_violations_count", "Policy violations"],
  ["audit_exceptions_count", "Audit exceptions"],
  ["privacy_incidents_count", "Privacy incidents"],
  ["tax_penalties_count", "Tax penalties"],
];

export async function calculateRiskScoreAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);
  // Every count is required: the service refuses a missing one ("use 0 when
  // there are none"), and the console does not supply the 0 for the reader.
  const refusal = missing(previous, fd, [["assessment_name", "Assessment name"], ...RISK_COUNTS], RISK_COUNTS);
  if (refusal) return refusal;
  const n = (k: string) => numberOf(fd, k)!;
  const res = await calculateRiskScore(identity, {
    assessment_name: text(fd, "assessment_name"),
    subject_type: text(fd, "subject_type") || undefined,
    subject_id: text(fd, "subject_id") || undefined,
    open_obligations_count: n("open_obligations_count"),
    policy_violations_count: n("policy_violations_count"),
    audit_exceptions_count: n("audit_exceptions_count"),
    privacy_incidents_count: n("privacy_incidents_count"),
    tax_penalties_count: n("tax_penalties_count"),
    source_references: listOf(fd, "source_references").length ? listOf(fd, "source_references") : undefined,
  });
  if (res.ok) refresh();
  return toState(previous, fd, res, "compliance-risk-scoring-svc", (s) => [
    ["Score ID", show(s.id)],
    ["Status", show(s.status)],
    ["Composite score / tier", `${show(s.composite_risk_score)} / ${show(s.risk_tier)}`],
    ["Model version", show(s.model_version)],
    ["Human review required", show(s.requires_human_review)],
  ]);
}

export async function analyzeReconciliationAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);
  const refusal = missing(previous, fd, [["job_name", "Job name"], ["bank_reconciliation_run_id", "Bank reconciliation run ID"]]);
  if (refusal) return refusal;
  const res = await analyzeReconciliation(identity, {
    job_name: text(fd, "job_name"),
    bank_reconciliation_run_id: text(fd, "bank_reconciliation_run_id"),
  });
  if (res.ok) refresh();
  return toState(previous, fd, res, "reconciliation-intelligence-svc", (j) => [
    ["Job ID", show(j.id)],
    ["Status", show(j.status)],
    ["Processed / unmatched", `${show(j.total_processed_count)} / ${show(j.unmatched_count)}`],
    ["Run", show(j.bank_reconciliation_run_id)],
  ]);
}

export async function createReportDefinitionAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);
  const refusal = missing(previous, fd, [["report_name", "Report name"], ["report_type", "Report type"], ["output_format", "Output format"], ["data_sources", "Data sources"]]);
  if (refusal) return refusal;
  const res = await createReportDefinition(identity, {
    report_name: text(fd, "report_name"),
    report_type: text(fd, "report_type"),
    output_format: text(fd, "output_format"),
    data_sources: listOf(fd, "data_sources"),
  });
  if (res.ok) refresh();
  return toState(previous, fd, res, "reporting-orchestration-svc", (d) => [
    ["Definition ID", show(d.id)],
    ["Status", show(d.status)],
    ["Report", `${show(d.report_name)} (${show(d.report_type)}, ${show(d.output_format)})`],
    ["Version", show(d.version)],
  ]);
}

export async function requestRecommendationAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);
  const refusal = missing(previous, fd, [["subject_type", "Subject type"], ["subject_reference", "Subject reference"], ["action_type", "Action type"], ["oversight_class", "Oversight class"]]);
  if (refusal) return refusal;
  const res = await requestRecommendation(identity, {
    subject_type: text(fd, "subject_type"),
    subject_reference: text(fd, "subject_reference"),
    action_type: text(fd, "action_type"),
    oversight_class: text(fd, "oversight_class"),
    evidence_refs: listOf(fd, "evidence_refs").length ? listOf(fd, "evidence_refs") : undefined,
  });
  if (res.ok) refresh();
  return toState(previous, fd, res, "decision-support-svc", (r) => [
    ["Recommendation ID", show(r.recommendation_id)],
    ["Status", show(r.status)],
    ["Recommended action", show(r.recommended_action)],
    ["Confidence", show(r.confidence_score)],
    ["Source", show(r.source)],
    ["History", show(r.history_status)],
    ["Rationale", show(r.rationale)],
  ]);
}
