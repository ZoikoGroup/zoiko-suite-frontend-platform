// governance-decision-log-svc (:8083) — the append-only governance evidence log.
//
// Contract: GET /v1/decisions returns a JSON array (never null), newest first.
// Optional filters: actor, entity, action, rule_basis, from, to, limit, offset.

import { apiGet, type ApiResult } from "./client";

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
export async function getDecisionStats(trendDays = 14): Promise<ApiResult<DecisionStats>> {
  const result = await apiGet<GovernanceDecision[]>("governance", "/v1/decisions", {
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
