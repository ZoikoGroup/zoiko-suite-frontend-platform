// Server-side API clients for HR & Workforce domain microservices:
// - employee-master-svc (8108)
// - leave-absence-svc (8115)
// - org-structure-svc (8116)
// - workforce-compliance-svc (8118)

import { type ApiResult, type Identity } from "./client";

function employeeMasterUrl(): string {
  return (process.env.ZOIKO_EMPLOYEE_MASTER_URL ?? "http://localhost:8108").replace(/\/$/, "");
}

function leaveAbsenceUrl(): string {
  return (process.env.ZOIKO_LEAVE_ABSENCE_URL ?? "http://localhost:8115").replace(/\/$/, "");
}

function orgStructureUrl(): string {
  return (process.env.ZOIKO_ORG_STRUCTURE_URL ?? "http://localhost:8116").replace(/\/$/, "");
}

function workforceComplianceUrl(): string {
  return (process.env.ZOIKO_WORKFORCE_COMPLIANCE_URL ?? "http://localhost:8118").replace(/\/$/, "");
}

// ─── 1. Employee Master ──────────────────────────────────────────────────────

export type Employee = {
  employee_id: string;
  tenant_id: string;
  legal_entity_id: string;
  first_name: string;
  last_name: string;
  email: string;
  employment_type: string;
  status: string;
  hire_date: string;
  created_at: string;
};

type EmployeesResponse = { employees: Employee[]; total: number };

export async function listEmployees(identity?: Identity): Promise<ApiResult<Employee[]>> {
  const base = employeeMasterUrl();
  const url = `${base}/v1/employees`;
  return fetchDomainService<EmployeesResponse, Employee[]>(
    url,
    base,
    "employee-master-svc",
    identity,
    (d) => d.employees ?? [],
  );
}

// ─── 2. Leave & Absence ──────────────────────────────────────────────────────

export type LeaveRequest = {
  request_id: string;
  tenant_id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: string;
  created_at: string;
};

type LeaveRequestsResponse = { requests: LeaveRequest[]; total: number };

export async function listLeaveRequests(identity?: Identity): Promise<ApiResult<LeaveRequest[]>> {
  const base = leaveAbsenceUrl();
  const url = `${base}/v1/leave/requests`;
  return fetchDomainService<LeaveRequestsResponse, LeaveRequest[]>(
    url,
    base,
    "leave-absence-svc",
    identity,
    (d) => d.requests ?? [],
  );
}

// ─── 3. Org Structure ────────────────────────────────────────────────────────

export type Department = {
  department_id: string;
  tenant_id: string;
  legal_entity_id: string;
  code: string;
  name: string;
  manager_id?: string;
  created_at: string;
};

type DepartmentsResponse = { departments: Department[]; total: number };

export async function listDepartments(identity?: Identity): Promise<ApiResult<Department[]>> {
  const base = orgStructureUrl();
  const url = `${base}/v1/org/departments`;
  return fetchDomainService<DepartmentsResponse, Department[]>(
    url,
    base,
    "org-structure-svc",
    identity,
    (d) => d.departments ?? [],
  );
}

// ─── 4. Workforce Compliance ─────────────────────────────────────────────────

export type ComplianceAlert = {
  alert_id: string;
  tenant_id: string;
  employee_id: string;
  alert_type: string;
  severity: string;
  description: string;
  status: string;
  created_at: string;
};

type AlertsResponse = { alerts: ComplianceAlert[]; total: number };

export async function listWorkforceAlerts(identity?: Identity): Promise<ApiResult<ComplianceAlert[]>> {
  const base = workforceComplianceUrl();
  const url = `${base}/v1/compliance/alerts`;
  return fetchDomainService<AlertsResponse, ComplianceAlert[]>(
    url,
    base,
    "workforce-compliance-svc",
    identity,
    (d) => d.alerts ?? [],
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
