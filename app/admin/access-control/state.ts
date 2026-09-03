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

export const IDLE_CREATE_ROLE: CreateRoleState = { status: "idle" };
export const IDLE_UPDATE_ROLE: UpdateRoleState = { status: "idle" };
export const IDLE_CREATE_BUNDLE: CreateBundleState = { status: "idle" };
