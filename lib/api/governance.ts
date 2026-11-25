// governance-decision-log-svc (:8083) — the append-only governance evidence
// ledger: every governed decision, its replays, and the G-07 hash chain that
// makes the record tamper-evident.
//
// Every read carries X-Purpose-Context (the service requires a purpose on
// reads, decision D-06) and the caller's identity; every write carries an
// Idempotency-Key (envelope.ts). Nothing here edits or deletes a decision —
// the service has no such route. A correction or a resolution is a NEW
// decision naming the earlier one as its causation (a follow-up).

import { REQUEST_TIMEOUT_MS, serviceLabel, serviceUrl } from "./config";
import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";
import { envelopeHeaders } from "./envelope";
import { humanizeCode } from "../humanize";

/** Why the console reads the ledger: governance review and audit. */
export const READ_PURPOSE = "GOVERNANCE_AUDIT";

// ── wire types (field names match the Go json tags) ─────────────────────────

export type StatusCategory = "APPROVED" | "PENDING" | "ESCALATED" | "DENIED" | "OTHER";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const STATUS_CATEGORIES: Exclude<StatusCategory, "OTHER">[] = ["APPROVED", "PENDING", "ESCALATED", "DENIED"];

export type GovernanceDecision = {
  decision_id: string;
  tenant_id: string;
  legal_entity_id: string;
  actor_id: string;
  action_type: string;
  outcome: string;
  rule_basis: string;
  jurisdiction_context?: string | null;
  policy_version_id?: string | null;
  evaluation_context?: unknown;
  correlation_id: string;
  workflow_instance_id?: string | null;
  causation_id?: string | null;
  action_subject_type?: string | null;
  action_subject_id?: string | null;
  decided_at: string;
  recorded_at: string;
  title?: string | null;
  summary?: string | null;
  domain: string;
  priority?: Priority | null;
  tags?: string[] | null;
  related_obligation_id?: string | null;
  chain_seq: number;
  prev_hash: string;
  curr_hash: string;
  status_category: StatusCategory;
  display_ref: string;
  follow_up_count: number;
};

export type DecisionPage = {
  records: GovernanceDecision[];
  total_count: number;
  next_cursor: string;
  limit: number;
  offset: number;
};

export type CategoryCounts = {
  total: number;
  approved: number;
  pending: number;
  escalated: number;
  denied: number;
  other: number;
};

export type NamedCount = { key: string; label?: string; count: number };

export type DecisionSummary = {
  from: string;
  to: string;
  previous_from: string;
  totals: CategoryCounts;
  previous_totals: CategoryCounts;
  open_pending: number;
  open_escalated: number;
  by_domain: NamedCount[];
  by_jurisdiction: NamedCount[];
  by_priority: NamedCount[];
  top_sources: NamedCount[];
  trend: (CategoryCounts & { date: string })[];
  replays: { total: number; mismatches: number };
  chain: { length: number; head_hash?: string; packages: number; sealed_through: number; last_sealed_at?: string | null };
  outbox: { pending: number; published: number; oldest_pending_seconds: number };
  facets: {
    domains: { code: string; label: string }[];
    jurisdictions: string[];
    priorities: string[];
    categories: string[];
  };
};

export type ReplayManifest = {
  replay_manifest_id: string;
  decision_id: string;
  policy_version_id: string;
  replayed_outcome: string;
  original_outcome: string;
  outcomes_match: boolean;
  replay_notes?: string | null;
  replayed_at: string;
  replayed_by_principal_id: string;
  tenant_id: string;
  decision_display_ref?: string;
  decision_title?: string | null;
  decision_action_type?: string;
};

export type EvidencePackage = {
  package_id: string;
  tenant_id: string;
  package_seq: number;
  to_seq: number;
  leaf_count: number;
  merkle_root: string;
  head_hash: string;
  head_decision_id: string;
  prev_package_hash: string;
  package_hash: string;
  label?: string | null;
  reason?: string | null;
  sealed_by: string;
  sealed_at: string;
};

export type PackageCheck = {
  package_id: string;
  package_seq: number;
  to_seq: number;
  valid: boolean;
  reason?: string;
  recomputed_root?: string;
};

export type ChainVerification = {
  valid: boolean;
  decisions_checked: number;
  head_seq: number;
  head_hash?: string;
  head_decision_id?: string;
  first_break?: { chain_seq: number; decision_id: string; reason: string } | null;
  packages_checked: number;
  packages: PackageCheck[];
  verified_at: string;
};

export type OutboxEvent = {
  event_type: string;
  created_at: string;
  published_at?: string | null;
  attempts: number;
  last_error?: string | null;
};

export type DecisionEvidence = {
  decision_id: string;
  display_ref: string;
  chain_seq: number;
  prev_hash: string;
  curr_hash: string;
  hash_valid: boolean;
  prev_link_valid: boolean;
  package?: EvidencePackage | null;
  events: OutboxEvent[];
  events_note: string;
};

// ── reads ────────────────────────────────────────────────────────────────────

/** Every filter GET /v1/decisions accepts. All optional, AND-composed. */
export type DecisionFilters = {
  q?: string;
  domain?: string;
  status?: string;
  priority?: string;
  jurisdiction?: string;
  actor?: string;
  /** legal_entity_id — the read is then authorized on that entity. */
  entity?: string;
  action?: string;
  ruleBasis?: string;
  /** RFC3339. */
  from?: string;
  to?: string;
  causation?: string;
  workflow?: string;
  limit?: number;
  offset?: number;
  cursor?: string;
};

function read<T>(path: string, identity: Identity | undefined, query?: Record<string, string | number | undefined>) {
  return apiGet<T>("governance", path, { identity, query, purposeContext: READ_PURPOSE });
}

export async function listDecisionRecords(filters: DecisionFilters, identity?: Identity): Promise<ApiResult<DecisionPage>> {
  const result = await read<DecisionPage>("/v1/decisions", identity, {
    q: filters.q,
    domain: filters.domain,
    status: filters.status,
    priority: filters.priority,
    jurisdiction: filters.jurisdiction,
    actor: filters.actor,
    entity: filters.entity,
    action: filters.action,
    rule_basis: filters.ruleBasis,
    from: filters.from,
    to: filters.to,
    causation: filters.causation,
    workflow: filters.workflow,
    limit: filters.limit,
    offset: filters.offset,
    cursor: filters.cursor,
  });
  if (!result.ok) return result;
  if (!Array.isArray(result.data?.records)) {
    return { ok: false, error: { kind: "malformed", message: "governance-decision-log-svc returned no records array" } };
  }
  return result;
}

export function getDecision(decisionId: string, identity?: Identity): Promise<ApiResult<GovernanceDecision>> {
  return read<GovernanceDecision>(`/v1/decisions/${encodeURIComponent(decisionId)}`, identity);
}

export function getDecisionSummary(
  window: { days?: number; from?: string; to?: string; entity?: string },
  identity?: Identity,
): Promise<ApiResult<DecisionSummary>> {
  return read<DecisionSummary>("/v1/decisions/summary", identity, {
    days: window.from ? undefined : window.days,
    from: window.from,
    to: window.to,
    entity: window.entity,
  });
}

export function getDecisionEvidence(decisionId: string, identity?: Identity): Promise<ApiResult<DecisionEvidence>> {
  return read<DecisionEvidence>(`/v1/decisions/${encodeURIComponent(decisionId)}/evidence`, identity);
}

export function listReplayManifests(decisionId: string, identity?: Identity): Promise<ApiResult<ReplayManifest[]>> {
  return read<ReplayManifest[]>(`/v1/decisions/${encodeURIComponent(decisionId)}/replay-manifests`, identity);
}

export function listAllReplays(
  params: { limit?: number; offset?: number; mismatches?: boolean },
  identity?: Identity,
): Promise<ApiResult<{ records: ReplayManifest[]; total_count: number }>> {
  return read("/v1/replay-manifests", identity, {
    limit: params.limit,
    offset: params.offset,
    mismatches: params.mismatches ? "true" : undefined,
  });
}

export function verifyChain(identity?: Identity): Promise<ApiResult<ChainVerification>> {
  return read<ChainVerification>("/v1/evidence/chain/verify", identity);
}

export function listPackages(identity?: Identity): Promise<ApiResult<{ records: EvidencePackage[]; total_count: number }>> {
  return read("/v1/evidence/packages", identity);
}

export function getPackage(packageId: string, identity?: Identity): Promise<ApiResult<EvidencePackage>> {
  return read<EvidencePackage>(`/v1/evidence/packages/${encodeURIComponent(packageId)}`, identity);
}

export function verifyPackage(packageId: string, identity?: Identity): Promise<ApiResult<PackageCheck>> {
  return read<PackageCheck>(`/v1/evidence/packages/${encodeURIComponent(packageId)}/verify`, identity);
}

/**
 * The tenant's evidence bundle, as the raw JSON document the service built
 * (so the download is byte-for-byte what was exported), with its file name.
 */
export async function exportEvidenceBundle(
  identity: Identity,
): Promise<{ ok: true; body: string; filename: string } | { ok: false; status?: number; message: string }> {
  let response: Response;
  try {
    response = await fetch(serviceUrl("governance") + "/v1/evidence/chain/export", {
      headers: {
        Accept: "application/json",
        ...envelopeHeaders({ identity, purposeContext: READ_PURPOSE, materialWrite: false }),
      },
      signal: AbortSignal.timeout(Math.max(REQUEST_TIMEOUT_MS, 30_000)),
    });
  } catch {
    return { ok: false, message: `${serviceLabel("governance")} did not answer the export` };
  }
  if (!response.ok) {
    return { ok: false, status: response.status, message: `${serviceLabel("governance")} refused the export (${response.status})` };
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "governance-evidence.json";
  return { ok: true, body: await response.text(), filename };
}

// ── writes ───────────────────────────────────────────────────────────────────

export type RecordDecisionInput = {
  actionType: string;
  outcome: string;
  ruleBasis: string;
  legalEntityId: string;
  title?: string;
  summary?: string;
  domain?: string;
  priority?: string;
  tags?: string[];
  jurisdiction?: string;
  relatedObligationId?: string;
  subjectType?: string;
  subjectId?: string;
  /** The decision this one follows up (resolves, overrides, corrects). */
  causationId?: string;
  evaluationContext?: unknown;
  /** RFC3339 — when the decision was made, not when it is logged. */
  decidedAt?: string;
};

/**
 * Append one decision. decision_id and the correlation id are generated here:
 * decision_id is the service's dedup key, and a human-chosen one would collide.
 * 201 = recorded; 200 = an identical decision was already recorded.
 */
export function recordDecision(input: RecordDecisionInput, identity: Identity): Promise<ApiWriteResult<GovernanceDecision>> {
  const correlationId = crypto.randomUUID();
  const body: Record<string, unknown> = {
    decision_id: crypto.randomUUID(),
    legal_entity_id: input.legalEntityId,
    action_type: input.actionType,
    outcome: input.outcome,
    rule_basis: input.ruleBasis,
    correlation_id: correlationId,
    decided_at: input.decidedAt ?? new Date().toISOString(),
  };
  const optional: [string, unknown][] = [
    ["title", input.title],
    ["summary", input.summary],
    ["domain", input.domain],
    ["priority", input.priority],
    ["tags", input.tags?.length ? input.tags : undefined],
    ["jurisdiction_context", input.jurisdiction],
    ["related_obligation_id", input.relatedObligationId],
    ["action_subject_type", input.subjectType],
    ["action_subject_id", input.subjectId],
    ["causation_id", input.causationId],
    ["evaluation_context", input.evaluationContext],
  ];
  for (const [k, v] of optional) if (v !== undefined && v !== "") body[k] = v;
  return apiPost<GovernanceDecision>("governance", "/v1/decisions", body, {
    identity: { ...identity, legalEntityId: input.legalEntityId },
    correlationId,
    causationId: input.causationId,
  });
}

export function replayDecision(decisionId: string, identity: Identity): Promise<ApiWriteResult<ReplayManifest>> {
  return apiPost<ReplayManifest>("governance", `/v1/decisions/${encodeURIComponent(decisionId)}/replay`, {}, { identity });
}

export function sealPackage(
  input: { throughDecisionId?: string; label?: string; reason?: string },
  identity: Identity,
): Promise<ApiWriteResult<EvidencePackage>> {
  const body: Record<string, string> = {};
  if (input.throughDecisionId) body.through_decision_id = input.throughDecisionId;
  if (input.label) body.label = input.label;
  if (input.reason) body.reason = input.reason;
  return apiPost<EvidencePackage>("governance", "/v1/evidence/packages/seal", body, { identity });
}

// ── presentation helpers ─────────────────────────────────────────────────────

/** Badge label and tone for a decision's status. */
export function statusView(d: Pick<GovernanceDecision, "status_category" | "outcome">): {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral" | "info";
} {
  const outcome = d.outcome?.trim().toUpperCase();
  switch (d.status_category) {
    case "APPROVED":
      return { label: "Approved", tone: "success" };
    case "PENDING":
      return outcome === "IN_PROGRESS" ? { label: "In Progress", tone: "info" } : { label: "Pending", tone: "warning" };
    case "ESCALATED":
      return { label: "Escalated", tone: "danger" };
    case "DENIED":
      return { label: "Denied", tone: "neutral" };
    default:
      return { label: humanizeCode(d.outcome) || "Unknown", tone: "neutral" };
  }
}

/** A decision's name: its title, else its action type in words. */
export function decisionTitle(d: Pick<GovernanceDecision, "title" | "action_type">): string {
  return d.title?.trim() || humanizeCode(d.action_type) || d.action_type;
}

/** Split "RULE-CODE:reference" into its parts; a value with no colon is whole. */
export function splitRuleBasis(raw: string): { rule: string; reference?: string } {
  const trimmed = raw?.trim() ?? "";
  const colon = trimmed.indexOf(":");
  if (colon <= 0 || colon === trimmed.length - 1) return { rule: trimmed };
  return { rule: trimmed.slice(0, colon), reference: trimmed.slice(colon + 1) };
}

/** Turn a service refusal into a sentence an operator can act on. */
export function explainDecisionError(error: { status?: number; message: string; body?: unknown }): string {
  const code = (error.body as { code?: string } | undefined)?.code ?? "";
  const detail = (error.body as { detail?: string } | undefined)?.detail;
  switch (code) {
    case "AUTHORIZATION_DENIED":
      return "You do not hold the permission for this on the governance ledger. Ask an administrator for the governance role.";
    case "AUTHZ_UNAVAILABLE":
      return "authorization-svc could not be reached, so nothing was decided or written. Try again shortly.";
    case "UNKNOWN_DOMAIN":
      return "That domain is not one the ledger knows.";
    case "NOTHING_TO_SEAL":
      return "Every decision up to that point is already sealed. Record more decisions, then seal again.";
    case "CHAIN_BROKEN":
      return "The evidence chain does not verify, so it cannot be sealed. Run Verify chain to find the broken link.";
    case "IDEMPOTENCY_MISMATCH":
    case "DECISION_ID_CONFLICT":
      return "A different request already used this key. Submit again.";
    case "NOT_IMPLEMENTED":
      return detail ?? "Replay is implemented only for APPROVAL_THRESHOLD decisions.";
    case "SERVICE_UNAVAILABLE":
      return detail === "Policy service unavailable"
        ? "policy-svc could not be reached to fetch the policy version, so nothing was replayed."
        : "The governance ledger could not reach its database. Nothing was written.";
  }
  if (error.status === 404) return detail ?? "Not found.";
  return detail ?? error.message;
}

// ── Overview page (Executive dashboard) ──────────────────────────────────────
// The overview panels want the ledger pre-digested into a feed and two
// charts. They read the same live service, through the summary endpoint.

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

function outcomeBucket(category: StatusCategory): DecisionOutcome {
  if (category === "APPROVED") return "authorized";
  if (category === "DENIED") return "denied";
  return "escalated";
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

export function formatTimeAgo(isoTimestamp: string): string {
  const then = new Date(isoTimestamp).getTime();
  if (Number.isNaN(then)) return "unknown";
  const elapsed = Date.now() - then;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) return RELATIVE.format(-Math.round(elapsed / ms), unit);
  }
  return "just now";
}

/** The most recent decisions, as feed entries. */
export async function listDecisions(params: { limit?: number; identity?: Identity } = {}): Promise<ApiResult<DecisionLogEntry[]>> {
  const result = await listDecisionRecords({ limit: params.limit ?? 8 }, params.identity);
  if (!result.ok) return result;
  return {
    ok: true,
    data: result.data.records.map((d) => ({
      id: d.display_ref || d.decision_id,
      actor: d.actor_id,
      action: decisionTitle(d),
      entity: d.legal_entity_id,
      outcome: outcomeBucket(d.status_category),
      note: d.status_category === "OTHER" ? `Unrecognised outcome "${d.outcome}" — basis: ${d.rule_basis}` : d.rule_basis || undefined,
      timeAgo: formatTimeAgo(d.decided_at),
    })),
  };
}

export type OutcomeSplit = { name: string; value: number; color: string }[];
export type TrendPoint = { day: string; authorized: number; escalated: number };

export type DecisionStats = {
  total: number;
  authorized: number;
  escalated: number;
  denied: number;
  exceptions: number;
  outcomeSplit: OutcomeSplit;
  trend: TrendPoint[];
  exceptionDelta: number;
};

/** Window totals and a daily series, from GET /v1/decisions/summary. */
export async function getDecisionStats(trendDays = 14, identity?: Identity): Promise<ApiResult<DecisionStats>> {
  const result = await getDecisionSummary({ days: trendDays }, identity);
  if (!result.ok) return result;
  const s = result.data;
  const authorized = s.totals.approved;
  const escalated = s.totals.escalated + s.totals.pending + s.totals.other;
  const denied = s.totals.denied;
  const prevExceptions = s.previous_totals.total - s.previous_totals.approved;
  return {
    ok: true,
    data: {
      total: s.totals.total,
      authorized,
      escalated,
      denied,
      exceptions: escalated + denied,
      outcomeSplit: [
        { name: "Authorized", value: authorized, color: "var(--color-navy-600)" },
        { name: "Escalated", value: escalated, color: "var(--color-gold-400)" },
        { name: "Denied", value: denied, color: "#c2483d" },
      ],
      trend: s.trend.map((p) => ({
        day: new Date(p.date + "T00:00:00Z").toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" }),
        authorized: p.approved,
        escalated: p.total - p.approved,
      })),
      exceptionDelta: escalated + denied - prevExceptions,
    },
  };
}
