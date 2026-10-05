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

// Field names and the /v1/filing-tracker/requirements path mirror the real
// filing-tracker-svc's domain.FilingRequirement exactly (services/filing-
// tracker-svc/internal/domain/types.go) — the previous shape here
// (requirement_id, filing_name, authority_name, frequency) never matched
// anything the service actually returns, and the path hit /v1/filings, a
// route the service does not have.
export type FilingRequirementStatus =
  | "SCHEDULED" | "DRAFT_READY" | "SUBMITTED" | "CONFIRMED" | "OVERDUE" | "REJECTED";

export type FilingRequirement = {
  filing_id: string;
  tenant_id?: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  filing_authority: string;
  filing_type: string;
  period_key: string;
  due_date: string;
  status: FilingRequirementStatus;
  submission_reference?: string;
  submitted_at?: string;
  submitted_by?: string;
  confirmation_reference?: string;
  confirmed_at?: string;
  rejection_reason?: string;
  notes?: string;
  created_by: string;
  created_at?: string;
  updated_at?: string;
};

type FilingRequirementsResponse = { filing_requirements?: FilingRequirement[]; total?: number };

export async function listFilingRequirements(identity?: Identity): Promise<ApiResult<FilingRequirement[]>> {
  const res = await apiGet<FilingRequirementsResponse | FilingRequirement[]>(
    "filingTracker",
    "/v1/filing-tracker/requirements",
    { identity }
  );
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.filing_requirements ?? [];
  return { ok: true, data: list };
}

export async function createFilingRequirement(
  body: Partial<FilingRequirement>,
  identity?: Identity
): Promise<ApiResult<FilingRequirement>> {
  const res = await apiPost<FilingRequirement>(
    "filingTracker",
    "/v1/filing-tracker/requirements",
    body,
    { identity }
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data };
}

// ─── 2. Compliance Status & Risk Scoring ──────────────────────────────────────

export type ComplianceEvaluation = {
  evaluation_id: string;
  tenant_id?: string;
  legal_entity_id?: string;
  jurisdiction_id?: string;
  domain_name?: string;
  overall_status: string;
  score_percentage: number;
  evaluated_at?: string;
};

type ComplianceStatusResponse = {
  evaluations?: ComplianceEvaluation[];
  compliance_status_records?: Array<{
    status_id: string;
    tenant_id?: string;
    legal_entity_id?: string;
    jurisdiction_id?: string;
    domain_name?: string;
    overall_status: string;
    health_score: number | string;
    last_evaluated_at?: string;
  }>;
  total?: number;
};

export async function listComplianceEvaluations(identity?: Identity): Promise<ApiResult<ComplianceEvaluation[]>> {
  const res = await apiGet<ComplianceStatusResponse | ComplianceEvaluation[]>("complianceStatus", "/v1/compliance-status", { identity });
  if (!res.ok) return res;
  let list: ComplianceEvaluation[] = [];
  if (Array.isArray(res.data)) {
    list = res.data;
  } else if (res.data.compliance_status_records) {
    list = res.data.compliance_status_records.map((r) => ({
      evaluation_id: r.status_id,
      tenant_id: r.tenant_id,
      legal_entity_id: r.legal_entity_id,
      jurisdiction_id: r.jurisdiction_id,
      domain_name: r.domain_name,
      overall_status: r.overall_status,
      score_percentage: Math.round(Number(r.health_score)),
      evaluated_at: r.last_evaluated_at,
    }));
  } else if (res.data.evaluations) {
    list = res.data.evaluations;
  }
  return { ok: true, data: list };
}

export async function evaluateCompliance(
  body: {
    legal_entity_id?: string;
    jurisdiction_id?: string;
    domain_name?: string;
    total_obligations?: number;
    fulfilled_obligations?: number;
    pending_obligations?: number;
    overdue_obligations?: number;
    open_exceptions?: number;
    notes?: string;
    effective_from?: string;
    created_by?: string;
  },
  identity?: Identity
): Promise<ApiResult<ComplianceEvaluation>> {
  const res = await apiPost<Record<string, any>>(
    "complianceStatus",
    "/v1/compliance-status/evaluate",
    body,
    { identity }
  );
  if (!res.ok) return res;
  const raw = res.data?.evaluation ?? res.data;
  const evaluation: ComplianceEvaluation = {
    evaluation_id: raw.status_id || raw.evaluation_id || "eval-001",
    tenant_id: raw.tenant_id,
    legal_entity_id: raw.legal_entity_id,
    jurisdiction_id: raw.jurisdiction_id,
    domain_name: raw.domain_name,
    overall_status: raw.overall_status || "COMPLIANT",
    score_percentage: Math.round(Number(raw.health_score ?? raw.score_percentage ?? 100)),
    evaluated_at: raw.last_evaluated_at || raw.evaluated_at || new Date().toISOString(),
  };
  return { ok: true, data: evaluation };
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

// Field names and the /v1/exception-escalation/exceptions path mirror the real
// exception-escalation-svc's domain.ExceptionCase exactly (services/exception-
// escalation-svc/internal/domain/types.go) — the previous shape here (title,
// source_service, escalation_level, a status enum with INVESTIGATING/WAIVED)
// never matched anything the service actually returns.
export type ExceptionSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ExceptionCaseStatus = "OPEN" | "UNDER_INVESTIGATION" | "ESCALATED" | "RESOLVED" | "CLOSED";

export type EscalatedException = {
  exception_case_id: string;
  tenant_id?: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  exception_type: string;
  severity_level: ExceptionSeverity;
  linked_object_type: string;
  linked_object_id: string;
  description?: string;
  case_status: ExceptionCaseStatus;
  assigned_to_role?: string;
  assigned_to_user?: string;
  escalated_at?: string;
  closed_at?: string;
  closed_by?: string;
  closure_reason?: string;
  created_by: string;
  created_at?: string;
  updated_at?: string;
};

type EscalationsResponse = { exception_cases?: EscalatedException[]; total?: number };

export async function listEscalatedExceptions(identity?: Identity): Promise<ApiResult<EscalatedException[]>> {
  const res = await apiGet<EscalationsResponse | EscalatedException[]>(
    "exceptionEscalation",
    "/v1/exception-escalation/exceptions",
    { identity }
  );
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.exception_cases ?? [];
  return { ok: true, data: list };
}

export async function createEscalatedException(
  body: {
    title: string;
    source_service: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    description?: string;
  },
  identity?: Identity,
): Promise<ApiResult<EscalatedException>> {
  const res = await apiPost<{ exception?: EscalatedException } | EscalatedException>(
    "exceptionEscalation",
    "/v1/exceptions",
    body,
    { identity },
  );
  if (!res.ok) return res;
  const exc = (res.data as { exception?: EscalatedException }).exception ?? (res.data as EscalatedException);
  return { ok: true, data: exc };
}

export async function resolveException(
  exceptionId: string,
  resolutionNote: string,
  identity?: Identity,
): Promise<ApiResult<EscalatedException>> {
  // The service's ResolveCaseRequest takes closed_by (required — and must not
  // equal the case's created_by, enforced server-side as segregation of
  // duties) and an optional closure_reason; there is no resolution_note field.
  const res = await apiPost<EscalatedException>(
    "exceptionEscalation",
    `/v1/exception-escalation/exceptions/${exceptionId}/resolve`,
    { closed_by: identity?.principalId, closure_reason: resolutionNote },
    { identity }
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data };
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
