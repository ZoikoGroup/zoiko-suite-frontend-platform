// Server components that read policy-svc.
export { ApplicablePolicyPanel } from "./ApplicablePolicyPanel";
export { VersionHistoryPanel } from "./VersionHistoryPanel";
export {
  CreatePolicyForm,
  CreateVersionForm,
  ActivateVersionForm,
  EvaluatePolicyForm,
} from "./PolicyForms";
// Plain-English rendering of the three records policy-svc returns. Used by the
// forms above, and available to any panel that has one of these records in hand.
export { PolicySummary, VersionSummary, EvaluationSummary } from "./PolicySummary";

// Policies & Controls console (v2.0 layout): app/admin/policies/page.tsx imports
// these directly from ./console/*.
