/** Base path for all workflow console routes. */
export const BASE = "/admin/workflows";

/** Console tabs. */
export const TABS = [
  { key: "pending", label: "Pending Approvals" },
  { key: "instances", label: "Instances" },
  { key: "definitions", label: "Definitions" },
  { key: "audit", label: "Audit Engagements" },
  { key: "forms", label: "Forms" },
  { key: "cases", label: "Cases" },
  { key: "state-machines", label: "State Machines" },
] as const;

export type TabKey = typeof TABS[number]["key"];

/** Context passed to all register drawers. */
export interface WorkflowCtx {
  me: string;
  canManage: boolean;
  legalEntityId: string;
}