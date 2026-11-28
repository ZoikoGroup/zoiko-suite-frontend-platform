// obligations-svc (:8088) — the statutory / regulatory obligation registry, and
// the filing requirements scoped under each obligation.
//
// Six endpoints, all wired here and all verified live. Five properties of this
// service shape the console and are easy to get wrong. Three of them USED to
// read very differently, and the old text is kept alongside because it is the
// clearest statement of what changed:
//
//  1. IDENTITY AND TENANT ARE BOTH REQUIRED. Every call sends X-Tenant-Id and
//     X-Principal-Id; without either the service answers 401. This used to read
//     "NO TENANT HEADER. This service reads no X-Tenant-Id and has no RLS…an
//     unfiltered list returns every entity's obligations" — accurate then, and
//     the reason the register had to send a legal-entity filter and hope. There
//     is a tenant column and forced row-level security now.
//
//  2. DEDUP IS SCOPED TO THE TENANT. obligation_code is unique within a tenant,
//     not globally. It used to be global, and creation is idempotent on it — so
//     a second tenant posting an ordinary code was handed the FIRST tenant's
//     obligation as a 200. Within one tenant the old behaviour still holds and
//     still matters: a repeat differing in legal_entity_id, jurisdiction_id,
//     obligation_type or due_date is 409, and a repeat differing only in
//     severity_level, responsible_function or source_reference returns 200 with
//     the ORIGINAL row and silently discards the new values. A 200 is never
//     "saved" — it is "one with that code already exists, here it is, unchanged".
//
//  3. JURISDICTION VALIDATION FAILS CLOSED — 404 for an unknown id, 503 when
//     jurisdiction-rules-svc cannot be reached. The second is an outage, not a
//     bad input, and the two are reported apart. Note a deactivated jurisdiction
//     reads as 404 here: that lookup is active-only, by design.
//
//  4. A MALFORMED UUID IN THE PATH IS 404, not 503. It used to die in the pg
//     driver and surface as `store_unavailable` — an outage status for a typo.
//     The console still pre-validates, which now saves a round trip rather than
//     covering for the service.
//
//  5. AN UNKNOWN STATUS STRING IS 409 `invalid_transition`, not 400. The status
//     field is not validated against a vocabulary; it simply fails to match any
//     legal transition. Verified with "BANANA".
//
// WRITES ARE AUTHORIZED. OBLIGATION_CREATE, OBLIGATION_STATUS_UPDATE and
// FILING_REQUIREMENT_CREATE are checked against authorization-svc on the
// obligation's own legal entity, and fail closed. There was no authorization of
// any kind before: every write succeeded for any caller the gateway admitted.
//
// One thing this service still does NOT have, which the page must not imply:
// there is no endpoint that advances filing_status. Every filing requirement is
// created PENDING and stays PENDING. Create and read are the whole surface.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

/** Wire shape from the backend. Field names match the Go json tags exactly. */
export type Obligation = {
  obligation_id: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  obligation_source_type: string;
  obligation_source_id: string;
  obligation_code: string;
  obligation_type: string;
  obligation_status: string;
  due_date: string;
  severity_level: string;
  responsible_function: string;
  source_reference: string;
  created_at: string;
  created_by_principal_id: string;
  updated_at: string;
  closed_at: string | null;
};

export type FilingRequirement = {
  filing_requirement_id: string;
  obligation_id: string;
  filing_type: string;
  filing_authority: string;
  /** Always "PENDING" in practice — nothing in this service advances it. */
  filing_status: string;
  created_at: string;
};

/**
 * The obligation_status state machine, exactly as the store enforces it.
 *
 * CLOSED is absent as a key because it is terminal. Requesting the status a row
 * is already in is a 200 no-op rather than an error, which is why "already there"
 * is not modelled as a transition.
 */
export const LEGAL_TRANSITIONS: Record<string, readonly string[]> = {
  OPEN: ["IN_PROGRESS", "OVERDUE", "CLOSED"],
  IN_PROGRESS: ["OVERDUE", "CLOSED"],
  OVERDUE: ["CLOSED"],
  CLOSED: [],
};

export const OBLIGATION_STATUSES = ["OPEN", "IN_PROGRESS", "OVERDUE", "CLOSED"] as const;

/** Data-only tags in the backend — these constrain the console's own forms only. */
export const OBLIGATION_TYPES = [
  "FILING",
  "TAX_PAYMENT",
  "REGULATORY_REPORT",
  "DISCLOSURE",
  "LICENCE_RENEWAL",
  "CONTRACTUAL_DELIVERABLE",
] as const;

export const SOURCE_TYPES = [
  "CONTRACT_CLAUSE",
  "FILING_RULE",
  "POLICY_MANDATE",
  "JURISDICTION_RULE",
] as const;

export const SEVERITY_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export const RESPONSIBLE_FUNCTIONS = [
  "Finance",
  "Legal",
  "Tax",
  "Compliance",
  "Payroll",
  "HR",
] as const;

export type ObligationStatus = typeof OBLIGATION_STATUSES[number];

/** Applicability check result from the backend. */
export type ApplicabilityDecision = {
  obligation_id: string;
  applicable: boolean;
  reason: string;
  checked_at: string;
  checked_by_principal_id: string;
};

/** Current applicability state for an obligation. */
export type CurrentApplicability = {
  obligation_id: string;
  applicable: boolean;
  last_checked_at: string | null;
  last_checked_by: string | null;
  next_check_due: string | null;
};

/** Obligation definition from the registry. */
export type ObligationDefinition = {
  definition_id: string;
  obligation_code: string;
  obligation_type: string;
  description: string;
  default_severity: string;
  default_responsible_function: string;
  jurisdiction_id: string;
  source_type: string;
  source_reference: string;
  is_active: boolean;
};

/** Entity mapping for obligation definitions. */
export type ObligationEntityMapping = {
  definition_id: string;
  legal_entity_id: string;
  tenant_id: string;
  is_active: boolean;
  created_at: string;
};

/**
 * CLOSED is the only terminal state, and the only one that means the duty is
 * discharged. Named rather than compared inline so the register and the state
 * machine cannot drift apart.
 */
export function isTerminal(status: string): boolean {
  return status === "CLOSED";
}

// ── Reads ───────────────────────────────────────────────────────────────────

export type ListObligationsInput = {
  /** Required in practice: the service answers 401 without both a tenant and
   *  a principal. Optional in the type only so the overview panels can pass
   *  their own session through without restating it. */
  identity?: Identity;
  legalEntityId?: string;
  jurisdictionId?: string;
  obligationType?: string;
  status?: string;
  /** RFC3339. The service 400s on anything else and names the field. */
  dueBefore?: string;
  dueAfter?: string;
  /** 1–200, default 100. Values above 200 are clamped here: the service refuses them. */
  limit?: number;
  offset?: number;
};

/**
 * List obligations, soonest-due first.
 *
 * The service orders by created_at DESC and offers no sort parameter, but a
 * compliance register is read by deadline — so the ordering is applied here,
 * over one page rather than over the whole register.
 *
 * Paging is real now. This comment used to read "there is also no pagination
 * anywhere on this service (no limit/offset), so a long register renders in
 * full rather than silently truncating" — true when written, and the reason the
 * register was unbounded: every obligation a tenant had ever recorded, in one
 * response, forever.
 */
export async function listObligations(
  input: ListObligationsInput = {},
): Promise<ApiResult<Obligation[]>> {
  const limit = input.limit === undefined ? undefined : Math.min(Math.max(input.limit, 1), 200);
  const result = await apiGet<Obligation[]>("obligations", "/v1/obligations", {
    identity: input.identity,
    query: {
      limit,
      offset: input.offset,
      legal_entity_id: input.legalEntityId,
      jurisdiction_id: input.jurisdictionId,
      obligation_type: input.obligationType,
      status: input.status,
      due_before: input.dueBefore,
      due_after: input.dueAfter,
    },
  });

  if (!result.ok) return result;

  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: { kind: "malformed", message: "obligations returned a non-array list" },
    };
  }

  return {
    ok: true,
    data: [...result.data].sort(
      (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime(),
    ),
  };
}

export async function getObligation(
  obligationId: string,
  identity?: Identity,
): Promise<ApiResult<Obligation>> {
  return apiGet<Obligation>(
    "obligations",
    `/v1/obligations/${encodeURIComponent(obligationId)}`,
    { identity },
  );
}

/**
 * List the filing requirements under one obligation.
 *
 * Unlike the contract version ledger, this DOES 404 for an unknown obligation
 * rather than returning an empty array — so "no such obligation" and "no filings
 * yet" stay distinguishable. Verified live.
 */
export async function listFilingRequirements(
  obligationId: string,
  identity?: Identity,
): Promise<ApiResult<FilingRequirement[]>> {
  const result = await apiGet<FilingRequirement[]>(
    "obligations",
    `/v1/obligations/${encodeURIComponent(obligationId)}/filing-requirements`,
    { identity },
  );

  if (!result.ok) return result;

  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "obligations returned a non-array filing requirement list",
      },
    };
  }

  return { ok: true, data: result.data };
}

// ── Writes ──────────────────────────────────────────────────────────────────

export type RaiseObligationInput = {
  /** Sent as headers. The service authorizes the principal and scopes the row
   *  to the tenant; created_by_principal_id below must match this principal or
   *  the write is refused, so the two can never disagree. */
  identity: Identity;
  principalId: string;
  legalEntityId: string;
  jurisdictionId: string;
  obligationSourceType: string;
  obligationSourceId: string;
  obligationCode: string;
  obligationType: string;
  /** RFC3339 — the service decodes into time.Time and rejects a bare date. */
  dueDate: string;
  severityLevel: string;
  responsibleFunction: string;
  sourceReference: string;
  correlationId?: string;
};

/**
 * Raise an obligation.
 *
 * 201 means a row was written. 200 means obligation_code already existed with
 * matching key attributes and the response is the EXISTING row — see note 2 at
 * the top of this file. Callers must not report 200 as a save.
 *
 * obligation_id is deliberately not sent: the service generates one. Supplying
 * it would let a caller pick the primary key while dedup still keys on
 * obligation_code, so two different ids could contend for one code.
 */
export async function raiseObligation(
  input: RaiseObligationInput,
): Promise<ApiWriteResult<Obligation>> {
  return apiPost<Obligation>(
    "obligations",
    "/v1/obligations",
    {
      legal_entity_id: input.legalEntityId,
      jurisdiction_id: input.jurisdictionId,
      obligation_source_type: input.obligationSourceType,
      obligation_source_id: input.obligationSourceId,
      obligation_code: input.obligationCode,
      obligation_type: input.obligationType,
      due_date: input.dueDate,
      severity_level: input.severityLevel,
      responsible_function: input.responsibleFunction,
      source_reference: input.sourceReference,
      created_by_principal_id: input.principalId,
    },
    { correlationId: input.correlationId, identity: input.identity },
  );
}

/**
 * Transition an obligation's status.
 *
 * Always 200 on success, whether a real transition happened or the row was
 * already in that status — the response body carries only the obligation, with
 * no `transitioned` flag, so the two are indistinguishable from the response
 * alone. The caller passes the status it last read as `expectedStatus` and this
 * module reports which of the two occurred; see `describeTransition`.
 */
export async function transitionObligation(input: {
  obligationId: string;
  status: string;
  identity: Identity;
  correlationId?: string;
}): Promise<ApiWriteResult<Obligation>> {
  return apiPost<Obligation>(
    "obligations",
    `/v1/obligations/${encodeURIComponent(input.obligationId)}/status`,
    { obligation_status: input.status },
    { correlationId: input.correlationId, identity: input.identity },
  );
}

export async function addFilingRequirement(input: {
  obligationId: string;
  filingType: string;
  filingAuthority: string;
  submissionChannel: string;
  identity: Identity;
  correlationId?: string;
}): Promise<ApiWriteResult<FilingRequirement>> {
  return apiPost<FilingRequirement>(
    "obligations",
    `/v1/obligations/${encodeURIComponent(input.obligationId)}/filing-requirements`,
    {
      filing_type: input.filingType,
      filing_authority: input.filingAuthority,
      submission_channel: input.submissionChannel,
    },
    { correlationId: input.correlationId, identity: input.identity },
  );
}

// ── WF-3: Deadline Clocks ────────────────────────────────────────────────────

/** Clock classes (data, not code). */
export const CLOCK_CLASSES = ["HARD_LEGAL", "SOFT_INTERNAL", "ADVISORY", "EXTENSION"] as const;
export type ClockClass = typeof CLOCK_CLASSES[number];

/** Clock states (state machine). */
export const CLOCK_STATES = [
  "PLANNED",
  "ACTIVE",
  "DUE_SOON",
  "DUE",
  "OVERDUE",
  "FULFILLED",
  "WAIVED",
  "NOT_APPLICABLE",
  "SUPERSEDED",
] as const;
export type ClockState = typeof CLOCK_STATES[number];

/** Legal clock state transitions. */
export const CLOCK_TRANSITIONS: Record<ClockState, readonly ClockState[]> = {
  PLANNED: ["ACTIVE", "SUPERSEDED"],
  ACTIVE: ["DUE_SOON", "DUE", "FULFILLED", "WAIVED", "NOT_APPLICABLE", "SUPERSEDED"],
  DUE_SOON: ["DUE", "FULFILLED", "WAIVED", "NOT_APPLICABLE", "SUPERSEDED"],
  DUE: ["OVERDUE", "FULFILLED", "WAIVED", "NOT_APPLICABLE", "SUPERSEDED"],
  OVERDUE: ["FULFILLED", "WAIVED", "NOT_APPLICABLE", "SUPERSEDED"],
  FULFILLED: [],
  WAIVED: [],
  NOT_APPLICABLE: [],
  SUPERSEDED: [],
};

/** Display labels for clock states. */
export const CLOCK_STATE_LABEL: Record<ClockState, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  PLANNED: { label: "Planned", tone: "neutral" },
  ACTIVE: { label: "Active", tone: "info" },
  DUE_SOON: { label: "Due Soon", tone: "warning" },
  DUE: { label: "Due", tone: "warning" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  FULFILLED: { label: "Fulfilled", tone: "success" },
  WAIVED: { label: "Waived", tone: "neutral" },
  NOT_APPLICABLE: { label: "Not Applicable", tone: "neutral" },
  SUPERSEDED: { label: "Superseded", tone: "neutral" },
};

/** Display labels for clock classes. */
export const CLOCK_CLASS_LABEL: Record<ClockClass, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  HARD_LEGAL: { label: "Hard Legal", tone: "danger" },
  SOFT_INTERNAL: { label: "Soft Internal", tone: "warning" },
  ADVISORY: { label: "Advisory", tone: "info" },
  EXTENSION: { label: "Extension", tone: "info" },
};

export type EscalationStep = {
  step_order: number;
  after_overdue_by: string; // e.g. "24h"
  escalated_to_role: string;
  action_type: "NOTIFY" | "REASSIGN" | "INVALIDATE";
};

export type Clock = {
  clock_id: string;
  obligation_id: string;
  tenant_id: string;
  legal_entity_id: string;
  clock_class: ClockClass;
  clock_state: ClockState;
  calendar_code: string;
  calendar_rule_id: string;
  calendar_rule_version: number;
  computed_deadline: string;
  due_soon_threshold: string; // duration string
  escalation_ladder: EscalationStep[];
  satisfied_at: string | null;
  satisfied_by_principal_id: string | null;
  satisfied_evidence_ids: string[];
  waived_at: string | null;
  waived_by_principal_id: string | null;
  waived_reason: string | null;
  waived_evidence_ids: string[];
  not_applicable_at: string | null;
  not_applicable_by_principal_id: string | null;
  not_applicable_reason: string | null;
  superseded_at: string | null;
  superseded_by_clock_id: string | null;
  created_at: string;
  updated_at: string;
  version: number;
};

export type ListClocksInput = {
  identity?: Identity;
  obligationId?: string;
  legalEntityId?: string;
  clockClass?: ClockClass;
  clockState?: ClockState;
  limit?: number;
  offset?: number;
  cursor?: string;
};

/** List clocks on an obligation (or all clocks for an entity). */
export async function listClocks(
  input: ListClocksInput = {},
): Promise<ApiResult<Clock[]>> {
  const result = await apiGet<Clock[]>("obligations", "/v1/obligations", {
    identity: input.identity,
    query: {
      limit: input.limit,
      offset: input.offset,
      cursor: input.cursor,
      obligation_id: input.obligationId,
      legal_entity_id: input.legalEntityId,
      clock_class: input.clockClass,
      clock_state: input.clockState,
    },
  });

  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return { ok: false, error: { kind: "malformed", message: "clocks returned a non-array list" } };
  }
  return { ok: true, data: result.data };
}

/** Get one clock by ID. */
export async function getClock(
  obligationId: string,
  clockId: string,
  identity?: Identity,
): Promise<ApiResult<Clock>> {
  return apiGet<Clock>(
    "obligations",
    `/v1/obligations/${encodeURIComponent(obligationId)}/clocks/${encodeURIComponent(clockId)}`,
    { identity },
  );
}

export type CreateClockInput = {
  identity: Identity;
  obligationId: string;
  clockClass: ClockClass;
  calendarCode: string;
  calendarRuleId: string;
  calendarRuleVersion: number;
  /** RFC3339. */
  computedDeadline: string;
  /** Go duration string, e.g. "168h" for 7 days. */
  dueSoonThreshold: string;
  escalationLadder: EscalationStep[];
  correlationId?: string;
};

/** Create a clock on an obligation. */
export async function createClock(
  input: CreateClockInput,
): Promise<ApiWriteResult<Clock>> {
  return apiPost<Clock>(
    "obligations",
    `/v1/obligations/${encodeURIComponent(input.obligationId)}/clocks`,
    {
      clock_class: input.clockClass,
      calendar_code: input.calendarCode,
      calendar_rule_id: input.calendarRuleId,
      calendar_rule_version: input.calendarRuleVersion,
      computed_deadline: input.computedDeadline,
      due_soon_threshold: input.dueSoonThreshold,
      escalation_ladder: input.escalationLadder,
    },
    { correlationId: input.correlationId, identity: input.identity },
  );
}

export type TransitionClockInput = {
  obligationId: string;
  clockId: string;
  clockState: ClockState;
  identity: Identity;
  expectedVersion?: number;
  correlationId?: string;
  evidenceEvaluationIds?: string[];
  reason?: string;
  authorityPrincipalId?: string;
  supersededByClockId?: string;
};

/** Transition a clock to a new state. */
export async function transitionClock(
  input: TransitionClockInput,
): Promise<ApiWriteResult<Clock>> {
  return apiPost<Clock>(
    "obligations",
    `/v1/obligations/${encodeURIComponent(input.obligationId)}/clocks/${encodeURIComponent(input.clockId)}/status`,
    {
      clock_state: input.clockState,
      expected_version: input.expectedVersion,
      evidence_evaluation_ids: input.evidenceEvaluationIds,
      reason: input.reason,
      authority_principal_id: input.authorityPrincipalId,
      superseded_by_clock_id: input.supersededByClockId,
    },
    { correlationId: input.correlationId, identity: input.identity },
  );
}

/** Satisfy a clock (FULFILLED) with evidence. */
export async function satisfyClock(
  obligationId: string,
  clockId: string,
  evidenceEvaluationIds: string[],
  identity: Identity,
  expectedVersion?: number,
  correlationId?: string,
): Promise<ApiWriteResult<Clock>> {
  return apiPost<Clock>(
    "obligations",
    `/v1/obligations/${encodeURIComponent(obligationId)}/clocks/${encodeURIComponent(clockId)}/satisfy`,
    {
      evidence_evaluation_ids: evidenceEvaluationIds,
      expected_version: expectedVersion,
    },
    { correlationId, identity },
  );
}

/** Waive a clock (WAIVED) with authority + reason + evidence. */
export async function waiveClock(
  obligationId: string,
  clockId: string,
  reason: string,
  authorityPrincipalId: string,
  identity: Identity,
  expectedVersion?: number,
  evidenceEvaluationIds: string[] = [],
  correlationId?: string,
): Promise<ApiWriteResult<Clock>> {
  return apiPost<Clock>(
    "obligations",
    `/v1/obligations/${encodeURIComponent(obligationId)}/clocks/${encodeURIComponent(clockId)}/waive`,
    {
      reason,
      authority_principal_id: authorityPrincipalId,
      evidence_evaluation_ids: evidenceEvaluationIds,
      expected_version: expectedVersion,
    },
    { correlationId, identity },
  );
}

/** Mark a clock as NOT_APPLICABLE with authority + reason. */
export async function notApplicableClock(
  obligationId: string,
  clockId: string,
  reason: string,
  authorityPrincipalId: string,
  identity: Identity,
  expectedVersion?: number,
  correlationId?: string,
): Promise<ApiWriteResult<Clock>> {
  return apiPost<Clock>(
    "obligations",
    `/v1/obligations/${encodeURIComponent(obligationId)}/clocks/${encodeURIComponent(clockId)}/not-applicable`,
    {
      reason,
      authority_principal_id: authorityPrincipalId,
      expected_version: expectedVersion,
    },
    { correlationId, identity },
  );
}

/** Summary route for console v2.0 KPIs. */
export type ObligationSummary = {
  open: number;
  due_soon: number;
  overdue: number;
  filing_pending: number;
  unassessed_applicability: number;
  obligations_by_jurisdiction: Record<string, number>;
  obligations_by_clock_class: Record<string, number>;
  clock_pipeline: Record<ClockState, number>;
  escalation_ladder: Array<{ step: number; overdue_count: number; role: string }>;
};

export async function getObligationSummary(
  identity?: Identity,
): Promise<ApiResult<ObligationSummary>> {
  return apiGet<ObligationSummary>("obligations", "/v1/obligations/summary", { identity });
}

// ── Interpretation ──────────────────────────────────────────────────────────

/**
 * Did the status call change anything?
 *
 * `expected` is the status the console last read for this row. Equal to the
 * requested status means the caller asked for what was already there, which the
 * service treats as an idempotent no-op. This is accurate unless another writer
 * moved the row between the render and the submit — in which case it reports a
 * transition that this caller did not cause, which is why the copy says "is now"
 * rather than "you moved it".
 */
export function describeTransition(
  expected: string,
  requested: string,
  returned: string,
): { changed: boolean; message: string } {
  if (requested === expected) {
    return {
      changed: false,
      message: `Already ${requested} — the service accepted the request and changed nothing.`,
    };
  }
  if (returned === requested) {
    return {
      changed: true,
      message: `Moved from ${expected} to ${returned}.`,
    };
  }
  // Should not happen: a 200 with neither the requested nor the expected status.
  return {
    changed: true,
    message: `The service returned ${returned} after a request for ${requested}.`,
  };
}

/**
 * Turn a backend error string into something a reader can act on.
 *
 * apiGet/apiPost fold `error`, `field`, `message` and `detail` into one string,
 * so this matches on the machine code inside it.
 */
export function explainObligationError(message: string): string {
  if (message.includes("jurisdiction_not_found")) {
    return "That jurisdiction does not exist in jurisdiction-rules-svc. An obligation must be jurisdiction-bound, so the write was refused rather than stored unvalidated.";
  }
  if (message.includes("jurisdiction_service_unavailable")) {
    return "jurisdiction-rules-svc could not be reached, so the jurisdiction could not be validated. This service fails closed and refused the write — it did not store an unvalidated jurisdiction. This is an outage, not a problem with what you entered.";
  }
  if (message.includes("obligation_conflict")) {
    return "An obligation with that code already exists with a different legal entity, jurisdiction, type, or due date. Codes are the dedup key and are global, so pick a different code — or correct the four fields to match the existing record.";
  }
  if (message.includes("invalid_transition")) {
    return "That status transition is not legal. OPEN can move to IN_PROGRESS, OVERDUE or CLOSED; IN_PROGRESS to OVERDUE or CLOSED; OVERDUE to CLOSED. CLOSED is terminal. An unrecognised status value also lands here rather than as a validation error.";
  }
  if (message.includes("obligation_not_found")) {
    return "No obligation with that ID. This service has no tenant scoping, so this genuinely means the ID does not exist rather than that it belongs to someone else.";
  }
  if (message.includes("missing_field")) {
    return `A required field was missing — ${message}. Every field on an obligation is mandatory, including source_reference, which is what makes an obligation traceable to what created it.`;
  }
  if (message.includes("invalid_field")) {
    return `A filter was rejected — ${message}. Date filters must be full RFC3339 timestamps, not bare dates.`;
  }
  if (message.includes("store_unavailable")) {
    return "obligations-svc could not reach its database. Note that a malformed UUID also produces this, because the ID is rejected by the driver rather than by validation — check the ID before assuming an outage.";
  }
  return message;
}

// ── Roll-ups ────────────────────────────────────────────────────────────────

export type ObligationStats = {
  total: number;
  open: number;
  inProgress: number;
  overdue: number;
  closed: number;
  /** OPEN or IN_PROGRESS rows whose due_date has passed but which are not marked
   *  OVERDUE. Real and expected: nothing in this service sweeps deadlines. */
  pastDueNotFlagged: number;
  dueWithin7Days: number;
};

export function summariseObligations(obligations: Obligation[]): ObligationStats {
  let open = 0;
  let inProgress = 0;
  let overdue = 0;
  let closed = 0;
  let pastDueNotFlagged = 0;
  let dueWithin7Days = 0;

  for (const o of obligations) {
    switch (o.obligation_status) {
      case "OPEN":
        open += 1;
        break;
      case "IN_PROGRESS":
        inProgress += 1;
        break;
      case "OVERDUE":
        overdue += 1;
        break;
      case "CLOSED":
        closed += 1;
        break;
    }

    if (o.obligation_status === "CLOSED") continue;

    const days = daysUntil(o.due_date);
    if (days < 0 && o.obligation_status !== "OVERDUE") pastDueNotFlagged += 1;
    if (days >= 0 && days <= 7) dueWithin7Days += 1;
  }

  return {
    total: obligations.length,
    open,
    inProgress,
    overdue,
    closed,
    pastDueNotFlagged,
    dueWithin7Days,
  };
}

// ── Overview-page helpers (kept — consumed by KpiCardGrid and ObligationsPanel) ──

export type UpcomingObligation = {
  id: string;
  title: string;
  entity: string;
  dueInDays: number;
  overdue: boolean;
};

/**
 * Fetch obligations, sorted soonest-due first and mapped for the UI.
 *
 * "Not closed" is read from obligation_status rather than from closed_at. Both
 * agree today — closed_at is stamped by the same UPDATE that sets CLOSED — but
 * status is the field the state machine actually enforces.
 */
export async function listUpcomingObligations(
  limit = 5,
  identity?: Identity,
): Promise<ApiResult<UpcomingObligation[]>> {
  const result = await apiGet<Obligation[]>("obligations", "/v1/obligations", { identity });

  if (!result.ok) return result;

  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: { kind: "malformed", message: "obligations returned a non-array list" },
    };
  }

  const upcoming = result.data
    .filter((o) => o.obligation_status !== "CLOSED")
    .map(toUpcoming)
    .sort((a, b) => a.dueInDays - b.dueInDays)
    .slice(0, limit);

  return { ok: true, data: upcoming };
}

export type ObligationKpiStats = {
  open: number;
  overdue: number;
  dueWithin7Days: number;
  /** Share of open obligations that are not overdue, 0–100. Null when none are open. */
  onTrackPercent: number | null;
};

/**
 * Roll up the obligation registry for the Overview KPIs.
 *
 * obligations-svc has no count or aggregate endpoint, so this reads the list and
 * counts locally.
 */
export async function getObligationStats(
  identity?: Identity,
): Promise<ApiResult<ObligationKpiStats>> {
  const result = await apiGet<Obligation[]>("obligations", "/v1/obligations", { identity });

  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: { kind: "malformed", message: "obligations returned a non-array list" },
    };
  }

  const open = result.data.filter((o) => o.obligation_status !== "CLOSED");
  const days = open.map((o) => daysUntil(o.due_date));
  const overdue = days.filter((d) => d < 0).length;

  return {
    ok: true,
    data: {
      open: open.length,
      overdue,
      dueWithin7Days: days.filter((d) => d >= 0 && d <= 7).length,
      onTrackPercent:
        open.length === 0 ? null : Math.round(((open.length - overdue) / open.length) * 100),
    },
  };
}

function toUpcoming(obligation: Obligation): UpcomingObligation {
  const dueInDays = daysUntil(obligation.due_date);

  return {
    id: obligation.obligation_id,
    // obligation_code is the human-recognisable identifier (e.g. VAT-RETURN-Q2);
    // obligation_type is the category. Prefer the code, fall back to the type.
    title: obligation.obligation_code || obligation.obligation_type || "Untitled obligation",
    entity: obligation.legal_entity_id,
    dueInDays,
    overdue: dueInDays < 0,
  };
}

export function daysUntil(isoDate: string): number {
  const due = new Date(isoDate).getTime();
  if (Number.isNaN(due)) return 0;
  return Math.ceil((due - Date.now()) / (24 * 60 * 60 * 1000));
}
