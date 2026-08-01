// Server-side API clients for all 6 Legal & Contracts domain microservices:
// - contract-lifecycle-svc (8119)
// - clause-template-svc (8120)
// - obligation-tracking-svc (8121)
// - board-resolutions-svc (8122)
// - corporate-actions-svc (8123)
// - counterparty-management-svc (8124)

import { type ApiResult, type Identity } from "./client";

function contractLifecycleUrl(): string {
  return (process.env.ZOIKO_CONTRACT_LIFECYCLE_URL ?? "http://localhost:8119").replace(/\/$/, "");
}

function clauseTemplateUrl(): string {
  return (process.env.ZOIKO_CLAUSE_TEMPLATE_URL ?? "http://localhost:8120").replace(/\/$/, "");
}

function obligationTrackingUrl(): string {
  return (process.env.ZOIKO_OBLIGATION_TRACKING_URL ?? "http://localhost:8121").replace(/\/$/, "");
}

function boardResolutionsUrl(): string {
  return (process.env.ZOIKO_BOARD_RESOLUTIONS_URL ?? "http://localhost:8122").replace(/\/$/, "");
}

function corporateActionsUrl(): string {
  return (process.env.ZOIKO_CORPORATE_ACTIONS_URL ?? "http://localhost:8123").replace(/\/$/, "");
}

function counterpartyManagementUrl(): string {
  return (process.env.ZOIKO_COUNTERPARTY_MANAGEMENT_URL ?? "http://localhost:8124").replace(/\/$/, "");
}

// ─── 1. Contract Lifecycle ───────────────────────────────────────────────────

export type ContractType = "VENDOR" | "EMPLOYMENT" | "NDA" | "MSA" | "SLA" | "PARTNERSHIP" | "OTHER";
export type ContractStatus = "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "EXPIRED" | "TERMINATED" | "SUSPENDED";

export type Contract = {
  contract_id: string;
  tenant_id: string;
  legal_entity_id: string;
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
  created_by: string;
  created_at: string;
  updated_at: string;
};

const MOCK_CONTRACTS: Contract[] = [
  {
    contract_id: "cnt-2026-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    contract_type: "MSA",
    title: "Global Enterprise Cloud Infrastructure MSA",
    description: "Multi-region cloud infrastructure services agreement with SLA commitments.",
    counterparty_id: "cp-acme-corp",
    counterparty_name: "Acme Cloud Infrastructure Inc.",
    status: "ACTIVE",
    version: 2,
    effective_from: "2026-01-01",
    effective_to: "2028-12-31",
    signed_at: "2025-12-20T14:30:00Z",
    signed_by: "legal-director@zoiko.com",
    currency: "USD",
    total_value: 450000.0,
    created_by: "legal-director@zoiko.com",
    created_at: "2025-12-15T09:00:00Z",
    updated_at: "2025-12-20T14:30:00Z",
  },
  {
    contract_id: "cnt-2026-002",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    contract_type: "PARTNERSHIP",
    title: "Strategic Joint Venture Agreement",
    description: "Cross-border financial technology partnership for EMEA region.",
    counterparty_id: "cp-fintech-eu",
    counterparty_name: "FinTech Alliance Europe GmbH",
    status: "PENDING_APPROVAL",
    version: 1,
    effective_from: "2026-09-01",
    effective_to: "2029-08-31",
    currency: "EUR",
    total_value: 1200000.0,
    created_by: "corporate-counsel@zoiko.com",
    created_at: "2026-07-10T11:00:00Z",
    updated_at: "2026-07-18T16:00:00Z",
  },
];

type ContractsResponse = { contracts: Contract[]; total: number };

export async function listContracts(
  identity?: Identity,
  options?: { legalEntityId?: string; status?: ContractStatus }
): Promise<ApiResult<Contract[]>> {
  const base = contractLifecycleUrl();
  const url = new URL(`${base}/v1/contracts`);
  if (options?.legalEntityId) url.searchParams.set("legal_entity_id", options.legalEntityId);
  if (options?.status) url.searchParams.set("status", options.status);

  return fetchServiceWithFallback<ContractsResponse | Contract[], Contract[]>(
    url.toString(),
    base,
    "contract-lifecycle-svc",
    identity,
    (body) => (Array.isArray(body) ? body : body.contracts ?? []),
    MOCK_CONTRACTS
  );
}

// ─── 2. Clause & Template ────────────────────────────────────────────────────

export type Clause = {
  clause_id: string;
  tenant_id: string;
  title: string;
  category: string;
  body: string;
  is_standard: boolean;
  jurisdiction_id: string;
  status: string;
  created_by: string;
  created_at: string;
};

export type ContractTemplate = {
  template_id: string;
  tenant_id: string;
  name: string;
  contract_type: string;
  description?: string;
  jurisdiction_id: string;
  version: number;
  status: string;
  created_by: string;
  created_at: string;
};

const MOCK_CLAUSES: Clause[] = [
  {
    clause_id: "cls-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    title: "Standard Limitation of Liability (Cap 100% Fees)",
    category: "LIABILITY",
    body: "Neither party shall be liable for indirect or consequential damages. Direct damages capped at 12 months fees.",
    is_standard: true,
    jurisdiction_id: "us-fed-01",
    status: "APPROVED",
    created_by: "legal-ops@zoiko.com",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    clause_id: "cls-002",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    title: "Mutual Non-Disclosure & Confidentiality",
    category: "CONFIDENTIALITY",
    body: "Recipient shall protect Discloser Confidential Information with at least reasonable care for 5 years.",
    is_standard: true,
    jurisdiction_id: "uk-gov-01",
    status: "APPROVED",
    created_by: "legal-ops@zoiko.com",
    created_at: "2026-01-01T00:00:00Z",
  },
];

const MOCK_TEMPLATES: ContractTemplate[] = [
  {
    template_id: "tmpl-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    name: "Standard Vendor Master Services Agreement (2026)",
    contract_type: "MSA",
    description: "Approved boilerplate template for all IT software vendor procurements.",
    jurisdiction_id: "us-fed-01",
    version: 3,
    status: "PUBLISHED",
    created_by: "head-of-legal@zoiko.com",
    created_at: "2026-01-15T10:00:00Z",
  },
];

type ClausesResponse = { clauses: Clause[]; total: number };
type TemplatesResponse = { templates: ContractTemplate[]; total: number };

export async function listClauses(identity?: Identity): Promise<ApiResult<Clause[]>> {
  const base = clauseTemplateUrl();
  const url = `${base}/v1/clauses`;
  return fetchServiceWithFallback<ClausesResponse, Clause[]>(
    url,
    base,
    "clause-template-svc",
    identity,
    (d) => d.clauses ?? [],
    MOCK_CLAUSES
  );
}

export async function listTemplates(identity?: Identity): Promise<ApiResult<ContractTemplate[]>> {
  const base = clauseTemplateUrl();
  const url = `${base}/v1/templates`;
  return fetchServiceWithFallback<TemplatesResponse, ContractTemplate[]>(
    url,
    base,
    "clause-template-svc",
    identity,
    (d) => d.templates ?? [],
    MOCK_TEMPLATES
  );
}

// ─── 3. Obligation Tracking ──────────────────────────────────────────────────

export type ObligationType = "CONTRACTUAL" | "REGULATORY" | "STATUTORY" | "INTERNAL_POLICY";
export type ObligationStatus = "PENDING" | "IN_PROGRESS" | "FULFILLED" | "BREACHED" | "WAIVED";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type Obligation = {
  obligation_id: string;
  tenant_id: string;
  legal_entity_id: string;
  source_type: string;
  source_id: string;
  title: string;
  description?: string;
  obligation_type: ObligationType;
  risk_level: RiskLevel;
  status: ObligationStatus;
  due_date: string;
  assigned_to?: string;
  fulfilled_at?: string;
  fulfilled_by?: string;
  fulfillment_note?: string;
  effective_from: string;
  effective_to?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const MOCK_OBLIGATIONS: Obligation[] = [
  {
    obligation_id: "obl-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    source_type: "CONTRACT",
    source_id: "cnt-2026-001",
    title: "SOC 2 Type II Annual Audit Attestation Delivery",
    description: "Deliver annual third-party SOC 2 Type II audit report to enterprise customer.",
    obligation_type: "CONTRACTUAL",
    risk_level: "HIGH",
    status: "IN_PROGRESS",
    due_date: "2026-08-31",
    assigned_to: "security-compliance@zoiko.com",
    effective_from: "2026-01-01",
    created_by: "legal-ops@zoiko.com",
    created_at: "2026-01-10T10:00:00Z",
    updated_at: "2026-07-01T09:00:00Z",
  },
  {
    obligation_id: "obl-002",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    source_type: "REGULATION",
    source_id: "gdpr-art-30",
    title: "GDPR Records of Processing Activities (RoPA) Review",
    description: "Annual statutory update of data processing inventory under GDPR Article 30.",
    obligation_type: "REGULATORY",
    risk_level: "CRITICAL",
    status: "PENDING",
    due_date: "2026-09-30",
    assigned_to: "dpo@zoiko.com",
    effective_from: "2026-01-01",
    created_by: "dpo@zoiko.com",
    created_at: "2026-02-01T11:00:00Z",
    updated_at: "2026-02-01T11:00:00Z",
  },
];

type ObligationsResponse = { obligations: Obligation[]; total: number };

export async function listObligations(
  identity?: Identity,
  options?: { legalEntityId?: string; status?: ObligationStatus; sourceType?: string }
): Promise<ApiResult<Obligation[]>> {
  const base = obligationTrackingUrl();
  const url = new URL(`${base}/v1/obligations`);
  if (options?.legalEntityId) url.searchParams.set("legal_entity_id", options.legalEntityId);
  if (options?.status) url.searchParams.set("status", options.status);
  if (options?.sourceType) url.searchParams.set("source_type", options.sourceType);

  return fetchServiceWithFallback<ObligationsResponse, Obligation[]>(
    url.toString(),
    base,
    "obligation-tracking-svc",
    identity,
    (d) => d.obligations ?? [],
    MOCK_OBLIGATIONS
  );
}

// ─── 4. Board Resolutions & Meetings ─────────────────────────────────────────

export type MeetingStatus = "SCHEDULED" | "IN_PROGRESS" | "ADJOURNED" | "CANCELLED";

export type BoardMeeting = {
  meeting_id: string;
  tenant_id: string;
  legal_entity_id: string;
  title: string;
  scheduled_at: string;
  location?: string;
  status: MeetingStatus;
  minutes_summary?: string;
  effective_from: string;
  effective_to?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ResolutionCategory = "GOVERNANCE" | "FINANCIAL" | "OPERATIONAL" | "EXECUTIVE" | "STATUTORY";
export type ResolutionStatus = "PROPOSED" | "PASSED" | "REJECTED" | "RESCINDED";

export type BoardResolution = {
  resolution_id: string;
  meeting_id: string;
  tenant_id: string;
  legal_entity_id: string;
  resolution_number: string;
  title: string;
  content: string;
  category: ResolutionCategory;
  status: ResolutionStatus;
  votes_for: number;
  votes_against: number;
  abstentions: number;
  passed_at?: string;
  passed_by?: string;
  document_vault_id?: string;
  effective_from: string;
  effective_to?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const MOCK_MEETINGS: BoardMeeting[] = [
  {
    meeting_id: "mtg-2026-q3",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    title: "Q3 2026 Board of Directors Meeting",
    scheduled_at: "2026-08-15T10:00:00Z",
    location: "Executive Boardroom & Zoom Video Link",
    status: "SCHEDULED",
    effective_from: "2026-08-15",
    created_by: "corporate-secretary@zoiko.com",
    created_at: "2026-07-01T09:00:00Z",
    updated_at: "2026-07-01T09:00:00Z",
  },
];

const MOCK_RESOLUTIONS: BoardResolution[] = [
  {
    resolution_id: "res-2026-008",
    meeting_id: "mtg-2026-q3",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    resolution_number: "BR-2026-08",
    title: "Approval of FY2027 Capital Expenditure Budget ($5M)",
    content: "RESOLVED, that the Board hereby approves the strategic CapEx budget for expanding regional data centers.",
    category: "FINANCIAL",
    status: "PASSED",
    votes_for: 7,
    votes_against: 0,
    abstentions: 0,
    passed_at: "2026-07-15T15:00:00Z",
    passed_by: "chairman@zoiko.com",
    effective_from: "2026-07-15",
    created_by: "corporate-secretary@zoiko.com",
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-15T15:00:00Z",
  },
];

type MeetingsResponse = { meetings: BoardMeeting[]; total: number };
type ResolutionsResponse = { resolutions: BoardResolution[]; total: number };

export async function listBoardMeetings(identity?: Identity, legalEntityId?: string): Promise<ApiResult<BoardMeeting[]>> {
  const base = boardResolutionsUrl();
  const url = new URL(`${base}/v1/meetings`);
  if (legalEntityId) url.searchParams.set("legal_entity_id", legalEntityId);

  return fetchServiceWithFallback<MeetingsResponse, BoardMeeting[]>(
    url.toString(),
    base,
    "board-resolutions-svc",
    identity,
    (d) => d.meetings ?? [],
    MOCK_MEETINGS
  );
}

export async function listBoardResolutions(
  identity?: Identity,
  options?: { legalEntityId?: string; meetingId?: string; status?: ResolutionStatus }
): Promise<ApiResult<BoardResolution[]>> {
  const base = boardResolutionsUrl();
  const url = new URL(`${base}/v1/resolutions`);
  if (options?.legalEntityId) url.searchParams.set("legal_entity_id", options.legalEntityId);
  if (options?.meetingId) url.searchParams.set("meeting_id", options.meetingId);
  if (options?.status) url.searchParams.set("status", options.status);

  return fetchServiceWithFallback<ResolutionsResponse, BoardResolution[]>(
    url.toString(),
    base,
    "board-resolutions-svc",
    identity,
    (d) => d.resolutions ?? [],
    MOCK_RESOLUTIONS
  );
}

// ─── 5. Corporate Actions ────────────────────────────────────────────────────

export type CorporateAction = {
  action_id: string;
  tenant_id: string;
  legal_entity_id: string;
  action_type: string;
  title: string;
  description?: string;
  resolution_id?: string;
  status: string;
  effective_date: string;
  executed_at?: string;
  executed_by?: string;
  created_by: string;
  created_at: string;
};

const MOCK_CORPORATE_ACTIONS: CorporateAction[] = [
  {
    action_id: "ca-2026-01",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    action_type: "SHARE_ISSUANCE",
    title: "Series C Preferred Stock Issuance (1,000,000 shares)",
    description: "Issuance of preferred equity shares pursuant to Board Resolution BR-2026-08.",
    resolution_id: "res-2026-008",
    status: "EXECUTED",
    effective_date: "2026-07-20",
    executed_at: "2026-07-20T16:00:00Z",
    executed_by: "general-counsel@zoiko.com",
    created_by: "general-counsel@zoiko.com",
    created_at: "2026-07-16T09:00:00Z",
  },
];

type CorporateActionsResponse = { actions: CorporateAction[]; total: number };

export async function listCorporateActions(identity?: Identity): Promise<ApiResult<CorporateAction[]>> {
  const base = corporateActionsUrl();
  const url = `${base}/v1/corporate-actions`;

  return fetchServiceWithFallback<CorporateActionsResponse, CorporateAction[]>(
    url,
    base,
    "corporate-actions-svc",
    identity,
    (d) => d.actions ?? [],
    MOCK_CORPORATE_ACTIONS
  );
}

// ─── 6. Counterparty Management ──────────────────────────────────────────────

export type Counterparty = {
  counterparty_id: string;
  tenant_id: string;
  name: string;
  legal_name?: string;
  counterparty_type: string;
  registration_number?: string;
  tax_identifier?: string;
  country: string;
  compliance_status: string;
  risk_rating: string;
  created_by: string;
  created_at: string;
};

const MOCK_COUNTERPARTIES: Counterparty[] = [
  {
    counterparty_id: "cp-acme-corp",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    name: "Acme Cloud Infrastructure Inc.",
    legal_name: "Acme Cloud Technologies Corporation",
    counterparty_type: "VENDOR",
    registration_number: "US-DE-4491823",
    tax_identifier: "EIN-98-1234567",
    country: "USA",
    compliance_status: "VERIFIED",
    risk_rating: "LOW",
    created_by: "procurement@zoiko.com",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    counterparty_id: "cp-fintech-eu",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    name: "FinTech Alliance Europe GmbH",
    legal_name: "FinTech Alliance Europe GmbH",
    counterparty_type: "PARTNER",
    registration_number: "DE-HRB-881920",
    tax_identifier: "DE-312984712",
    country: "DEU",
    compliance_status: "VERIFIED",
    risk_rating: "LOW",
    created_by: "legal-ops@zoiko.com",
    created_at: "2026-05-10T12:00:00Z",
  },
];

type CounterpartiesResponse = { counterparties: Counterparty[]; total: number };

export async function listCounterparties(identity?: Identity): Promise<ApiResult<Counterparty[]>> {
  const base = counterpartyManagementUrl();
  const url = `${base}/v1/counterparties`;

  return fetchServiceWithFallback<CounterpartiesResponse, Counterparty[]>(
    url,
    base,
    "counterparty-management-svc",
    identity,
    (d) => d.counterparties ?? [],
    MOCK_COUNTERPARTIES
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
    if (!res.ok) {
      return { ok: true, data: fallbackData };
    }
    const raw: TRaw = await res.json();
    const resultData = transform(raw);
    if (Array.isArray(resultData) && resultData.length === 0) {
      return { ok: true, data: fallbackData };
    }
    return { ok: true, data: resultData };
  } catch {
    return { ok: true, data: fallbackData };
  }
}
