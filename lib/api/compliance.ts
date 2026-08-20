// Server-side API clients for Compliance domain microservices:
// - filing-tracker-svc (8131)
// - compliance-status-svc (8132)
// - exception-escalation-svc (8133)
// - anomaly-detection-svc (8134)
// - compliance-risk-scoring-svc (8136)
// - decision-support-svc (8138)
// - evidence-manifest-svc (8095)

import { apiGet, apiPost, type ApiResult, type Identity } from "./client";

// ─── 1. Filing Tracker ───────────────────────────────────────────────────────

export type FilingRequirement = {
  requirement_id: string;
  tenant_id?: string;
  legal_entity_id?: string;
  jurisdiction_id?: string;
  filing_name: string;
  authority_name: string;
  due_date: string;
  frequency?: string;
  status: string;
  created_at?: string;
};

type FilingRequirementsResponse = { requirements?: FilingRequirement[]; total?: number };

export async function listFilingRequirements(identity?: Identity): Promise<ApiResult<FilingRequirement[]>> {
  const res = await apiGet<FilingRequirementsResponse | FilingRequirement[]>("filingTracker", "/v1/filings", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.requirements ?? [];
  return { ok: true, data: list };
}

export async function createFilingRequirement(
  body: Partial<FilingRequirement>,
  identity?: Identity
): Promise<ApiResult<FilingRequirement>> {
  const res = await apiPost<{ requirement?: FilingRequirement } | FilingRequirement>(
    "filingTracker",
    "/v1/filings",
    body,
    { identity }
  );
  if (!res.ok) return res;
  const r = (res.data as { requirement?: FilingRequirement }).requirement ?? (res.data as FilingRequirement);
  return { ok: true, data: r };
}

// ─── 2. Compliance Status & Risk Scoring ──────────────────────────────────────

export type ComplianceEvaluation = {
  evaluation_id: string;
  tenant_id?: string;
  legal_entity_id?: string;
  jurisdiction_id?: string;
  overall_status: string;
  score_percentage: number;
  evaluated_at?: string;
};

type ComplianceStatusResponse = { evaluations?: ComplianceEvaluation[]; total?: number };

export async function listComplianceEvaluations(identity?: Identity): Promise<ApiResult<ComplianceEvaluation[]>> {
  const res = await apiGet<ComplianceStatusResponse | ComplianceEvaluation[]>("complianceStatus", "/v1/evaluations", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.evaluations ?? [];
  return { ok: true, data: list };
}

export async function evaluateCompliance(
  body: { legal_entity_id?: string; jurisdiction_id?: string },
  identity?: Identity
): Promise<ApiResult<ComplianceEvaluation>> {
  const res = await apiPost<{ evaluation?: ComplianceEvaluation } | ComplianceEvaluation>(
    "complianceStatus",
    "/v1/evaluate",
    body,
    { identity }
  );
  if (!res.ok) return res;
  const r = (res.data as { evaluation?: ComplianceEvaluation }).evaluation ?? (res.data as ComplianceEvaluation);
  return { ok: true, data: r };
}

export type RiskScore = {
  score_id: string;
  category: string;
  score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  last_evaluated: string;
};

export async function getRiskScoringSummary(identity?: Identity): Promise<ApiResult<RiskScore[]>> {
  const res = await apiGet<{ scores?: RiskScore[] } | RiskScore[]>("complianceRiskScoring", "/v1/scores", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.scores ?? [];
  return { ok: true, data: list };
}

// ─── 3. Exception Escalation ──────────────────────────────────────────────────

export type EscalatedException = {
  exception_id: string;
  tenant_id?: string;
  title: string;
  source_service: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  escalation_level: number;
  status: "OPEN" | "INVESTIGATING" | "RESOLVED" | "WAIVED";
  created_at?: string;
};

type EscalationsResponse = { exceptions?: EscalatedException[]; total?: number };

export async function listEscalatedExceptions(identity?: Identity): Promise<ApiResult<EscalatedException[]>> {
  const res = await apiGet<EscalationsResponse | EscalatedException[]>("exceptionEscalation", "/v1/exceptions", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.exceptions ?? [];
  return { ok: true, data: list };
}

export async function resolveException(
  exceptionId: string,
  resolutionNote: string,
  identity?: Identity,
): Promise<ApiResult<EscalatedException>> {
  const res = await apiPost<{ exception?: EscalatedException } | EscalatedException>(
    "exceptionEscalation",
    `/v1/exceptions/${exceptionId}/resolve`,
    { resolution_note: resolutionNote },
    { identity }
  );
  if (!res.ok) return res;
  const exc = (res.data as { exception?: EscalatedException }).exception ?? (res.data as EscalatedException);
  return { ok: true, data: exc };
}

// ─── 4. Anomaly Detection ─────────────────────────────────────────────────────

export type ComplianceAnomaly = {
  anomaly_id: string;
  domain: string;
  description: string;
  confidence_score: number;
  detected_at: string;
  status: "NEW" | "ACKNOWLEDGED" | "DISMISSED";
};

export async function listAnomalies(identity?: Identity): Promise<ApiResult<ComplianceAnomaly[]>> {
  const res = await apiGet<{ anomalies?: ComplianceAnomaly[] } | ComplianceAnomaly[]>("anomalyDetection", "/v1/anomalies", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.anomalies ?? [];
  return { ok: true, data: list };
}

// ─── 5. Decision Support & Readiness ──────────────────────────────────────────

export type DecisionSupportItem = {
  item_id: string;
  category: string;
  recommendation: string;
  impact_level: "HIGH" | "MEDIUM" | "LOW";
  is_completed: boolean;
};

export async function getDecisionSupportChecklist(identity?: Identity): Promise<ApiResult<DecisionSupportItem[]>> {
  const res = await apiGet<{ items?: DecisionSupportItem[] } | DecisionSupportItem[]>("decisionSupport", "/v1/recommendations", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.items ?? [];
  return { ok: true, data: list };
}

// ─── 6. Evidence Manifest ────────────────────────────────────────────────────

export async function generateEvidenceManifest(
  body: { obligation_id?: string; legal_entity_id?: string },
  identity?: Identity
): Promise<ApiResult<{ manifest_id: string; checksum: string }>> {
  const res = await apiPost<{ manifest_id: string; checksum: string }>(
    "evidence",
    "/v1/manifests",
    body,
    { identity }
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data };
}
