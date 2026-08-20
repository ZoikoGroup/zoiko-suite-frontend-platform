// Server-side API clients for all 6 Legal & Contracts domain microservices:
// - contract-lifecycle-svc (8119)
// - clause-template-svc (8120)
// - obligation-tracking-svc (8121)
// - board-resolutions-svc (8122)
// - corporate-actions-svc (8123)
// - counterparty-management-svc (8124)

import { type ApiResult, type ApiWriteResult, type Identity, apiPost } from "./client";

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

type ContractsResponse = { contracts: Contract[]; total: number };

export async function listContracts(
  identity?: Identity,
  options?: { legalEntityId?: string; status?: ContractStatus }
): Promise<ApiResult<Contract[]>> {
  const base = contractLifecycleUrl();
  const url = new URL(`${base}/v1/contracts`);
  if (options?.legalEntityId) url.searchParams.set("legal_entity_id", options.legalEntityId);
  if (options?.status) url.searchParams.set("status", options.status);

  return fetchDomainService<ContractsResponse | Contract[], Contract[]>(
    url.toString(),
    base,
    "contract-lifecycle-svc",
    identity,
    (body) => (Array.isArray(body) ? body : body.contracts ?? []),
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

type ClausesResponse = { clauses: Clause[]; total: number };
type TemplatesResponse = { templates: ContractTemplate[]; total: number };

export async function listClauses(identity?: Identity): Promise<ApiResult<Clause[]>> {
  const base = clauseTemplateUrl();
  const url = `${base}/v1/clauses`;
  return fetchDomainService<ClausesResponse, Clause[]>(
    url,
    base,
    "clause-template-svc",
    identity,
    (d) => d.clauses ?? [],
  );
}

export async function listTemplates(identity?: Identity): Promise<ApiResult<ContractTemplate[]>> {
  const base = clauseTemplateUrl();
  const url = `${base}/v1/templates`;
  return fetchDomainService<TemplatesResponse, ContractTemplate[]>(
    url,
    base,
    "clause-template-svc",
    identity,
    (d) => d.templates ?? [],
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

  return fetchDomainService<ObligationsResponse, Obligation[]>(
    url.toString(),
    base,
    "obligation-tracking-svc",
    identity,
    (d) => d.obligations ?? [],
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

type MeetingsResponse = { meetings: BoardMeeting[]; total: number };
type ResolutionsResponse = { resolutions: BoardResolution[]; total: number };

export async function listBoardMeetings(identity?: Identity, legalEntityId?: string): Promise<ApiResult<BoardMeeting[]>> {
  const base = boardResolutionsUrl();
  const url = new URL(`${base}/v1/meetings`);
  if (legalEntityId) url.searchParams.set("legal_entity_id", legalEntityId);

  return fetchDomainService<MeetingsResponse, BoardMeeting[]>(
    url.toString(),
    base,
    "board-resolutions-svc",
    identity,
    (d) => d.meetings ?? [],
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

  return fetchDomainService<ResolutionsResponse, BoardResolution[]>(
    url.toString(),
    base,
    "board-resolutions-svc",
    identity,
    (d) => d.resolutions ?? [],
  );
}

export type CreateBoardMeetingInput = {
  identity: Identity & { principalId: string; tenantId: string; legalEntityId: string };
  title: string;
  scheduledAt: string;
  location?: string;
  effectiveFrom: string;
};

/** Schedule a board meeting. Created as SCHEDULED for the tenant on the X
 *  header; the service authorizes MEETING_CREATE against the meeting's legal
 *  entity and refuses without a principal. */
export async function createBoardMeeting(
  input: CreateBoardMeetingInput,
): Promise<ApiWriteResult<BoardMeeting>> {
  return apiPost<BoardMeeting>("boardResolutions", "/v1/meetings", {
    legal_entity_id: input.identity.legalEntityId,
    title: input.title,
    scheduled_at: input.scheduledAt,
    ...(input.location ? { location: input.location } : {}),
    effective_from: input.effectiveFrom,
    created_by: input.identity.principalId,
  }, { identity: input.identity });
}

export type CreateBoardResolutionInput = {
  identity: Identity & { principalId: string; tenantId: string; legalEntityId: string };
  meetingId?: string;
  resolutionNumber?: string;
  title: string;
  content: string;
  category: ResolutionCategory;
  effectiveFrom: string;
  effectiveTo?: string;
};

/** Propose a board resolution. Always lands in PROPOSED — the service ignores
 *  any status supplied by the caller. */
export async function createBoardResolution(
  input: CreateBoardResolutionInput,
): Promise<ApiWriteResult<BoardResolution>> {
  return apiPost<BoardResolution>("boardResolutions", "/v1/resolutions", {
    ...(input.meetingId ? { meeting_id: input.meetingId } : {}),
    legal_entity_id: input.identity.legalEntityId,
    ...(input.resolutionNumber ? { resolution_number: input.resolutionNumber } : {}),
    title: input.title,
    content: input.content,
    category: input.category,
    effective_from: input.effectiveFrom,
    ...(input.effectiveTo ? { effective_to: input.effectiveTo } : {}),
    created_by: input.identity.principalId,
  }, { identity: input.identity });
}

export type RecordVotesInput = {
  identity: Identity & { principalId: string; tenantId: string; legalEntityId: string };
  resolutionId: string;
  votesFor: number;
  votesAgainst: number;
  abstentions: number;
};

/** Tally a resolution's votes. 409 once the resolution is finalized — voting
 *  only tallies, it does not change status. */
export async function recordResolutionVotes(
  input: RecordVotesInput,
): Promise<ApiWriteResult<BoardResolution>> {
  return apiPost<BoardResolution>("boardResolutions", `/v1/resolutions/${input.resolutionId}/vote`, {
    votes_for: input.votesFor,
    votes_against: input.votesAgainst,
    abstentions: input.abstentions,
  }, { identity: input.identity });
}

export type PassResolutionInput = {
  identity: Identity & { principalId: string; tenantId: string; legalEntityId: string };
  resolutionId: string;
  /** The principal the pass is attributed to. */
  passedBy: string;
};

/** Pass a resolution into force. The service enforces segregation of duties —
 *  the resolution's creator may not be the principal who passes it — and
 *  verifies evidence sufficiency (fail closed) before finalizing. */
export async function passBoardResolution(
  input: PassResolutionInput,
): Promise<ApiWriteResult<BoardResolution>> {
  return apiPost<BoardResolution>("boardResolutions", `/v1/resolutions/${input.resolutionId}/pass`, {
    passed_by: input.passedBy,
  }, { identity: input.identity });
}

/** Human-readable reason for a rejected board write. */
export function explainBoardError(message: string): string {
  if (message.includes("forbidden")) {
    return "Authorization denied — this principal does not hold the required permission on this legal entity, or is the resolution's own creator trying to pass it (segregation of duties).";
  }
  if (message.includes("authorization service unavailable")) {
    return "Could not verify authorization, so the write was refused. authorization-svc is unreachable — this is a fail-closed refusal, not a denial.";
  }
  if (message.includes("principal identity missing")) {
    return "The service received no principal identity and refused the write. Sign in again.";
  }
  if (message.includes("already finalized")) {
    return "This resolution is already passed, rejected, or rescinded — it can no longer be voted on or changed.";
  }
  if (message.includes("required evidence is missing")) {
    return "The evidence-requirements catalog has a requirement this resolution does not yet satisfy. Attach the required evidence, then retry the pass.";
  }
  if (message.includes("evidence-requirements-svc unavailable")) {
    return "Evidence sufficiency could not be verified, so the pass was refused (fail closed). evidence-requirements-svc is unreachable.";
  }
  if (message.includes("title and scheduled_at")) {
    return "A meeting needs both a title and a scheduled date/time.";
  }
  if (message.includes("title, content, and category")) {
    return "A resolution needs a title, content, and a category.";
  }
  if (message.includes("not found")) {
    return "No such record exists for this tenant. Row-level security hides another tenant's record the same way, so both read as not found.";
  }
  return message;
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

type CorporateActionsResponse = { actions: CorporateAction[]; total: number };

export async function listCorporateActions(identity?: Identity): Promise<ApiResult<CorporateAction[]>> {
  const base = corporateActionsUrl();
  const url = `${base}/v1/corporate-actions`;

  return fetchDomainService<CorporateActionsResponse, CorporateAction[]>(
    url,
    base,
    "corporate-actions-svc",
    identity,
    (d) => d.actions ?? [],
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

type CounterpartiesResponse = { counterparties: Counterparty[]; total: number };

export async function listCounterparties(identity?: Identity): Promise<ApiResult<Counterparty[]>> {
  const base = counterpartyManagementUrl();
  const url = `${base}/v1/counterparties`;

  return fetchDomainService<CounterpartiesResponse, Counterparty[]>(
    url,
    base,
    "counterparty-management-svc",
    identity,
    (d) => d.counterparties ?? [],
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
