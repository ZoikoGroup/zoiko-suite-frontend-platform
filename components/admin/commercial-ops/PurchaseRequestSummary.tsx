import { Badge } from "@/components/ui";
import { CopyableId, DetailList, StoredAs, type Detail } from "@/components/admin/shared";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  explainRequest,
  formatRequestAmount,
  type PurchaseRequest,
} from "@/lib/api/purchase-requests";

/**
 * One purchase request, in plain English.
 *
 * This replaces the JSON dump the two lookups used to show. `LookupById` falls
 * back to rendering the record as pretty-printed JSON when no `renderRecord` is
 * passed, and neither purchase-request lookup passed one — so "paste an ID, read
 * one record" answered a budget holder with a wire format, on the one screen
 * whose entire purpose is telling someone whether a spend was approved and by
 * whom.
 *
 * The order is the order the questions get asked in — where does this stand,
 * what happens next, who decided it, then the references needed to carry on —
 * rather than the order the columns are declared in.
 *
 * No "use client": this renders from the server-side register and from the
 * client lookup wrapper, and needs nothing from either runtime.
 */
export function PurchaseRequestSummary({
  request,
  /** `compact` drops the meaning paragraph and the ids that only matter to an
   *  auditor — used right after a write, where the reader already knows what
   *  they just did and wants confirmation rather than the full record. */
  variant = "full",
  className,
}: {
  request: PurchaseRequest;
  variant?: "full" | "compact";
  className?: string;
}) {
  const explained = explainRequest(request);
  const status = explained.status;
  const full = variant === "full";

  const details: Detail[] = [
    {
      label: "What is being requested",
      value: request.description || "Nothing was written here",
      hint: request.description
        ? "The description an approver reads before deciding"
        : "A request with no description gives an approver nothing to decide on",
      wide: true,
    },
    {
      label: "How much",
      value: formatRequestAmount(request.amount, request.currency_code),
      hint: `Recorded in ${request.currency_code}. Requests in different currencies are never added together — this service holds no exchange rates.`,
    },
    {
      label: "What happens next",
      value: explained.nextStep,
      wide: true,
    },
  ];

  if (status.decided) {
    const decidedBy = request.approved_by_principal_id ?? request.rejected_by_principal_id;
    const decidedAt = request.approved_at ?? request.rejected_at;

    details.push({
      label: request.status === "REJECTED" ? "Who turned it down" : "Who approved it",
      value: decidedBy ? (
        <CopyableId value={decidedBy} className="text-sm" />
      ) : (
        "Nobody is named on the record"
      ),
      hint: decidedAt
        ? formatDateTime(decidedAt)
        : "No time is recorded for the decision, which should not happen on a decided request",
    });
  }

  // A rejection's reason is the audit record for the refusal, so it is shown
  // whenever it exists rather than only on a REJECTED record: a reason stored
  // against a request in any other state is itself worth seeing.
  if (request.rejection_reason) {
    details.push({
      label: "Reason given",
      value: request.rejection_reason,
      hint: "This is the record of why the request was refused",
      wide: true,
    });
  }

  if (full) {
    details.push(
      {
        label: "Who raised it",
        value: <CopyableId value={request.requested_by_principal_id} className="text-sm" />,
        hint: "The person who asked for the spend — and who, for that reason, may not be the one who decides it",
      },
      {
        label: "When it was raised",
        value: formatDateTime(request.created_at),
      },
      {
        label: "Which company it applies to",
        value: <CopyableId value={request.legal_entity_id} className="text-sm" />,
      },
      {
        label: "Organisation",
        value: <CopyableId value={request.tenant_id} className="text-sm" />,
      },
      {
        label: "Request reference",
        value: <CopyableId value={request.request_id} className="text-sm" />,
        hint: "Paste this into the order form to place an order against this request, or quote it to report a problem",
      },
      {
        label: "Submission reference",
        value: <CopyableId value={request.correlation_id} className="text-sm" />,
        hint: "Ties this record to the submission that created it — a retry carrying the same reference resolves to this request rather than raising a second one",
      },
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={status.tone} dot={!status.decided} title={status.meaning}>
          {status.label}
        </Badge>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {explained.headline}
        </p>
      </div>

      {full && (
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {status.meaning}
        </p>
      )}

      {/* The wording above is this console's reading of the record. An operator
          quoting the request to whoever administers spend, or an auditor citing
          it in a finding, needs the value the service actually holds. */}
      <StoredAs code={status.raw} />

      <DetailList items={details} />
    </div>
  );
}
