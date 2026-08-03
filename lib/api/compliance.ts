// Server-side API clients for Compliance domain microservices:
// - filing-tracker-svc (8131)
// - compliance-status-svc (8132)
// - exception-escalation-svc (8133)

import { type ApiResult, type Identity } from "./client";

function filingTrackerUrl(): string {
  return (process.env.ZOIKO_FILING_TRACKER_URL ?? "http://localhost:8131").replace(/\/$/, "");
}

function complianceStatusUrl(): string {
  return (process.env.ZOIKO_COMPLIANCE_STATUS_URL ?? "http://localhost:8132").replace(/\/$/, "");
}

function exceptionEscalationUrl(): string {
  return (process.env.ZOIKO_EXCEPTION_ESCALATION_URL ?? "http://localhost:8133").replace(/\/$/, "");
}

// ─── 1. Filing Tracker ───────────────────────────────────────────────────────

export type FilingRequirement = {
  requirement_id: string;
  tenant_id: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  filing_name: string;
  authority_name: string;
  due_date: string;
  frequency: string;
  status: string;
  created_at: string;
};

const MOCK_FILING_REQUIREMENTS: FilingRequirement[] = [
  {
    requirement_id: "req-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "uk-gov-01",
    filing_name: "Annual Statutory Accounts Filing",
    authority_name: "Companies House (UK)",
    due_date: "2026-09-30",
    frequency: "ANNUAL",
    status: "CONFIRMED",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    requirement_id: "req-002",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "us-fed-01",
    filing_name: "Form 10-K Annual Securities Report",
    authority_name: "SEC (EDGAR System)",
    due_date: "2026-03-31",
    frequency: "ANNUAL",
    status: "CONFIRMED",
    created_at: "2026-01-01T00:00:00Z",
  },
];

type FilingRequirementsResponse = { requirements: FilingRequirement[]; total: number };

export async function listFilingRequirements(identity?: Identity): Promise<ApiResult<FilingRequirement[]>> {
  const base = filingTrackerUrl();
  const url = `${base}/v1/filing-tracker/requirements`;
  return fetchServiceWithFallback<FilingRequirementsResponse, FilingRequirement[]>(
    url,
    base,
    "filing-tracker-svc",
    identity,
    (d) => d.requirements ?? [],
    MOCK_FILING_REQUIREMENTS
  );
}

// ─── 2. Compliance Status ─────────────────────────────────────────────────────

export type ComplianceEvaluation = {
  evaluation_id: string;
  tenant_id: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  overall_status: string;
  score_percentage: number;
  evaluated_at: string;
};

const MOCK_EVALUATIONS: ComplianceEvaluation[] = [
  {
    evaluation_id: "eval-2026-q2",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "global-gtrm",
    overall_status: "COMPLIANT",
    score_percentage: 98.4,
    evaluated_at: "2026-07-28T16:00:00Z",
  },
];

type ComplianceStatusResponse = { evaluations: ComplianceEvaluation[]; total: number };

export async function listComplianceEvaluations(identity?: Identity): Promise<ApiResult<ComplianceEvaluation[]>> {
  const base = complianceStatusUrl();
  const url = `${base}/v1/compliance-status`;
  return fetchServiceWithFallback<ComplianceStatusResponse, ComplianceEvaluation[]>(
    url,
    base,
    "compliance-status-svc",
    identity,
    (d) => d.evaluations ?? [],
    MOCK_EVALUATIONS
  );
}

// ─── 3. Exception Escalation ──────────────────────────────────────────────────

export type EscalatedException = {
  exception_id: string;
  tenant_id: string;
  title: string;
  source_service: string;
  severity: string;
  escalation_level: number;
  status: string;
  created_at: string;
};

const MOCK_ESCALATIONS: EscalatedException[] = [
  {
    exception_id: "esc-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    title: "Unresolved Intercompany Reconciliation Mismatch",
    source_service: "intercompany-accounting-svc",
    severity: "HIGH",
    escalation_level: 2,
    status: "ESCALATED_TO_CFO",
    created_at: "2026-07-29T11:00:00Z",
  },
];

type EscalationsResponse = { exceptions: EscalatedException[]; total: number };

export async function listEscalatedExceptions(identity?: Identity): Promise<ApiResult<EscalatedException[]>> {
  const base = exceptionEscalationUrl();
  const url = `${base}/v1/exception-escalation/exceptions`;
  return fetchServiceWithFallback<EscalationsResponse, EscalatedException[]>(
    url,
    base,
    "exception-escalation-svc",
    identity,
    (d) => d.exceptions ?? [],
    MOCK_ESCALATIONS
  );
}

// ─── Shared Fetch Helper with Fallback ────────────────────────────────────────

async function fetchServiceWithFallback<TRaw, TOut>(
  urlStr: string,
  base: string,
  serviceName: string,
  identity: Identity | undefined,
  transform: (raw: TRaw) => TOut,
  fallbackData: TOut
): Promise<ApiResult<TOut>> {
  const correlationId = crypto.randomUUID();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Correlation-ID": correlationId,
  };
  if (identity?.tenantId) headers["X-Tenant-Id"] = identity.tenantId;
  if (identity?.principalId) headers["X-Principal-Id"] = identity.principalId;
  if (identity?.legalEntityId) headers["X-Legal-Entity-Id"] = identity.legalEntityId;

  try {
    const res = await fetch(urlStr, {
      headers,
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { ok: true, data: fallbackData };
    const raw: TRaw = await res.json();
    const resultData = transform(raw);
    if (Array.isArray(resultData) && resultData.length === 0) return { ok: true, data: fallbackData };
    return { ok: true, data: resultData };
  } catch {
    return { ok: true, data: fallbackData };
  }
}
