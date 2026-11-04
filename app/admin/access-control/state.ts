import type { PermissionBundleDef, RoleDefinition } from "@/lib/api/access-control";

/**
 * Action states for the role catalogue.
 *
 * `replayed` is kept apart from `created` because the service is idempotent on
 * correlation_id: a resubmitted form resolves to the original role and writes
 * nothing. Reporting that as a new role would overstate what happened; reporting
 * it as an error would understate it.
 *
 * `notEnforced` is the state that earns its own case. Every other failure here
 * means "nothing changed". This one means the status change was refused
 * *because* it could not be propagated to authorization-svc — so the role is
 * still being enforced exactly as before, and the operator needs to know that
 * the thing they tried to switch off is still on. Folding it into `error` would
 * leave a reader unsure whether the retirement half-happened.
 *
 * `unauthorized` is separate from `refused` for the reason the rest of this
 * console keeps them apart: "you may not do this" and "we could not determine
 * whether you may" are different facts, and collapsing them reports a
 * governance-plane outage as a permissions problem.
 */

export type CreateRoleState =
  | { status: "idle" }
  | { status: "created"; role: RoleDefinition; message: string }
  | { status: "replayed"; role: RoleDefinition; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export type UpdateRoleState =
  | { status: "idle" }
  | { status: "updated"; role: RoleDefinition; message: string }
  /** The status change was refused because authorization-svc could not be
   *  reached. The role is unchanged and STILL ENFORCED. */
  | { status: "notEnforced"; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export type CreateBundleState =
  | { status: "idle" }
  | { status: "created"; bundle: PermissionBundleDef; message: string }
  | { status: "replayed"; bundle: PermissionBundleDef; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

/**
 * Editing ONE bundle that already exists — its permitted actions, its active
 * state, or both. Distinct from CreateBundleState for the same reason Update
 * is distinct from Create at the role level: "changed" and "created" are
 * different facts, and a reader watches a live register.
 *
 * `notEnforced` carries the same meaning UpdateRoleState gives it. An edit
 * propagates to authorization-svc BEFORE it is recorded and fails closed, so a
 * 503 means the change was not made and the bundle is still enforcing exactly
 * what it enforced before. Everything else has an ordinary reading.
 */
export type UpdateBundleState =
  | { status: "idle" }
  | { status: "updated"; bundle: PermissionBundleDef; message: string }
  /** The change was refused because authorization-svc could not be reached.
   *  The bundle is unchanged and is still enforcing its current actions. */
  | { status: "notEnforced"; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

/**
 * Detaching one bundle from its role — a withdrawal, not a deletion.
 *
 * Deliberately NOT broken into a "detached" / "already detached" pair the way
 * RevokeAssignmentState keeps `alreadyRevoked`. The service answers the first
 * detach and every replay of it with the same 200 and the same withdrawn
 * record, so the console cannot tell a fresh withdrawal from a confirmation of
 * one already made — and claiming the distinction would present a guess as a
 * fact. One state carries both, and the message says so.
 */
export type DetachBundleState =
  | { status: "idle" }
  | { status: "detached"; bundle: PermissionBundleDef; message: string }
  | { status: "notEnforced"; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export const IDLE_UPDATE_BUNDLE: UpdateBundleState = { status: "idle" };
export const IDLE_DETACH_BUNDLE: DetachBundleState = { status: "idle" };

export const IDLE_CREATE_ROLE: CreateRoleState = { status: "idle" };
export const IDLE_UPDATE_ROLE: UpdateRoleState = { status: "idle" };
export const IDLE_CREATE_BUNDLE: CreateBundleState = { status: "idle" };

// Grant, SoD, condition, delegation and decision-log states belong to
// authorization-svc and live in app/admin/authorization/state.ts.
