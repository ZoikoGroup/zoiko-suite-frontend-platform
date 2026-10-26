"use server";

// Server Actions for the Authorization page (authorization-svc :8089).
//
// Every action verifies the session itself (Server Actions are reachable by
// direct POST) and forwards the session's signed envelope: authorization-svc
// identifies the caller of every admin route by it (A-01), and in
// AUTHZ_IDENTITY_ASSERTION=require a header-only call is 401.
//
// Status mapping, everywhere:
//   401 / 403 / 409  → refused  (the service decided — permission, checker
//                                independence, SoD, version)
//   202              → pending  (maker-checker: recorded, grants nothing yet)
//   anything else    → error    (nothing was decided)

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, toIdentity, type SessionIdentity } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import {
  PLATFORM_SCOPE_SENTINEL,
  assignRole,
  authorize,
  createABACRule,
  createDelegatedAuthority,
  createSoDRule,
  commandAuthorityLimit,
  decideBreakGlassSession,
  decidePrivilegedSession,
  decideRuleChange,
  needsAttention,
  requestAuthorityLimit,
  requestAuthorityLimitChange,
  decideRoleAssignment,
  evaluateDelegatedAccess,
  evaluateSoD,
  explainAuthzError,
  explainDecisionBasis,
  getAccessDecision,
  getAvailableActions,
  invalidateAuthorizationCache,
  issueBreakGlassSession,
  issuePrivilegedSession,
  listAccessDecisions,
  listConflictingPermissions,
  openSupportSession,
  recomputeEffectiveAccess,
  requestSoDException,
  reviewSession,
  revokeDelegatedAuthority,
  revokeRoleAssignment,
  revokeSession,
  saveWorkloadBinding,
  setABACRuleActive,
  setPermissionBundleActive,
  setRoleActive,
  setSoDRuleActive,
  setWorkloadBindingActive,
  transitionSoDException,
  validateEntityScope,
  validateSoDConflicts,
  type CommandReason,
} from "@/lib/api/authorization";
import type { ApiError } from "@/lib/api/client";
import type { AuthzResult } from "./state";

const EXPIRED: AuthzResult = { status: "error", message: "Your session has expired — sign in again." };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireIdentity(): Promise<SessionIdentity | null> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email || !session.principalId || !session.tenantId) return null;
  return toIdentity(session);
}

function text(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

/** Comma- or newline-separated values, trimmed, de-duplicated. */
function list(fd: FormData, key: string): string[] {
  return [...new Set(text(fd, key).split(/[\s,]+/).map((v) => v.trim()).filter(Boolean))];
}

/** datetime-local gives local time with no zone; the service wants RFC 3339. */
function rfc3339(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function fail(error: ApiError): AuthzResult {
  const attention = needsAttention(error);
  if (attention === "step_up") return { status: "step_up", message: "Verify it's you to continue." };
  if (attention === "signin") return { status: "signin", message: explainAuthzError(error) };
  const refused = error.status === 401 || error.status === 403 || error.status === 409;
  return { status: refused ? "refused" : "error", message: explainAuthzError(error) };
}

function bad(message: string): AuthzResult {
  return { status: "error", message };
}

function when(iso: string | null | undefined): string {
  return iso ? formatDateTime(iso) : "—";
}

/** A decision in words. Anything unrecognised is shown as itself, never as allowed. */
function answerLabel(decision: string): string {
  switch (decision) {
    case "GRANTED":
    case "PERMIT":
      return "Allowed";
    case "DENIED":
    case "DENY":
      return "Not allowed";
    case "STEP_UP":
      return "Needs a fresh sign-in";
    case "REQUIRE_APPROVAL":
      return "Needs approval";
    default:
      return decision;
  }
}

/** The reason every R-command needs. OTHER must say what the other reason is. */
function readReason(fd: FormData): CommandReason | string {
  const reasonCode = text(fd, "reason_code");
  const note = text(fd, "reason_note");
  if (!reasonCode) return "Choose a reason.";
  if (reasonCode === "OTHER" && !note) return "Say what the reason is in the note.";
  const version = Number(text(fd, "expected_version"));
  return { reasonCode, note: note || undefined, expectedVersion: Number.isInteger(version) && version > 0 ? version : undefined };
}

// ═══ Commands on existing records (one dispatcher, reason required) ════════

type Command =
  | "assignment.approve" | "assignment.reject" | "assignment.revoke"
  | "role.retire" | "role.reactivate"
  | "bundle.retire" | "bundle.reactivate"
  | "sod_rule.retire" | "sod_rule.reactivate"
  | "sod_exception.approve" | "sod_exception.reject" | "sod_exception.revoke"
  | "abac.retire" | "abac.reactivate"
  | "delegation.revoke"
  | "workload.deactivate" | "workload.reactivate"
  | "jit.approve" | "jit.reject" | "jit.revoke"
  | "break_glass.approve" | "break_glass.reject" | "break_glass.revoke" | "support.revoke"
  | "sod_rule.approve" | "sod_rule.reject" | "abac.approve" | "abac.reject"
  | "limit.approve" | "limit.reject" | "limit.retire";

const DONE: Record<Command, string> = {
  "assignment.approve": "Approved. The grant is in force from now.",
  "assignment.reject": "Rejected. The request grants nothing.",
  "assignment.revoke": "Revoked. The grant ends on the next permission check.",
  "role.retire": "Role retired. Nobody holding it can use it until it is reactivated.",
  "role.reactivate": "Role reactivated. Everyone still assigned to it has its actions again.",
  "bundle.retire": "Permission set retired. The role no longer grants its actions.",
  "bundle.reactivate": "Permission set reactivated.",
  "sod_rule.retire": "Retirement requested. The rule keeps refusing that pair until someone else approves the change.",
  "sod_rule.reactivate": "Reactivation requested. It takes effect once someone else approves it.",
  "sod_rule.approve": "Published. The rule change is in force from now.",
  "sod_rule.reject": "Rejected. The rule stays exactly as it was.",
  "sod_exception.approve": "Exception approved. The conflict is permitted under its control until it expires.",
  "sod_exception.reject": "Exception rejected.",
  "sod_exception.revoke": "Exception revoked. The conflict is refused again.",
  "abac.retire": "Retirement requested. The condition keeps applying until someone else approves the change.",
  "abac.reactivate": "Reactivation requested. It takes effect once someone else approves it.",
  "abac.approve": "Published. The condition change is in force from now.",
  "abac.reject": "Rejected. The condition stays exactly as it was.",
  "delegation.revoke": "Delegation withdrawn. The borrowed authority ends now.",
  "workload.deactivate": "Workload binding deactivated.",
  "workload.reactivate": "Workload binding reactivated.",
  "jit.approve": "Session approved. It is active from now.",
  "jit.reject": "Session rejected.",
  "jit.revoke": "Session revoked.",
  "break_glass.approve": "Approved. Emergency access is active from now, and a security alert has been raised.",
  "break_glass.reject": "Rejected. No emergency access was granted.",
  "break_glass.revoke": "Break-glass session revoked.",
  "limit.approve": "Approved. The limit is in force from now.",
  "limit.reject": "Rejected. Nothing changes.",
  "limit.retire": "Retirement requested. The limit keeps applying until someone else approves it.",
  "support.revoke": "Support session revoked.",
};

export async function commandAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;

  const command = text(fd, "command") as Command;
  const id = text(fd, "id");
  if (!(command in DONE)) return bad("Unknown action.");
  if (!id) return bad("Nothing was selected.");
  const reason = readReason(fd);
  if (typeof reason === "string") return bad(reason);

  const [kind, verb] = command.split(".") as [string, string];
  const active = verb === "reactivate";
  let result;
  switch (kind) {
    case "assignment": {
      if (verb === "revoke") {
        const endsAt = rfc3339(text(fd, "effective_to"));
        result = await revokeRoleAssignment({ identity, assignmentId: id, reason, effectiveTo: endsAt ?? undefined });
      } else {
        result = await decideRoleAssignment({ identity, assignmentId: id, approve: verb === "approve", reason });
      }
      break;
    }
    case "role":
      result = await setRoleActive({ identity, roleId: id, active, reason });
      break;
    case "bundle":
      result = await setPermissionBundleActive({ identity, permissionBundleId: id, active, reason });
      break;
    case "sod_rule":
      result = verb === "approve" || verb === "reject"
        ? await decideRuleChange({ identity, kind: "sod", ruleId: id, approve: verb === "approve", reason })
        : await setSoDRuleActive({ identity, sodRuleId: id, active, reason });
      break;
    case "sod_exception":
      result = await transitionSoDException({ identity, sodExceptionId: id, to: verb as "approve" | "reject" | "revoke", reason });
      break;
    case "abac":
      result = verb === "approve" || verb === "reject"
        ? await decideRuleChange({ identity, kind: "abac", ruleId: id, approve: verb === "approve", reason })
        : await setABACRuleActive({ identity, abacRuleId: id, active, reason });
      break;
    case "limit":
      result = await commandAuthorityLimit({ identity, limitId: id, verb: verb as "approve" | "reject" | "retire", reason });
      break;
    case "delegation":
      result = await revokeDelegatedAuthority({ identity, delegationId: id, reason });
      break;
    case "workload":
      result = await setWorkloadBindingActive({ identity, workloadId: id, active, reason });
      break;
    case "jit":
      result = verb === "revoke"
        ? await revokeSession({ identity, kind: "privileged", sessionId: id, reason })
        : await decidePrivilegedSession({ identity, sessionId: id, approve: verb === "approve", reason });
      break;
    case "break_glass":
      result = verb === "revoke"
        ? await revokeSession({ identity, kind: "break_glass", sessionId: id, reason })
        : await decideBreakGlassSession({ identity, sessionId: id, approve: verb === "approve", reason });
      break;
    case "support":
      result = await revokeSession({ identity, kind: "support", sessionId: id, reason });
      break;
    default:
      return bad("Unknown action.");
  }

  if (!result.ok) return fail(result.error);
  refresh();
  const scheduled = command === "assignment.revoke" && text(fd, "effective_to");
  if (scheduled) return { status: "done", message: `Scheduled to end ${when(rfc3339(text(fd, "effective_to")))}.` };
  // A break-glass approval below the quorum is recorded, not yet in force.
  const data = result.data as { status?: string; approvals?: unknown[]; approvals_required?: number } | undefined;
  if (command === "break_glass.approve" && data?.status === "PENDING_APPROVAL") {
    const left = Math.max(0, (data.approvals_required ?? 1) - (data.approvals?.length ?? 0));
    return { status: "pending", message: `Your approval is recorded. ${left} more independent approval${left === 1 ? " is" : "s are"} needed before access starts.` };
  }
  return { status: result.status === 202 ? "pending" : "done", message: DONE[command] };
}

export async function reviewSessionAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const kind = text(fd, "kind");
  const id = text(fd, "id");
  const outcome = text(fd, "outcome");
  const notes = text(fd, "notes");
  if (kind !== "privileged" && kind !== "break_glass") return bad("Unknown session type.");
  if (outcome !== "ATTESTED" && outcome !== "FLAGGED") return bad("Choose attest or flag.");
  if (outcome === "FLAGGED" && !notes) return bad("Say what was found — a flagged session needs notes.");
  const result = await reviewSession({ identity, kind, sessionId: id, outcome, notes: notes || undefined });
  if (!result.ok) return fail(result.error);
  refresh();
  return {
    status: "done",
    message: outcome === "ATTESTED" ? "Review recorded: attested." : "Review recorded: flagged. A security alert was raised.",
  };
}

// ═══ Grants ════════════════════════════════════════════════════════════════

export async function grantRoleAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const principalId = text(fd, "principal_id");
  const roleId = text(fd, "role_id");
  const tenantWide = text(fd, "scope") === "tenant";
  const legalEntityId = tenantWide ? "" : text(fd, "legal_entity_id") || identity.legalEntityId;
  const from = rfc3339(text(fd, "effective_from")) ?? new Date().toISOString();
  const to = rfc3339(text(fd, "effective_to"));

  if (!UUID.test(principalId)) return bad("Enter the person's principal ID.");
  if (!roleId) return bad("Choose a role.");
  if (principalId === identity.principalId) return bad("You cannot grant a role to yourself.");
  if (!tenantWide && !legalEntityId) return bad("Enter the legal entity, or choose the whole organisation.");
  if (to && to <= from) return bad("The end must be after the start.");

  const result = await assignRole({
    identity,
    principalId,
    roleId,
    legalEntityId,
    effectiveFrom: from,
    effectiveTo: to ?? undefined,
    approvalReference: text(fd, "approval_reference") || undefined,
  });
  if (!result.ok) return fail(result.error);
  refresh();
  const pending = result.status === 202 || result.data.approval_status === "PENDING_APPROVAL";
  return {
    status: pending ? "pending" : "done",
    message: pending
      ? "Recorded for approval. This is a privileged role, so it grants nothing until somebody independent approves it (within 72 hours)."
      : result.status === 200
        ? "This grant already exists — nothing new was recorded."
        : "Granted. It is in force from the start date.",
    details: [
      { label: "Grant ID", value: result.data.principal_role_assignment_id },
      { label: "Starts", value: when(result.data.effective_from) },
      { label: "Ends", value: result.data.effective_to ? when(result.data.effective_to) : "Open-ended" },
    ],
  };
}

// ═══ Separation of duties ══════════════════════════════════════════════════

export async function createSoDRuleAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const domainCode = text(fd, "domain_code").toUpperCase();
  const conflictType = text(fd, "conflict_type") || "HARD";
  const actionA = text(fd, "action_a");
  // An own-object rule is stored self-referentially (action_a == action_b ==
  // the guarded action) — the service's convention, read by CheckOwnObjectSoD.
  const ownObject = conflictType === "OWN_OBJECT_FORBIDDEN";
  const actionB = ownObject ? actionA : text(fd, "action_b");
  if (!domainCode || !actionA) return bad("Enter the area and the action.");
  if (!ownObject && !actionB) return bad("Enter the second action.");
  if (!ownObject && actionA === actionB) return bad("The two actions must be different.");
  const result = await createSoDRule({ identity, domainCode, actionA, actionB, conflictType });
  if (!result.ok) return fail(result.error);
  refresh();
  return {
    status: "pending",
    message: (ownObject
      ? `Proposed: nobody may ${actionA} a record they prepared or own.`
      : `Proposed: nobody may hold both ${actionA} and ${actionB}.`) +
      " It takes effect once someone other than you publishes it.",
  };
}

export async function requestSoDExceptionAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const sodRuleId = text(fd, "sod_rule_id");
  const principalId = text(fd, "principal_id");
  const compensatingControl = text(fd, "compensating_control");
  const reason = text(fd, "reason");
  const from = rfc3339(text(fd, "effective_from"));
  const expires = rfc3339(text(fd, "expires_at"));
  if (!UUID.test(sodRuleId)) return bad("Choose the rule.");
  if (!UUID.test(principalId)) return bad("Enter the person's principal ID.");
  if (!compensatingControl || !reason) return bad("Name the compensating control and the reason.");
  if (!expires) return bad("Choose when the exception expires — exceptions always expire.");
  const result = await requestSoDException({
    identity, sodRuleId, principalId, compensatingControl, reason, effectiveFrom: from ?? undefined, expiresAt: expires,
  });
  if (!result.ok) return fail(result.error);
  refresh();
  return {
    status: "pending",
    message: "Requested. It permits nothing until somebody other than you and the person it covers approves it.",
    details: [{ label: "Exception ID", value: result.data.sod_exception_id }, { label: "Expires", value: when(result.data.expires_at) }],
  };
}

export async function conflictingPermissionsAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const action = text(fd, "action_type");
  if (!action) return bad("Enter an action.");
  const result = await listConflictingPermissions(identity, action);
  if (!result.ok) return fail(result.error);
  const conflicts = result.data.conflicts ?? [];
  if (conflicts.length === 0) return { status: "done", message: `Nothing conflicts with ${action}.` };
  return {
    status: "done",
    message: `${conflicts.length} action${conflicts.length === 1 ? "" : "s"} may never be held with ${action}.`,
    table: {
      headers: ["Conflicts with", "Type", "Applies to"],
      rows: conflicts.map((c) => [c.conflicts_with, c.conflict_type, c.platform_wide ? "Every organisation" : "This organisation"]),
    },
  };
}

// ═══ Conditions (ABAC) ═════════════════════════════════════════════════════

export async function createAbacRuleAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const ruleCode = text(fd, "rule_code").toUpperCase();
  const actionType = text(fd, "action_type");
  const effect = text(fd, "effect");
  const attributeKey = text(fd, "attribute_key");
  const operator = text(fd, "operator");
  const attributeValue = text(fd, "attribute_value");
  if (!ruleCode || !actionType || !attributeKey || !operator) return bad("Fill in the code, action, attribute and comparison.");
  if (effect !== "REQUIRE" && effect !== "FORBID") return bad("Choose require or forbid.");
  if (!operator.endsWith("exists") && !attributeValue) return bad("This comparison needs a value.");
  const result = await createABACRule({ identity, ruleCode, actionType, effect, attributeKey, operator, attributeValue: attributeValue || undefined });
  if (!result.ok) return fail(result.error);
  refresh();
  return { status: "pending", message: `Condition ${ruleCode} is proposed for ${actionType}. It applies once someone other than you publishes it.` };
}

// ═══ Delegation ════════════════════════════════════════════════════════════

export async function lendAuthorityAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const delegate = text(fd, "delegate_principal_id");
  const subset = text(fd, "scope_type") === "ACTION_SUBSET";
  const actions = list(fd, "delegated_actions");
  const from = rfc3339(text(fd, "effective_from")) ?? new Date().toISOString();
  const to = rfc3339(text(fd, "effective_to"));
  const reason = text(fd, "reason");
  if (!UUID.test(delegate)) return bad("Enter the principal ID of the person borrowing your authority.");
  if (delegate === identity.principalId) return bad("You cannot lend authority to yourself.");
  if (subset && actions.length === 0) return bad("List the actions to lend, or lend all of your authority.");
  if (!to) return bad("Choose when the delegation ends — every delegation has an end.");
  if (to <= from) return bad("The end must be after the start.");
  if (!reason) return bad("Say why (for example: annual leave cover).");
  const result = await createDelegatedAuthority({
    identity,
    delegatorPrincipalId: identity.principalId,
    delegatePrincipalId: delegate,
    scopeType: subset ? "ACTION_SUBSET" : "FULL",
    legalEntityId: text(fd, "legal_entity_id") || undefined,
    delegatedActions: subset ? actions : undefined,
    effectiveFrom: from,
    effectiveTo: to,
    reason,
    approvalReference: text(fd, "approval_reference") || undefined,
  });
  if (!result.ok) return fail(result.error);
  refresh();
  return {
    status: "done",
    message: `Delegated until ${when(result.data.effective_to)}. It never confers more than you hold yourself.`,
    details: [{ label: "Delegation ID", value: result.data.delegated_authority_id }],
  };
}

// ═══ Workloads and operations ══════════════════════════════════════════════

export async function saveWorkloadBindingAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const workloadId = text(fd, "workload_id");
  const audience = text(fd, "allowed_audience");
  const actions = list(fd, "allowed_actions");
  if (!workloadId || !audience) return bad("Enter the workload and its audience.");
  if (audience === "*" || actions.includes("*")) return bad("Wildcards are not allowed — name each action.");
  if (actions.length === 0) return bad("List at least one action.");
  const reason = readReason(fd);
  if (typeof reason === "string") return bad(reason);
  const result = await saveWorkloadBinding({ identity, workloadId, allowedAudience: audience, allowedActions: actions, reason });
  if (!result.ok) return fail(result.error);
  refresh();
  return { status: "done", message: `Saved. ${workloadId} may now take only the ${actions.length} listed action${actions.length === 1 ? "" : "s"}.` };
}

export async function invalidateCacheAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const principalId = text(fd, "principal_id");
  if (principalId && !UUID.test(principalId)) return bad("The principal ID must be a UUID.");
  const reason = readReason(fd);
  if (typeof reason === "string") return bad(reason);
  const result = await invalidateAuthorizationCache({ identity, principalId: principalId || undefined, reason });
  if (!result.ok) return fail(result.error);
  return { status: "done", message: "Cached decisions for your organisation were dropped on every replica. The next check reads the current grants." };
}

// ═══ Elevated access ═══════════════════════════════════════════════════════

export async function issueJitAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const actions = list(fd, "requested_actions");
  const hours = Number(text(fd, "duration_hours"));
  const ticketRef = text(fd, "ticket_ref");
  const reason = text(fd, "reason");
  const resourceScope = text(fd, "resource_scope");
  const environment = text(fd, "target_environment");
  const principalId = text(fd, "principal_id");
  if (actions.length === 0) return bad("List the actions needed.");
  if (actions.some((a) => a.includes("*"))) return bad("Wildcards are not allowed — name each action.");
  if (!ticketRef || !reason || !resourceScope || !environment) return bad("Ticket, reason, resource and environment are all required.");
  if (!(hours > 0 && hours <= 8)) return bad("Duration must be more than 0 and at most 8 hours.");
  if (principalId && !UUID.test(principalId)) return bad("The principal ID must be a UUID.");
  const result = await issuePrivilegedSession({
    identity, principalId: principalId || undefined, requestedActions: actions, ticketRef, reason,
    durationSeconds: Math.round(hours * 3600), resourceScope, targetEnvironment: environment,
  });
  if (!result.ok) return fail(result.error);
  refresh();
  const pending = result.data.status === "PENDING_APPROVAL";
  return {
    status: pending ? "pending" : "done",
    message: pending
      ? "Requested. Anything beyond read access needs approval from somebody independent; it grants nothing until then."
      : `Active until ${when(result.data.expires_at)}.`,
    details: [{ label: "Session ID", value: result.data.session_id }],
  };
}

export async function issueBreakGlassAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const actions = list(fd, "requested_actions");
  const incidentId = text(fd, "incident_id");
  const reason = text(fd, "reason");
  const minutes = Number(text(fd, "duration_minutes"));
  const principalId = text(fd, "principal_id");
  if (!incidentId) return bad("Enter the incident reference — break-glass needs a declared incident.");
  if (!reason) return bad("Say why.");
  if (actions.length === 0) return bad("List the actions needed.");
  if (actions.some((a) => a.includes("*"))) return bad("Wildcards are not allowed — name each action.");
  if (text(fd, "duration_minutes") && !(minutes > 0 && minutes <= 120)) return bad("Duration must be at most 120 minutes.");
  if (principalId && !UUID.test(principalId)) return bad("The principal ID must be a UUID.");
  const result = await issueBreakGlassSession({
    identity, principalId: principalId || undefined, incidentId, reason, requestedActions: actions,
    durationSeconds: minutes > 0 ? Math.round(minutes * 60) : undefined,
  });
  if (!result.ok) return fail(result.error);
  refresh();
  const need = result.data.approvals_required ?? 1;
  return {
    status: "pending",
    message: `Emergency access requested. Security has been alerted. It starts when ${need === 1 ? "an independent approver" : `${need} independent approvers`} approve${need === 1 ? "s" : ""} it, and lapses if nobody does within an hour.`,
    details: [{ label: "Request ID", value: result.data.session_id }],
  };
}

export async function openSupportSessionAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const ticketRef = text(fd, "ticket_ref");
  const purpose = text(fd, "purpose");
  const consent = text(fd, "tenant_consent_obtained");
  const writes = list(fd, "allowed_actions");
  const hours = Number(text(fd, "duration_hours"));
  const operator = text(fd, "support_operator_id");
  if (!ticketRef || !purpose) return bad("Enter the ticket and the purpose.");
  if (consent !== "yes" && consent !== "no") return bad("State whether the organisation consented.");
  if (writes.some((a) => a.includes("*"))) return bad("Wildcards are not allowed — name each action.");
  if (text(fd, "duration_hours") && !(hours > 0 && hours <= 4)) return bad("Duration must be at most 4 hours.");
  if (operator && !UUID.test(operator)) return bad("The operator ID must be a UUID.");
  const result = await openSupportSession({
    identity, supportOperatorId: operator || undefined, ticketRef, purpose, tenantConsentObtained: consent === "yes",
    allowedActions: writes, allowBulkExport: fd.get("allow_bulk_export") === "on",
    durationSeconds: hours > 0 ? Math.round(hours * 3600) : undefined,
  });
  if (!result.ok) return fail(result.error);
  refresh();
  return {
    status: consent === "yes" ? "done" : "pending",
    message:
      consent === "yes"
        ? `Open until ${when(result.data.expires_at)} — ${writes.length ? `read access plus ${writes.length} named write${writes.length === 1 ? "" : "s"}` : "read-only"}.`
        : "Recorded without consent, so it grants nothing.",
    details: [{ label: "Session ID", value: result.data.session_id }],
  };
}

// ═══ Checks ════════════════════════════════════════════════════════════════

export async function checkAccessAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const principalId = text(fd, "principal_id") || identity.principalId;
  const actionType = text(fd, "action_type");
  const platform = text(fd, "scope") === "platform";
  const legalEntityId = platform ? PLATFORM_SCOPE_SENTINEL : text(fd, "legal_entity_id") || identity.legalEntityId;
  if (!actionType) return bad("Enter the action to check.");
  if (actionType === "*") return bad("Ask about one action at a time.");

  const attributes: Record<string, string> = {};
  const amount = text(fd, "amount");
  if (amount) {
    attributes.amount = amount;
    attributes.currency = text(fd, "currency") || "GBP";
  }
  for (const line of text(fd, "attributes").split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) attributes[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }

  const result = await authorize({
    identity, principalId, legalEntityId, actionType,
    resourceOwnerPrincipalId: text(fd, "resource_owner_principal_id") || undefined,
    attributes,
  });
  if (!result.ok) return fail(result.error);
  const d = result.data;
  const basis = explainDecisionBasis(d.decision_basis);
  const outcome = d.decision ?? d.decision_outcome;
  const allowed = d.decision_outcome === "GRANTED";
  const details = [
    { label: "Answer", value: `${answerLabel(outcome)} (${outcome})` },
    { label: "Why", value: `${basis.label} — ${d.decision_basis}` },
  ];
  if (d.obligations?.length) details.push({ label: "Conditions attached", value: d.obligations.join(", ") });
  if (d.reason_codes?.length) details.push({ label: "Reason codes", value: d.reason_codes.join(", ") });
  if (d.policy_set_version) details.push({ label: "Policy version", value: d.policy_set_version });
  details.push({ label: "Decision ID", value: d.access_decision_id });
  return {
    status: allowed ? "done" : "refused",
    message: `${basis.meaning} This check was recorded.`,
    details,
  };
}

export async function sodEvaluateAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const actionType = text(fd, "action_type");
  const maker = text(fd, "maker_principal_id");
  if (!actionType || !UUID.test(maker)) return bad("Enter the action and the maker's principal ID.");
  const result = await evaluateSoD({
    identity, actionType, makerPrincipalId: maker,
    checkerPrincipalId: text(fd, "checker_principal_id") || undefined,
    subjectPrincipalId: text(fd, "subject_principal_id") || undefined,
  });
  if (!result.ok) return fail(result.error);
  const conflict = result.data.result === "CONFLICT";
  const why: Record<string, string> = {
    maker_is_checker: "The same person would both do and approve it.",
    checker_is_subject: "The approver is the person it is about.",
    maker_is_subject: "The maker would be acting on their own access.",
    held_duty_conflict: "Somebody already holds a duty that conflicts with this action.",
  };
  return {
    status: conflict ? "refused" : "done",
    message: conflict ? `Conflict: ${why[result.data.conflict_id ?? ""] ?? result.data.reason ?? "separation of duties is broken."}` : "No conflict. These people may do and approve this.",
    details: conflict && result.data.reason ? [{ label: "Detail", value: result.data.reason }] : undefined,
  };
}

export async function sodPrecheckAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const actions = list(fd, "candidate_actions");
  const principalId = text(fd, "principal_id");
  if (actions.length === 0) return bad("List the actions the grant would add.");
  const result = await validateSoDConflicts({
    identity, candidateActions: actions, principalId: principalId || undefined,
    legalEntityId: text(fd, "legal_entity_id") || undefined,
  });
  if (!result.ok) return fail(result.error);
  const v = result.data;
  if (v.conflict_free) return { status: "done", message: "No conflict. The grant would not break separation of duties." };
  return {
    status: "refused",
    message: "This grant would break separation of duties.",
    table: { headers: ["Action", "Conflicts with", "Already"], rows: v.conflicts.map((c) => [c.candidate_action, c.conflicts_with, c.source === "held" ? "held" : "in this grant"]) },
  };
}

export async function entityScopeAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const principalId = text(fd, "principal_id") || identity.principalId;
  const entities = list(fd, "legal_entity_ids");
  if (entities.length === 0) return bad("List at least one legal entity.");
  const result = await validateEntityScope({ identity, principalId, legalEntityIds: entities, actionType: text(fd, "action_type") || undefined });
  if (!result.ok) return fail(result.error);
  return {
    status: "done",
    message: "Where this person can act.",
    table: { headers: ["Legal entity", "Can act", "Basis"], rows: result.data.results.map((r) => [r.legal_entity_id, r.in_scope ? "Yes" : "No", r.basis]) },
  };
}

export async function delegatedAccessAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const principalId = text(fd, "principal_id");
  const legalEntityId = text(fd, "legal_entity_id") || identity.legalEntityId;
  const actionType = text(fd, "action_type");
  const delegator = text(fd, "delegator_principal_id");
  if (!UUID.test(principalId)) return bad("Enter the person's principal ID.");
  if (delegator && !actionType) return bad("Naming a lender needs an action too.");
  const result = await evaluateDelegatedAccess({
    identity, principalId, legalEntityId, actionType: actionType || undefined, delegatorPrincipalId: delegator || undefined,
  });
  if (!result.ok) return fail(result.error);
  const r = result.data;
  const details = [{ label: "Borrowed authority", value: r.has_delegated_access ? "Yes" : "No" }, { label: "Basis", value: r.basis }];
  if (r.held_directly !== undefined && actionType) details.push({ label: "Also holds it directly", value: r.held_directly ? "Yes" : "No" });
  if (r.delegated_actions?.length) details.push({ label: "Borrowed actions", value: r.delegated_actions.join(", ") });
  if (r.delegation_id) details.push({ label: "Delegation ID", value: r.delegation_id });
  return { status: "done", message: r.has_delegated_access ? "This person is acting on borrowed authority." : "No borrowed authority applies.", details };
}

export async function effectiveAccessAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const principalId = text(fd, "principal_id") || identity.principalId;
  if (!UUID.test(principalId)) return bad("The principal ID must be a UUID.");
  const result = await recomputeEffectiveAccess({ identity, principalId });
  if (!result.ok) return fail(result.error);
  const e = result.data;
  return {
    status: "done",
    message: `${e.effective_actions.length} action${e.effective_actions.length === 1 ? "" : "s"} in force now, from ${e.assignments.filter((a) => a.granting).length} granting grant(s).`,
    details: [{ label: "Actions", value: e.effective_actions.join(", ") || "None" }, { label: "Computed", value: when(e.computed_at) }],
  };
}

export async function availableActionsAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const resourceType = text(fd, "resource_type");
  const resourceId = text(fd, "resource_id");
  if (!resourceType || !resourceId) return bad("Enter the resource type and ID.");
  const result = await getAvailableActions({
    identity, resourceType, resourceId,
    principalId: text(fd, "principal_id") || undefined,
    legalEntityId: text(fd, "legal_entity_id") || undefined,
  });
  if (!result.ok) return fail(result.error);
  const a = result.data;
  const rows: string[][] = [
    ...a.available_actions.map((x) => [x, "Allowed", ""]),
    ...(a.step_up_actions ?? []).map((x) => [x.action, "Needs a fresh sign-in", x.reason]),
    ...(a.denied_actions ?? []).map((x) => [x.action, "Not allowed", x.basis]),
  ];
  return {
    status: "done",
    message: rows.length ? `${a.available_actions.length} of ${rows.length} action(s) allowed on ${resourceType} ${resourceId}.` : "No actions apply to this resource.",
    table: rows.length ? { headers: ["Action", "Answer", "Why"], rows } : undefined,
  };
}

// ═══ Decision log ══════════════════════════════════════════════════════════

export async function searchDecisionsAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const outcome = text(fd, "outcome");
  const result = await listAccessDecisions(identity, {
    principalId: text(fd, "principal_id") || undefined,
    actionType: text(fd, "action_type") || undefined,
    outcome: outcome === "GRANTED" || outcome === "DENIED" ? outcome : undefined,
    legalEntityId: text(fd, "legal_entity_id") || undefined,
    decidedFrom: rfc3339(text(fd, "decided_from")) ?? undefined,
    decidedTo: rfc3339(text(fd, "decided_to")) ?? undefined,
    limit: 50,
  });
  if (!result.ok) return fail(result.error);
  const rows = result.data.decisions ?? [];
  if (rows.length === 0) return { status: "done", message: "No decisions match." };
  return {
    status: "done",
    message: `${rows.length} decision${rows.length === 1 ? "" : "s"}${result.data.next_cursor ? " (newest 50 — narrow the search for older ones)" : ""}.`,
    table: {
      headers: ["When", "Who", "Action", "Answer", "Why", "Decision ID"],
      rows: rows.map((r) => [
        when(r.decided_at), r.principal_id, r.action_type,
        answerLabel(r.decision ?? r.decision_outcome),
        r.decision_basis === "redacted" ? "Hidden (needs iam.policy.read)" : explainDecisionBasis(r.decision_basis).label,
        r.access_decision_id,
      ]),
    },
  };
}

export async function lookupDecisionAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const id = text(fd, "access_decision_id");
  if (!id) return bad("Enter a decision ID.");
  const result = await getAccessDecision(id, identity);
  if (!result.ok) {
    if (result.error.status === 404) return { status: "refused", message: "No decision with that ID is visible to you." };
    return fail(result.error);
  }
  const d = result.data;
  const basis = explainDecisionBasis(d.decision_basis);
  const details = [
    { label: "Answer", value: `${answerLabel(d.decision ?? d.decision_outcome)} (${d.decision ?? d.decision_outcome})` },
    { label: "Who", value: d.principal_id },
    { label: "Action", value: d.action_type },
    { label: "Legal entity", value: d.legal_entity_id },
    { label: "When", value: when(d.decided_at) },
    { label: "Why", value: d.decision_basis === "redacted" ? "Hidden (needs iam.policy.read)" : `${basis.label} — ${d.decision_basis}` },
  ];
  if (d.resource_type) details.push({ label: "Resource", value: `${d.resource_type} ${d.resource_id ?? ""}`.trim() });
  if (d.matched_grants?.length) details.push({ label: "Matched grants", value: d.matched_grants.join(", ") });
  if (d.on_behalf_of) details.push({ label: "On behalf of", value: d.on_behalf_of });
  if (d.obligations?.length) details.push({ label: "Conditions attached", value: d.obligations.join(", ") });
  if (d.reason_codes?.length) details.push({ label: "Reason codes", value: d.reason_codes.join(", ") });
  if (d.policy_set_version) details.push({ label: "Policy version", value: d.policy_set_version });
  if (d.session_assurance) details.push({ label: "Sign-in assurance", value: d.session_assurance });
  details.push({ label: "Correlation ID", value: d.correlation_id });
  return { status: "done", message: basis.meaning, details };
}

// ═══ Authority limits (AU-03) ══════════════════════════════════════════════

const AMOUNT = /^\d+(\.\d{1,4})?$/;

function limitFields(fd: FormData) {
  return {
    currency: text(fd, "currency").toUpperCase() || undefined,
    lowerLimit: text(fd, "lower_limit") || undefined,
    upperLimit: text(fd, "upper_limit") || undefined,
    effectiveFrom: rfc3339(text(fd, "effective_from")) ?? undefined,
    effectiveTo: rfc3339(text(fd, "effective_to")) ?? undefined,
  };
}

export async function requestLimitAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const target = text(fd, "target");
  const principalId = target === "person" ? text(fd, "principal_id") : "";
  const roleId = target === "role" ? text(fd, "role_id") : "";
  const authorityType = text(fd, "authority_type");
  const f = limitFields(fd);
  if (target === "person" && !UUID.test(principalId)) return bad("Choose the person this limit is for.");
  if (target === "role" && !roleId) return bad("Choose the role this limit is for.");
  if (!authorityType) return bad("Choose what the limit governs.");
  if (!f.upperLimit || !AMOUNT.test(f.upperLimit)) return bad("Enter the maximum amount, for example 25000.");
  if (f.lowerLimit && !AMOUNT.test(f.lowerLimit)) return bad("The minimum must be an amount, for example 0.");
  const reason = readReason(fd);
  if (typeof reason === "string") return bad(reason);
  const result = await requestAuthorityLimit({
    identity, reason,
    limit: { principalId: principalId || undefined, roleId: roleId || undefined, authorityType,
      legalEntityId: text(fd, "legal_entity_id") || undefined, ...f },
  });
  if (!result.ok) return fail(result.error);
  refresh();
  return {
    status: "pending",
    message: "Limit requested. It applies only after someone other than you, and other than the person it is for, approves it.",
    details: [
      { label: "Governs", value: result.data.authority_type },
      { label: "Up to", value: `${result.data.upper_limit} ${result.data.currency}` },
    ],
  };
}

export async function changeLimitAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const id = text(fd, "id");
  const f = limitFields(fd);
  if (!id) return bad("Nothing was selected.");
  if (f.upperLimit && !AMOUNT.test(f.upperLimit)) return bad("The maximum must be an amount, for example 25000.");
  if (f.lowerLimit && !AMOUNT.test(f.lowerLimit)) return bad("The minimum must be an amount, for example 0.");
  const reason = readReason(fd);
  if (typeof reason === "string") return bad(reason);
  const result = await requestAuthorityLimitChange({ identity, limitId: id, reason, limit: f });
  if (!result.ok) return fail(result.error);
  refresh();
  return {
    status: "pending",
    message: "Change requested. The current limit keeps applying until someone else approves the new one.",
    details: [{ label: "Proposed maximum", value: `${result.data.upper_limit} ${result.data.currency}` }],
  };
}
