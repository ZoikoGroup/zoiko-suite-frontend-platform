// Policies & Controls console: URL state and the reads one render needs.
//
// Everything a reader can change lives in the URL (?q, filters, ?page, ?size,
// ?id, ?pane, ?new, ?months), so a filtered view or an open record can be
// bookmarked and shared, and the page renders on the server with no client
// state. Reads go out as the signed-in principal: policy-svc authorizes every
// one of them (POLICY_READ, CONTROL_TEST_DEFINITION_READ, …).

import { cache } from "react";
import type { ApiError, ApiResult } from "@/lib/api/client";
import type { SessionIdentity } from "@/lib/auth";
import * as P from "@/lib/api/policies";
import { listEntities, type LegalEntity } from "@/lib/api/tenants";
import { buildModel, type Model, type RowFilter } from "./model";

export const BASE = "/admin/policies";

export type Query = {
  q?: string;
  domain?: string;
  status?: string;
  type?: string;
  eff?: string;
  /** "overdue": only records past their review date. */
  due?: string;
  entity?: string;
  page?: string;
  size?: string;
  /** The row open in the drawer (policy_id or control_test_definition_id). */
  id?: string;
  pane?: string;
  /** "closed" keeps the drawer shut until a row is picked. */
  drawer?: string;
  /** Which create form is open under the header. */
  new?: string;
  /** Control Reviews window: 6 or 12 months. */
  months?: string;
  /** Version comparison in the History pane: base and target version ids (a plain GET form sets both). */
  cb?: string;
  ct?: string;
};

const KEYS: (keyof Query)[] = ["q", "domain", "status", "type", "eff", "entity", "due", "page", "size", "id", "pane", "drawer", "new", "months", "cb", "ct"];

/** The two versions ?cb and ?ct name, when both look like ids and differ. */
export function compareOf(q: Query): { base: string; target: string } | null {
  const id = /^[0-9a-f-]{36}$/i;
  const base = q.cb ?? "";
  const target = q.ct ?? "";
  return id.test(base) && id.test(target) && base !== target ? { base, target } : null;
}

export function queryOf(params: Record<string, string | string[] | undefined>): Query {
  const out: Query = {};
  for (const k of KEYS) {
    const v = params[k];
    const one = Array.isArray(v) ? v[0] : v;
    if (one) out[k] = one;
  }
  return out;
}

/** A link to this page with `changes` applied over `base` (undefined drops a key). */
export function href(base: Query, changes: Query = {}): string {
  const merged: Query = { ...base, ...changes };
  const sp = new URLSearchParams();
  for (const k of KEYS) {
    const v = merged[k];
    if (v !== undefined && v !== "") sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `${BASE}?${s}` : BASE;
}

export const FILTER_KEYS = ["q", "domain", "status", "type", "eff", "entity", "due"] as const;

export function filterOf(q: Query): RowFilter {
  return { q: q.q, domain: q.domain, status: q.status, type: q.type, eff: q.eff, entity: q.entity, due: q.due };
}

export function isFiltered(q: Query): boolean {
  return FILTER_KEYS.some((k) => !!q[k]);
}

export const PAGE_SIZES = [10, 25, 50] as const;

export function pageOf(q: Query): { page: number; size: number } {
  const size = PAGE_SIZES.includes(Number(q.size) as (typeof PAGE_SIZES)[number]) ? Number(q.size) : 10;
  const page = Math.max(1, Math.floor(Number(q.page) || 1));
  return { page, size };
}

export function monthsOf(q: Query): 6 | 12 {
  return q.months === "6" ? 6 : 12;
}

/** One read's outcome, kept with its error so a panel can say what failed. */
export type Read<T> = { data: T | null; error: ApiError | null };

export function settle<T>(r: ApiResult<T>): Read<T> {
  return r.ok ? { data: r.data, error: null } : { data: null, error: r.error };
}

/** Registers cap a page at 200; read every page, up to `cap` rows. */
async function readAll<T>(page: (cursor?: string) => Promise<ApiResult<P.PagedList<T>>>, cap = 2000): Promise<Read<T[]> & { truncated: boolean }> {
  const items: T[] = [];
  let cursor: string | undefined;
  while (items.length < cap) {
    const r = await page(cursor);
    if (!r.ok) return { data: null, error: r.error, truncated: false };
    items.push(...r.data.items);
    if (!r.data.next_cursor) return { data: items, error: null, truncated: false };
    cursor = r.data.next_cursor;
  }
  return { data: items, error: null, truncated: true };
}

/** At most this many controls have their executions read for one render. */
export const EXECUTION_READ_CAP = 150;

export type Console = {
  summary: Read<P.PolicySummary>;
  families: Read<P.PolicyFamily[]>;
  versions: Read<P.PolicyVersion[]>;
  controls: Read<P.ControlTestDefinition[]>;
  entities: Map<string, LegalEntity>;
  model: Model;
  /** Some register hit the read cap: figures cover what was read. */
  truncated: boolean;
  /** When the reads were made (ms): every "now" on the page is this one. */
  asOf: number;
};

export const loadConsole = cache(async (identity: SessionIdentity): Promise<Console> => {
  const [summary, families, versions, controls, entities] = await Promise.all([
    P.getPolicySummary(identity).then(settle),
    readAll((c) => P.listPolicyFamilies(identity, undefined, 200, c)),
    readAll((c) => P.listPolicyVersions(identity, undefined, 200, c)),
    readAll((c) => P.listControlTestDefinitions(identity, undefined, 200, c)),
    identity.tenantId ? listEntities(identity.tenantId, identity) : Promise.resolve(null),
  ]);

  // Each control's executions, latest period first. A control whose list
  // cannot be read is shown as not tested and counted as unread.
  const executions = new Map<string, P.ControlTestExecution[] | null>();
  const defs = (controls.data ?? []).slice(0, EXECUTION_READ_CAP);
  await Promise.all(
    defs.map(async (d) => {
      const r = await readAll((c) => P.listControlTestExecutions(d.control_test_definition_id, identity, 200, c), 400);
      executions.set(d.control_test_definition_id, r.data);
    }),
  );

  const asOf = Date.now();
  return {
    asOf,
    summary,
    families,
    versions,
    controls,
    entities: new Map((entities?.ok ? entities.data : []).map((e) => [e.legal_entity_id, e])),
    model: buildModel(families.data ?? [], versions.data ?? [], controls.data ?? [], executions, asOf),
    truncated: families.truncated || versions.truncated || controls.truncated || (controls.data?.length ?? 0) > EXECUTION_READ_CAP,
  };
});

// ── the open record's extra reads ────────────────────────────────────────────

export type PolicyDetail = {
  transitions: Read<(P.VersionTransition & { version_number?: number })[]>;
  evaluations: Read<P.Evaluation[]>;
  attestations: Read<P.Attestation[]>;
  /** The family's PDC-05 test suite (certified types only; null data otherwise). */
  testCases: Read<P.TestCase[]>;
  /** Certification state and waivers per live-able version (not superseded or retired). */
  certification: Map<string, { state: Read<P.Certification>; waivers: Read<P.Waiver[]> }>;
  /** The History pane's comparison, when ?cmp names two versions. */
  comparison: Read<P.Comparison> | null;
};

/** Versions that can still move through the lifecycle, so certification matters for them. */
const LIVE_ABLE = new Set(["DRAFT", "REVIEW", "APPROVED", "SCHEDULED", "ACTIVE", "SUSPENDED"]);

export type ControlDetail = {
  effectiveness: Read<P.ControlEffectiveness>;
  attestations: Read<P.Attestation[]>;
};

export async function loadPolicyDetail(
  identity: SessionIdentity,
  family: P.PolicyFamily,
  versions: P.PolicyVersion[],
  cmp: { base: string; target: string } | null = null,
): Promise<PolicyDetail> {
  const certified = P.CERTIFIED_POLICY_TYPES.includes(family.policy_type);
  const live = certified ? versions.filter((v) => LIVE_ABLE.has(v.version_status)).slice(0, 10) : [];
  const [transitions, evaluations, attestations, testCases, certs, comparison] = await Promise.all([
    Promise.all(
      versions.slice(0, 25).map(async (v) => {
        const r = await readAll((c) => P.listTransitions(v.policy_version_id, identity, 200, c), 400);
        return { error: r.error, items: (r.data ?? []).map((x) => ({ ...x, version_number: v.version_number })) };
      }),
    ).then((parts): Read<(P.VersionTransition & { version_number?: number })[]> => {
      const failed = parts.find((p) => p.error !== null);
      if (failed) return { data: null, error: failed.error };
      const all = parts.flatMap((p) => p.items);
      return { data: all.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)), error: null };
    }),
    P.listEvaluations(identity, { policy_type: family.policy_type }, 200).then((r) =>
      r.ok ? { data: r.data.items.filter((e) => e.policy_id === family.policy_id), error: null } : { data: null, error: r.error },
    ),
    P.listAttestations(identity, { subject_ref: family.policy_code }, 50).then((r) => (r.ok ? { data: r.data.items, error: null } : { data: null, error: r.error })),
    certified
      ? readAll((c) => P.listPolicyTestCases(family.policy_id, identity, 200, c), 400).then((r) => ({ data: r.data, error: r.error }))
      : Promise.resolve<Read<P.TestCase[]>>({ data: null, error: null }),
    Promise.all(
      live.map(async (v) => {
        const [state, waivers] = await Promise.all([
          P.getPolicyVersionCertification(v.policy_version_id, identity).then(settle),
          P.listPolicyTestWaivers(v.policy_version_id, identity, 100).then((r) => (r.ok ? { data: r.data.items, error: null } : { data: null, error: r.error })),
        ]);
        return [v.policy_version_id, { state, waivers }] as const;
      }),
    ),
    cmp ? P.comparePolicyVersions(cmp.base, cmp.target, identity).then(settle) : Promise.resolve(null),
  ]);
  return { transitions, evaluations, attestations, testCases, certification: new Map(certs), comparison };
}

export async function loadControlDetail(identity: SessionIdentity, control: P.ControlTestDefinition): Promise<ControlDetail> {
  const [effectiveness, attestations] = await Promise.all([
    P.getControlEffectiveness(control.control_ref, identity).then(settle),
    P.listAttestations(identity, { subject_ref: control.control_ref }, 50).then((r) => (r.ok ? { data: r.data.items, error: null } : { data: null, error: r.error })),
  ]);
  return { effectiveness, attestations };
}

export function entityName(entities: Map<string, LegalEntity>, id: string): string {
  const e = entities.get(id);
  return e ? e.trading_name || e.legal_name : `${id.slice(0, 8)}…`;
}
