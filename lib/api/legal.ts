// Server-side API clients for all 6 Legal & Contracts domain microservices:
// - contract-lifecycle-svc (8119)
// - clause-template-svc (8120)
// - obligation-tracking-svc (8121)
// - board-resolutions-svc (8122)
// - corporate-actions-svc (8123)
// - counterparty-management-svc (8124)

import { apiGet, apiPost, apiPut, type ApiResult, type Identity } from "./client";

// ─── 1. Contract Lifecycle ───────────────────────────────────────────────────

export type ContractType = "VENDOR" | "EMPLOYMENT" | "NDA" | "MSA" | "SLA" | "PARTNERSHIP" | "OTHER";
export type ContractStatus = "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "EXPIRED" | "TERMINATED" | "SUSPENDED";

export type Contract = {
  contract_id: string;
  tenant_id?: string;
  legal_entity_id?: string;
  contract_type: ContractType;
  title: string;
  description?: string;
  counterparty_id: string;
  counterparty_name: string;
  status: ContractStatus;
  version: number;
  effective_from: string;
  effective_to?: string;
  signed_at?: string;
  signed_by?: string;
  terminated_at?: string;
  terminated_by?: string;
  termination_note?: string;
  currency: string;
  total_value: number;
  document_vault_id?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
};

type ContractsResponse = { contracts?: Contract[]; total?: number };

export async function listContracts(
  identity?: Identity,
  options?: { legalEntityId?: string; status?: ContractStatus }
): Promise<ApiResult<Contract[]>> {
  const query: Record<string, string | undefined> = {};
  if (options?.legalEntityId) query.legal_entity_id = options.legalEntityId;
  if (options?.status) query.status = options.status;

  const res = await apiGet<ContractsResponse | Contract[]>("contracts", "/v1/contracts", { identity, query });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.contracts ?? [];
  return { ok: true, data: list };
}

export async function getContract(contractId: string, identity?: Identity): Promise<ApiResult<Contract>> {
  const res = await apiGet<{ contract?: Contract } | Contract>("contracts", `/v1/contracts/${contractId}`, { identity });
  if (!res.ok) return res;
  const c = (res.data as { contract?: Contract }).contract ?? (res.data as Contract);
  return { ok: true, data: c };
}

export async function createContract(
  body: {
    title: string;
    contract_type: ContractType;
    counterparty_id: string;
    counterparty_name: string;
    currency: string;
    total_value: number;
    effective_from: string;
    effective_to?: string;
    description?: string;
    legal_entity_id?: string;
  },
  identity?: Identity
): Promise<ApiResult<Contract>> {
  const res = await apiPost<{ contract?: Contract } | Contract>("contracts", "/v1/contracts", body, { identity });
  if (!res.ok) return res;
  const c = (res.data as { contract?: Contract }).contract ?? (res.data as Contract);
  return { ok: true, data: c };
}

export async function updateContractStatus(
  contractId: string,
  status: ContractStatus,
  identity?: Identity
): Promise<ApiResult<Contract>> {
  const res = await apiPut<{ contract?: Contract } | Contract>("contracts", `/v1/contracts/${contractId}/status`, { status }, { identity });
  if (!res.ok) return res;
  const c = (res.data as { contract?: Contract }).contract ?? (res.data as Contract);
  return { ok: true, data: c };
}

// ─── 2. Clause & Template ────────────────────────────────────────────────────

export type Clause = {
  clause_id: string;
  tenant_id?: string;
  title: string;
  name?: string;
  category: string;
  body: string;
  is_standard?: boolean;
  jurisdiction_id?: string;
  version?: number;
  status?: string;
  created_by?: string;
  created_at?: string;
};

export type ContractTemplate = {
  template_id?: string;
  clause_id?: string;
  name?: string;
  title?: string;
  contract_type?: string;
  category?: string;
  version?: number;
  body?: string;
  status?: string;
  created_at?: string;
};

type ClausesResponse = { clauses?: Clause[]; total?: number };

export async function listClauses(identity?: Identity): Promise<ApiResult<Clause[]>> {
  const res = await apiGet<ClausesResponse | Clause[]>("clauseTemplate", "/v1/clauses", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.clauses ?? [];
  return { ok: true, data: list };
}

export async function listTemplates(identity?: Identity): Promise<ApiResult<ContractTemplate[]>> {
  const res = await apiGet<{ templates?: ContractTemplate[] } | ContractTemplate[]>("clauseTemplate", "/v1/templates", { identity });
  if (!res.ok) return { ok: true, data: [] };
  const list = Array.isArray(res.data) ? res.data : res.data.templates ?? [];
  return { ok: true, data: list };
}

export async function createClause(
  body: {
    title: string;
    category: string;
    body: string;
    jurisdiction_id?: string;
    effective_from?: string;
  },
  identity?: Identity,
): Promise<ApiResult<Clause>> {
  const res = await apiPost<{ clause?: Clause } | Clause>("clauseTemplate", "/v1/clauses", body, { identity });
  if (!res.ok) return res;
  const c = (res.data as { clause?: Clause }).clause ?? (res.data as Clause);
  return { ok: true, data: c };
}

// ─── 3. Obligation Tracking ──────────────────────────────────────────────────

export type ContractObligation = {
  obligation_id: string;
  contract_id?: string;
  tenant_id?: string;
  title: string;
  description?: string;
  due_date: string;
  status: string;
  assigned_to?: string;
  obligation_type?: string;
  risk_level?: string;
  created_at?: string;
};

export type Obligation = ContractObligation;

type ObligationsResponse = { obligations?: ContractObligation[]; total?: number };

export async function listContractObligations(identity?: Identity): Promise<ApiResult<ContractObligation[]>> {
  const res = await apiGet<ObligationsResponse | ContractObligation[]>("obligationTracking", "/v1/obligations", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.obligations ?? [];
  return { ok: true, data: list };
}

export const listObligations = listContractObligations;

// ─── 4. Board Resolutions ────────────────────────────────────────────────────

export type BoardResolution = {
  resolution_id: string;
  resolution_number?: string;
  tenant_id?: string;
  meeting_id?: string;
  title: string;
  content: string;
  category: string;
  status: string;
  votes_for?: number;
  votes_against?: number;
  abstentions?: number;
  passed_at?: string;
  created_at?: string;
};

export type BoardMeeting = {
  meeting_id: string;
  title: string;
  scheduled_at?: string;
  meeting_date?: string;
  date?: string;
  location?: string;
  status: string;
};

type ResolutionsResponse = { resolutions?: BoardResolution[]; total?: number };

export async function listBoardResolutions(identity?: Identity): Promise<ApiResult<BoardResolution[]>> {
  const res = await apiGet<ResolutionsResponse | BoardResolution[]>("boardResolutions", "/v1/resolutions", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.resolutions ?? [];
  return { ok: true, data: list };
}

export async function listBoardMeetings(identity?: Identity): Promise<ApiResult<BoardMeeting[]>> {
  const res = await apiGet<{ meetings?: BoardMeeting[] } | BoardMeeting[]>("boardResolutions", "/v1/meetings", { identity });
  if (!res.ok) return { ok: true, data: [] };
  const list = Array.isArray(res.data) ? res.data : res.data.meetings ?? [];
  return { ok: true, data: list };
}

export async function createResolution(
  body: {
    meeting_id?: string;
    title: string;
    content: string;
    category: string;
    effective_from?: string;
  },
  identity?: Identity,
): Promise<ApiResult<BoardResolution>> {
  const res = await apiPost<{ resolution?: BoardResolution } | BoardResolution>("boardResolutions", "/v1/resolutions", body, { identity });
  if (!res.ok) return res;
  const r = (res.data as { resolution?: BoardResolution }).resolution ?? (res.data as BoardResolution);
  return { ok: true, data: r };
}

// ─── 5. Corporate Actions ────────────────────────────────────────────────────

export type CorporateAction = {
  action_id: string;
  tenant_id?: string;
  action_type: string;
  title?: string;
  description: string;
  status: string;
  effective_date: string;
  created_at?: string;
};

type ActionsResponse = { actions?: CorporateAction[]; total?: number };

export async function listCorporateActions(identity?: Identity): Promise<ApiResult<CorporateAction[]>> {
  const res = await apiGet<ActionsResponse | CorporateAction[]>("corporateActions", "/v1/actions", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.actions ?? [];
  return { ok: true, data: list };
}

// ─── 6. Counterparty Management ──────────────────────────────────────────────

export type Counterparty = {
  counterparty_id: string;
  tenant_id?: string;
  name: string;
  legal_name?: string;
  counterparty_type: string;
  registration_number?: string;
  tax_identifier?: string;
  country: string;
  compliance_status: string;
  risk_rating: string;
  created_by?: string;
  created_at?: string;
};

type CounterpartiesResponse = { counterparties?: Counterparty[]; total?: number };

export async function listCounterparties(identity?: Identity): Promise<ApiResult<Counterparty[]>> {
  const res = await apiGet<CounterpartiesResponse | Counterparty[]>("counterpartyManagement", "/v1/counterparties", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.counterparties ?? [];
  return { ok: true, data: list };
}
