import type { PermissionBundleDef, RoleDefinition } from "@/lib/api/access-control";
import type { RoleAssignment, SoDRule } from "@/lib/api/authorization";

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
 * Assignment states — authorization-svc, not access-control-svc.
 *
 * `granted` says what the other three cannot: this is the only action in this
 * console that actually gives someone access. Defining a role and attaching a
 * bundle grant nothing until this succeeds, so the success message names the
 * effect rather than the record.
 *
 * `scopeMismatch` is its own case because the backend answers it as a plain
 * 404 `role_not_found`. Two very different things produce that: the role does
 * not exist, or it exists in another tenant. Reporting the second as "not
 * found" sends an operator hunting for a typo in a role code that is spelled
 * correctly.
 */
export type AssignRoleState =
  | { status: "idle" }
  | { status: "granted"; assignment: RoleAssignment; message: string }
  | { status: "scopeMismatch"; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

/**
 * `alreadyRevoked` is separate from `error` on purpose. A second revoke
 * answers 404 because the store matches only assignments still in force —
 * which means the operator's intent is already satisfied. Showing that as a
 * failure invites them to retry something that has already worked.
 */
export type RevokeAssignmentState =
  | { status: "idle" }
  | { status: "revoked"; assignment: RoleAssignment; message: string }
  | { status: "alreadyRevoked"; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

/**
 * `created` carries a deliberately blunt message: a new SoD rule can start
 * denying requests from principals who held both actions a moment ago, with
 * no further action by anyone. That is the point of the feature and the
 * reason it needs saying out loud in the UI.
 */
export type CreateSoDRuleState =
  | { status: "idle" }
  | { status: "created"; rule: SoDRule; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export const IDLE_CREATE_ROLE: CreateRoleState = { status: "idle" };
export const IDLE_UPDATE_ROLE: UpdateRoleState = { status: "idle" };
export const IDLE_CREATE_BUNDLE: CreateBundleState = { status: "idle" };
export const IDLE_ASSIGN_ROLE: AssignRoleState = { status: "idle" };
export const IDLE_REVOKE_ASSIGNMENT: RevokeAssignmentState = { status: "idle" };
export const IDLE_CREATE_SOD_RULE: CreateSoDRuleState = { status: "idle" };
