import { Badge } from "@/components/ui";
import type { ContractStatus } from "@/lib/api/contracts";

/**
 * Status presentation for a contract.
 *
 * EXPIRED and SUSPENDED are styled even though no transition in
 * contract-lifecycle-svc produces them, so a row written by some future
 * deadline sweep renders as a state rather than as a raw enum string.
 */
const PRESENTATION: Record<
  ContractStatus,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info"; dot?: boolean }
> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_APPROVAL: { label: "Pending approval", tone: "warning", dot: true },
  ACTIVE: { label: "Active", tone: "success", dot: true },
  EXPIRED: { label: "Expired", tone: "neutral" },
  TERMINATED: { label: "Terminated", tone: "danger" },
  SUSPENDED: { label: "Suspended", tone: "warning" },
};

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  // The column is TEXT with no CHECK constraint, so an unrecognised value is
  // possible. Showing it verbatim beats crashing the register on it.
  const presentation = PRESENTATION[status];
  if (!presentation) return <Badge tone="neutral">{status}</Badge>;

  return (
    <Badge tone={presentation.tone} dot={presentation.dot}>
      {presentation.label}
    </Badge>
  );
}
