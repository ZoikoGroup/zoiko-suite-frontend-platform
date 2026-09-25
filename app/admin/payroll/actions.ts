"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  initiatePayrollRun,
  createCompensationStructure,
  raisePayrollException,
} from "@/lib/api/payroll";

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

export type PayrollActionState = {
  ok: boolean;
  message: string;
  id?: string;
};

export async function initiatePayrollRunAction(
  formData: FormData
): Promise<PayrollActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ok: false, message: "Your session has expired — sign in again." };
  }

  const periodStart = String(formData.get("period_start") ?? "").trim();
  const periodEnd = String(formData.get("period_end") ?? "").trim();
  const payDate = String(formData.get("pay_date") ?? "").trim();
  const isShadowRun = formData.get("is_shadow_run") === "true";

  if (!periodStart || !periodEnd || !payDate) {
    return { ok: false, message: "Period start date, end date, and pay date are required." };
  }

  const res = await initiatePayrollRun(
    {
      pay_period_start: periodStart,
      pay_period_end: periodEnd,
      pay_date: payDate,
      is_shadow_run: isShadowRun,
    },
    identity
  );

  if (!res.ok) {
    return { ok: false, message: res.error.message };
  }

  refresh();
  return {
    ok: true,
    message: `Payroll run initialized for ${periodStart} → ${periodEnd} in payroll-run-svc.`,
    id: res.data.payroll_run_id,
  };
}

export async function createCompensationStructureAction(
  formData: FormData
): Promise<PayrollActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ok: false, message: "Your session has expired — sign in again." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const payType = String(formData.get("pay_type") ?? "SALARY").trim();
  const minAmount = Number(formData.get("min_amount") ?? 0);
  const maxAmount = Number(formData.get("max_amount") ?? 0);
  const currency = String(formData.get("currency") ?? "USD").trim().toUpperCase();

  if (!name) {
    return { ok: false, message: "Structure title / grade name is required." };
  }
  if (maxAmount <= 0 || maxAmount < minAmount) {
    return { ok: false, message: "Valid salary range (minimum and maximum amounts) is required." };
  }

  const res = await createCompensationStructure(
    {
      name,
      pay_type: payType,
      min_amount: minAmount,
      max_amount: maxAmount,
      currency,
    },
    identity
  );

  if (!res.ok) {
    return { ok: false, message: res.error.message };
  }

  refresh();
  return {
    ok: true,
    message: `Compensation structure ${name} (${currency} ${minAmount.toLocaleString()} - ${maxAmount.toLocaleString()}) created.`,
    id: res.data.structure_id,
  };
}

export async function raisePayrollExceptionAction(
  formData: FormData
): Promise<PayrollActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ok: false, message: "Your session has expired — sign in again." };
  }

  const payrollRunId = String(formData.get("payroll_run_id") ?? "").trim();
  const exceptionCode = String(formData.get("exception_code") ?? "CALCULATION_MISMATCH").trim();
  const severity = String(formData.get("severity") ?? "WARNING").trim();
  const description = String(formData.get("description") ?? "").trim();
  const employeeId = String(formData.get("employee_id") ?? "").trim();

  if (!payrollRunId || !description) {
    return { ok: false, message: "Payroll run ID and exception description are required." };
  }

  const res = await raisePayrollException(
    {
      payroll_run_id: payrollRunId,
      exception_code: exceptionCode,
      severity,
      description,
      employee_id: employeeId || undefined,
    },
    identity
  );

  if (!res.ok) {
    return { ok: false, message: res.error.message };
  }

  refresh();
  return {
    ok: true,
    message: `Payroll exception flagged (${exceptionCode}) in payroll-exceptions-svc.`,
    id: res.data.exception_id,
  };
}
