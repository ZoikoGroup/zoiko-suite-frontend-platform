"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  issueEmploymentContract,
  amendEmploymentContract,
  terminateEmploymentContract,
  getEmploymentContract,
  getActiveContractByEmployee,
  type EmploymentContract,
  type ContractType,
  type PayFrequency,
} from "@/lib/api/employment-contracts";
import type { LookupState } from "@/components/admin/shared/lookup";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const decoded = decodeSession(raw);
  if (!decoded) {
    throw new Error("unauthenticated");
  }
  return decoded;
}

export type ContractActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  contractId?: string;
  contract?: EmploymentContract;
};

export async function issueContractAction(
  _previous: ContractActionState,
  formData: FormData
): Promise<ContractActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const legalEntityId = String(formData.get("legal_entity_id") ?? "").trim();
  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const contractType = String(formData.get("contract_type") ?? "FULL_TIME").trim() as ContractType;
  const title = String(formData.get("title") ?? "").trim();
  const salaryStr = String(formData.get("base_salary_amount") ?? "").trim();
  const currency = String(formData.get("currency") ?? "GBP").trim().toUpperCase();
  const payFrequency = String(formData.get("pay_frequency") ?? "MONTHLY").trim() as PayFrequency;
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();
  const effectiveTo = String(formData.get("effective_to") ?? "").trim() || undefined;

  if (!legalEntityId || !employeeId || !title || !salaryStr || !effectiveFrom) {
    return { status: "error", message: "Legal entity, employee ID, title, salary, and effective date are all required." };
  }

  const baseSalaryAmount = parseFloat(salaryStr);
  if (isNaN(baseSalaryAmount) || baseSalaryAmount <= 0) {
    return { status: "error", message: "Negative Rule: Base salary amount must be greater than zero." };
  }

  if (effectiveTo && effectiveTo < effectiveFrom) {
    return { status: "error", message: "Negative Rule: effective_to precedes effective_from." };
  }

  const correlationId = "corr-ctr-" + Date.now();

  const res = await issueEmploymentContract(
    {
      legal_entity_id: legalEntityId,
      employee_id: employeeId,
      contract_type: contractType,
      title,
      base_salary_amount: baseSalaryAmount,
      currency,
      pay_frequency: payFrequency,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      correlation_id: correlationId,
    },
    identity
  );

  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to issue employment contract." };
  }

  revalidatePath("/admin/hr");
  return {
    status: "success",
    contractId: res.data.contract_id,
    contract: res.data,
    message: `Contract issued successfully on :8109! Contract ID: ${res.data.contract_id} (Number: ${res.data.contract_number}, Version: ${res.data.version}, Status: ${res.data.status})`,
  };
}

export async function amendContractAction(
  _previous: ContractActionState,
  formData: FormData
): Promise<ContractActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const contractId = String(formData.get("contract_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim() || undefined;
  const salaryStr = String(formData.get("base_salary_amount") ?? "").trim();
  const amendmentReason = String(formData.get("amendment_reason") ?? "").trim();
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();

  if (!contractId || !amendmentReason || !effectiveFrom) {
    return { status: "error", message: "Contract ID, amendment reason, and effective from date are required." };
  }

  const baseSalaryAmount = salaryStr ? parseFloat(salaryStr) : undefined;
  if (baseSalaryAmount !== undefined && (isNaN(baseSalaryAmount) || baseSalaryAmount <= 0)) {
    return { status: "error", message: "Negative Rule: Amended salary amount must be greater than zero." };
  }

  const res = await amendEmploymentContract(
    contractId,
    {
      title,
      base_salary_amount: baseSalaryAmount,
      amendment_reason: amendmentReason,
      effective_from: effectiveFrom,
    },
    identity
  );

  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to amend contract." };
  }

  revalidatePath("/admin/hr");
  return {
    status: "success",
    contractId: res.data.contract.contract_id,
    contract: res.data.contract,
    message: `Contract amended successfully to Version ${res.data.contract.version}! Amendment ID: ${res.data.amendment.amendment_id} (Reason: "${res.data.amendment.amendment_reason}")`,
  };
}

export async function terminateContractAction(
  _previous: ContractActionState,
  formData: FormData
): Promise<ContractActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const contractId = String(formData.get("contract_id") ?? "").trim();
  const terminationDate = String(formData.get("termination_date") ?? "").trim();

  if (!contractId || !terminationDate) {
    return { status: "error", message: "Contract ID and termination date are required." };
  }

  const res = await terminateEmploymentContract(contractId, terminationDate, identity);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to terminate contract." };
  }

  revalidatePath("/admin/hr");
  return {
    status: "success",
    contractId: res.data.contract_id,
    contract: res.data,
    message: `Contract ${res.data.contract_number} has been TERMINATED effective ${res.data.effective_to}! Status: TERMINATED.`,
  };
}

export async function lookupContractAction(
  _previous: LookupState,
  formData: FormData
): Promise<LookupState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const contractId = String(formData.get("lookup_contract_id") ?? "").trim();
  const employeeId = String(formData.get("lookup_employee_id") ?? "").trim();

  if (!contractId && !employeeId) {
    return { status: "error", message: "Provide either a Contract ID or an Employee ID." };
  }

  if (contractId) {
    const res = await getEmploymentContract(contractId, identity);
    if (!res.ok) {
      return { status: "error", message: res.error.message || "Contract not found." };
    }
    return {
      status: "found",
      record: res.data,
      message: `Retrieved Contract ${res.data.contract_number} (Version ${res.data.version}, Status: ${res.data.status}) from :8109`,
    };
  } else {
    const res = await getActiveContractByEmployee(employeeId, identity);
    if (!res.ok) {
      return { status: "error", message: res.error.message || "Active contract for employee not found." };
    }
    return {
      status: "found",
      record: res.data,
      message: `Retrieved Active Contract for Employee ${employeeId} from :8109 — Version: ${res.data.version}, Status: ${res.data.status}`,
    };
  }
}
