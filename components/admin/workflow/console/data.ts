// Workflows & Approvals console: URL state, the reads one render needs, and
// the row model the register, KPIs and drawer share.
//
// Everything a reader can change lives in the URL (?tab, filters, ?page,
// ?size, ?id), so a filtered view or an open workflow can be bookmarked and
// shared, and the page renders on the server with no client state.
//
// workflow-svc stores no title or priority for an instance. The title is the
// route's name (the definition it started from) or its workflow type; there is
// no priority column, and the console does not invent one. Who must decide a
// stage is on the stage, not the instance, so the open workflows are read one
// by one (capped) to tell which are waiting on the viewer.

import type { SessionIdentity } from "@/lib/auth";
import type { ApiError, ApiResult } from "@/lib/api/client";
import { person } from "@/lib/directory";
import { humanizeCode, humanizeKey } from "@/lib/humanize";
import { listPrincipals, type PrincipalDetail } from "@/lib/api/identity";
import { listEntities, type LegalEntity } from "@/lib/api/tenants";
import {
  getApprovalEvidence,
  getWorkflow,
  listPendingApprovals,
  listWorkflowDefinitions,
  listWorkflows,
  type WorkflowDefinition,
  type WorkflowInstance,
  type WorkflowStage,
  type WorkflowTransition,
  type WorkflowWithStages,
} from "@/lib/api/workflow";

export const BASE = "/admin/workflows";

export type Query = Record<string, string | undefined>;

export const TABS = [
  { key: "mine", label: "My Approvals" },
  { key: "requests", label: "My Requests" },
  { key: "all", label: "All Workflows" },
  { key: "history", label: "History" },
] as const;
export type TabKey = (typeof TABS)[number]["key"];

export const PAGE_SIZES = [8, 25, 50] as const;

/** The filters the register's URL can carry. */
export const FILTER_KEYS = ["q", "type", "entity", "status", "deadline"] as const;

/** Open workflows read one by one for their stages. Beyond this the
 *  register still lists them, without the stage detail. */
export const DETAIL_CAP = 60;

/** A stage due within this many hours is "due soon". */
export const DUE_SOON_HOURS = 48;

export const OPEN = new Set(["PENDING", "ESCALATED"]);

export function href(base: Query, changes: Query = {}): string {
  const merged: Query = { ...base, ...changes };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "") params.set(k, v);
  const s = params.toString();
  return s ? `${BASE}?${s}` : BASE;
}

export function tabOf(q: Query): TabKey {
  return TABS.some((t) => t.key === q.tab) ? (q.tab as TabKey) : "mine";
}

export function pageOf(q: Query): { page: number; size: number } {
  const page = Math.max(1, Math.floor(Number(q.page) || 1));
  const size = (PAGE_SIZES as readonly number[]).includes(Number(q.size)) ? Number(q.size) : PAGE_SIZES[0];
  return { page, size };
}

export function isFiltered(q: Query): boolean {
  return FILTER_KEYS.some((k) => !!q[k]);
}

/** One read's outcome, kept with its error so a panel can say what failed. */
export type Read<T> = { data: T | null; error: ApiError | null };

function settle<T>(r: ApiResult<T>): Read<T> {
  return r.ok ? { data: r.data, error: null } : { data: null, error: r.error };
}

// ── row model ────────────────────────────────────────────────────────────────

export type DeadlineKey = "overdue" | "soon" | "on_track" | "none" | "closed";

export type Row = {
  wf: WorkflowInstance;
  /** Short display reference, "WF-3F2A9C1B". The full id is a hover away. */
  ref: string;
  title: string;
  description: string;
  typeLabel: string;
  requester: string;
  /** Loaded for open workflows (up to DETAIL_CAP). */
  stages?: WorkflowStage[];
  current?: WorkflowStage;
  /** The deadline that applies now: the current stage's, else the workflow's. */
  due?: string;
  deadline: DeadlineKey;
  /** The current stage is waiting on the viewer (named, in the pool, or the escalation owner). */
  mine: boolean;
  /** The current stage is routed to a role; whether the viewer holds it is authorization-svc's call. */
  roleRouted: boolean;
  open: boolean;
};

export function refOf(id: string): string {
  return `WF-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export type Directory = {
  name: (principalId: string | null | undefined) => string;
  entity: (legalEntityId: string | null | undefined) => string;
  definition: (id: string | null | undefined) => WorkflowDefinition | undefined;
};

export function makeDirectory(
  principals: PrincipalDetail[],
  entities: Map<string, LegalEntity>,
  definitions: WorkflowDefinition[],
): Directory {
  const people = new Map(principals.map((p) => [p.principal_id, p.display_name || p.email] as const));
  const defs = new Map(definitions.map((d) => [d.workflow_definition_id, d] as const));
  return {
    name(id) {
      const key = (id ?? "").trim();
      if (!key) return "—";
      const listed = people.get(key);
      if (listed) return listed;
      return person(key).name;
    },
    entity(id) {
      const key = (id ?? "").trim();
      if (!key) return "—";
      const e = entities.get(key);
      if (e) return e.trading_name || e.legal_name;
      return `${key.slice(0, 8)}…`;
    },
    definition(id) {
      return id ? defs.get(id) : undefined;
    },
  };
}

export function titleOf(wf: WorkflowInstance, dir: Directory): string {
  const def = dir.definition(wf.workflow_definition_id);
  return def?.name?.trim() || humanizeCode(wf.workflow_type) || wf.workflow_type;
}

export function descriptionOf(wf: WorkflowInstance, dir: Directory, stageCount?: number): string {
  if (wf.subject_type && wf.subject_id) {
    const v = wf.subject_version ? ` v${wf.subject_version}` : "";
    return `${humanizeKey(wf.subject_type)} ${wf.subject_id.length > 14 ? `${wf.subject_id.slice(0, 8)}…` : wf.subject_id}${v}`;
  }
  const def = dir.definition(wf.workflow_definition_id);
  if (def?.description?.trim()) return def.description.trim();
  if (stageCount) return `${stageCount}-stage approval`;
  return `Started by ${dir.name(wf.initiated_by)}`;
}

/** The stage waiting for a decision, when the workflow is open. */
export function currentStageOf(wf: WorkflowInstance, stages?: WorkflowStage[]): WorkflowStage | undefined {
  if (!stages?.length || !OPEN.has(String(wf.workflow_status))) return undefined;
  return stages.find((s) => s.stage_order === wf.current_stage) ?? stages.find((s) => s.stage_status === "PENDING");
}

export function deadlineOf(wf: WorkflowInstance, current: WorkflowStage | undefined, now: number): { due?: string; deadline: DeadlineKey } {
  if (!OPEN.has(String(wf.workflow_status))) return { due: wf.due_at ?? undefined, deadline: "closed" };
  const candidates = [current?.due_at, wf.due_at].filter((d): d is string => !!d && !Number.isNaN(Date.parse(d)));
  if (candidates.length === 0) return { deadline: "none" };
  const due = candidates.sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const left = Date.parse(due) - now;
  if (left < 0) return { due, deadline: "overdue" };
  if (left <= DUE_SOON_HOURS * 3600_000) return { due, deadline: "soon" };
  return { due, deadline: "on_track" };
}

/** Is the current stage waiting on this principal? */
export function waitsOn(wf: WorkflowInstance, current: WorkflowStage | undefined, principalId: string): boolean {
  if (!OPEN.has(String(wf.workflow_status))) return false;
  // An escalated workflow with a named owner is decided by that owner.
  if (wf.workflow_status === "ESCALATED" && wf.escalation_target) return wf.escalation_target === principalId;
  if (!current) return false;
  if (current.approver_principal_id) return current.approver_principal_id === principalId;
  if (current.quorum_approvers?.length) return current.quorum_approvers.includes(principalId);
  return false;
}

export function buildRow(wf: WorkflowInstance, stages: WorkflowStage[] | undefined, dir: Directory, me: string, now: number): Row {
  const current = currentStageOf(wf, stages);
  const { due, deadline } = deadlineOf(wf, current, now);
  const open = OPEN.has(String(wf.workflow_status));
  return {
    wf,
    ref: refOf(wf.workflow_instance_id),
    title: titleOf(wf, dir),
    description: descriptionOf(wf, dir, stages?.length),
    typeLabel: humanizeCode(wf.workflow_type) || wf.workflow_type,
    requester: dir.name(wf.initiated_by),
    stages,
    current,
    due,
    deadline,
    mine: waitsOn(wf, current, me),
    roleRouted: open && !!current && !!current.approver_role && !current.approver_principal_id && !current.quorum_approvers?.length,
    open,
  };
}

// ── loading ──────────────────────────────────────────────────────────────────

export type ConsoleData = {
  /** The tenant's latest workflows (one page). */
  all: Read<WorkflowInstance[]>;
  /** True when the page is full, so older workflows exist that are not counted. */
  truncated: boolean;
  pending: Read<WorkflowInstance[]>;
  definitions: Read<WorkflowDefinition[]>;
  rows: Row[];
  /** Open workflows whose stages were not read (beyond DETAIL_CAP or refused). */
  unread: number;
  dir: Directory;
  entities: LegalEntity[];
};

/** Names for people, entities and routes, and the people a picker offers. */
export async function loadDirectory(
  identity: SessionIdentity,
  definitionsRead?: Promise<ApiResult<WorkflowDefinition[]>>,
): Promise<{ dir: Directory; people: { id: string; name: string }[]; entities: LegalEntity[]; definitions: Read<WorkflowDefinition[]> }> {
  const caller = identity as SessionIdentity & { principalId: string; tenantId: string };
  const [definitions, entities, principals] = await Promise.all([
    definitionsRead ?? listWorkflowDefinitions(identity),
    identity.tenantId ? listEntities(identity.tenantId, identity) : Promise.resolve({ ok: false } as ApiResult<LegalEntity[]>),
    listPrincipals(caller, { pageSize: 200 }),
  ]);
  const entityMap = new Map<string, LegalEntity>();
  if (entities.ok) for (const e of entities.data ?? []) entityMap.set(e.legal_entity_id, e);
  const defs = definitions.ok ? (definitions.data ?? []) : [];
  const listed = principals.ok ? (principals.data.items ?? []) : [];
  const dir = makeDirectory(listed, entityMap, defs);
  // Only people decide approvals: service accounts are left out of pickers.
  const people = listed
    .filter((p) => p.principal_type === "HUMAN" && (p.status === "ACTIVE" || !p.status))
    .map((p) => ({ id: p.principal_id, name: p.display_name || p.email || p.principal_id }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { dir, people, entities: [...entityMap.values()], definitions: settle(definitions) };
}

export async function loadConsole(identity: SessionIdentity): Promise<ConsoleData> {
  const [all, pending, directory] = await Promise.all([
    listWorkflows(identity, { limit: 200 }),
    listPendingApprovals(identity, { limit: 200 }),
    loadDirectory(identity),
  ]);
  const { dir } = directory;

  // Every workflow either list returned, newest first, once.
  const byId = new Map<string, WorkflowInstance>();
  for (const wf of [...(all.ok ? all.data.records : []), ...(pending.ok ? pending.data : [])]) {
    if (!byId.has(wf.workflow_instance_id)) byId.set(wf.workflow_instance_id, wf);
  }
  const instances = [...byId.values()].sort((a, b) => Date.parse(b.started_at ?? b.created_at ?? "") - Date.parse(a.started_at ?? a.created_at ?? ""));

  // Stages of the open ones, which say who each is waiting on.
  const open = instances.filter((wf) => OPEN.has(String(wf.workflow_status))).slice(0, DETAIL_CAP);
  const details = await Promise.all(open.map((wf) => getWorkflow(wf.workflow_instance_id, identity)));
  const stagesById = new Map<string, WorkflowStage[]>();
  const fresh = new Map<string, WorkflowWithStages>();
  details.forEach((d) => {
    if (d.ok) {
      stagesById.set(d.data.workflow_instance_id, d.data.stages ?? []);
      fresh.set(d.data.workflow_instance_id, d.data);
    }
  });

  const now = Date.now();
  const me = identity.principalId;
  const rows = instances.map((wf) => {
    const latest = fresh.get(wf.workflow_instance_id);
    const base: WorkflowInstance = latest ? { ...wf, ...latest } : wf;
    return buildRow(base, stagesById.get(wf.workflow_instance_id), dir, me, now);
  });
  const openTotal = instances.filter((wf) => OPEN.has(String(wf.workflow_status))).length;

  return {
    all: all.ok ? { data: all.data.records, error: null } : { data: null, error: all.error },
    truncated: all.ok && all.data.records.length >= 200,
    pending: settle(pending),
    definitions: directory.definitions,
    rows,
    unread: openTotal - stagesById.size,
    dir,
    entities: directory.entities,
  };
}

/** The register rows for a tab, after the URL's filters. */
export function rowsFor(tab: TabKey, rows: Row[], q: Query, me: string): Row[] {
  let out: Row[];
  switch (tab) {
    case "mine":
      out = rows.filter((r) => r.mine);
      break;
    case "requests":
      out = rows.filter((r) => r.wf.initiated_by === me);
      break;
    case "history":
      out = rows.filter((r) => !r.open);
      break;
    default:
      out = rows;
  }
  const needle = (q.q ?? "").trim().toLowerCase();
  if (needle) {
    out = out.filter((r) =>
      [r.ref, r.wf.workflow_instance_id, r.title, r.description, r.typeLabel, r.wf.workflow_type, r.requester, r.wf.subject_id ?? "", r.wf.subject_type ?? ""]
        .some((v) => v.toLowerCase().includes(needle)),
    );
  }
  if (q.type) out = out.filter((r) => r.wf.workflow_type === q.type);
  if (q.entity) out = out.filter((r) => r.wf.legal_entity_id === q.entity);
  if (q.status) out = out.filter((r) => r.wf.workflow_status === q.status);
  if (q.deadline) out = out.filter((r) => r.deadline === q.deadline);
  if (tab === "mine") {
    // The approver's queue: most urgent first, then the soonest deadline.
    const rank: Record<DeadlineKey, number> = { overdue: 0, soon: 1, on_track: 2, none: 3, closed: 4 };
    out = [...out].sort((a, b) => rank[a.deadline] - rank[b.deadline] || (Date.parse(a.due ?? "") || Infinity) - (Date.parse(b.due ?? "") || Infinity));
  }
  return out;
}

// ── the selected workflow ────────────────────────────────────────────────────

export type WorkflowDetail = {
  workflow: Read<WorkflowWithStages>;
  trail: Read<WorkflowTransition[]>;
  /** When it was read: deadlines are measured against this. */
  readAt: number;
};

export async function loadDetail(id: string, identity: SessionIdentity): Promise<WorkflowDetail> {
  const [workflow, trail] = await Promise.all([getWorkflow(id, identity).then(settle), getApprovalEvidence(id, identity).then(settle)]);
  return { workflow, trail, readAt: Date.now() };
}

// ── trend ────────────────────────────────────────────────────────────────────

export type TrendPoint = { date: string; label: string; approved: number };

/** Workflows approved per day over the last `days`, by when they completed. */
export function approvalTrend(rows: Row[], days: number, now = Date.now()): TrendPoint[] {
  const dayMs = 86_400_000;
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  const start = end.getTime() - (days - 1) * dayMs;
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.wf.workflow_status !== "APPROVED") continue;
    const at = Date.parse(r.wf.completed_at ?? r.wf.updated_at ?? "");
    if (Number.isNaN(at) || at < start) continue;
    const key = new Date(at).toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start + i * dayMs);
    const key = d.toISOString().slice(0, 10);
    return {
      date: key,
      label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
      approved: counts.get(key) ?? 0,
    };
  });
}

// ── stage wording ────────────────────────────────────────────────────────────

/** A stage's short name for the progress line: its role, its approver, or its quorum. */
export function stageLabel(stage: Pick<WorkflowStage, "approver_role" | "approver_principal_id" | "quorum_approvers" | "required_approvals" | "stage_order">, dir: Directory): string {
  if (stage.approver_role) return humanizeCode(stage.approver_role) || stage.approver_role;
  if (stage.quorum_approvers?.length) return `${stage.required_approvals ?? "?"} of ${stage.quorum_approvers.length} approvers`;
  if (stage.approver_principal_id) return dir.name(stage.approver_principal_id);
  return `Stage ${stage.stage_order}`;
}

/** Everyone a stage names: its approver or its pool. */
export function stagePeople(stage: Pick<WorkflowStage, "approver_principal_id" | "quorum_approvers">): string[] {
  if (stage.quorum_approvers?.length) return stage.quorum_approvers;
  return stage.approver_principal_id ? [stage.approver_principal_id] : [];
}

export type SodFinding = { ok: boolean; text: string };

/**
 * The segregation-of-duties rules workflow-svc enforces, checked against the
 * route as stored: the initiator is no stage's approver, nobody is named in
 * two stages, and nobody decided two stages. The service refuses a breach
 * whatever this says; this shows the reader that the route is clean.
 */
export function sodFindings(wf: WorkflowInstance, stages: WorkflowStage[], dir: Directory): SodFinding[] {
  const out: SodFinding[] = [];
  const initiatorNamed = stages.filter((s) => stagePeople(s).includes(wf.initiated_by));
  if (initiatorNamed.length) {
    out.push({ ok: false, text: `${dir.name(wf.initiated_by)} started this workflow and is named in stage ${initiatorNamed.map((s) => s.stage_order).join(", ")}.` });
  }
  const seen = new Map<string, number>();
  for (const s of stages) {
    for (const p of stagePeople(s)) {
      const first = seen.get(p);
      if (first !== undefined && first !== s.stage_order) out.push({ ok: false, text: `${dir.name(p)} is named in stages ${first} and ${s.stage_order}.` });
      else seen.set(p, s.stage_order);
    }
  }
  const deciders = new Map<string, number[]>();
  for (const s of stages) {
    if (s.acted_by) deciders.set(s.acted_by, [...(deciders.get(s.acted_by) ?? []), s.stage_order]);
  }
  for (const [who, orders] of deciders) {
    if (orders.length > 1) out.push({ ok: false, text: `${dir.name(who)} decided stages ${orders.join(" and ")}.` });
    if (who === wf.initiated_by) out.push({ ok: false, text: `${dir.name(who)} started this workflow and decided stage ${orders.join(", ")}.` });
  }
  return out;
}
