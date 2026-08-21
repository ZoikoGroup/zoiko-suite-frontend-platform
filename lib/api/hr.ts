import { apiGet, apiPost, type ApiResult, type Identity } from "./client";

// ─── 1. Employee Master ──────────────────────────────────────────────────────

export type Employee = {
  employee_id: string;
  tenant_id?: string;
  legal_entity_id?: string;
  first_name: string;
  last_name: string;
  email: string;
  employment_type?: string;
  worker_type?: string;
  status: string;
  hire_date: string;
  job_title?: string;
  department_id?: string;
  created_at?: string;
};

type EmployeesResponse = { employees?: Employee[]; total?: number };

export async function listEmployees(identity?: Identity): Promise<ApiResult<Employee[]>> {
  const res = await apiGet<EmployeesResponse | Employee[]>("employeeMaster", "/v1/employees", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.employees ?? [];
  return { ok: true, data: list };
}

export async function getEmployee(employeeId: string, identity?: Identity): Promise<ApiResult<Employee>> {
  const res = await apiGet<{ employee?: Employee } | Employee>("employeeMaster", `/v1/employees/${employeeId}`, { identity });
  if (!res.ok) return res;
  const emp = (res.data as { employee?: Employee }).employee ?? (res.data as Employee);
  return { ok: true, data: emp };
}

export async function createEmployee(
  body: {
    first_name: string;
    last_name: string;
    email: string;
    worker_type: string;
    hire_date: string;
    job_title?: string;
    department_id?: string;
  },
  identity?: Identity,
): Promise<ApiResult<Employee>> {
  const res = await apiPost<{ employee?: Employee } | Employee>("employeeMaster", "/v1/employees", body, { identity });
  if (!res.ok) return res;
  const emp = (res.data as { employee?: Employee }).employee ?? (res.data as Employee);
  return { ok: true, data: emp };
}

// ─── 2. Leave & Absence ──────────────────────────────────────────────────────

export type LeaveRequest = {
  request_id: string;
  tenant_id?: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days_requested?: number;
  total_hours?: number;
  status: string;
  reason?: string;
  created_at?: string;
};

type LeaveRequestsResponse = { requests?: LeaveRequest[]; total?: number };

export async function listLeaveRequests(identity?: Identity): Promise<ApiResult<LeaveRequest[]>> {
  const res = await apiGet<LeaveRequestsResponse | LeaveRequest[]>("leaveAbsence", "/v1/leave/requests", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.requests ?? [];
  return { ok: true, data: list };
}

export async function submitLeaveRequest(
  body: {
    employee_id: string;
    leave_type_id: string;
    start_date: string;
    end_date: string;
    total_hours: number;
    reason?: string;
  },
  identity?: Identity,
): Promise<ApiResult<LeaveRequest>> {
  const res = await apiPost<{ request?: LeaveRequest } | LeaveRequest>("leaveAbsence", "/v1/leave/requests", body, { identity });
  if (!res.ok) return res;
  const req = (res.data as { request?: LeaveRequest }).request ?? (res.data as LeaveRequest);
  return { ok: true, data: req };
}

// ─── 3. Org Structure ────────────────────────────────────────────────────────

export type Department = {
  department_id: string;
  tenant_id?: string;
  legal_entity_id?: string;
  code: string;
  name: string;
  manager_id?: string;
  created_at?: string;
};

type DepartmentsResponse = { departments?: Department[]; total?: number };

export async function listDepartments(identity?: Identity): Promise<ApiResult<Department[]>> {
  const res = await apiGet<DepartmentsResponse | Department[]>("orgStructure", "/v1/org/departments", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.departments ?? [];
  return { ok: true, data: list };
}

export async function createDepartment(
  body: { code: string; name: string; manager_id?: string; legal_entity_id?: string },
  identity?: Identity,
): Promise<ApiResult<Department>> {
  const res = await apiPost<{ department?: Department } | Department>("orgStructure", "/v1/org/departments", body, { identity });
  if (!res.ok) return res;
  const dep = (res.data as { department?: Department }).department ?? (res.data as Department);
  return { ok: true, data: dep };
}

// ─── 4. Performance Reviews ──────────────────────────────────────────────────

export type ReviewCycle = {
  cycle_id: string;
  legal_entity_id?: string;
  name: string;
  start_date: string;
  end_date: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  created_at?: string;
};

export type ReviewRecord = {
  review_id: string;
  cycle_id: string;
  employee_id: string;
  reviewer_id?: string;
  rating?: number;
  comments?: string;
  status: "PENDING" | "SUBMITTED" | "COMPLETED";
  created_at?: string;
};

export async function listReviewCycles(identity?: Identity): Promise<ApiResult<ReviewCycle[]>> {
  const res = await apiGet<{ cycles?: ReviewCycle[] } | ReviewCycle[]>("performanceReview", "/v1/cycles", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.cycles ?? [];
  return { ok: true, data: list };
}

export async function createReviewCycle(
  body: { name: string; start_date: string; end_date: string; legal_entity_id?: string },
  identity?: Identity,
): Promise<ApiResult<ReviewCycle>> {
  const res = await apiPost<{ cycle?: ReviewCycle } | ReviewCycle>("performanceReview", "/v1/cycles", body, { identity });
  if (!res.ok) return res;
  const cycle = (res.data as { cycle?: ReviewCycle }).cycle ?? (res.data as ReviewCycle);
  return { ok: true, data: cycle };
}

export async function listReviews(identity?: Identity): Promise<ApiResult<ReviewRecord[]>> {
  const res = await apiGet<{ reviews?: ReviewRecord[] } | ReviewRecord[]>("performanceReview", "/v1/reviews", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.reviews ?? [];
  return { ok: true, data: list };
}

export async function submitReviewFeedback(
  reviewId: string,
  body: { rating: number; comments: string },
  identity?: Identity,
): Promise<ApiResult<ReviewRecord>> {
  const res = await apiPost<{ review?: ReviewRecord } | ReviewRecord>(
    "performanceReview",
    `/v1/reviews/${reviewId}/submit`,
    body,
    { identity },
  );
  if (!res.ok) return res;
  const rev = (res.data as { review?: ReviewRecord }).review ?? (res.data as ReviewRecord);
  return { ok: true, data: rev };
}

// ─── 5. Workforce Compliance ─────────────────────────────────────────────────

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

type AlertsResponse = { alerts?: ComplianceAlert[]; total?: number };

export async function listWorkforceAlerts(identity?: Identity): Promise<ApiResult<ComplianceAlert[]>> {
  const res = await apiGet<AlertsResponse | ComplianceAlert[]>("workforceCompliance", "/v1/compliance/alerts", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.alerts ?? [];
  return { ok: true, data: list };
}

// ─── 6. Offboarding & Severance ──────────────────────────────────────────────

export async function initiateTermination(
  body: {
    employee_id: string;
    termination_type: string;
    reason_code: string;
    last_working_day: string;
    effective_from: string;
    reason_details?: string;
  },
  identity?: Identity,
): Promise<ApiResult<unknown>> {
  return apiPost<unknown>("offboardingSeverance", "/v1/terminations", body, { identity });
}
