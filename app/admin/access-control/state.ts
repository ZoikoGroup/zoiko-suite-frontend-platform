import type { PermissionBundleDef, RoleDefinition } from "@/lib/api/access-control";
import type {
  ABACRule,
  AccessDecision,
  AuthzTone,
  EntityScopeResult,
  AuthorizeDecision,
  DelegatedAuthority,
  PermissionBundle,
  Role,
  RoleAssignment,
  SoDConflict,
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

/**
 * Searching the decision log.
 *
 * `searched` carries the page AND the filters it was run with, because the
 * cursor is only meaningful alongside them: continuing a page with different
 * filters would silently return a different question's next page. The form
 * therefore re-submits both together rather than keeping the cursor alone.
 *
 * `empty` is kept apart from `searched` with no rows for the reason this
 * console keeps every such pair apart: on an AUDIT read, "this organisation
 * refused nobody in that window" and "your filters matched nothing" are
 * different facts, and reporting the second as the first would let somebody
 * close an investigation on a typo.
 */
export type DecisionSearchFilters = {
  principalId: string;
  outcome: "" | "GRANTED" | "DENIED";
  actionType: string;
  legalEntityId: string;
  decidedFrom: string;
  decidedTo: string;
};

export type DecisionSearchState =
  | { status: "idle" }
  | {
      status: "searched";
      decisions: AccessDecision[];
      /** Absent when this was the last page. Its presence is the only correct
       *  test for "there is more" — a short page is not proof of the end. */
      nextCursor?: string;
      filters: DecisionSearchFilters;
      message: string;
    }
  | { status: "empty"; filters: DecisionSearchFilters; message: string }
  /** A filter the service refused — a mistyped outcome, an unparseable date,
   *  an inverted window. Its own state because nothing was searched, and
   *  showing an empty table would answer the question wrongly. */
  | { status: "invalidFilter"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

/**
 * The pre-flight separation-of-duties check.
 *
 * `conflict` is NOT an error state, and that distinction is the whole point of
 * the check: a conflict is the control working, discovered before a grant was
 * made instead of after every use of it started being refused. It gets its own
 * status so the UI can say "do not grant this" in the words of a finding
 * rather than the words of a failure.
 */
export type SoDPrecheckState =
  | { status: "idle" }
  | {
      status: "clear";
      headline: string;
      detail: string;
      ownObjectRestricted: string[];
    }
  | {
      status: "conflict";
      headline: string;
      detail: string;
      conflicts: SoDConflict[];
      ownObjectRestricted: string[];
    }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export const IDLE_DECISION_SEARCH: DecisionSearchState = { status: "idle" };
export const IDLE_SOD_PRECHECK: SoDPrecheckState = { status: "idle" };

export const EMPTY_DECISION_FILTERS: DecisionSearchFilters = {
  principalId: "",
  outcome: "",
  actionType: "",
  legalEntityId: "",
  decidedFrom: "",
  decidedTo: "",
};

/**
 * "Where can this person act?" — the entity-scope check.
 *
 * `results` carries one row per company asked about, in the order asked, so a
 * caller can line the answers up against its own list. `inScopeCount` is kept
 * alongside rather than derived in the component because the headline sentence
 * ("can act in 2 of 5") is the answer, and recomputing it in two places is how
 * the two disagree.
 */
/**
 * What was submitted, echoed back on EVERY non-idle status.
 *
 * NOT a convenience. React re-creates the form subtree when the panel's shape
 * changes between statuses, which discards an uncontrolled input's value — so
 * after one submit the fields silently reverted to their defaults, and a
 * "tweak it and run it again" re-sent the ORIGINAL question while showing the
 * operator the text they had typed. Measured in a browser: a two-line entity
 * list came back as one line after the first submit.
 *
 * Echoing the submission back as `defaultValue` is the same fix
 * DecisionSearchState carries in its `filters` field, and for the same reason.
 */
export type EntityScopeSubmission = {
  principalId: string;
  actionType: string;
  /** The raw textarea contents, so line breaks and order survive. */
  legalEntityIdsRaw: string;
};

export type EntityScopeCheckState =
  | { status: "idle" }
  | {
      status: "checked";
      submitted: EntityScopeSubmission;
      results: Array<{ result: EntityScopeResult; explanation: string }>;
      inScopeCount: number;
      message: string;
    }
  | { status: "refused"; submitted: EntityScopeSubmission; message: string }
  | { status: "unauthorized"; submitted: EntityScopeSubmission; message: string }
  | { status: "error"; submitted: EntityScopeSubmission; message: string };

/**
 * "Whose authority is this person using?" — the delegated-access check.
 *
 * `bothPaths` is its own field rather than something the UI infers, because it
 * is the finding: somebody holding an action in their own right AND by
 * delegation is invisible to the evaluation endpoint, which names RBAC as the
 * basis when both apply. A four-eyes step reading only the outcome would count
 * the delegator's own authority as the delegate's.
 */
export type DelegatedAccessSubmission = {
  principalId: string;
  actionType: string;
  legalEntityId: string;
};

export type DelegatedAccessCheckState =
  | { status: "idle" }
  | {
      status: "checked";
      submitted: DelegatedAccessSubmission;
      headline: string;
      detail: string;
      tone: AuthzTone;
      delegatedActions: string[];
      bothPaths: boolean;
    }
  | { status: "refused"; submitted: DelegatedAccessSubmission; message: string }
  | { status: "unauthorized"; submitted: DelegatedAccessSubmission; message: string }
  | { status: "error"; submitted: DelegatedAccessSubmission; message: string };

export const IDLE_ENTITY_SCOPE_CHECK: EntityScopeCheckState = { status: "idle" };
export const IDLE_DELEGATED_ACCESS_CHECK: DelegatedAccessCheckState = { status: "idle" };
