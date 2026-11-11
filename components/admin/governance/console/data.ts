// Governance Log console: URL state and the reads one render needs.
//
// Everything a reader can change lives in the URL (?tab, ?days, filters,
// ?page, ?size, ?id, ?pane), so a filtered view or an open record can be
// bookmarked and shared, and the page renders on the server with no client
// state.

import type { SessionIdentity } from "@/lib/auth";
import type { ApiError, ApiResult } from "@/lib/api/client";
import {
  getDecision,
  getDecisionEvidence,
  getDecisionSummary,
  listAllReplays,
  listDecisionRecords,
  listPackages,
  listReplayManifests,
  type DecisionEvidence,
  type DecisionFilters,
  type DecisionPage,
  type DecisionSummary,
  type EvidencePackage,
  type GovernanceDecision,
  type ReplayManifest,
} from "@/lib/api/governance";
import { listEntities, type LegalEntity } from "@/lib/api/tenants";

export const BASE = "/admin/governance";

export type Query = Record<string, string | undefined>;

export const TABS = [
  { key: "decisions", label: "Decisions" },
  { key: "replays", label: "Replays" },
  { key: "evidence", label: "Evidence chain" },
] as const;
export type TabKey = (typeof TABS)[number]["key"];

export const PERIODS = [
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
  ["365", "Last 12 months"],
] as const;

export const PAGE_SIZES = [10, 25, 50] as const;

/** The decision filters the register's URL can carry. */
export const FILTER_KEYS = ["q", "domain", "status", "priority", "jurisdiction", "actor", "entity", "action", "rule_basis", "from", "to"] as const;

/** A link to this page with `changes` applied over `base` (undefined drops a key). */
export function href(base: Query, changes: Query = {}): string {
  const merged: Query = { ...base, ...changes };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "") params.set(k, v);
  const s = params.toString();
  return s ? `${BASE}?${s}` : BASE;
}

export function tabOf(q: Query): TabKey {
  return TABS.some((t) => t.key === q.tab) ? (q.tab as TabKey) : "decisions";
}

export function daysOf(q: Query): number {
  const n = Number(q.days);
  return PERIODS.some(([d]) => Number(d) === n) ? n : 30;
}

export function pageOf(q: Query): { page: number; size: number } {
  const page = Math.max(1, Math.floor(Number(q.page) || 1));
  const size = (PAGE_SIZES as readonly number[]).includes(Number(q.size)) ? Number(q.size) : 10;
  return { page, size };
}

/** datetime-local / date input → RFC3339 the service accepts. */
function rfc3339(v: string | undefined, endOfDay = false): string | undefined {
  if (!v) return undefined;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T${endOfDay ? "23:59:59" : "00:00:00"}Z` : v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function filtersOf(q: Query): DecisionFilters {
  const { page, size } = pageOf(q);
  return {
    q: q.q,
    domain: q.domain,
    status: q.status,
    priority: q.priority,
    jurisdiction: q.jurisdiction,
    actor: q.actor,
    entity: q.entity,
    action: q.action,
    ruleBasis: q.rule_basis,
    from: rfc3339(q.from),
    to: rfc3339(q.to, true),
    limit: size,
    offset: (page - 1) * size,
  };
}

export function isFiltered(q: Query): boolean {
  return FILTER_KEYS.some((k) => !!q[k]);
}

/** One read's outcome, kept with its error so a panel can say what failed. */
export type Read<T> = { data: T | null; error: ApiError | null };

function settle<T>(r: ApiResult<T>): Read<T> {
  return r.ok ? { data: r.data, error: null } : { data: null, error: r.error };
}

export type DecisionDetail = {
  decision: Read<GovernanceDecision>;
  evidence: Read<DecisionEvidence>;
  followUps: Read<DecisionPage>;
  causedBy: GovernanceDecision | null;
  replays: Read<ReplayManifest[]>;
};

export type GovernanceData = {
  summary: Read<DecisionSummary>;
  decisions: Read<DecisionPage> | null;
  replays: Read<{ records: ReplayManifest[]; total_count: number }> | null;
  packages: Read<{ records: EvidencePackage[]; total_count: number }>;
  entities: Map<string, LegalEntity>;
  detail: DecisionDetail | null;
};

/** Every read one render needs, in parallel. */
export async function loadGovernance(identity: SessionIdentity, q: Query): Promise<GovernanceData> {
  const tab = tabOf(q);
  const { page, size } = pageOf(q);
  const [summary, decisions, replays, packages, entities, detail] = await Promise.all([
    getDecisionSummary({ days: daysOf(q) }, identity).then(settle),
    tab === "decisions" ? listDecisionRecords(filtersOf(q), identity).then(settle) : Promise.resolve(null),
    tab === "replays"
      ? listAllReplays({ limit: size, offset: (page - 1) * size, mismatches: q.mismatches === "true" }, identity).then(settle)
      : Promise.resolve(null),
    listPackages(identity).then(settle),
    identity.tenantId ? listEntities(identity.tenantId, identity) : Promise.resolve({ ok: false } as ApiResult<LegalEntity[]>),
    tab === "decisions" && q.id ? loadDetail(q.id, identity) : Promise.resolve(null),
  ]);
  const byId = new Map<string, LegalEntity>();
  if (entities.ok) for (const e of entities.data) byId.set(e.legal_entity_id, e);
  return { summary, decisions, replays, packages, entities: byId, detail };
}

export async function loadDetail(id: string, identity: SessionIdentity): Promise<DecisionDetail> {
  const [decision, evidence, followUps, replays] = await Promise.all([
    getDecision(id, identity).then(settle),
    getDecisionEvidence(id, identity).then(settle),
    listDecisionRecords({ causation: id, limit: 50 }, identity).then(settle),
    listReplayManifests(id, identity).then(settle),
  ]);
  let causedBy: GovernanceDecision | null = null;
  const cause = decision.data?.causation_id;
  if (cause) {
    const parent = await getDecision(cause, identity);
    if (parent.ok) causedBy = parent.data;
  }
  return { decision, evidence, followUps, causedBy, replays };
}

/** The entity's display name, else a short id. */
export function entityName(entities: Map<string, LegalEntity>, id: string): string {
  const e = entities.get(id);
  if (e) return e.trading_name || e.legal_name;
  if (id === "PLATFORM") return "Platform";
  return id ? `${id.slice(0, 8)}…` : "—";
}
