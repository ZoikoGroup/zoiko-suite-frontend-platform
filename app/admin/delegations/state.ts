import type { DelegationGrant } from "@/lib/api/delegations";

/**
 * Action states for the delegation register.
 *
 * `replayed` is kept apart from `granted` because the service is idempotent on
 * correlation_id: a resubmitted form resolves to the original grant and writes
 * nothing. That is the correct outcome, and reporting it as either a new grant
 * or an error would be a lie in opposite directions.
 *
 * `refused` is kept apart from `error` because every refusal this register
 * produces is a governance answer, not a fault — the caller may not delegate
 * another principal's authority, or may not name themselves the beneficiary, or
 * the delegator does not hold what is being delegated. Those need to read as
 * decisions, not as something that went wrong.
 */

export type GrantDelegationState =
  | { status: "idle" }
  | { status: "granted"; delegation: DelegationGrant; message: string }
  | { status: "replayed"; delegation: DelegationGrant; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export type RevokeDelegationState =
  | { status: "idle" }
  | { status: "revoked"; delegation: DelegationGrant; message: string }
  /** Already REVOKED or EXPIRED. Both terminal, so there is nothing to undo —
   *  a 409, and not a failure of this request. */
  | { status: "terminal"; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export const IDLE_GRANT_DELEGATION: GrantDelegationState = { status: "idle" };
export const IDLE_REVOKE_DELEGATION: RevokeDelegationState = { status: "idle" };
