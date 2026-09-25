import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

export type ContractType = "FULL_TIME" | "PART_TIME" | "FIXED_TERM" | "EXECUTIVE";
export type ContractStatus = "DRAFT" | "ACTIVE" | "SUPERSEDED" | "TERMINATED" | "EXPIRED";
export type PayFrequency = "MONTHLY" | "BIWEEKLY" | "WEEKLY";

export type EmploymentContract = {
  contract_id: string;
  tenant_id: string;
  legal_entity_id: string;
  employee_id: string;
  contract_number: string;
  version: number;
  contract_type: ContractType;
  status: ContractStatus;
  title: string;
  base_salary_amount: number;
  currency: string;
  pay_frequency: PayFrequency;
  effective_from: string;
  effective_to?: string;
  document_vault_ref?: string;
  correlation_id: string;
  created_at: string;
  updated_at: string;
};

export type ContractAmendment = {
  amendment_id: string;
  tenant_id: string;
  contract_id: string;
  from_version: number;
  to_version: number;
  amendment_reason: string;
  amended_by: string;
  effective_from: string;
  created_at: string;
};

export type IssueContractInput = {
  legal_entity_id: string;
  employee_id: string;
  contract_number?: string;
  contract_type: ContractType;
  title: string;
  base_salary_amount: number;
  currency: string;
  pay_frequency: PayFrequency;
  effective_from: string;
  effective_to?: string;
  correlation_id: string;
};

export type AmendContractInput = {
  title?: string;
  base_salary_amount?: number;
  currency?: string;
  pay_frequency?: PayFrequency;
  amendment_reason: string;
  effective_from: string;
};

export type AmendContractResponse = {
  contract: EmploymentContract;
  amendment: ContractAmendment;
};

export async function issueEmploymentContract(
  input: IssueContractInput,
  identity: Identity
): Promise<ApiWriteResult<EmploymentContract>> {
  return apiPost<EmploymentContract>(
    "employmentContracts",
    "/v1/contracts",
    input,
    {
      identity: { ...identity, legalEntityId: input.legal_entity_id },
      purposeContext: "workforce.contract.issuance",
    }
  );
}

export async function amendEmploymentContract(
  id: string,
  input: AmendContractInput,
  identity: Identity
): Promise<ApiWriteResult<AmendContractResponse>> {
  return apiPost<AmendContractResponse>(
    "employmentContracts",
    `/v1/contracts/${encodeURIComponent(id)}/amend`,
    input,
    {
      identity,
      purposeContext: "workforce.contract.amendment",
    }
  );
}

export async function terminateEmploymentContract(
  id: string,
  terminationDate: string,
  identity: Identity
): Promise<ApiWriteResult<EmploymentContract>> {
  return apiPost<EmploymentContract>(
    "employmentContracts",
    `/v1/contracts/${encodeURIComponent(id)}/terminate`,
    { termination_date: terminationDate },
    {
      identity,
      purposeContext: "workforce.contract.termination",
    }
  );
}

export async function getEmploymentContract(
  id: string,
  identity: Identity
): Promise<ApiResult<EmploymentContract>> {
  return apiGet<EmploymentContract>(
    "employmentContracts",
    `/v1/contracts/${encodeURIComponent(id)}`,
    {
      identity,
      purposeContext: "workforce.contract.view",
    }
  );
}

export async function getActiveContractByEmployee(
  employeeId: string,
  identity: Identity
): Promise<ApiResult<EmploymentContract>> {
  return apiGet<EmploymentContract>(
    "employmentContracts",
    `/v1/contracts/employee/${encodeURIComponent(employeeId)}/active`,
    {
      identity,
      purposeContext: "workforce.contract.view",
    }
  );
}
