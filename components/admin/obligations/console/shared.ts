const BASE = "/admin/obligations";

export { BASE };

/** Build a console-relative href. */
export function href(...parts: string[]) {
  return BASE + "/" + parts.join("/");
}

export type ObligationsCtx = {
  me: string;
  canManage: boolean;
  legalEntityId: string;
};

export const OBLIGATION_STATUS_LABEL: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  OPEN: { label: "Open", tone: "info" },
  IN_PROGRESS: { label: "In Progress", tone: "warning" },
  PENDING_APPROVAL: { label: "Pending Approval", tone: "warning" },
  CLOSED: { label: "Closed", tone: "success" },
  WAIVED: { label: "Waived", tone: "neutral" },
  NOT_APPLICABLE: { label: "Not Applicable", tone: "neutral" },
};

export const CLOCK_STATE_LABEL: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  PENDING: { label: "Pending", tone: "neutral" },
  ACTIVE: { label: "Active", tone: "info" },
  DUE_SOON: { label: "Due Soon", tone: "warning" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  SATISFIED: { label: "Satisfied", tone: "success" },
  WAIVED: { label: "Waived", tone: "neutral" },
  NOT_APPLICABLE: { label: "Not Applicable", tone: "neutral" },
};

export const CLOCK_CLASS_LABEL: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  HARD_LEGAL: { label: "Hard Legal", tone: "danger" },
  SOFT_INTERNAL: { label: "Soft Internal", tone: "warning" },
  ADVISORY: { label: "Advisory", tone: "info" },
};

export const CLOCK_PIPELINE_ORDER = ["PENDING", "ACTIVE", "DUE_SOON", "OVERDUE", "SATISFIED", "WAIVED", "NOT_APPLICABLE"] as const;