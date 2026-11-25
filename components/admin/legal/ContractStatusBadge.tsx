import { Badge } from "@/components/ui";
import type { ContractStatus } from "@/lib/api/contracts";

/**
 * Status presentation for a contract, one entry per domain.ContractStatus.
 *
 * EXECUTED, EXPIRED and ARCHIVED are styled even though no endpoint produces
 * them today, so a row written by some future job renders as a state rather
 * than as a raw enum string.
 */
const PRESENTATION: Record<
  ContractStatus,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info"; dot?: boolean }
> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  REVIEW: { label: "In review", tone: "warning", dot: true },
  APPROVED: { label: "Approved", tone: "info", dot: true },
  EXECUTED: { label: "Executed", tone: "info" },
  EFFECTIVE: { label: "Effective", tone: "success", dot: true },
  TERMINATED: { label: "Terminated", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
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
