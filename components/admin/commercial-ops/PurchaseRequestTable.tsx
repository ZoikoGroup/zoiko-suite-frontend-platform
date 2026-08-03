import { Badge } from "@/components/ui";
import { CopyableId } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import type { PurchaseRequest, RequestStatus } from "@/lib/api/purchase-requests";

const STATUS_TONE: Record<RequestStatus, "success" | "danger" | "warning"> = {
  APPROVED: "success",
  REJECTED: "danger",
  PENDING: "warning",
};

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * The requisition register.
 *
 * The ID column is copyable because it is the one value that has to move between
 * panels by hand: issuing an order against an approved request means pasting its
 * id into the issue form, and there is no picker for it.
 *
 * A rejection shows its reason inline rather than behind a lookup — a refusal
 * whose reason is one click away reads as an unexplained refusal.
 */
export function PurchaseRequestTable({ requests }: { requests: PurchaseRequest[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse text-left">
        <thead className="border-b border-slate-200 dark:border-slate-800">
          <tr>
            <th scope="col" className={HEAD}>
              Description
            </th>
            <th scope="col" className={HEAD}>
              Amount
            </th>
            <th scope="col" className={HEAD}>
              Status
            </th>
            <th scope="col" className={HEAD}>
              Raised
            </th>
            <th scope="col" className={HEAD}>
              Decided by
            </th>
            <th scope="col" className={HEAD}>
              Request ID
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {requests.map((request) => {
            const decidedBy =
              request.approved_by_principal_id ?? request.rejected_by_principal_id ?? null;
            const decidedAt = request.approved_at ?? request.rejected_at ?? null;

            return (
              <tr
                key={request.request_id}
                className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <td className={cn(CELL, "max-w-[20rem] text-slate-900 dark:text-slate-100")}>
                  <span className="break-words">{request.description}</span>
                  {request.status === "REJECTED" && request.rejection_reason && (
                    <p className="mt-1 break-words text-[11px] text-rose-600 dark:text-rose-400">
                      Reason: {request.rejection_reason}
                    </p>
                  )}
                </td>
                <td className={cn(CELL, "whitespace-nowrap tabular-nums text-slate-900 dark:text-slate-100")}>
                  {formatAmount(request.amount, request.currency_code)}
                </td>
                <td className={CELL}>
                  <Badge tone={STATUS_TONE[request.status]} dot={request.status === "PENDING"}>
                    {request.status}
                  </Badge>
                  {request.status === "APPROVED" && (
                    <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                      issuable
                    </p>
                  )}
                </td>
                <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
                  {formatDateTime(request.created_at)}
                </td>
                <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                  {decidedBy ? (
                    <>
                      <CopyableId value={decidedBy} className="text-xs" />
                      {decidedAt && (
                        <p className="mt-0.5 whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-500">
                          {formatDateTime(decidedAt)}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-[11px] italic text-slate-400 dark:text-slate-500">
                      awaiting a decision
                    </span>
                  )}
                </td>
                <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                  <CopyableId value={request.request_id} className="text-xs" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
