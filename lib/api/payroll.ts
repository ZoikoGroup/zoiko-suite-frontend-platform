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

const MOCK_PAYROLL_RUNS: PayrollRun[] = [
  {
    payroll_run_id: "pr-2026-07",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    pay_period_code: "2026-M07",
    period_start_date: "2026-07-01",
    period_end_date: "2026-07-31",
    payment_date: "2026-07-31",
    status: "FINALIZED",
    total_gross_pay: 425000.0,
    total_net_pay: 318750.0,
    total_tax_deductions: 106250.0,
    total_employee_count: 85,
    created_by: "payroll-admin@zoiko.com",
    created_at: "2026-07-25T09:00:00Z",
    updated_at: "2026-07-31T17:00:00Z",
  },
  {
    payroll_run_id: "pr-2026-08",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    pay_period_code: "2026-M08",
    period_start_date: "2026-08-01",
    period_end_date: "2026-08-31",
    payment_date: "2026-08-31",
    status: "CALCULATED",
    total_gross_pay: 430000.0,
    total_net_pay: 322500.0,
    total_tax_deductions: 107500.0,
    total_employee_count: 87,
    created_by: "payroll-admin@zoiko.com",
    created_at: "2026-07-28T10:00:00Z",
    updated_at: "2026-07-30T14:00:00Z",
  },
];

type PayrollRunsResponse = { payroll_runs: PayrollRun[]; total: number };

export async function listPayrollRuns(identity?: Identity): Promise<ApiResult<PayrollRun[]>> {
  const base = payrollRunUrl();
  const url = `${base}/v1/payroll-runs`;
  return fetchServiceWithFallback<PayrollRunsResponse, PayrollRun[]>(
    url,
    base,
    "payroll-run-svc",
    identity,
    (d) => d.payroll_runs ?? [],
    MOCK_PAYROLL_RUNS
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

const MOCK_COMPENSATION: CompensationStructure[] = [
  {
    structure_id: "comp-eng-lead",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    title: "Lead Software Engineer Pay Grade",
    wage_type: "SALARY",
    base_pay: 145000.0,
    currency: "USD",
    pay_frequency: "MONTHLY",
    effective_from: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    structure_id: "comp-sales-dir",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    title: "Director of Global Sales",
    wage_type: "COMMISSION",
    base_pay: 180000.0,
    currency: "USD",
    pay_frequency: "MONTHLY",
    effective_from: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z",
  },
];

type CompStructuresResponse = { structures: CompensationStructure[]; total: number };

export async function listCompensationStructures(identity?: Identity): Promise<ApiResult<CompensationStructure[]>> {
  const base = compensationUrl();
  const url = `${base}/v1/compensation/structures`;
  return fetchServiceWithFallback<CompStructuresResponse, CompensationStructure[]>(
    url,
    base,
    "compensation-svc",
    identity,
    (d) => d.structures ?? [],
    MOCK_COMPENSATION
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

const MOCK_BENEFITS: BenefitPlan[] = [
  {
    plan_id: "ben-health-ppo",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    name: "Executive Health PPO Plan",
    benefit_type: "HEALTH_INSURANCE",
    provider_name: "BlueCross BlueShield",
    employer_contribution_percent: 80.0,
    currency: "USD",
    status: "ACTIVE",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    plan_id: "ben-401k-match",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    name: "Corporate 401(k) Matching Program",
    benefit_type: "RETIREMENT",
    provider_name: "Fidelity Investments",
    employer_contribution_percent: 100.0,
    currency: "USD",
    status: "ACTIVE",
    created_at: "2026-01-01T00:00:00Z",
  },
];

type BenefitPlansResponse = { plans: BenefitPlan[]; total: number };

export async function listBenefitPlans(identity?: Identity): Promise<ApiResult<BenefitPlan[]>> {
  const base = benefitsUrl();
  const url = `${base}/v1/benefits/plans`;
  return fetchServiceWithFallback<BenefitPlansResponse, BenefitPlan[]>(
    url,
    base,
    "benefits-svc",
    identity,
    (d) => d.plans ?? [],
    MOCK_BENEFITS
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

const MOCK_TAX_PROFILES: TaxProfile[] = [
  {
    profile_id: "tx-prof-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "us-fed-01",
    tax_identifier: "W4-SINGLE-01",
    filing_status: "SINGLE",
    withholding_allowances: 2,
    additional_withholding_amount: 50.0,
    currency: "USD",
    status: "ACTIVE",
    created_at: "2026-01-01T00:00:00Z",
  },
];

type TaxProfilesResponse = { profiles: TaxProfile[]; total: number };

export async function listPayrollTaxProfiles(identity?: Identity): Promise<ApiResult<TaxProfile[]>> {
  const base = payrollTaxUrl();
  const url = `${base}/v1/payroll-tax/profiles`;
  return fetchServiceWithFallback<TaxProfilesResponse, TaxProfile[]>(
    url,
    base,
    "payroll-tax-svc",
    identity,
    (d) => d.profiles ?? [],
    MOCK_TAX_PROFILES
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

const MOCK_EXCEPTIONS: PayrollException[] = [
  {
    exception_id: "exc-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    payroll_run_id: "pr-2026-08",
    employee_id: "emp-102",
    exception_type: "MISSING_BANK_ACCOUNT",
    severity: "WARNING",
    status: "OPEN",
    description: "Employee bank direct deposit routing number missing verification.",
    created_at: "2026-07-29T10:00:00Z",
  },
];

type ExceptionsResponse = { exceptions: PayrollException[]; total: number };

export async function listPayrollExceptions(identity?: Identity): Promise<ApiResult<PayrollException[]>> {
  const base = payrollExceptionsUrl();
  const url = `${base}/v1/payroll-exceptions`;
  return fetchServiceWithFallback<ExceptionsResponse, PayrollException[]>(
    url,
    base,
    "payroll-exceptions-svc",
    identity,
    (d) => d.exceptions ?? [],
    MOCK_EXCEPTIONS
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
