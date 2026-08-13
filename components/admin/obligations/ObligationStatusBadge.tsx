import { Badge } from "@/components/ui";

/**
 * Status badge for an obligation.
 *
 * OPEN is deliberately neutral rather than green. An open obligation is an
 * outstanding duty, not a healthy state — the only genuinely good state here is
 * CLOSED, which is the one that has been discharged. Colouring OPEN green would
 * make a register full of unmet statutory duties read as a clean bill of health.
 *
 * An unrecognised value still renders, as a neutral badge with the raw string:
 * obligation_status is a VARCHAR with no CHECK constraint, so a value outside the
 * state machine is storable in principle and should be visible rather than
 * silently blank.
 */
const TONES: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  OPEN: "info",
  IN_PROGRESS: "neutral",
  OVERDUE: "danger",
  CLOSED: "success",
};

export function ObligationStatusBadge({ status }: { status: string }) {
  return <Badge tone={TONES[status] ?? "neutral"}>{status.replace(/_/g, " ")}</Badge>;
}

/**
 * Severity badge.
 *
 * Severity is data-only in the backend (no enum, no validation), so an unknown
 * value renders neutral rather than being dropped.
 */
const SEVERITY_TONES: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  CRITICAL: "danger",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return <Badge tone={SEVERITY_TONES[severity] ?? "neutral"}>{severity}</Badge>;
}
