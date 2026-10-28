// Server-side API clients for Compliance domain microservices:
// - filing-tracker-svc (8131)
// - compliance-status-svc (8132)
// - exception-escalation-svc (8133)
// - anomaly-detection-svc (8134)
// - compliance-risk-scoring-svc (8136)
// - decision-support-svc (8138)
// - evidence-manifest-svc (8095)

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

// ─── 1. Filing Tracker (filing-tracker-svc, /v1/filing-tracker/requirements) ──
//
// SCHEDULED → submit → SUBMITTED → confirm → CONFIRMED; mark-overdue → OVERDUE.

export type FilingStatus = "SCHEDULED" | "DRAFT_READY" | "SUBMITTED" | "CONFIRMED" | "OVERDUE" | "REJECTED";

/** Wire shape of domain.FilingRequirement. */
export type FilingRequirement = {
  filing_id: string;
  tenant_id: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  filing_authority: string;
  filing_type: string;
  period_key: string;
  /** "YYYY-MM-DD". */
  due_date: string;
  status: FilingStatus;
  submission_reference?: string | null;
  submitted_at?: string | null;
  submitted_by?: string | null;
  confirmation_reference?: string | null;
  confirmed_at?: string | null;
  rejection_reason?: string;
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type WriteIdentity = Identity & { principalId: string; tenantId: string; legalEntityId?: string };

export async function listFilingRequirements(identity?: Identity): Promise<ApiResult<FilingRequirement[]>> {
  const res = await apiGet<{ filing_requirements?: FilingRequirement[] | null }>(
    "filingTracker",
    "/v1/filing-tracker/requirements",
    { identity },
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data?.filing_requirements ?? [] };
}

export type CreateFilingRequirementInput = {
  identity: WriteIdentity & { legalEntityId: string };
  jurisdictionId: string;
  filingAuthority: string;
  filingType: string;
  /** e.g. "2026-Q3". */
  periodKey: string;
  /** "YYYY-MM-DD". */
  dueDate: string;
  notes?: string;
};

export async function createFilingRequirement(
  input: CreateFilingRequirementInput,
): Promise<ApiWriteResult<FilingRequirement>> {
  return apiPost<FilingRequirement>(
    "filingTracker",
    "/v1/filing-tracker/requirements",
    {
      legal_entity_id: input.identity.legalEntityId,
      jurisdiction_id: input.jurisdictionId,
      filing_authority: input.filingAuthority,
      filing_type: input.filingType,
      period_key: input.periodKey,
      due_date: input.dueDate,
      ...(input.notes ? { notes: input.notes } : {}),
      created_by: input.identity.principalId,
    },
    { identity: input.identity },
  );
}

/** SCHEDULED → SUBMITTED, recording the submission reference. */
export async function submitFiling(
  filingId: string,
  submissionReference: string,
  identity: WriteIdentity,
): Promise<ApiWriteResult<FilingRequirement>> {
  return apiPost<FilingRequirement>(
    "filingTracker",
    `/v1/filing-tracker/requirements/${encodeURIComponent(filingId)}/submit`,
    { submission_reference: submissionReference, submitted_by: identity.principalId },
    { identity },
  );
}

/** SUBMITTED → CONFIRMED, recording the authority confirmation reference. */
export async function confirmFiling(
  filingId: string,
  confirmationReference: string,
  identity: WriteIdentity,
): Promise<ApiWriteResult<FilingRequirement>> {
  return apiPost<FilingRequirement>(
    "filingTracker",
    `/v1/filing-tracker/requirements/${encodeURIComponent(filingId)}/confirm`,
    { confirmation_reference: confirmationReference },
    { identity },
  );
}

// ─── 2. Compliance Status (compliance-status-svc, /v1/compliance-status) ─────

export type ComplianceOverallStatus = "COMPLIANT" | "WARNING" | "NON_COMPLIANT" | "UNDER_REVIEW";

/** Wire shape of domain.ComplianceHealth — one evaluated health record. */
export type ComplianceEvaluation = {
  status_id: string;
  tenant_id: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  domain_name: string;
  overall_status: ComplianceOverallStatus;
  /** 0–100, computed by the service from the obligation counts. */
  health_score: number;
  total_obligations: number;
  fulfilled_obligations: number;
  pending_obligations: number;
  overdue_obligations: number;
  open_exceptions: number;
  last_evaluated_at: string;
  notes?: string;
  effective_from: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export async function listComplianceEvaluations(identity?: Identity): Promise<ApiResult<ComplianceEvaluation[]>> {
  const res = await apiGet<{ compliance_status_records?: ComplianceEvaluation[] | null }>(
    "complianceStatus",
    "/v1/compliance-status",
    { identity },
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data?.compliance_status_records ?? [] };
}

export type EvaluateComplianceInput = {
  identity: WriteIdentity & { legalEntityId: string };
  jurisdictionId: string;
  domainName: string;
  totalObligations: number;
  fulfilledObligations: number;
  pendingObligations: number;
  overdueObligations: number;
  openExceptions: number;
  /** "YYYY-MM-DD". */
  effectiveFrom: string;
  notes?: string;
};

/** Record an evaluation; the service derives overall_status and health_score. */
export async function evaluateCompliance(
  input: EvaluateComplianceInput,
): Promise<ApiWriteResult<ComplianceEvaluation>> {
  return apiPost<ComplianceEvaluation>(
    "complianceStatus",
    "/v1/compliance-status/evaluate",
    {
      legal_entity_id: input.identity.legalEntityId,
      jurisdiction_id: input.jurisdictionId,
      domain_name: input.domainName,
      total_obligations: input.totalObligations,
      fulfilled_obligations: input.fulfilledObligations,
      pending_obligations: input.pendingObligations,
      overdue_obligations: input.overdueObligations,
      open_exceptions: input.openExceptions,
      effective_from: input.effectiveFrom,
      ...(input.notes ? { notes: input.notes } : {}),
      created_by: input.identity.principalId,
    },
    { identity: input.identity },
  );
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

// ─── 3. Exception Escalation (exception-escalation-svc, /v1/exception-escalation) ─

export type ExceptionSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ExceptionCaseStatus = "OPEN" | "UNDER_INVESTIGATION" | "ESCALATED" | "RESOLVED" | "CLOSED";

/** Wire shape of domain.ExceptionCase. */
export type EscalatedException = {
  exception_case_id: string;
  tenant_id: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  exception_type: string;
  severity_level: ExceptionSeverity;
  linked_object_type: string;
  linked_object_id: string;
  description: string;
  case_status: ExceptionCaseStatus;
  assigned_to_role?: string;
  assigned_to_user?: string;
  escalated_at?: string | null;
  closed_at?: string | null;
  closed_by?: string;
  closure_reason?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export async function listEscalatedExceptions(identity?: Identity): Promise<ApiResult<EscalatedException[]>> {
  const res = await apiGet<{ exception_cases?: EscalatedException[] | null }>(
    "exceptionEscalation",
    "/v1/exception-escalation/exceptions",
    { identity },
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data?.exception_cases ?? [] };
}

export type CreateExceptionInput = {
  identity: WriteIdentity & { legalEntityId: string };
  jurisdictionId: string;
  exceptionType: string;
  severityLevel: ExceptionSeverity;
  /** What the exception is about, e.g. "FILING" and its filing_id. */
  linkedObjectType: string;
  linkedObjectId: string;
  description: string;
  assignedToRole?: string;
};

export async function createEscalatedException(
  input: CreateExceptionInput,
): Promise<ApiWriteResult<EscalatedException>> {
  return apiPost<EscalatedException>(
    "exceptionEscalation",
    "/v1/exception-escalation/exceptions",
    {
      legal_entity_id: input.identity.legalEntityId,
      jurisdiction_id: input.jurisdictionId,
      exception_type: input.exceptionType,
      severity_level: input.severityLevel,
      linked_object_type: input.linkedObjectType,
      linked_object_id: input.linkedObjectId,
      description: input.description,
      ...(input.assignedToRole ? { assigned_to_role: input.assignedToRole } : {}),
      created_by: input.identity.principalId,
    },
    { identity: input.identity },
  );
}

/** Close an exception case with a reason, attributed to the caller. */
export async function resolveException(
  exceptionCaseId: string,
  closureReason: string,
  identity: WriteIdentity,
): Promise<ApiWriteResult<EscalatedException>> {
  return apiPost<EscalatedException>(
    "exceptionEscalation",
    `/v1/exception-escalation/exceptions/${encodeURIComponent(exceptionCaseId)}/resolve`,
    { closed_by: identity.principalId, closure_reason: closureReason },
    { identity },
  );
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
