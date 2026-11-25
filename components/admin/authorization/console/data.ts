// Every register the Authorization console shows, read once per request.
// Server-only. Each read keeps its own result, so one register that cannot be
// read says so in its own tab instead of showing as empty — an empty grants
// list and an unreadable one mean very different things to an auditor.

import type { SessionIdentity } from "@/lib/auth";
import {
  listABACRules,
  listAccessDecisions,
  listAuthorityLimits,
  listBreakGlassSessions,
  listDelegatedAuthorities,
  listPrivilegedSessions,
  listRoleAssignments,
  listRoles,
  listSoDExceptions,
  listSoDRules,
  listSupportSessions,
  listWorkloadBindings,
  type ABACRule,
  type AccessDecision,
  type AuthorityLimit,
  type BreakGlassSession,
  type DelegatedAuthority,
  type PrivilegedSession,
  type Role,
  type RoleAssignment,
  type SoDException,
  type SoDRule,
  type SupportSession,
  type WorkloadBinding,
} from "@/lib/api/authorization";
import type { ApiError, ApiResult } from "@/lib/api/client";
import { approvalItems, type ApprovalItem, type Registers } from "@/lib/authz-inbox";

/** A register's rows, or why there are none to show. */
export type Read<T> = { rows: T[]; error: ApiError | null };

/** How many recent decisions the console summarises and lists. The service caps a page at 200. */
export const DECISION_WINDOW = 200;

export type AuthzData = {
  roles: Read<Role>;
  assignments: Read<RoleAssignment>;
  jit: Read<PrivilegedSession>;
  breakGlass: Read<BreakGlassSession>;
  support: Read<SupportSession>;
  sodRules: Read<SoDRule>;
  exceptions: Read<SoDException>;
  abac: Read<ABACRule>;
  limits: Read<AuthorityLimit>;
  delegations: Read<DelegatedAuthority>;
  workloads: Read<WorkloadBinding>;
  /** The latest DECISION_WINDOW decisions, newest first. */
  decisions: Read<AccessDecision> & { more: boolean };
  /** Everything waiting for a second person. */
  approvals: ApprovalItem[];
};

function read<T, R>(result: ApiResult<R>, pick: (data: R) => T[] | null | undefined): Read<T> {
  return result.ok ? { rows: pick(result.data) ?? [], error: null } : { rows: [], error: result.error };
}

export async function loadAuthorization(identity: SessionIdentity): Promise<AuthzData> {
  const [roles, assignments, jit, bg, support, sod, exc, abac, limits, delegations, workloads, decisions] = await Promise.all([
    listRoles(identity),
    listRoleAssignments(identity, { includeExpired: true }),
    listPrivilegedSessions(identity),
    listBreakGlassSessions(identity),
    listSupportSessions(identity),
    listSoDRules(identity),
    listSoDExceptions(identity),
    listABACRules(identity),
    listAuthorityLimits(identity),
    listDelegatedAuthorities(identity),
    listWorkloadBindings(identity),
    listAccessDecisions(identity, { limit: DECISION_WINDOW }),
  ]);

  const data: Omit<AuthzData, "approvals"> = {
    roles: read(roles, (d) => d),
    assignments: read(assignments, (d) => d),
    jit: read(jit, (d) => d.sessions),
    breakGlass: read(bg, (d) => d.sessions),
    support: read(support, (d) => d.sessions),
    sodRules: read(sod, (d) => d),
    exceptions: read(exc, (d) => d),
    abac: read(abac, (d) => d),
    limits: read(limits, (d) => d.authority_limits),
    delegations: read(delegations, (d) => d),
    workloads: read(workloads, (d) => d.workload_bindings),
    decisions: { ...read(decisions, (d) => d.decisions), more: decisions.ok && !!decisions.data.next_cursor },
  };

  const registers: Registers = {
    roles: data.roles.rows,
    assignments: data.assignments.rows,
    jit: data.jit.rows,
    breakGlass: data.breakGlass.rows,
    sodRules: data.sodRules.rows,
    abacRules: data.abac.rows,
    limits: data.limits.rows,
    exceptions: data.exceptions.rows,
    problem: null,
  };
  return { ...data, approvals: approvalItems(registers, identity.principalId) };
}

/** The first unreadable register among these, ignoring "you may not see this" (403). */
export function firstProblem(...reads: Read<unknown>[]): ApiError | null {
  return reads.find((r) => r.error && r.error.status !== 403)?.error ?? null;
}
