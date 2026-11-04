// Everything in the Authorization area that is waiting for a second person,
// gathered into one list — the "pending authorisations" view every banking
// back office has. Server-only (reads lib/directory and the session).
//
// Wrapped in React's cache(), so the layout's badge and the page's list share
// one set of reads per request.

import { cache } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, toIdentity, type SessionIdentity, type SessionPayload } from "@/lib/auth";
import {
  isAssignmentActive,
  listABACRules,
  listAuthorityLimits,
  listBreakGlassSessions,
  listPrivilegedSessions,
  listRoleAssignments,
  listRoles,
  listSoDExceptions,
  listSoDRules,
  type ABACRule,
  type AuthorityLimit,
  type BreakGlassSession,
  type PrivilegedSession,
  type Role,
  type RoleAssignment,
  type SoDException,
  type SoDRule,
} from "@/lib/api/authorization";
import type { ApiError } from "@/lib/api/client";
import { person } from "@/lib/directory";

export type ApprovalKind = "grant" | "jit" | "break_glass" | "sod_rule" | "abac_rule" | "limit" | "sod_exception";

export const KIND_LABEL: Record<ApprovalKind, string> = {
  grant: "Role grant",
  jit: "Just-in-time access",
  break_glass: "Emergency access",
  sod_rule: "Separation-of-duties rule",
  abac_rule: "Access condition",
  limit: "Authority limit",
  sod_exception: "Duty-conflict exception",
};

export type ApprovalItem = {
  key: string;
  kind: ApprovalKind;
  id: string;
  /** e.g. "Grant FINANCE_APPROVER to Chief Financial Officer". */
  title: string;
  detail: string;
  requestedBy: string | null;
  /** Whom it is about, when that is a person. */
  subject: string | null;
  requestedAt: string | null;
  expiresAt: string | null;
  /** Commands for ActionDialog / commandAction. */
  approve: string;
  reject: string;
  /** Approving needs the approver's own recent second factor. */
  stepUp: boolean;
  /** The signed-in person asked for it or it is about them: someone else decides. */
  notYours: boolean;
  version?: number;
};

export type SessionTrust = {
  signed: boolean;
  mfa: boolean;
  /** When the signed session ends (seconds since epoch). */
  expiresAt?: number;
  /** When the person last proved who they are (seconds since epoch). */
  authTime?: number;
};

export const currentSession = cache(async (): Promise<{ session: SessionPayload; identity: SessionIdentity } | null> => {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.principalId || !session.tenantId) return null;
  return { session, identity: toIdentity(session) };
});

/** What the session's envelope says, for display only — the services verify it. */
export function sessionTrust(session: SessionPayload): SessionTrust {
  if (!session.envelopeJwt) return { signed: false, mfa: false };
  try {
    const c = JSON.parse(Buffer.from(session.envelopeJwt.split(".")[1] ?? "", "base64url").toString("utf-8")) as {
      exp?: number;
      auth_time?: number;
      session_trust_posture?: { mfa_verified?: boolean };
    };
    return { signed: true, mfa: !!c.session_trust_posture?.mfa_verified, expiresAt: c.exp, authTime: c.auth_time };
  } catch {
    return { signed: false, mfa: false };
  }
}

export type Registers = {
  roles: Role[];
  assignments: RoleAssignment[];
  jit: PrivilegedSession[];
  breakGlass: BreakGlassSession[];
  sodRules: SoDRule[];
  abacRules: ABACRule[];
  limits: AuthorityLimit[];
  exceptions: SoDException[];
  /** The first read that failed, so a page can say why it is short. */
  problem: ApiError | null;
};

export const loadRegisters = cache(async (identity: SessionIdentity): Promise<Registers> => {
  const [roles, assignments, jit, bg, sod, abac, limits, exc] = await Promise.all([
    listRoles(identity),
    listRoleAssignments(identity, { includeExpired: true }),
    listPrivilegedSessions(identity),
    listBreakGlassSessions(identity),
    listSoDRules(identity),
    listABACRules(identity),
    listAuthorityLimits(identity),
    listSoDExceptions(identity),
  ]);
  let problem: ApiError | null = null;
  for (const r of [roles, assignments, jit, bg, sod, abac, limits, exc]) {
    if (!r.ok && r.error.status !== 403) {
      problem = r.error;
      break;
    }
  }
  return {
    roles: roles.ok ? roles.data ?? [] : [],
    assignments: assignments.ok ? assignments.data ?? [] : [],
    jit: jit.ok ? jit.data.sessions ?? [] : [],
    breakGlass: bg.ok ? bg.data.sessions ?? [] : [],
    sodRules: sod.ok ? sod.data ?? [] : [],
    abacRules: abac.ok ? abac.data ?? [] : [],
    limits: limits.ok ? limits.data.authority_limits ?? [] : [],
    exceptions: exc.ok ? exc.data ?? [] : [],
    problem,
  };
});

const CHANGE_WORD: Record<string, string> = { PUBLISH: "Publish", REACTIVATE: "Reactivate", RETIRE: "Retire" };

export function approvalItems(r: Registers, me: string): ApprovalItem[] {
  const roleName = new Map(r.roles.map((x) => [x.role_id, x.role_name || x.role_code]));
  const items: ApprovalItem[] = [];
  const notYours = (requester?: string | null, subject?: string | null) => requester === me || subject === me;

  for (const a of r.assignments) {
    if (a.approval_status !== "PENDING_APPROVAL") continue;
    items.push({
      key: `grant:${a.principal_role_assignment_id}`, kind: "grant", id: a.principal_role_assignment_id,
      title: `${roleName.get(a.role_id) ?? "A role"} for ${person(a.principal_id).name}`,
      detail: a.legal_entity_id ? "One legal entity" : "Whole organisation",
      requestedBy: a.assigned_by, subject: a.principal_id, requestedAt: a.created_at, expiresAt: a.approval_expires_at ?? null,
      approve: "assignment.approve", reject: "assignment.reject", stepUp: false, notYours: notYours(a.assigned_by, a.principal_id),
    });
  }
  for (const s of r.jit) {
    if (s.status !== "PENDING_APPROVAL") continue;
    items.push({
      key: `jit:${s.session_id}`, kind: "jit", id: s.session_id,
      title: `${s.requested_actions.join(", ")} for ${person(s.principal_id).name}`,
      detail: `${s.ticket_ref} · ${Math.round(s.duration_seconds / 360) / 10} h · ${s.target_environment ?? ""}`,
      requestedBy: s.requested_by ?? null, subject: s.principal_id, requestedAt: s.created_at, expiresAt: null,
      approve: "jit.approve", reject: "jit.reject", stepUp: true, notYours: notYours(s.requested_by, s.principal_id),
    });
  }
  for (const s of r.breakGlass) {
    if (s.status !== "PENDING_APPROVAL") continue;
    const got = s.approvals?.length ?? 0;
    const need = s.approvals_required ?? 1;
    items.push({
      key: `bg:${s.session_id}`, kind: "break_glass", id: s.session_id,
      title: `Incident ${s.incident_id}: ${s.requested_actions.join(", ")} for ${person(s.principal_id).name}`,
      detail: `${s.reason}${need > 1 ? ` · ${got} of ${need} approvals` : ""}`,
      requestedBy: s.requested_by ?? null, subject: s.principal_id, requestedAt: s.created_at, expiresAt: s.request_expires_at ?? null,
      approve: "break_glass.approve", reject: "break_glass.reject", stepUp: true,
      notYours: notYours(s.requested_by, s.principal_id) || !!s.approvals?.some((a) => a.approver_id === me),
    });
  }
  for (const x of r.sodRules) {
    if (!x.pending_change) continue;
    items.push({
      key: `sod:${x.sod_rule_id}`, kind: "sod_rule", id: x.sod_rule_id,
      title: `${CHANGE_WORD[x.pending_change] ?? x.pending_change}: ${x.action_a === x.action_b ? `no one may ${x.action_a} their own work` : `${x.action_a} ✕ ${x.action_b}`}`,
      detail: x.tenant_id ? "This organisation" : "Every organisation",
      requestedBy: x.change_requested_by ?? null, subject: null, requestedAt: x.change_requested_at ?? null, expiresAt: null,
      approve: "sod_rule.approve", reject: "sod_rule.reject", stepUp: false, notYours: notYours(x.change_requested_by), version: x.version,
    });
  }
  for (const x of r.abacRules) {
    if (!x.pending_change) continue;
    items.push({
      key: `abac:${x.abac_rule_id}`, kind: "abac_rule", id: x.abac_rule_id,
      title: `${CHANGE_WORD[x.pending_change] ?? x.pending_change}: ${x.rule_code} on ${x.action_type}`,
      detail: `${x.effect === "REQUIRE" ? "Requires" : "Forbids"} ${x.attribute_key} ${x.operator} ${x.attribute_value ?? ""}`.trim(),
      requestedBy: x.change_requested_by ?? null, subject: null, requestedAt: x.change_requested_at ?? null, expiresAt: null,
      approve: "abac.approve", reject: "abac.reject", stepUp: false, notYours: notYours(x.change_requested_by), version: x.version,
    });
  }
  for (const l of r.limits) {
    const pendingRow = l.status === "PENDING_APPROVAL";
    if (!pendingRow && !l.pending_action) continue;
    const who = l.principal_id ? person(l.principal_id).name : `role ${roleName.get(l.role_id ?? "") ?? ""}`;
    const what = l.pending_action ? "Retire" : l.supersedes_id ? "Change" : "New";
    items.push({
      key: `limit:${l.authority_limit_id}`, kind: "limit", id: l.authority_limit_id,
      title: `${what}: ${l.authority_type.replace(/_/g, " ")} up to ${Number(l.upper_limit).toLocaleString("en-GB")} ${l.currency} for ${who}`,
      detail: l.request_reason ?? "",
      requestedBy: l.requested_by ?? null, subject: l.principal_id ?? null, requestedAt: l.requested_at ?? null, expiresAt: null,
      approve: "limit.approve", reject: "limit.reject", stepUp: false, notYours: notYours(l.requested_by, l.principal_id),
    });
  }
  for (const e of r.exceptions) {
    if (e.status !== "REQUESTED") continue;
    items.push({
      key: `exc:${e.sod_exception_id}`, kind: "sod_exception", id: e.sod_exception_id,
      title: `Allow a duty conflict for ${person(e.principal_id).name}`,
      detail: `Control: ${e.compensating_control}`,
      requestedBy: e.requested_by, subject: e.principal_id, requestedAt: e.created_at, expiresAt: e.expires_at,
      approve: "sod_exception.approve", reject: "sod_exception.reject", stepUp: false, notYours: notYours(e.requested_by, e.principal_id),
    });
  }
  return items.sort((a, b) => (b.requestedAt ?? "").localeCompare(a.requestedAt ?? ""));
}

/** Ended sessions waiting for their retrospective review. */
export function reviewsDue(r: Registers) {
  return [
    ...r.jit.filter((s) => s.review_status === "PENDING").map((s) => ({ kind: "privileged" as const, id: s.session_id, subject: s.principal_id, requestedBy: s.requested_by ?? null, label: s.ticket_ref, endedAt: s.revoked_at ?? s.expires_at })),
    ...r.breakGlass.filter((s) => s.review_status === "PENDING").map((s) => ({ kind: "break_glass" as const, id: s.session_id, subject: s.principal_id, requestedBy: s.requested_by ?? null, label: `Incident ${s.incident_id}`, endedAt: s.revoked_at ?? s.expires_at })),
  ];
}

export function liveGrants(r: Registers) {
  return r.assignments.filter((a) => (a.approval_status ?? "APPROVED") === "APPROVED" && isAssignmentActive(a));
}
