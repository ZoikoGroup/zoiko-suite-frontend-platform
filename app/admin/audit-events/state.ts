// Shared contract between audit-events Server Actions and the components that
// call them.
//
// Lives outside actions.ts because "use server" files may only export async
// functions — the initial-state constants cannot live there.

export type AuditDomain =
  | "tax"
  | "legal"
  | "commercial-ops"
  | "finance"
  | "payroll"
  | "hr"
  | "compliance"
  | "";

/** Outcome of triggering a chain verification. */
export type VerifyChainState = {
  status: "idle" | "verified" | "compromised" | "error";
  message: string;
  checkedEvents?: number;
  verifiedAt?: string;
};

export const IDLE_VERIFY_STATE: VerifyChainState = { status: "idle", message: "" };

/** Outcome of a filter action (not a mutation — no writes). */
export type FilterState = {
  status: "idle" | "filtered" | "empty" | "error";
  message: string;
};

export const IDLE_FILTER_STATE: FilterState = { status: "idle", message: "" };

/** Outcome of an export action. */
export type ExportState = {
  status: "idle" | "exported" | "empty" | "error";
  message: string;
  /** The exported payload as a JSON string the UI can download. */
  payload?: string;
  filename?: string;
};

export const IDLE_EXPORT_STATE: ExportState = { status: "idle", message: "" };
