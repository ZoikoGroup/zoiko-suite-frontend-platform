"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createEmployee,
  submitLeaveRequest,
  createDepartment,
  createReviewCycle,
  initiateTermination,
} from "@/lib/api/hr";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };
}

export type HrActionState = {
  ok: boolean;
  message: string;
  id?: string;
};

export async function createEmployeeAction(
  formData: FormData
): Promise<HrActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ok: false, message: "Your session has expired — sign in again." };
  }

  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const jobTitle = String(formData.get("job_title") ?? "").trim();
  const departmentId = String(formData.get("department_id") ?? "").trim();
  const workerType = String(formData.get("worker_type") ?? "FULL_TIME").trim();
  const hireDate = String(formData.get("hire_date") ?? "").trim() || new Date().toISOString().split("T")[0];

  if (!firstName || !lastName) {
    return { ok: false, message: "First name and last name are required." };
  }
  if (!email || !email.includes("@")) {
    return { ok: false, message: "A valid corporate email address is required." };
  }

  const res = await createEmployee(
    {
      first_name: firstName,
      last_name: lastName,
      email,
      job_title: jobTitle || undefined,
      department_id: departmentId || undefined,
      worker_type: workerType,
      hire_date: hireDate,
    },
    identity
  );

  if (!res.ok) {
    return { ok: false, message: res.error.message };
  }

  refresh();
  return {
    ok: true,
    message: `Employee ${firstName} ${lastName} onboarded successfully into employee-master-svc.`,
    id: res.data.employee_id,
  };
}

export async function submitLeaveRequestAction(
  formData: FormData
): Promise<HrActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ok: false, message: "Your session has expired — sign in again." };
  }

  const employeeId = String(formData.get("employee_id") ?? "").trim() || identity.principalId;
  const leaveTypeId = String(formData.get("leave_type_id") ?? "ANNUAL_LEAVE").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();
  const totalHours = Number(formData.get("total_hours") ?? 40);
  const reason = String(formData.get("reason") ?? "").trim();

  if (!startDate || !endDate) {
    return { ok: false, message: "Start date and end date are required." };
  }

  const res = await submitLeaveRequest(
    {
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      start_date: startDate,
      end_date: endDate,
      total_hours: totalHours,
      reason: reason || undefined,
    },
    identity
  );

  if (!res.ok) {
    return { ok: false, message: res.error.message };
  }

  refresh();
  return {
    ok: true,
    message: `Leave request for ${startDate} → ${endDate} submitted to leave-absence-svc.`,
    id: res.data.request_id,
  };
}

export async function createDepartmentAction(
  formData: FormData
): Promise<HrActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ok: false, message: "Your session has expired — sign in again." };
  }

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const managerId = String(formData.get("manager_id") ?? "").trim();

  if (!code || !name) {
    return { ok: false, message: "Department code and name are required." };
  }

  const res = await createDepartment(
    {
      code,
      name,
      manager_id: managerId || undefined,
      legal_entity_id: identity.legalEntityId,
    },
    identity
  );

  if (!res.ok) {
    return { ok: false, message: res.error.message };
  }

  refresh();
  return {
    ok: true,
    message: `Department ${name} (${code}) registered in org-structure-svc.`,
    id: res.data.department_id,
  };
}

export async function initiateTerminationAction(
  formData: FormData
): Promise<HrActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ok: false, message: "Your session has expired — sign in again." };
  }

  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const terminationType = String(formData.get("termination_type") ?? "VOLUNTARY").trim();
  const reasonCode = String(formData.get("reason_code") ?? "RESIGNATION").trim();
  const lastWorkingDay = String(formData.get("last_working_day") ?? "").trim();
  const reasonDetails = String(formData.get("reason_details") ?? "").trim();

  if (!employeeId || !lastWorkingDay) {
    return { ok: false, message: "Employee ID and last working day are required." };
  }

  const res = await initiateTermination(
    {
      employee_id: employeeId,
      termination_type: terminationType,
      reason_code: reasonCode,
      last_working_day: lastWorkingDay,
      effective_from: new Date().toISOString(),
      reason_details: reasonDetails || undefined,
    },
    identity
  );

  if (!res.ok) {
    return { ok: false, message: "Failed to record offboarding in offboarding-severance-svc." };
  }

  refresh();
  return {
    ok: true,
    message: `Termination notice for employee ${employeeId} initiated in offboarding-severance-svc.`,
  };
}
