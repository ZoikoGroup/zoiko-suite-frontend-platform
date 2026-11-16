"use client";

// The create forms of the Block 8 panels. Every field is the reader's; the
// legal entity comes from the session in the Server Action. Optional fields
// left blank are not sent, so the service applies its own documented default
// and records it on what it returns.

import { useCallback, useEffect, useState } from "react";
import { CreateRecordForm } from "./CreateRecordForm";
import { opts, type FieldSpec } from "./create-state";
import {
  createAnomalyRuleAction,
  detectAnomalyAction,
  loadAnomalyRules,
  generateForecastAction,
  calculateRiskScoreAction,
  analyzeReconciliationAction,
  createReportDefinitionAction,
  requestRecommendationAction,
} from "@/app/admin/intelligence/actions";
import type { AnomalyRule } from "@/lib/api/intelligence";

type OnCreated = { onCreated?: () => void };

const RULE_FIELDS: FieldSpec[] = [
  { name: "rule_name", label: "Rule name", kind: "text", required: true },
  { name: "domain_name", label: "Domain", kind: "text", required: true, hint: "The domain the rule watches, e.g. FINANCE." },
  { name: "metric_type", label: "Metric type", kind: "text", required: true },
  { name: "threshold_value", label: "Threshold value", kind: "number", step: "any", required: true },
  { name: "z_score_cutoff", label: "Z-score cutoff", kind: "number", step: "any", required: true, hint: "0 to 100; the service reads 0 as its default of 3.00." },
];

const DETECT_FIELDS: FieldSpec[] = [
  { name: "domain_name", label: "Domain", kind: "text", required: true },
  { name: "source_entity_id", label: "Source entity", kind: "text", required: true, hint: "The record the observation is about." },
  { name: "metric_type", label: "Metric type", kind: "text", required: true },
  { name: "observed_value", label: "Observed value", kind: "number", step: "any", required: true },
  { name: "expected_value", label: "Expected value", kind: "number", step: "any", required: true },
  { name: "std_deviation", label: "Standard deviation", kind: "number", step: "any" },
  { name: "rule_id", label: "Rule ID", kind: "text", hint: "arule-… from the rules list, to score against that rule." },
  { name: "description", label: "Description", kind: "textarea" },
];

export function AnomalyRuleSection({ onCreated }: OnCreated) {
  const [rules, setRules] = useState<AnomalyRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    const res = await loadAnomalyRules();
    if (res.ok) {
      setRules(res.rules);
      setError(null);
    } else {
      setRules(null);
      setError(`anomaly-detection-svc rules: ${res.message}`);
    }
  }, []);

  useEffect(() => {
    // Loads on mount; setState happens after the await.
    void loadRules();
  }, [loadRules]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <CreateRecordForm
          title="New anomaly rule"
          description="anomaly-detection-svc stores the rule; anomalies recorded against it are scored with its cutoff."
          fields={RULE_FIELDS}
          action={createAnomalyRuleAction}
          submitLabel="Create rule"
          onCreated={loadRules}
        />
        <CreateRecordForm
          title="Record an observation"
          description="The service scores the observation and records an OPEN anomaly with the severity it computes. It is advisory; nothing is blocked."
          fields={DETECT_FIELDS}
          action={detectAnomalyAction}
          submitLabel="Submit observation"
          onCreated={onCreated}
        />
      </div>
      {error ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">{error}</p>
      ) : rules && rules.length > 0 ? (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800">
          <p className="border-b border-slate-100 px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:border-slate-800">Rules ({rules.length})</p>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rules.map((r) => (
              <li key={r.rule_id} className="px-3 py-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                <span className="font-semibold">{r.rule_name}</span> · {r.domain_name} · {r.metric_type} · threshold {r.threshold_value} · z {r.z_score_cutoff} ·{" "}
                {r.is_active ? "active" : "inactive"} · <span className="font-mono text-slate-400">{r.rule_id}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const FORECAST_FIELDS: FieldSpec[] = [
  { name: "model_name", label: "Model name", kind: "text", required: true },
  { name: "domain", label: "Domain", kind: "select", required: true, options: opts("FINANCIAL", "PAYROLL", "CASH_FLOW", "WORKFORCE", "TAX_LIABILITY") },
  { name: "historical_data", label: "Historical data", kind: "text", required: true, hint: "At least 2 values, comma-separated, oldest first." },
  { name: "historical_start_date", label: "Historical start date", kind: "date", required: true },
  { name: "horizon_periods", label: "Horizon periods", kind: "number", hint: "1 to 120. Blank: the service's default, recorded on the forecast." },
  { name: "granularity", label: "Granularity", kind: "select", options: opts("DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"), hint: "Blank: the service's default." },
  { name: "algorithm_type", label: "Algorithm", kind: "select", options: opts("LINEAR_TREND", "EXPONENTIAL_SMOOTHING", "MOVING_AVERAGE", "SEASONAL_ADJUSTED"), hint: "Blank: the service's default." },
  { name: "scenario_type", label: "Scenario", kind: "select", options: opts("BASELINE", "OPTIMISTIC", "PESSIMISTIC"), hint: "Blank: the service's default." },
];

export function ForecastCreateForm({ onCreated }: OnCreated) {
  return (
    <CreateRecordForm
      title="Generate forecast"
      description="forecasting-svc projects the series you enter and records the forecast CALCULATED; it is not reviewed or approved by this."
      fields={FORECAST_FIELDS}
      action={generateForecastAction}
      submitLabel="Generate"
      onCreated={onCreated}
    />
  );
}

const RISK_FIELDS: FieldSpec[] = [
  { name: "assessment_name", label: "Assessment name", kind: "text", required: true },
  { name: "subject_type", label: "Subject type", kind: "text", hint: "Blank: the service assesses the legal entity." },
  { name: "subject_id", label: "Subject ID", kind: "text" },
  { name: "open_obligations_count", label: "Open obligations", kind: "number", required: true, hint: "Enter 0 when there are none." },
  { name: "policy_violations_count", label: "Policy violations", kind: "number", required: true },
  { name: "audit_exceptions_count", label: "Audit exceptions", kind: "number", required: true },
  { name: "privacy_incidents_count", label: "Privacy incidents", kind: "number", required: true },
  { name: "tax_penalties_count", label: "Tax penalties", kind: "number", required: true },
  { name: "source_references", label: "Source references", kind: "text", hint: "Comma-separated references to where the counts came from." },
];

export function RiskScoreCreateForm({ onCreated }: OnCreated) {
  return (
    <CreateRecordForm
      title="Calculate risk score"
      description="compliance-risk-scoring-svc scores the counts you enter with its weighted model. The counts are yours; none is filled in."
      fields={RISK_FIELDS}
      action={calculateRiskScoreAction}
      submitLabel="Calculate"
      onCreated={onCreated}
    />
  );
}

const RECON_FIELDS: FieldSpec[] = [
  { name: "job_name", label: "Job name", kind: "text", required: true },
  { name: "bank_reconciliation_run_id", label: "Bank reconciliation run ID", kind: "text", required: true, hint: "The bank-reconciliation-svc run to analyze (a UUID)." },
];

export function ReconciliationCreateForm({ onCreated }: OnCreated) {
  return (
    <CreateRecordForm
      title="Analyze a reconciliation run"
      description="reconciliation-intelligence-svc analyzes the run's unmatched items and suggests resolutions; it applies none."
      fields={RECON_FIELDS}
      action={analyzeReconciliationAction}
      submitLabel="Analyze"
      onCreated={onCreated}
    />
  );
}

const REPORT_FIELDS: FieldSpec[] = [
  { name: "report_name", label: "Report name", kind: "text", required: true },
  { name: "report_type", label: "Report type", kind: "select", required: true, options: opts("FINANCIAL_SUMMARY", "PAYROLL_SUMMARY", "COMPLIANCE_OVERVIEW", "AUDIT_TRAIL", "CASH_FLOW", "WORKFORCE_ANALYTICS") },
  { name: "output_format", label: "Output format", kind: "select", required: true, options: opts("JSON", "CSV", "PDF") },
  { name: "data_sources", label: "Data sources", kind: "text", required: true, hint: "Comma-separated service names, e.g. general-ledger-svc." },
];

export function ReportDefinitionCreateForm({ onCreated }: OnCreated) {
  return (
    <CreateRecordForm
      title="New report definition"
      description="The definition lands DRAFT. Runs are recorded NOT_IMPLEMENTED by reporting-orchestration-svc: no report data is produced yet."
      fields={REPORT_FIELDS}
      action={createReportDefinitionAction}
      submitLabel="Create definition"
      onCreated={onCreated}
    />
  );
}

const RECOMMENDATION_FIELDS: FieldSpec[] = [
  { name: "subject_type", label: "Subject type", kind: "text", required: true, hint: "e.g. JOURNAL" },
  { name: "subject_reference", label: "Subject reference", kind: "text", required: true },
  { name: "action_type", label: "Action type", kind: "text", required: true, hint: "The decision being asked about, e.g. REVIEW." },
  { name: "oversight_class", label: "Oversight class", kind: "select", required: true, options: opts("O1", "O2", "O3") },
  { name: "evidence_refs", label: "Evidence references", kind: "text", hint: "Comma-separated." },
];

export function RecommendationRequestForm({ onCreated }: OnCreated) {
  return (
    <CreateRecordForm
      title="Request a recommendation"
      description="decision-support-svc derives advice from prior decisions in governance-decision-log-svc, or records NO_HISTORY with zero confidence when it has none. The console never submits a model's proposal. Advice is PENDING until a person accepts or rejects it."
      fields={RECOMMENDATION_FIELDS}
      action={requestRecommendationAction}
      submitLabel="Request"
      onCreated={onCreated}
    />
  );
}
