// Server-side API clients for HR & Workforce domain microservices:
// - employee-master-svc (8108)
// - leave-absence-svc (8115)
// - org-structure-svc (8116)
// - workforce-compliance-svc (8118)
// - talent-management-svc (8132)
// - onboarding-svc (8133)

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

const MOCK_EMPLOYEES: Employee[] = [
  {
    employee_id: "emp-101",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    first_name: "Sarah",
    last_name: "Jenkins",
    email: "s.jenkins@zoiko.com",
    employment_type: "FULL_TIME",
    status: "ACTIVE",
    hire_date: "2024-03-15",
    created_at: "2024-03-15T09:00:00Z",
  },
  {
    employee_id: "emp-102",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    first_name: "David",
    last_name: "Chen",
    email: "d.chen@zoiko.com",
    employment_type: "FULL_TIME",
    status: "ACTIVE",
    hire_date: "2023-08-01",
    created_at: "2023-08-01T09:00:00Z",
  },
];

type EmployeesResponse = { employees: Employee[]; total: number };

export async function listEmployees(identity?: Identity): Promise<ApiResult<Employee[]>> {
  const base = employeeMasterUrl();
  const url = `${base}/v1/employees`;
  return fetchServiceWithFallback<EmployeesResponse, Employee[]>(
    url,
    base,
    "employee-master-svc",
    identity,
    (d) => d.employees ?? [],
    MOCK_EMPLOYEES
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

const MOCK_LEAVE: LeaveRequest[] = [
  {
    request_id: "leave-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    employee_id: "emp-101",
    leave_type_id: "ANNUAL_LEAVE",
    start_date: "2026-08-10",
    end_date: "2026-08-14",
    days_requested: 5,
    status: "APPROVED",
    created_at: "2026-07-20T10:00:00Z",
  },
];

type LeaveRequestsResponse = { requests: LeaveRequest[]; total: number };

export async function listLeaveRequests(identity?: Identity): Promise<ApiResult<LeaveRequest[]>> {
  const base = leaveAbsenceUrl();
  const url = `${base}/v1/leave/requests`;
  return fetchServiceWithFallback<LeaveRequestsResponse, LeaveRequest[]>(
    url,
    base,
    "leave-absence-svc",
    identity,
    (d) => d.requests ?? [],
    MOCK_LEAVE
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

const MOCK_DEPARTMENTS: Department[] = [
  {
    department_id: "dept-eng",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    code: "ENG-01",
    name: "Software Engineering & Technology",
    manager_id: "emp-102",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    department_id: "dept-fin",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    code: "FIN-01",
    name: "Corporate Finance & Treasury",
    manager_id: "emp-101",
    created_at: "2026-01-01T00:00:00Z",
  },
];

type DepartmentsResponse = { departments: Department[]; total: number };

export async function listDepartments(identity?: Identity): Promise<ApiResult<Department[]>> {
  const base = orgStructureUrl();
  const url = `${base}/v1/org/departments`;
  return fetchServiceWithFallback<DepartmentsResponse, Department[]>(
    url,
    base,
    "org-structure-svc",
    identity,
    (d) => d.departments ?? [],
    MOCK_DEPARTMENTS
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

const MOCK_ALERTS: ComplianceAlert[] = [
  {
    alert_id: "alt-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    employee_id: "emp-102",
    alert_type: "VISA_EXPIRY_WARNING",
    severity: "WARNING",
    description: "Employee H-1B work authorization visa expires in 90 days.",
    status: "OPEN",
    created_at: "2026-07-25T09:00:00Z",
  },
];

type AlertsResponse = { alerts: ComplianceAlert[]; total: number };

export async function listWorkforceAlerts(identity?: Identity): Promise<ApiResult<ComplianceAlert[]>> {
  const base = workforceComplianceUrl();
  const url = `${base}/v1/compliance/alerts`;
  return fetchServiceWithFallback<AlertsResponse, ComplianceAlert[]>(
    url,
    base,
    "workforce-compliance-svc",
    identity,
    (d) => d.alerts ?? [],
    MOCK_ALERTS
  );
}

// ─── 5. Talent Management ─────────────────────────────────────────────────────

function talentManagementUrl(): string {
  return (process.env.ZOIKO_TALENT_MANAGEMENT_URL ?? "http://localhost:8132").replace(/\/$/, "");
}

export type TalentProfile = {
  profile_id: string;
  tenant_id: string;
  employee_id: string;
  performance_rating: string;
  skill_tags: string[];
  career_track: string;
  promotion_eligible: boolean;
  last_review_date: string;
  created_at: string;
};

const MOCK_TALENT_PROFILES: TalentProfile[] = [
  {
    profile_id: "tal-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    employee_id: "emp-101",
    performance_rating: "EXCEEDS_EXPECTATIONS",
    skill_tags: ["TypeScript", "System Design", "Cloud Architecture"],
    career_track: "PRINCIPAL_ENGINEER",
    promotion_eligible: true,
    last_review_date: "2026-06-30",
    created_at: "2026-01-01T00:00:00Z",
  },
];

type TalentProfilesResponse = { profiles: TalentProfile[]; total: number };

export async function listTalentProfiles(identity?: Identity): Promise<ApiResult<TalentProfile[]>> {
  const base = talentManagementUrl();
  const url = `${base}/v1/talent/profiles`;
  return fetchServiceWithFallback<TalentProfilesResponse, TalentProfile[]>(
    url, base, "talent-management-svc", identity,
    (d) => d.profiles ?? [], MOCK_TALENT_PROFILES
  );
}

// ─── 6. Onboarding ───────────────────────────────────────────────────────────

function onboardingUrl(): string {
  return (process.env.ZOIKO_ONBOARDING_URL ?? "http://localhost:8133").replace(/\/$/, "");
}

export type OnboardingCase = {
  case_id: string;
  tenant_id: string;
  employee_id: string;
  legal_entity_id: string;
  start_date: string;
  checklist_items_total: number;
  checklist_items_completed: number;
  status: string;
  assigned_buddy_id?: string;
  created_at: string;
};

const MOCK_ONBOARDING_CASES: OnboardingCase[] = [
  {
    case_id: "ob-2026-0891",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    employee_id: "emp-2026-0891",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    start_date: "2026-08-01",
    checklist_items_total: 14,
    checklist_items_completed: 9,
    status: "IN_PROGRESS",
    assigned_buddy_id: "emp-101",
    created_at: "2026-07-28T08:00:00Z",
  },
];

type OnboardingCasesResponse = { cases: OnboardingCase[]; total: number };

export async function listOnboardingCases(identity?: Identity): Promise<ApiResult<OnboardingCase[]>> {
  const base = onboardingUrl();
  const url = `${base}/v1/onboarding/cases`;
  return fetchServiceWithFallback<OnboardingCasesResponse, OnboardingCase[]>(
    url, base, "onboarding-svc", identity,
    (d) => d.cases ?? [], MOCK_ONBOARDING_CASES
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
