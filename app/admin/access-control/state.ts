import type { PermissionBundleDef, RoleDefinition } from "@/lib/api/access-control";
import type {
  ABACRule,
  AuthorizeDecision,
  DelegatedAuthority,
  PermissionBundle,
  Role,
  RoleAssignment,
  SoDRule,
} from "@/lib/api/authorization";

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

// ─── authorization-svc's own surface ────────────────────────────────────────
//
// Everything above is the authoring plane: define a role, attach a bundle,
// grant it. These are the evaluation plane — the questions the service exists
// to answer, and the two admin surfaces it shipped without a console.

/**
 * The outcome of asking the authorization plane a question.
 *
 * `denied` is deliberately NOT an error state, and it is the most important
 * distinction on this page. A denial is the service working: it evaluated the
 * request, reached an answer, and recorded the artifact. `unevaluated` is the
 * failure — the service could not reach a store or a dependency, refused to
 * guess, and recorded NOTHING. A console that showed those the same way would
 * be telling an operator "this person may not do that" when the truth is "we
 * do not know, and nobody has been told either way".
 *
 * Both `granted` and `denied` carry the decision, because both have a basis
 * worth reading and an artifact worth quoting.
 */
export type EvaluateAccessState =
  | { status: "idle" }
  | { status: "granted"; decision: AuthorizeDecision; message: string }
  | { status: "denied"; decision: AuthorizeDecision; message: string }
  /** The service could not evaluate. No decision exists, in either direction. */
  | { status: "unevaluated"; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

/**
 * Retiring or reactivating a role in the EVALUATION plane.
 *
 * Separate from UpdateRoleState, which drives access-control-svc's catalogue.
 * They are two records and the difference is load-bearing: the catalogue's
 * status is the governed authoring record, and THIS flag is what the evaluation
 * engine joins through. A role marked retired upstream while this stays true is
 * a retirement that is a label and not a control, which is exactly the defect
 * the service's own SetRoleActive comment describes.
 */
export type RoleEnforcementState =
  | { status: "idle" }
  | { status: "retired"; role: Role; message: string }
  | { status: "reactivated"; role: Role; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

/**
 * Declaring an attribute condition.
 *
 * `created` carries a blunt message for the same reason CreateSoDRuleState
 * does, and more so: an attribute condition is deny-only and takes effect
 * immediately, so a REQUIRE rule naming an attribute no calling service sends
 * will refuse its action for everybody from the moment it is saved. That is
 * the mechanism working as designed and it needs saying out loud before
 * somebody discovers it from an outage.
 */
export type CreateAbacRuleState =
  | { status: "idle" }
  | { status: "created"; rule: ABACRule; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export type AbacRuleEnforcementState =
  | { status: "idle" }
  | { status: "retired"; rule: ABACRule; message: string }
  | { status: "reactivated"; rule: ABACRule; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

/**
 * Lending authority, and withdrawing it.
 *
 * `alreadyWithdrawn` is its own case for the reason RevokeAssignmentState's
 * `alreadyRevoked` is: the service answers a second withdrawal with 409
 * because the transition is one-way, which means the operator's intent is
 * already satisfied. Reporting that as a failure invites a retry of something
 * that has already worked.
 */
export type DelegateAuthorityState =
  | { status: "idle" }
  | { status: "lent"; delegation: DelegatedAuthority; message: string }
  | { status: "withdrawn"; delegation: DelegatedAuthority; message: string }
  | { status: "alreadyWithdrawn"; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

/**
 * Retiring or reactivating a conflict rule.
 *
 * Its own state rather than reusing CreateSoDRuleState, because the messages
 * are opposites: creating one starts denying an action to everybody holding
 * the pair, and retiring one stops. Both are governance events and neither
 * should be reported in the other's words.
 */
export type SoDRuleEnforcementState =
  | { status: "idle" }
  | { status: "retired"; rule: SoDRule; message: string }
  | { status: "reactivated"; rule: SoDRule; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export const IDLE_SOD_ENFORCEMENT: SoDRuleEnforcementState = { status: "idle" };
export const IDLE_EVALUATE_ACCESS: EvaluateAccessState = { status: "idle" };
/**
 * Switching one permission set on or off.
 *
 * Separate from RoleEnforcementState because the blast radius is different and
 * the message has to say so: retiring a ROLE suspends every action it grants,
 * while retiring one SET withdraws only that set's actions and leaves the
 * role's others in force. Conflating them would have the console tell an
 * operator the wrong thing about what they just took away.
 */
export type BundleEnforcementState =
  | { status: "idle" }
  | { status: "withdrawn"; bundle: PermissionBundle; message: string }
  | { status: "restored"; bundle: PermissionBundle; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export const IDLE_ROLE_ENFORCEMENT: RoleEnforcementState = { status: "idle" };
export const IDLE_BUNDLE_ENFORCEMENT: BundleEnforcementState = { status: "idle" };
export const IDLE_CREATE_ABAC_RULE: CreateAbacRuleState = { status: "idle" };
export const IDLE_ABAC_ENFORCEMENT: AbacRuleEnforcementState = { status: "idle" };
export const IDLE_DELEGATE_AUTHORITY: DelegateAuthorityState = { status: "idle" };
