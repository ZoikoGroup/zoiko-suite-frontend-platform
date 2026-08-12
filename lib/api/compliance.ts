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

type FilingRequirementsResponse = { requirements: FilingRequirement[]; total: number };

export async function listFilingRequirements(identity?: Identity): Promise<ApiResult<FilingRequirement[]>> {
  const base = filingTrackerUrl();
  const url = `${base}/v1/filing-tracker/requirements`;
  return fetchDomainService<FilingRequirementsResponse, FilingRequirement[]>(
    url,
    base,
    "filing-tracker-svc",
    identity,
    (d) => d.requirements ?? [],
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

type ComplianceStatusResponse = { evaluations: ComplianceEvaluation[]; total: number };

export async function listComplianceEvaluations(identity?: Identity): Promise<ApiResult<ComplianceEvaluation[]>> {
  const base = complianceStatusUrl();
  const url = `${base}/v1/compliance-status`;
  return fetchDomainService<ComplianceStatusResponse, ComplianceEvaluation[]>(
    url,
    base,
    "compliance-status-svc",
    identity,
    (d) => d.evaluations ?? [],
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

type EscalationsResponse = { exceptions: EscalatedException[]; total: number };

export async function listEscalatedExceptions(identity?: Identity): Promise<ApiResult<EscalatedException[]>> {
  const base = exceptionEscalationUrl();
  const url = `${base}/v1/exception-escalation/exceptions`;
  return fetchDomainService<EscalationsResponse, EscalatedException[]>(
    url,
    base,
    "exception-escalation-svc",
    identity,
    (d) => d.exceptions ?? [],
  );
}

// ─── Shared Fetch Helper with Fallback ────────────────────────────────────────

/**
 * GET a JSON resource from a domain service and report what actually happened.
 *
 * This replaces `fetchServiceWithFallback`, which substituted hardcoded sample
 * data and reported it as `{ ok: true }`. It did so in three cases — a non-OK
 * status, a thrown request, AND **a successful response whose list was empty** —
 * and that last one is the dangerous one: a healthy service with no records
 * displayed invented rows indistinguishable from real ones. There was no way for a
 * caller, or a reader of the page, to tell.
 *
 * It also made the panels' own error handling unreachable. Every consumer of these
 * functions already branches on `!res.ok` to render a "service unavailable" state;
 * because the helper never returned `ok: false`, that branch was dead code. Failing
 * honestly is what makes it live again.
 *
 * An empty list is now an empty list. An unreachable service is an error.
 */
async function fetchDomainService<TRaw, TOut>(
  urlStr: string,
  base: string,
  serviceName: string,
  identity: Identity | undefined,
  transform: (raw: TRaw) => TOut,
): Promise<ApiResult<TOut>> {
  const correlationId = crypto.randomUUID();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Correlation-ID": correlationId,
  };
  if (identity?.tenantId) headers["X-Tenant-Id"] = identity.tenantId;
  if (identity?.principalId) headers["X-Principal-Id"] = identity.principalId;
  if (identity?.legalEntityId) headers["X-Legal-Entity-Id"] = identity.legalEntityId;

  let res: Response;
  try {
    res = await fetch(urlStr, { headers, signal: AbortSignal.timeout(3000) });
  } catch (cause) {
    const isTimeout = cause instanceof DOMException && cause.name === "TimeoutError";
    return {
      ok: false,
      error: {
        kind: isTimeout ? "timeout" : "unreachable",
        message: isTimeout
          ? `${serviceName} did not respond within 3000ms`
          : `${serviceName} is unreachable at ${base}`,
      },
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: {
        kind: "http",
        status: res.status,
        message: `${serviceName} returned ${res.status} for ${urlStr.slice(base.length)}`,
      },
    };
  }

  try {
    return { ok: true, data: transform((await res.json()) as TRaw) };
  } catch {
    return {
      ok: false,
      error: { kind: "malformed", message: `${serviceName} returned a non-JSON body` },
    };
  }
}
