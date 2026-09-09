export { RoleCataloguePanel } from "./RoleCataloguePanel";
export { DefineRoleForm, UpdateRoleForm, AttachBundleForm } from "./AccessControlForms";
// authorization-svc, not access-control-svc — the live plane rather than the
// definition register. See AssignmentForms.tsx for why that split matters.
export { AssignRoleForm, AssignmentsPanel, SoDRulesPanel } from "./AssignmentForms";

// ─── authorization-svc's own surface ────────────────────────────────────────
//
// The evaluation plane. Everything above changes what these answer; until this
// pass, nothing in the console could ask them anything.
//
// One decision in plain English, shared by the check and the rationale lookup.
// Prefer it over rendering decision_outcome/decision_basis directly anywhere —
// a bare "sod:conflict_with=PAYMENT_INITIATE" is not an explanation.
export { AccessDecisionSummary } from "./AccessDecisionSummary";
export { EvaluateAccessForm } from "./EvaluateAccessForm";
export { AccessDecisionLookup } from "./AccessDecisionLookup";
export { DeclareAbacRuleForm, AbacRulesList, AbacRuleEnforcementButton } from "./AbacRuleForms";
export { RoleEnforcementButton } from "./RoleEnforcementButton";
// Withdraws ONE of a role's permission sets rather than the whole role —
// see the component for why that distinction is load-bearing.
export { BundleEnforcementButton } from "./BundleEnforcementButton";
export {
  EvaluationRolesPanel,
  EvaluationDelegationsPanel,
  AbacRulesPanel,
} from "./EvaluationPlanePanels";
export { DelegateAuthorityForm, WithdrawDelegationButton } from "./DelegationForms";

// ─── the audit read and the pre-flight check ────────────────────────────────
//
// Both are reads. DecisionLogPanel is what makes the service's "denials must
// be evidentially retrievable" obligation true from here — AccessDecisionLookup
// needs a reference, and a denial's reference exists only in the response
// handed to the service that was refused.
//
// SoDPrecheckForm asks the one question POST /v1/authorize structurally cannot:
// whether a grant WOULD breach separation of duties, before it exists. Neither
// records a decision artifact, unlike EvaluateAccessForm above.
export { DecisionLogPanel } from "./DecisionLogPanel";
export { SoDPrecheckForm } from "./SoDPrecheckForm";
