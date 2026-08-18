"use server";

// Server Actions for delegated-authority-svc (:8136).
//
// Server Actions are reachable by direct POST, not only through this UI, so the
// session is verified inside every action rather than relying on the proxy's
// /admin matcher. That matters more here than on most pages: this register is
// the one that hands one principal another's authority.
//
// Two service properties shape everything below:
//
//  - A principal may only delegate their OWN authority. The delegator defaults
//    to the signed-in principal for exactly that reason. The field is still
//    submitted rather than assumed, because an administrator holding
//    DELEGATION_ADMINISTER legitimately sets it to someone else, and quietly
//    overwriting it would hide the 403 that tells an operator they lack that
//    grant.
//  - Writes are authorized against the LEGAL ENTITY, not the platform scope. A
//    denial means the principal lacks a DELEGATION_* grant on this entity.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createDelegation,
  explainDelegationError,
  revokeDelegation,
} from "@/lib/api/delegations";
import {
  type GrantDelegationState,
  type RevokeDelegationState,
} from "./state";

async function requireIdentity(): Promise<SessionIdentity & { principalId: string }> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };
}

const EXPIRED = "Your session has expired — sign in again.";

/**
 * datetime-local submits `2026-10-05T14:00` — local time, no seconds, no zone.
 * Go's time.Time parses RFC3339 and rejects that outright, so the service
 * answers `invalid request body` and says nothing about the real cause. The
 * same trap this console hit on board meeting dates; converted once here rather
 * than at each call site.
 */
function asRFC3339(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ─── Grant a delegation ──────────────────────────────────────────────────────

export async function grantDelegationAction(
  _prev: GrantDelegationState,
  formData: FormData,
): Promise<GrantDelegationState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const legalEntityId = String(formData.get("legal_entity_id") ?? "").trim() || identity.legalEntityId;
  const delegator = String(formData.get("delegator_principal_id") ?? "").trim() || identity.principalId;
  const delegate = String(formData.get("delegate_principal_id") ?? "").trim();
  const actionType = String(formData.get("action_type") ?? "").trim();
  const from = String(formData.get("effective_from") ?? "").trim();
  const to = String(formData.get("effective_to") ?? "").trim();
  const correlationId = String(formData.get("correlation_id") ?? "").trim();

  if (!legalEntityId) return { status: "error", message: "A legal entity is required — a delegation is entity-scoped." };
  if (!delegate) return { status: "error", message: "A delegate principal is required." };
  if (!actionType) return { status: "error", message: "An action type is required. A delegation covers exactly one action." };

  // Checked here as well as in the service. The service's own refusal is
  // correct but terse, and naming a slip before a round trip is cheaper.
  if (delegator === delegate) {
    return {
      status: "error",
      message: "The delegator and the delegate are the same principal. A delegation to yourself grants nothing.",
    };
  }
  // The console can see this one coming: naming someone else as delegator AND
  // yourself as delegate is the self-dealing shape, refused by the service
  // whatever grants the caller holds. Saying so here explains why, rather than
  // letting a bare 403 read as a missing grant that could be requested.
  if (delegator !== identity.principalId && delegate === identity.principalId) {
    return {
      status: "refused",
      message:
        "You cannot create a delegation that hands you another principal's authority. Administering delegations between other people is a separate, grantable power; being the beneficiary of one you created is not, because it is self-elevation however it is worded.",
    };
  }

  const effectiveFrom = asRFC3339(from);
  const effectiveTo = asRFC3339(to);
  if (!effectiveFrom) return { status: "error", message: "A start time is required." };
  if (!effectiveTo) return { status: "error", message: "An end time is required — a delegation must be time-bound." };
  if (effectiveTo <= effectiveFrom) {
    return { status: "error", message: "The end of the window must be after its start." };
  }
  if (!correlationId) {
    return { status: "error", message: "A correlation id is required; it is the idempotency key for this grant." };
  }

  const result = await createDelegation({
    identity,
    legalEntityId,
    delegatorPrincipalId: delegator,
    delegatePrincipalId: delegate,
    actionType,
    effectiveFrom,
    effectiveTo,
    correlationId,
  });

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 401) return { status: "unauthorized", message: explainDelegationError(message) };
    // 403 here is a governance answer, not a missing-permission accident: the
    // caller tried to delegate authority that is not theirs, name themselves
    // the beneficiary, or delegate something the delegator does not hold.
    if (status === 403) return { status: "refused", message: explainDelegationError(message) };
    return { status: "error", message: explainDelegationError(message) };
  }

  refresh();

  // 200 is an idempotent replay on correlation_id, 201 a real grant. Reporting
  // a replay as a new delegation would tell an operator they had just handed
  // out authority that was handed out days ago.
  if (result.status === 200) {
    return {
      status: "replayed",
      delegation: result.data,
      message: `This correlation id already granted ${result.data.action_type} to ${result.data.delegate_principal_id}, so nothing was written. The service answered 200, not an error.`,
    };
  }
  return {
    status: "granted",
    delegation: result.data,
    message: `${result.data.delegator_principal_id} delegated ${result.data.action_type} to ${result.data.delegate_principal_id} until ${new Date(result.data.effective_to).toLocaleString()}. It takes effect immediately and expires on its own — expiry is observed when this register is next read.`,
  };
}

// ─── Revoke a delegation ─────────────────────────────────────────────────────

export async function revokeDelegationAction(
  _prev: RevokeDelegationState,
  formData: FormData,
): Promise<RevokeDelegationState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const delegationId = String(formData.get("delegation_id") ?? "").trim();
  if (!delegationId) return { status: "error", message: "A delegation id is required." };

  const result = await revokeDelegation({ identity, delegationId });

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 401) return { status: "unauthorized", message: explainDelegationError(message) };
    if (status === 403) return { status: "refused", message: explainDelegationError(message) };
    // 409 is "already terminal". Nothing to undo, and not a failed request.
    if (status === 409) return { status: "terminal", message: explainDelegationError(message) };
    return { status: "error", message: explainDelegationError(message) };
  }

  refresh();

  return {
    status: "revoked",
    delegation: result.data,
    message: `Revoked ${result.data.action_type} from ${result.data.delegate_principal_id}. Revocation is terminal — this grant cannot be reinstated, only replaced by a new one.`,
  };
}
