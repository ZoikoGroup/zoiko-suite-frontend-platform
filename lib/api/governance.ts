// governance-decision-log-svc (:8083) — the append-only governance evidence log.
//
// Contract: GET /v1/decisions returns a JSON array (never null), newest first.
// Optional filters: actor, entity, action, rule_basis, from, to, limit, offset.
//
// Append-only in the strict sense: there is no UPDATE and no DELETE route, and
// POST is idempotent on a caller-supplied decision_id, so a retry cannot inflate
// the record. Recording is the only write.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

/** Wire shape from the backend. Field names match the Go json tags exactly. */
export type GovernanceDecision = {
  decision_id: string;
  tenant_id: string;
  legal_entity_id: string;
  actor_id: string;
  action_type: string;
  outcome: string;
  rule_basis: string;
  evaluation_context?: unknown;
  correlation_id: string;
  decided_at: string;
};

/** UI-facing outcome buckets. The backend column is free-text, so we normalise. */
export type DecisionOutcome = "authorized" | "escalated" | "denied";

export type DecisionLogEntry = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  outcome: DecisionOutcome;
  note?: string;
  timeAgo: string;
};

export type ListDecisionsParams = {
  entity?: string;
  actor?: string;
  action?: string;
  limit?: number;
  /** Required in practice. governance-decision-log-svc reads the tenant from
   *  X-Tenant-Id and answers 400 `missing_tenant_id` without it — every read in
   *  this client used to omit it, so the decision log rendered as "those
   *  filters were rejected" on a request that carried no filters at all. */
  identity?: Identity;
};

/**
 * Fetch the most recent governance decisions, already mapped for the UI.
 *
 * The backend caps limit at 200 and defaults to 50.
 */
export async function listDecisions(
  params: ListDecisionsParams = {},
): Promise<ApiResult<DecisionLogEntry[]>> {
  const result = await apiGet<GovernanceDecision[]>("governance", "/v1/decisions", {
    identity: params.identity,
    query: {
      entity: params.entity,
      actor: params.actor,
      action: params.action,
      limit: params.limit ?? 8,
    },
  });

  if (!result.ok) return result;

  // Defensive: a proxy or misconfigured route could return a JSON object.
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: { kind: "malformed", message: "governance returned a non-array decision list" },
    };
  }

  return { ok: true, data: result.data.map(toLogEntry) };
}

export type OutcomeSplit = { name: string; value: number; color: string }[];

export type TrendPoint = { day: string; authorized: number; escalated: number };

export type DecisionStats = {
  total: number;
  authorized: number;
  escalated: number;
  denied: number;
  /** DENIED + ESCALATED — decisions that did not cleanly pass governance. */
  exceptions: number;
  outcomeSplit: OutcomeSplit;
  trend: TrendPoint[];
  /** Exceptions in the last 7 days minus the 7 days before that. */
  exceptionDelta: number;
};

/**
 * Aggregate the decision log into the numbers the Overview page shows.
 *
 * Everything here is computed from a single /v1/decisions read — the service has
 * no aggregate or group-by endpoint, so the roll-up happens client-side. The 200
 * row cap is the backend's maximum page size; beyond that these counts would
 * need real server-side aggregation.
 */
export async function getDecisionStats(
  trendDays = 14,
  identity?: Identity,
): Promise<ApiResult<DecisionStats>> {
  const result = await apiGet<GovernanceDecision[]>("governance", "/v1/decisions", {
    identity,
    query: { limit: 200 },
  });

  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: { kind: "malformed", message: "governance returned a non-array decision list" },
    };
  }

  const decisions = result.data;
  const bucketed = decisions.map((d) => ({
    outcome: normaliseOutcome(d.outcome).outcome,
    at: new Date(d.decided_at),
  }));

  const authorized = bucketed.filter((d) => d.outcome === "authorized").length;
  const escalated = bucketed.filter((d) => d.outcome === "escalated").length;
  const denied = bucketed.filter((d) => d.outcome === "denied").length;

  return {
    ok: true,
    data: {
      total: decisions.length,
      authorized,
      escalated,
      denied,
      exceptions: escalated + denied,
      outcomeSplit: [
        { name: "Authorized", value: authorized, color: "var(--color-navy-600)" },
        { name: "Escalated", value: escalated, color: "var(--color-gold-400)" },
        { name: "Denied", value: denied, color: "#c2483d" },
      ],
      trend: buildTrend(bucketed, trendDays),
      exceptionDelta: exceptionDelta(bucketed),
    },
  };
}

type Bucketed = { outcome: DecisionOutcome; at: Date };

/** Dense day-by-day series: days with no decisions render as zero, not a gap. */
function buildTrend(decisions: Bucketed[], days: number): TrendPoint[] {
  const series: TrendPoint[] = [];
  const today = new Date();

  for (let offset = days - 1; offset >= 0; offset--) {
    const day = new Date(today);
    day.setDate(day.getDate() - offset);
    const key = day.toDateString();

    const onDay = decisions.filter((d) => d.at.toDateString() === key);
    series.push({
      day: day.toLocaleDateString("en", { month: "short", day: "numeric" }),
      authorized: onDay.filter((d) => d.outcome === "authorized").length,
      escalated: onDay.filter((d) => d.outcome !== "authorized").length,
    });
  }

  return series;
}

/**
 * Trailing-7-day exception count minus the 7 days before it.
 *
 * A real comparison, not a decorative one — if there is no prior-week data the
 * delta is simply the current week's count.
 */
function exceptionDelta(decisions: Bucketed[]): number {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const inWindow = (from: number, to: number) =>
    decisions.filter(
      (d) => d.outcome !== "authorized" && d.at.getTime() > from && d.at.getTime() <= to,
    ).length;

  return inWindow(now - 7 * dayMs, now) - inWindow(now - 14 * dayMs, now - 7 * dayMs);
}

function toLogEntry(decision: GovernanceDecision): DecisionLogEntry {
  const { outcome, unmapped } = normaliseOutcome(decision.outcome);

  // rule_basis is the governance justification for the decision — the most
  // useful thing to surface as the entry's note. If the backend hands us an
  // outcome we don't recognise we say so rather than silently mislabelling it.
  const note = unmapped
    ? `Unrecognised outcome "${decision.outcome}" — basis: ${decision.rule_basis}`
    : decision.rule_basis || undefined;

  return {
    id: decision.decision_id,
    actor: decision.actor_id,
    action: decision.action_type,
    entity: decision.legal_entity_id,
    outcome,
    note,
    timeAgo: formatTimeAgo(decision.decided_at),
  };
}

/**
 * Map the backend's data-driven outcome onto the three UI buckets.
 *
 * The outcome column is VARCHAR(32) with no CHECK constraint, so values outside
 * the documented GRANTED / DENIED / ESCALATED set are possible. Those land in
 * "escalated" (the review bucket) and are flagged in the note — never presented
 * as if they were an authorized outcome.
 */
function normaliseOutcome(raw: string): { outcome: DecisionOutcome; unmapped: boolean } {
  switch (raw?.trim().toUpperCase()) {
    case "GRANTED":
    case "AUTHORIZED":
    case "APPROVED":
    case "PERMIT":
      return { outcome: "authorized", unmapped: false };
    case "DENIED":
    case "REJECTED":
    case "BLOCKED":
      return { outcome: "denied", unmapped: false };
    case "ESCALATED":
    case "PENDING":
      return { outcome: "escalated", unmapped: false };
    default:
      return { outcome: "escalated", unmapped: true };
  }
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

function formatTimeAgo(isoTimestamp: string): string {
  const then = new Date(isoTimestamp).getTime();
  if (Number.isNaN(then)) return "unknown";

  const elapsed = Date.now() - then;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) {
      return RELATIVE.format(-Math.round(elapsed / ms), unit);
    }
  }
  return "just now";
}

// ─── The rest of the service's surface ───────────────────────────────────────
//
// Everything above serves the Overview page, which wants the log pre-digested
// into feed entries and chart series. The Governance page wants the opposite:
// the raw records, every filter the service accepts, and the ability to write
// one. Both live here rather than in two modules, because they are one service.
//
// Note what this service does NOT do: there is no tenant scoping. GET
// /v1/decisions reads no identity header and applies no row-level security — it
// returns every decision in the store, filtered only by the query parameters
// given. The tenant boundary on this log is whatever the caller asks for, so
// the console always passes an entity filter when it means to scope a read.

/** Every filter GET /v1/decisions accepts. All optional, AND-composed. */
export type DecisionFilters = {
  actor?: string;
  /** Matches legal_entity_id, not tenant_id — the service has no tenant filter. */
  entity?: string;
  action?: string;
  ruleBasis?: string;
  /** RFC3339. The service answers 400 `invalid_from` on anything else. */
  from?: string;
  to?: string;
  /** Service caps at 200 and defaults to 50. */
  limit?: number;
  offset?: number;
  identity?: Identity;
};

/**
 * List raw decision records with the service's full filter set.
 *
 * Separate from listDecisions() above, which flattens each record into a feed
 * entry and drops evaluation_context. An evidence log read for audit purposes
 * needs the record as stored, including the context blob.
 */
export async function listDecisionRecords(
  filters: DecisionFilters = {},
): Promise<ApiResult<GovernanceDecision[]>> {
  const result = await apiGet<GovernanceDecision[]>("governance", "/v1/decisions", {
    identity: filters.identity,
    query: {
      actor: filters.actor,
      entity: filters.entity,
      action: filters.action,
      rule_basis: filters.ruleBasis,
      from: filters.from,
      to: filters.to,
      limit: filters.limit ?? 50,
      offset: filters.offset,
    },
  });

  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "governance-decision-log-svc returned a non-array decision list",
      },
    };
  }
  return { ok: true, data: result.data };
}

/**
 * Fetch one decision by its id.
 *
 * 404 means no record with that id exists anywhere in the store — not "not
 * visible to you", because this service applies no tenant filter to a lookup.
 */
export async function getDecision(
  decisionId: string,
  identity?: Identity,
): Promise<ApiResult<GovernanceDecision>> {
  return apiGet<GovernanceDecision>(
    "governance",
    `/v1/decisions/${encodeURIComponent(decisionId)}`,
    { identity },
  );
}

export type RecordDecisionInput = {
  /** Caller-supplied. This is the idempotency key: a second POST with the same
   *  id returns 200 and writes nothing, rather than duplicating the evidence. */
  decisionId: string;
  tenantId: string;
  legalEntityId: string;
  actorId: string;
  actionType: string;
  outcome: string;
  /** The rule that produced the outcome. Required — doctrine here is that an
   *  outcome without its basis is not evidence. */
  ruleBasis: string;
  correlationId: string;
  /** Arbitrary JSON. Anything without a first-class column goes here. */
  evaluationContext?: unknown;
  /** RFC3339. When the decision was made UPSTREAM, which is not the same as
   *  when it was logged. Omitted means the service stamps receipt time, which
   *  silently conflates the two — so the console always sends it. */
  decidedAt?: string;
  /** Caller identity, forwarded as X-Principal-Id / X-Tenant-Id /
   *  X-Legal-Entity-Id. Required for the write: the service answers 401
   *  missing_principal without X-Principal-Id, before any authz check. */
  identity: Identity;
};

/**
 * Append a decision to the evidence log.
 *
 * 201 means a new record was written. 200 means this decision_id was already
 * recorded and nothing changed — reported distinctly, because a log that
 * silently accepts a replay as a fresh fact is not an evidence log.
 *
 * Every field except evaluation_context and decided_at is required; the service
 * answers 400 with the name of the first missing one.
 */
export async function recordDecision(
  input: RecordDecisionInput,
): Promise<ApiWriteResult<GovernanceDecision>> {
  return apiPost<GovernanceDecision>(
    "governance",
    "/v1/decisions",
    {
      decision_id: input.decisionId,
      tenant_id: input.tenantId,
      legal_entity_id: input.legalEntityId,
      actor_id: input.actorId,
      action_type: input.actionType,
      outcome: input.outcome,
      rule_basis: input.ruleBasis,
      correlation_id: input.correlationId,
      ...(input.evaluationContext === undefined
        ? {}
        : { evaluation_context: input.evaluationContext }),
      ...(input.decidedAt ? { decided_at: input.decidedAt } : {}),
    },
    {
      correlationId: input.correlationId,
      identity: input.identity,
      // governance-decision-log-svc enforces §4 purpose_context — "required for
      // governed sensitive access" — and refuses the write with 400
      // envelope_incomplete without it. The envelope builder has always
      // supported the field; nothing passed one, so every append from the
      // console was refused before it reached the service.
      //
      // The value states why the decision register is being written to, which
      // is what the contract asks for: this endpoint records a governance
      // decision, and that is the purpose.
      purposeContext: "GOVERNANCE_DECISION_RECORD",
    },
  );
}

/** Outcomes the console offers when recording by hand. The column is free-text
 *  with no constraint, so this narrows the console's own form — it is not a
 *  statement about what the service accepts. */
export const DECISION_OUTCOMES = ["GRANTED", "DENIED", "ESCALATED"] as const;

/** Map a raw record onto the UI's three buckets, for callers that hold records
 *  rather than feed entries. Re-exported so the Governance page badges match the
 *  Overview page exactly. */
export function bucketOutcome(raw: string): { outcome: DecisionOutcome; unmapped: boolean } {
  return normaliseOutcome(raw);
}

/**
 * Turn a backend failure into something an operator can act on.
 *
 * This service answers in machine codes rather than prose, so matching is on
 * those codes.
 */
export function explainDecisionError(message: string): string {
  if (message.includes("missing_field")) {
    return `The service rejected the record as incomplete: ${message.split("missing_field").pop()?.trim() || "a required field was empty"}. Every field but evaluation_context and decided_at is mandatory.`;
  }
  if (message.includes("invalid_from") || message.includes("invalid_to")) {
    return "The date range was not valid RFC3339. Use a full timestamp, e.g. 2026-07-30T00:00:00Z.";
  }
  if (message.includes("invalid_json")) {
    return "The evaluation context was not valid JSON, so the service could not parse the request.";
  }
  if (message.includes("store_unavailable")) {
    return "governance-decision-log-svc could not reach its database. Nothing was written.";
  }
  if (message.includes("404")) {
    return "No decision with that id exists in the log.";
  }
  return message;
}
