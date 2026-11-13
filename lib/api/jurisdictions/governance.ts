// Rollout governance (ZS-JUR wave 8) and remediation cases (wave 7).
//
// A rollout is how a jurisdiction becomes supported: PLANNED → AUTHORING →
// READY → LAUNCHED, gated by a checklist with evidence and an expert approval;
// the database refuses a transition the gates do not allow. A remediation
// case collects every decision made with a pack version that was rolled back
// or withdrawn, and stays open until each has a disposition.

import type { ApiResult, ApiWriteResult, Identity } from "../client";
import { get, listAll, post, put, seg, type Caller } from "./core";

export type Rollout = {
  rollout_id: string;
  family_ref: string;
  display_name: string;
  layer: string;
  jurisdiction_code: string | null;
  scope_note: string;
  owner: string;
  support_owner: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type RolloutDetail = {
  rollout: Rollout;
  checklist: { code: string; checklist: string; text: string; met: boolean; evidence_ref: string; attested_by: string; attested_at: string | null }[] | null;
  expert_approvals: { expert: string; qualification: string; scope: string; decision: string; notes: string; decided_at: string }[] | null;
  pack_refs: string[] | null;
  events: { from_status: string | null; to_status: string; actor: string; reason: string; occurred_at: string }[] | null;
  blockers: Record<string, string[]> | null;
};

export const ROLLOUT_LAYERS = ["GLOBAL_REFERENCE", "GLOBAL_CORE", "REGIONAL_FRAMEWORK", "COUNTRY", "SUBDIVISION"] as const;
export const ROLLOUT_STATUSES = ["PLANNED", "AUTHORING", "READY", "LAUNCHED", "SUSPENDED", "RETIRED"] as const;

/** The transitions the database allows from each state. */
export const ROLLOUT_NEXT: Record<string, string[]> = {
  PLANNED: ["AUTHORING", "RETIRED"],
  AUTHORING: ["READY", "RETIRED"],
  READY: ["AUTHORING", "LAUNCHED", "RETIRED"],
  LAUNCHED: ["SUSPENDED", "RETIRED"],
  SUSPENDED: ["LAUNCHED", "RETIRED"],
};

export function listRollouts(identity: Identity, status?: string): Promise<ApiResult<Rollout[]>> {
  return listAll<Rollout>("/v1/admin/rollouts", identity, { status });
}

export function getRollout(id: string, identity: Identity): Promise<ApiResult<RolloutDetail>> {
  return get<RolloutDetail>(`/v1/admin/rollouts/${seg(id)}`, identity);
}

export function listRolloutChecklists(identity: Identity): Promise<ApiResult<{ code: string; checklist: string; text: string }[] | { items: { code: string; checklist: string; text: string }[] }>> {
  return get("/v1/rollout-checklists", identity);
}

export function getJurisdictionSupport(code: string, identity: Identity): Promise<ApiResult<{ jurisdiction_code: string; supported: boolean; outcome: string; rollouts: { family_ref: string; status: string }[] | null; explanation: string }>> {
  return get(`/v1/jurisdiction-support/${seg(code)}`, identity);
}

export function createRollout(
  input: { familyRef: string; displayName: string; layer: string; jurisdictionCode?: string; scopeNote: string; owner: string; supportOwner?: string },
  identity: Caller,
): Promise<ApiWriteResult<Rollout>> {
  return post<Rollout>(
    "/v1/admin/rollouts",
    {
      family_ref: input.familyRef,
      display_name: input.displayName,
      layer: input.layer,
      scope_note: input.scopeNote,
      owner: input.owner,
      ...(input.jurisdictionCode ? { jurisdiction_code: input.jurisdictionCode } : {}),
      ...(input.supportOwner ? { support_owner: input.supportOwner } : {}),
    },
    identity,
  );
}

export function seedRolloutPortfolio(identity: Caller): Promise<ApiWriteResult<unknown>> {
  return post("/v1/admin/rollouts:seed-portfolio", undefined, identity);
}

export function setRolloutOwner(id: string, input: { owner: string; supportOwner?: string }, identity: Caller): Promise<ApiWriteResult<unknown>> {
  return put(`/v1/admin/rollouts/${seg(id)}/owner`, { owner: input.owner, ...(input.supportOwner ? { support_owner: input.supportOwner } : {}) }, identity);
}

export function linkRolloutPacks(id: string, packRefs: string[], identity: Caller): Promise<ApiWriteResult<unknown>> {
  return put(`/v1/admin/rollouts/${seg(id)}/packs`, { pack_refs: packRefs }, identity);
}

export function attestRollout(id: string, input: { checklist: string; itemCode: string; met: boolean; evidenceRef: string }, identity: Caller): Promise<ApiWriteResult<unknown>> {
  return post(`/v1/admin/rollouts/${seg(id)}/attestations`, { checklist: input.checklist, item_code: input.itemCode, met: input.met, evidence_ref: input.evidenceRef }, identity);
}

export function approveRolloutAsExpert(
  id: string,
  input: { qualification: string; scope: string; decision: "APPROVE" | "REJECT"; notes: string },
  identity: Caller,
): Promise<ApiWriteResult<unknown>> {
  return post(`/v1/admin/rollouts/${seg(id)}/expert-approvals`, input, identity);
}

export function transitionRollout(id: string, to: string, reason: string, identity: Caller): Promise<ApiWriteResult<unknown>> {
  return post(`/v1/admin/rollouts/${seg(id)}/transition`, { to, reason }, identity);
}

// ─── Remediation ─────────────────────────────────────────────────────────────

export type RemediationCase = {
  case_id: string;
  pack_ref: string;
  version: string;
  trigger: "ROLLBACK" | "WITHDRAW" | "MANUAL" | string;
  ring_code: string | null;
  region_code: string | null;
  reason: string;
  evidence_ref: string | null;
  status: "OPEN" | "CLOSED" | string;
  decisions_total: number;
  opened_by: string;
  opened_at: string;
  closed_by: string | null;
  closed_at: string | null;
  closure_note: string | null;
  progress: { total: number; dispositioned: number; pending: number; by_disposition: Record<string, number> | null } | null;
};

export type RemediationDecision = {
  decision_id: string;
  decision_kind: string;
  outcome: string;
  effective_at: string;
  decided_at: string;
  requested_by: string;
  disposition: { disposition: string; evidence_ref: string; note: string | null; recorded_by: string; recorded_at: string } | null;
};

export const DISPOSITIONS = ["RECONFIRMED", "NOT_AFFECTED", "RECALCULATED", "SUPERSEDED_BY_NEW_DECISION"] as const;

export function listRemediationCases(identity: Identity, status?: "OPEN" | "CLOSED"): Promise<ApiResult<RemediationCase[]>> {
  return listAll<RemediationCase>("/v1/admin/remediation-cases", identity, { status });
}

export function getRemediationCase(id: string, identity: Identity): Promise<ApiResult<RemediationCase>> {
  return get<RemediationCase>(`/v1/admin/remediation-cases/${seg(id)}`, identity);
}

export function listCaseDecisions(id: string, identity: Identity): Promise<ApiResult<RemediationDecision[]>> {
  return listAll<RemediationDecision>(`/v1/admin/remediation-cases/${seg(id)}/decisions`, identity);
}

export function openRemediationCase(
  input: { packRef: string; version: string; ring?: string; region?: string; reason: string; evidenceRef: string },
  identity: Caller,
): Promise<ApiWriteResult<RemediationCase>> {
  return post<RemediationCase>(
    "/v1/admin/remediation-cases",
    { pack_ref: input.packRef, version: input.version, reason: input.reason, evidence_ref: input.evidenceRef, ...(input.ring ? { ring: input.ring } : {}), ...(input.region ? { region: input.region } : {}) },
    identity,
  );
}

export function recordDispositions(
  id: string,
  dispositions: { decision_id: string; disposition: string; evidence_ref: string; note?: string; new_decision_id?: string }[],
  identity: Caller,
): Promise<ApiWriteResult<{ recorded: number; replayed: number }>> {
  return post(`/v1/admin/remediation-cases/${seg(id)}/dispositions`, { dispositions }, identity);
}

export function closeRemediationCase(id: string, note: string, identity: Caller): Promise<ApiWriteResult<RemediationCase>> {
  return post<RemediationCase>(`/v1/admin/remediation-cases/${seg(id)}/close`, { note }, identity);
}
