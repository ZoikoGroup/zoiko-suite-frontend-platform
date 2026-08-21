// Server-side API clients for Payroll domain microservices:
// - payroll-run-svc (8110)
// - compensation-svc (8111)
// - benefits-svc (8112)
// - payroll-tax-svc (8113)
// - payroll-exceptions-svc (8114)

import { type ApiResult, type Identity } from "./client";

function payrollRunUrl(): string {
  return (process.env.ZOIKO_PAYROLL_RUN_URL ?? "http://localhost:8110").replace(/\/$/, "");
}

function compensationUrl(): string {
  return (process.env.ZOIKO_COMPENSATION_URL ?? "http://localhost:8111").replace(/\/$/, "");
}

function benefitsUrl(): string {
  return (process.env.ZOIKO_BENEFITS_URL ?? "http://localhost:8112").replace(/\/$/, "");
}

function payrollTaxUrl(): string {
  return (process.env.ZOIKO_PAYROLL_TAX_URL ?? "http://localhost:8113").replace(/\/$/, "");
}

function payrollExceptionsUrl(): string {
  return (process.env.ZOIKO_PAYROLL_EXCEPTIONS_URL ?? "http://localhost:8114").replace(/\/$/, "");
}

// ─── 1. Payroll Runs ─────────────────────────────────────────────────────────

export type PayrollRunStatus = "DRAFT" | "CALCULATING" | "CALCULATED" | "APPROVED" | "FINALIZED" | "CANCELLED";

export type PayrollRun = {
  payroll_run_id: string;
  tenant_id: string;
  legal_entity_id: string;
  pay_period_code: string;
  period_start_date: string;
  period_end_date: string;
  payment_date: string;
  status: PayrollRunStatus;
  total_gross_pay: number;
  total_net_pay: number;
  total_tax_deductions: number;
  total_employee_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type PayrollRunsResponse = { payroll_runs: PayrollRun[]; total: number };

export async function listPayrollRuns(identity?: Identity): Promise<ApiResult<PayrollRun[]>> {
  const base = payrollRunUrl();
  const url = `${base}/v1/payroll-runs`;
  return fetchDomainService<PayrollRunsResponse, PayrollRun[]>(
    url,
    base,
    "payroll-run-svc",
    identity,
    (d) => d.payroll_runs ?? [],
  );
}

// ─── 2. Compensation Structures ──────────────────────────────────────────────

export type WageType = "SALARY" | "HOURLY" | "COMMISSION" | "PIECE_RATE";

export type CompensationStructure = {
  structure_id: string;
  tenant_id: string;
  legal_entity_id: string;
  title: string;
  wage_type: WageType;
  base_pay: number;
  currency: string;
  pay_frequency: string;
  effective_from: string;
  created_at: string;
};

type CompStructuresResponse = { structures: CompensationStructure[]; total: number };

export async function listCompensationStructures(identity?: Identity): Promise<ApiResult<CompensationStructure[]>> {
  const base = compensationUrl();
  const url = `${base}/v1/compensation/structures`;
  return fetchDomainService<CompStructuresResponse, CompensationStructure[]>(
    url,
    base,
    "compensation-svc",
    identity,
    (d) => d.structures ?? [],
  );
}

// ─── 3. Benefits Plans ───────────────────────────────────────────────────────

export type BenefitPlan = {
  plan_id: string;
  tenant_id: string;
  legal_entity_id: string;
  name: string;
  benefit_type: string;
  provider_name: string;
  employer_contribution_percent: number;
  currency: string;
  status: string;
  created_at: string;
};

type BenefitPlansResponse = { plans: BenefitPlan[]; total: number };

export async function listBenefitPlans(identity?: Identity): Promise<ApiResult<BenefitPlan[]>> {
  const base = benefitsUrl();
  const url = `${base}/v1/benefits/plans`;
  return fetchDomainService<BenefitPlansResponse, BenefitPlan[]>(
    url,
    base,
    "benefits-svc",
    identity,
    (d) => d.plans ?? [],
  );
}

// ─── 4. Payroll Tax Profiles ──────────────────────────────────────────────────

export type TaxProfile = {
  profile_id: string;
  tenant_id: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  tax_identifier: string;
  filing_status: string;
  withholding_allowances: number;
  additional_withholding_amount: number;
  currency: string;
  status: string;
  created_at: string;
};

type TaxProfilesResponse = { profiles: TaxProfile[]; total: number };

export async function listPayrollTaxProfiles(identity?: Identity): Promise<ApiResult<TaxProfile[]>> {
  const base = payrollTaxUrl();
  const url = `${base}/v1/payroll-tax/profiles`;
  return fetchDomainService<TaxProfilesResponse, TaxProfile[]>(
    url,
    base,
    "payroll-tax-svc",
    identity,
    (d) => d.profiles ?? [],
  );
}

// ─── 5. Payroll Exceptions ────────────────────────────────────────────────────

export type ExceptionSeverity = "INFO" | "WARNING" | "CRITICAL" | "BLOCKER";
export type ExceptionStatus = "OPEN" | "RESOLVED" | "WAIVED";

export type PayrollException = {
  exception_id: string;
  tenant_id: string;
  payroll_run_id: string;
  employee_id: string;
  exception_type: string;
  severity: ExceptionSeverity;
  status: ExceptionStatus;
  description: string;
  created_at: string;
};

type ExceptionsResponse = { exceptions: PayrollException[]; total: number };

export async function listPayrollExceptions(identity?: Identity): Promise<ApiResult<PayrollException[]>> {
  const base = payrollExceptionsUrl();
  const url = `${base}/v1/payroll-exceptions`;
  return fetchDomainService<ExceptionsResponse, PayrollException[]>(
    url,
    base,
    "payroll-exceptions-svc",
    identity,
    (d) => d.exceptions ?? [],
  );
}

// ─── POST Operations ─────────────────────────────────────────────────────────

export async function initiatePayrollRun(
  body: {
    pay_period_start: string;
    pay_period_end: string;
    pay_date: string;
    is_shadow_run?: boolean;
  },
  identity?: Identity,
): Promise<ApiResult<PayrollRun>> {
  const base = payrollRunUrl();
  const url = `${base}/v1/payroll/runs`;
  return fetchDomainServicePost<{ payroll_run: PayrollRun }, PayrollRun>(
    url,
    base,
    "payroll-run-svc",
    body,
    identity,
    (d) => d.payroll_run,
  );
}

export async function createCompensationStructure(
  body: {
    name: string;
    pay_type: string;
    min_amount: number;
    max_amount: number;
    currency: string;
  },
  identity?: Identity,
): Promise<ApiResult<CompensationStructure>> {
  const base = compensationUrl();
  const url = `${base}/v1/compensation/structures`;
  return fetchDomainServicePost<{ structure: CompensationStructure }, CompensationStructure>(
    url,
    base,
    "compensation-svc",
    body,
    identity,
    (d) => d.structure,
  );
}

export async function raisePayrollException(
  body: {
    payroll_run_id: string;
    exception_code: string;
    severity: string;
    description: string;
    employee_id?: string;
  },
  identity?: Identity,
): Promise<ApiResult<PayrollException>> {
  const base = payrollExceptionsUrl();
  const url = `${base}/v1/payroll-exceptions`;
  return fetchDomainServicePost<{ exception: PayrollException }, PayrollException>(
    url,
    base,
    "payroll-exceptions-svc",
    body,
    identity,
    (d) => d.exception,
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

async function fetchDomainServicePost<TRaw, TOut>(
  urlStr: string,
  base: string,
  serviceName: string,
  body: unknown,
  identity: Identity | undefined,
  transform: (raw: TRaw) => TOut,
): Promise<ApiResult<TOut>> {
  const correlationId = crypto.randomUUID();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Correlation-ID": correlationId,
  };
  if (identity?.tenantId) headers["X-Tenant-Id"] = identity.tenantId;
  if (identity?.principalId) headers["X-Principal-Id"] = identity.principalId;
  if (identity?.legalEntityId) headers["X-Legal-Entity-Id"] = identity.legalEntityId;

  let res: Response;
  try {
    res = await fetch(urlStr, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
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
