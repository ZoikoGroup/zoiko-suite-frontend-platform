// delegated-authority-svc (:8136) — the register of who may act for whom.
//
// A delegation grant is one principal handing another the ability to act as if
// authorized for a single action_type, on a single legal entity, between two
// timestamps. Per docs/architecture/03-microservices.md §9.3 the service
// "maintains time-bound, scope-bound, approval-bound delegated authority
// chains," under one hard constraint: delegated authority must never exceed
// the delegator's own.
//
// Five properties shape this page, and four of them were gaps until 18 Aug:
//
//  1. A PRINCIPAL MAY ONLY DELEGATE THEIR OWN AUTHORITY. The delegator is the
//     caller. Naming somebody else as delegator needs DELEGATION_ADMINISTER on
//     the entity — a separate grant, held by delegation administrators and
//     almost nobody else. Until this pass the delegator was simply a field in
//     the request body: the service checked that the NAMED delegator held the
//     authority, and never that the caller had any right to give it away, so
//     DELEGATION_CREATE alone let a principal name a colleague as delegator,
//     name themselves as delegate, and mint themselves that colleague's
//     authority.
//  2. AN ADMINISTRATOR MAY NOT BE THE BENEFICIARY. Even with the administer
//     grant, a delegation created for someone else may not name its creator as
//     the delegate. Administering delegations between other people is a real
//     administrative power; being the beneficiary of one you created is the
//     same escalation by a longer route.
//  3. A READ IS SCOPED ONE OF TWO WAYS. With a legal entity, the caller needs
//     DELEGATION_VIEW on it and sees that entity's register. Without one, the
//     answer is the delegations the caller is personally party to. There is no
//     third mode: an unscoped read used to skip authorization entirely and
//     return the tenant's complete map of who may act for whom.
//  4. EXPIRY IS LAZY AND OBSERVED ON READ. Nothing sweeps in the background;
//     a due grant flips to EXPIRED when the register is next read, and
//     authority.expired is published at that moment. So the status shown here
//     is current as of this request — not as of a scheduler run.
//  5. NOTHING IS EVER DELETED. ACTIVE goes to REVOKED (explicitly) or EXPIRED
//     (by time), both terminal. The history is the evidence of what authority
//     was held and when, which is the whole point of the register.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

/** Wire shape. Field names match the Go json tags exactly. */
export type DelegationGrant = {
  delegation_id: string;
  tenant_id: string;
  legal_entity_id: string;
  delegator_principal_id: string;
  delegate_principal_id: string;
  action_type: string;
  effective_from: string;
  effective_to: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  created_by_principal_id: string;
  correlation_id: string;
  created_at: string;
  updated_at: string;
  revoked_by_principal_id?: string | null;
  revoked_at?: string | null;
  expired_at?: string | null;
};

export const DELEGATION_STATUSES = ["ACTIVE", "REVOKED", "EXPIRED"] as const;
export type DelegationStatus = (typeof DELEGATION_STATUSES)[number];

/**
 * Read the delegation register.
 *
 * Passing legalEntityId is what makes this an ENTITY read rather than a
 * personal one, and the two answer different questions:
 *
 *   - with it:    every delegation on that entity, requiring DELEGATION_VIEW.
 *   - without it: only the delegations the caller is delegator or delegate of.
 *
 * The second is not a degraded version of the first — it is the caller's own
 * involvement, and it is all an unprivileged principal is entitled to. Asking
 * for another principal's delegations without an entity scope is a 403, not an
 * empty list, because "you may not ask" and "there are none" are different
 * answers and only one of them is reassuring.
 */
export async function listDelegations(params: {
  identity: Identity;
  legalEntityId?: string;
  delegatorPrincipalId?: string;
  delegatePrincipalId?: string;
  status?: DelegationStatus;
  limit?: number;
  offset?: number;
}): Promise<ApiResult<DelegationGrant[]>> {
  return apiGet<DelegationGrant[]>("delegatedAuthority", "/v1/delegations/", {
    identity: params.identity,
    query: {
      legal_entity_id: params.legalEntityId,
      delegator_principal_id: params.delegatorPrincipalId,
      delegate_principal_id: params.delegatePrincipalId,
      status: params.status,
      limit: params.limit,
      offset: params.offset,
    },
  });
}

export async function getDelegation(params: {
  identity: Identity;
  delegationId: string;
}): Promise<ApiResult<DelegationGrant>> {
  return apiGet<DelegationGrant>(
    "delegatedAuthority",
    `/v1/delegations/${encodeURIComponent(params.delegationId)}`,
    { identity: params.identity },
  );
}

/**
 * Grant a delegation.
 *
 * correlationId is the idempotency key: the service is idempotent on
 * (tenant_id, correlation_id), so a retried submission resolves to the original
 * grant rather than a second one. Generate it once per submission, never per
 * attempt.
 *
 * delegatorPrincipalId is sent explicitly even though the service now requires
 * it to be the caller for an ordinary grant. It is in the wire contract, an
 * administrator legitimately sets it to someone else, and a client that
 * silently substituted the caller would hide the 403 that tells an operator
 * they lack DELEGATION_ADMINISTER.
 */
export async function createDelegation(params: {
  identity: Identity;
  legalEntityId: string;
  delegatorPrincipalId: string;
  delegatePrincipalId: string;
  actionType: string;
  effectiveFrom: string;
  effectiveTo: string;
  correlationId: string;
}): Promise<ApiWriteResult<DelegationGrant>> {
  return apiPost<DelegationGrant>(
    "delegatedAuthority",
    "/v1/delegations/",
    {
      legal_entity_id: params.legalEntityId,
      delegator_principal_id: params.delegatorPrincipalId,
      delegate_principal_id: params.delegatePrincipalId,
      action_type: params.actionType,
      effective_from: params.effectiveFrom,
      effective_to: params.effectiveTo,
      correlation_id: params.correlationId,
    },
    { identity: params.identity, correlationId: params.correlationId },
  );
}

/** Revoke an ACTIVE delegation. Terminal; a revoked grant cannot be reinstated. */
export async function revokeDelegation(params: {
  identity: Identity;
  delegationId: string;
}): Promise<ApiWriteResult<DelegationGrant>> {
  return apiPost<DelegationGrant>(
    "delegatedAuthority",
    `/v1/delegations/${encodeURIComponent(params.delegationId)}/revoke`,
    {},
    { identity: params.identity },
  );
}

/**
 * Turn a service refusal into something an operator can act on.
 *
 * Most of these are rules the console cannot check for itself, because they
 * depend on grants only authorization-svc knows about — which is exactly when a
 * bare error string leaves the reader with nothing to do next.
 */
export function explainDelegationError(message: string): string {
  if (message.includes("caller may only delegate their own authority")) {
    return "You can only delegate authority that is your own. Creating a delegation on someone else's behalf needs the DELEGATION_ADMINISTER grant on this legal entity — ask a delegation administrator, or set yourself as the delegator.";
  }
  if (message.includes("may not name the caller as delegate")) {
    return "A delegation you create for someone else cannot name you as the delegate. Administering delegations between other people is allowed; routing another principal's authority to yourself is not, however the grant is worded.";
  }
  if (message.includes("delegator does not hold the authority")) {
    return "The delegator does not hold this authority, so it cannot be delegated — a delegation may never exceed the delegator's own authority. Check the action type, or grant it to the delegator first.";
  }
  if (message.includes("delegate_principal_id must differ")) {
    return "The delegator and the delegate are the same principal. A delegation to yourself grants nothing.";
  }
  if (message.includes("effective_to must be after effective_from")) {
    return "The end of the window must be after its start. A delegation with no positive duration is not time-bound at all.";
  }
  if (message.includes("status must be one of")) {
    return "That is not a delegation status. Use ACTIVE, REVOKED or EXPIRED — a misspelled filter would otherwise report that nobody holds any delegated authority.";
  }
  if (message.includes("limit must be between")) {
    return "The register read asked for an out-of-range page. limit must be 1–500 and offset must not be negative.";
  }
  if (message.includes("requires legal_entity_id")) {
    return "Reading another principal's delegations needs a legal entity and DELEGATION_VIEW on it. Without one, you can only see delegations you are party to.";
  }
  if (message.includes("invalid delegation status transition")) {
    return "This delegation is no longer active — it has already been revoked, or it expired. Both are terminal, so there is nothing left to revoke.";
  }
  if (message.includes("delegation not found")) {
    return "No delegation with that id in this tenant.";
  }
  if (message.includes("tenant context missing")) {
    return "The request carried no tenant. Sign in again.";
  }
  if (message.includes("caller identity missing")) {
    return "The register received no verified principal. Sign in again.";
  }
  if (message.includes("authorization-svc unavailable")) {
    return "authorization-svc could not be reached, so no delegation could be checked. Nothing was written — this service fails closed rather than guessing.";
  }
  return message;
}
