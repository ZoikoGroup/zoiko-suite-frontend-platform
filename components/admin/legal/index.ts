// Contract-lifecycle console: the write path against contract-lifecycle-svc.
export { DraftContractForm } from "./DraftContractForm";
// Server component that reads contract-lifecycle-svc and feeds the table.
export { ContractRegisterPanel } from "./ContractRegisterPanel";
export { ContractTable } from "./ContractTable";
export { ContractStats } from "./ContractStats";
export { ContractStatusBadge } from "./ContractStatusBadge";
export { ContractTerms } from "./ContractTerms";
export { LifecycleActions } from "./LifecycleActions";
// Server component that reads the contract's immutable version history.
export { VersionTimeline } from "./VersionTimeline";

// Domain-view panels from the platform work on main. Both sets are exported so
// the register/write path and the domain summaries stay reachable.
export { ContractLifecyclePanel } from "./ContractLifecyclePanel";
export { ClausesAndTemplatesPanel } from "./ClausesAndTemplatesPanel";
export { ObligationTrackingPanel } from "./ObligationTrackingPanel";
export { BoardResolutionsPanel } from "./BoardResolutionsPanel";
export { BoardMeetingForm } from "./BoardMeetingForm";
export { BoardResolutionForm } from "./BoardResolutionForm";
export { ResolutionActions } from "./ResolutionActions";
export { CorporateActionsAndCounterpartiesPanel } from "./CorporateActionsAndCounterpartiesPanel";
export { LegalActionHeader } from "./LegalActionHeader";
export { LegalSummaryBar } from "./LegalSummaryBar";
export { LegalProcessTimeline } from "./LegalProcessTimeline";
export { ClauseAndResolutionPanels } from "./ClauseAndResolutionPanels";
