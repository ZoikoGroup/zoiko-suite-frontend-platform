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

// ─── Reading a board resolution without reading the schema ───────────────────
//
// A resolution is the record of a decision a board took, and the people who need
// to read one — a company secretary, a director, an auditor — are not the people
// who wrote the service. `{"status":"PROPOSED","category":"GOVERNANCE",
// "votes_for":0}` does not tell them whether the board has decided anything yet,
// what happens next, or who is allowed to do it.
//
// These helpers say what a record means in prose. They never alter or drop a
// stored value: the code the service holds stays visible next to the plain
// wording, on the same doctrine the policy and governance consoles already
// follow. A label is this console's reading of a record; the code is the record.

/**
 * The five categories the service accepts.
 *
 * Not decoration, and not free text: the category is the `domain_code` sent to
 * evidence-requirements-svc when a resolution is passed, so it decides which
 * supporting evidence the board must have on file first. The service refuses
 * anything outside this list with 400 — an unrecognised category would ask the
 * catalog about a domain that does not exist, come back with no requirements,
 * and bypass the evidence gate on a typo.
 */
export const RESOLUTION_CATEGORIES: readonly ResolutionCategory[] = [
  "GOVERNANCE",
  "FINANCIAL",
  "OPERATIONAL",
  "EXECUTIVE",
  "STATUTORY",
] as const;

/** Badge tones, matching the vocabulary `Badge` accepts. */
export type BoardTone = "success" | "warning" | "danger" | "neutral" | "info";

export type CategoryDescription = {
  /** Plain-words name for the category. */
  label: string;
  /** What kind of decision belongs in it. */
  meaning: string;
  /** The category exactly as stored. */
  raw: string;
  /** False when the service would refuse this value, or already holds one this
   *  console does not recognise. */
  recognised: boolean;
};

const CATEGORY_MEANING: Record<ResolutionCategory, { label: string; meaning: string }> = {
  GOVERNANCE: {
    label: "How the company is run",
    meaning:
      "Decisions about the company's own governance — appointing or removing directors, " +
      "changing board procedure, amending the constitution.",
  },
  FINANCIAL: {
    label: "Money",
    meaning:
      "Decisions that commit or move money — approving a budget, borrowing, declaring a " +
      "dividend, signing off the accounts.",
  },
  OPERATIONAL: {
    label: "Running the business",
    meaning:
      "Day-to-day decisions the board still has to take — entering a major contract, " +
      "choosing a supplier, taking on premises.",
  },
  EXECUTIVE: {
    label: "Senior people",
    meaning:
      "Decisions about senior officers — appointments, pay, and handing one person the " +
      "authority to act for the company.",
  },
  STATUTORY: {
    label: "Required by law",
    meaning:
      "Decisions the law requires the board to take and to minute, whether or not the " +
      "board would otherwise have discussed them.",
  },
};

/** Name a category in plain words, and say what it decides. */
export function describeResolutionCategory(raw: string): CategoryDescription {
  const stored = raw?.trim() || "(empty)";
  const known = CATEGORY_MEANING[stored as ResolutionCategory];

  if (!known) {
    return {
      label: "Unrecognised category",
      meaning:
        `The record holds the category "${stored}", which is not one of the five this ` +
        "console knows. That matters more than a display problem: the category decides " +
        "which supporting evidence has to be on file before the resolution can be passed, " +
        "and an unrecognised one asks for none. Treat this resolution as ungated until " +
        "whoever operates the service has confirmed the value.",
      raw: stored,
      recognised: false,
    };
  }

  return { ...known, raw: stored, recognised: true };
}

export type StatusDescription = {
  /** Short label for a badge — "Awaiting a decision", "Passed". */
  label: string;
  /** What the status means for the reader, and what it does not. */
  meaning: string;
  tone: BoardTone;
  /** The status exactly as stored. */
  raw: string;
  /** True once the resolution can no longer be voted on or passed. */
  final: boolean;
  unmapped: boolean;
};

const STATUS_MEANING: Record<
  ResolutionStatus,
  { label: string; meaning: string; tone: BoardTone; final: boolean }
> = {
  PROPOSED: {
    label: "Awaiting a decision",
    meaning:
      "The resolution has been put to the board and nothing has been settled yet. It has " +
      "no effect at this stage. Votes can still be recorded against it, and recording them " +
      "does not decide it — someone other than the person who proposed it has to close it.",
    tone: "warning",
    final: false,
  },
  PASSED: {
    label: "Passed",
    meaning:
      "The board carried this resolution and it is in force. It is now closed: it cannot " +
      "be voted on, reopened, or changed, and who closed it and when are recorded on it " +
      "permanently.",
    tone: "success",
    final: true,
  },
  REJECTED: {
    label: "Turned down",
    meaning:
      "The board declined this resolution. It is closed and cannot be reopened — a fresh " +
      "resolution would have to be proposed instead. Note that nothing in this console can " +
      "put a resolution into this state; it can only have been set elsewhere.",
    tone: "danger",
    final: true,
  },
  RESCINDED: {
    label: "Withdrawn",
    meaning:
      "This resolution was withdrawn after the fact and no longer has any effect. The " +
      "record is kept rather than deleted, so the decision and its withdrawal both stay " +
      "on file. Nothing in this console can put a resolution into this state.",
    tone: "neutral",
    final: true,
  },
};

/**
 * Say where a resolution stands.
 *
 * An unrecognised status is reported as needing review and is deliberately never
 * described as passed or in force — the safe reading of a value we cannot
 * interpret is that the decision is unconfirmed. It is also treated as final, so
 * this console will not offer to vote on or close a record whose state it does
 * not understand.
 */
export function describeResolutionStatus(raw: string): StatusDescription {
  const stored = raw?.trim() || "(empty)";
  const known = STATUS_MEANING[stored as ResolutionStatus];

  if (!known) {
    return {
      label: "Needs review",
      meaning:
        `The record holds the status "${stored}", which is not one this console knows how ` +
        "to read. It is deliberately not shown as passed or in force. Check with whoever " +
        "operates the service before relying on this record.",
      tone: "warning",
      raw: stored,
      final: true,
      unmapped: true,
    };
  }

  return { ...known, raw: stored, unmapped: false };
}

export type MeetingStatusDescription = {
  label: string;
  meaning: string;
  tone: BoardTone;
  raw: string;
  unmapped: boolean;
};

const MEETING_STATUS_MEANING: Record<
  MeetingStatus,
  { label: string; meaning: string; tone: BoardTone }
> = {
  SCHEDULED: {
    label: "Scheduled",
    meaning:
      "The meeting is in the diary and has not been marked as started, adjourned, or " +
      "cancelled. Every meeting created here stays at this stage: the service has no way " +
      "to move a meeting on, so this says the meeting was booked, not that it has yet to " +
      "happen.",
    tone: "info",
  },
  IN_PROGRESS: {
    label: "Sitting",
    meaning: "The meeting is recorded as under way.",
    tone: "success",
  },
  ADJOURNED: {
    label: "Adjourned",
    meaning:
      "The meeting was broken off. Any resolution proposed at it keeps whatever state it " +
      "already had — adjourning a meeting decides nothing.",
    tone: "neutral",
  },
  CANCELLED: {
    label: "Cancelled",
    meaning:
      "The meeting did not go ahead. Resolutions already attached to it are not withdrawn " +
      "by this, and can still be passed.",
    tone: "danger",
  },
};

/** Say where a meeting stands. */
export function describeMeetingStatus(raw: string): MeetingStatusDescription {
  const stored = raw?.trim() || "(empty)";
  const known = MEETING_STATUS_MEANING[stored as MeetingStatus];

  if (!known) {
    return {
      label: "Needs review",
      meaning: `The record holds the status "${stored}", which is not one this console knows.`,
      tone: "warning",
      raw: stored,
      unmapped: true,
    };
  }

  return { ...known, raw: stored, unmapped: false };
}

export type VoteSummary = {
  inFavour: number;
  against: number;
  abstained: number;
  /** Votes actually cast one way or the other. Abstentions are not votes. */
  cast: number;
  /** Everyone whose position was recorded, abstentions included. */
  recordedPositions: number;
  /** False when no one's position has been recorded yet. */
  anyRecorded: boolean;
  /** True when more voted in favour than against, false when fewer, null on a
   *  tie or an empty tally. This is what the numbers say, not what decides. */
  majorityInFavour: boolean | null;
  /** One line a person can read — "12 in favour, 3 against, 1 abstained". */
  line: string;
  /** What the numbers add up to, in words. */
  headline: string;
};

/**
 * Read a vote tally.
 *
 * The service stores three integers and checks only that none is negative. It
 * does not check them against a quorum, against the size of the board, or
 * against each other — and passing a resolution does not require the tally to
 * favour it. So this reports what the numbers say and is careful never to imply
 * the numbers decided anything.
 */
export function summariseVotes(votes: {
  votes_for?: number;
  votes_against?: number;
  abstentions?: number;
}): VoteSummary {
  const inFavour = votes.votes_for ?? 0;
  const against = votes.votes_against ?? 0;
  const abstained = votes.abstentions ?? 0;
  const cast = inFavour + against;
  const recordedPositions = cast + abstained;
  const anyRecorded = recordedPositions > 0;

  const majorityInFavour = cast === 0 ? null : inFavour === against ? null : inFavour > against;

  const parts = [`${inFavour} in favour`, `${against} against`];
  if (abstained > 0) parts.push(`${abstained} abstained`);
  const line = anyRecorded ? parts.join(", ") : "No votes recorded";

  let headline: string;
  if (!anyRecorded) {
    headline = "Nobody's vote has been recorded yet.";
  } else if (cast === 0) {
    headline = `Everyone present abstained — ${abstained} ${
      abstained === 1 ? "abstention" : "abstentions"
    } and no votes either way.`;
  } else if (majorityInFavour === null) {
    headline = `The vote is tied — ${inFavour} each way.`;
  } else if (majorityInFavour) {
    headline = `A majority voted in favour — ${inFavour} of the ${cast} votes cast.`;
  } else {
    headline = `A majority voted against — ${against} of the ${cast} votes cast.`;
  }

  return {
    inFavour,
    against,
    abstained,
    cast,
    recordedPositions,
    anyRecorded,
    majorityInFavour,
    line,
    headline,
  };
}

export type ResolutionExplanation = {
  /** One sentence: where this resolution stands. */
  headline: string;
  /** What that means for a reader who does not know the vocabulary. */
  meaning: string;
  status: StatusDescription;
  votes: VoteSummary;
  /** What has to happen next, or why nothing can. */
  nextStep: string;
};

/**
 * Explain one resolution: where it stands, what the votes say, what happens next.
 *
 * The headline names the resolution rather than reporting a bare status, because
 * "Passed" on its own is not a fact anyone can act on.
 *
 * The one thing this must not do is let the vote tally read as the decision. The
 * service will pass a resolution that was voted down and refuse one that was
 * voted through, because the tally and the closing action are unconnected — so
 * the two are always reported as separate facts.
 */
export function explainResolution(resolution: BoardResolution): ResolutionExplanation {
  const status = describeResolutionStatus(resolution.status);
  const votes = summariseVotes(resolution);
  const name = resolution.title?.trim() || "This resolution";

  if (status.unmapped) {
    return {
      headline: `${name}: the recorded state is not one this console recognises`,
      meaning: status.meaning,
      status,
      votes,
      nextStep:
        "Nothing can be done with this record here until the stored status is confirmed.",
    };
  }

  const HEADLINE: Record<ResolutionStatus, string> = {
    PROPOSED: `${name} is on the table and has not been decided`,
    PASSED: `${name} was passed and is in force`,
    REJECTED: `${name} was turned down`,
    RESCINDED: `${name} was withdrawn and no longer applies`,
  };

  return {
    headline: HEADLINE[resolution.status] ?? `${name}: ${status.label}`,
    meaning: status.meaning,
    status,
    votes,
    nextStep: describeNextStep(resolution),
  };
}

/**
 * What to do next with a resolution, in the second person.
 *
 * Says what the service will actually allow rather than what the status implies.
 * Two of those constraints are invisible in the record and would otherwise be
 * discovered as a refusal: the person who proposed a resolution may not be the
 * one who passes it, and the required supporting evidence must already be on
 * file before the pass will go through.
 */
export function describeNextStep(resolution: BoardResolution): string {
  const status = describeResolutionStatus(resolution.status);

  // Checked before `final`, which an unrecognised status also sets. It is set
  // there to stop this console offering to act on a record it cannot read — not
  // because the resolution is known to be closed, and saying it is closed would
  // assert something about the decision that nobody has established.
  if (status.unmapped) {
    return "Nothing can be done with this record here until the stored status is confirmed.";
  }
  if (status.raw === "PASSED") {
    return "Nothing further. This resolution is closed and in force, and its record cannot change.";
  }
  if (status.final) {
    return "Nothing further. This resolution is closed, and a new one would have to be proposed to revisit the decision.";
  }

  const votes = summariseVotes(resolution);
  const tally = votes.anyRecorded
    ? "The tally can be corrected at any point until it is closed."
    : "Record how the board voted, if you are keeping the count here.";

  return (
    `${tally} To put it into force, someone other than the person who proposed it — and who ` +
    "holds the authority to close resolutions — has to pass it, with the supporting evidence " +
    "for this kind of decision already on file."
  );
}

/**
 * Turn a refused board write into something the reader can act on.
 *
 * The service answers in short machine phrases, so the matching is on those.
 * Each message says what was refused, why, and what would make it go through —
 * a refusal a reader cannot act on is not much better than the status code.
 */
export function explainBoardError(message: string): string {
  if (message.includes("principal may not approve or decide on their own submission")) {
    return (
      "Refused: the person who proposed a resolution is not allowed to be the one who " +
      "passes it. This split is deliberate — one person must not be able to put their own " +
      "proposal into force on their own. Someone else with the authority to close " +
      "resolutions has to pass this one."
    );
  }
  if (message.includes("passed_by")) {
    return (
      "Refused: the pass has to be attributed to whoever is signed in, and this request " +
      "named someone else. A pass recorded against another person's name would defeat the " +
      "point of recording it."
    );
  }
  if (message.includes("forbidden")) {
    return (
      "Refused: your account does not have permission to do this for this legal entity. " +
      "Whoever administers access can grant it."
    );
  }
  if (message.includes("authorization service unavailable")) {
    return (
      "Nothing was changed. Your permission to do this could not be checked, so the request " +
      "was refused rather than allowed through unchecked. This is a safety refusal, not a " +
      "decision about you — try again shortly."
    );
  }
  if (message.includes("principal identity missing") || message.includes("tenant scope missing")) {
    return "Nothing was changed. Your session was not recognised — sign in again.";
  }
  if (message.includes("already finalized")) {
    return (
      "Nothing was changed. This resolution has already been closed — passed, turned down, " +
      "or withdrawn — so its votes and its outcome are fixed. To revisit the decision, " +
      "propose a new resolution."
    );
  }
  if (message.includes("required evidence is missing")) {
    return (
      "Nothing was changed. The board's own rules require supporting evidence on file for " +
      "this kind of decision, and some of it is not there yet. Attach what is required, " +
      "then pass the resolution again."
    );
  }
  if (message.includes("evidence-requirements-svc unavailable")) {
    return (
      "Nothing was changed. Whether the required supporting evidence is on file could not be " +
      "checked, so the resolution was not passed. It is refused rather than allowed through " +
      "unchecked — try again shortly."
    );
  }
  if (message.includes("vote counts may not be negative")) {
    return "A vote count cannot be less than zero. Enter each figure as a whole number, using 0 for none.";
  }
  if (message.includes("category must be one of")) {
    return (
      "Pick one of the five categories offered. The category is not a label — it decides " +
      "which supporting evidence the board needs before the resolution can be passed."
    );
  }
  if (message.includes("title and scheduled_at")) {
    return "A meeting needs a title and the date and time it is set for.";
  }
  if (message.includes("title, content, and category")) {
    return "A resolution needs a title, its wording, and a category.";
  }
  if (message.includes("effective_from")) {
    return "A start date is required — the date from which the decision applies.";
  }
  if (message.includes("legal_entity_id")) {
    return "The company this applies to is missing from your session. Sign in again.";
  }
  if (message.includes("not a valid value")) {
    return (
      "One of the values submitted was not in a form the service could store — most often a " +
      "date. Check the dates and try again."
    );
  }
  if (message.includes("request body exceeds")) {
    return "The wording is too long to store. Shorten it, or attach the full text as a document instead.";
  }
  if (message.includes("not found")) {
    return (
      "No such record exists for your organisation. A record belonging to another " +
      "organisation reads the same way, so this does not confirm it exists elsewhere."
    );
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
