"use client";

import { useActionState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, TriangleAlert } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { CopyableId } from "@/components/admin/shared";
import { CELL } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { advanceInvoice } from "@/app/admin/finance/actions";
import { IDLE_PAYABLE_STATE, type PayableActionState } from "@/app/admin/finance/state";
import {
  INVOICE_STAGES,
  NEXT_STEP,
  formatDueDate,
  isOverdue,
  stageIndex,
  type InvoiceStatus,
  type VendorInvoice,
} from "@/lib/api/accounts-payable";

/**
 * Amber for the stage that has had no check yet, navy for validated, emerald once
 * approved and therefore payable, slate for the terminal hand-off. The ladder is
 * deliberate: colour carries how far the liability has travelled, so a reader
 * scanning the register sees the position without reading the labels.
 */
const STAGE_TONE: Record<InvoiceStatus, "warning" | "info" | "success" | "neutral"> = {
  RECEIVED: "warning",
  VALIDATED: "info",
  APPROVED: "success",
  PAYMENT_REQUESTED: "neutral",
};

const STAGE_FILL: Record<InvoiceStatus, string> = {
  RECEIVED: "bg-amber-400 dark:bg-amber-500",
  VALIDATED: "bg-navy-500 dark:bg-navy-400",
  APPROVED: "bg-emerald-500 dark:bg-emerald-400",
  PAYMENT_REQUESTED: "bg-slate-400 dark:bg-slate-500",
};

/**
 * How far along the four-stage lifecycle this invoice is.
 *
 * A badge alone says where it is; it does not say how much is left. Four segments
 * do both at a glance, which is what makes a register of mixed-stage invoices
 * scannable. The text alternative carries the same fact for screen readers — the
 * segments are decorative on their own.
 */
function StageMeter({ status }: { status: InvoiceStatus }) {
  const reached = stageIndex(status) + 1;

  return (
    <span className="mt-1.5 flex items-center gap-1.5">
      <span className="flex gap-0.5" aria-hidden="true">
        {INVOICE_STAGES.map((stage, index) => (
          <span
            key={stage}
            className={cn(
              "h-1 w-4 rounded-full",
              index < reached ? STAGE_FILL[status] : "bg-slate-200 dark:bg-slate-700",
            )}
          />
        ))}
      </span>
      <span className="text-[11px] text-slate-400 dark:text-slate-500">
        {reached} of {INVOICE_STAGES.length}
      </span>
    </span>
  );
}

/**
 * One invoice, with the single transition that is legal from where it stands.
 *
 * The button is derived from the row's own status rather than offered as a choice
 * of three, because only one of the three would ever succeed: the service moves
 * the invoice with `WHERE status = <expected>` as one atomic statement, so the
 * other two answer 422. Showing all three would be offering two refusals.
 *
 * That also means this row cannot act on a stale reading. If the register is out
 * of date, the derived action is the wrong one and the service refuses it — which
 * is why a 422 is rendered as "not from here" rather than as a failure.
 */
export function InvoiceRow({
  invoice,
  columnCount,
}: {
  invoice: VendorInvoice;
  columnCount: number;
}) {
  const [state, action, pending] = useActionState<PayableActionState, FormData>(
    advanceInvoice,
    IDLE_PAYABLE_STATE,
  );

  const next = NEXT_STEP[invoice.status];
  const overdue = isOverdue(invoice);

  // Who last moved it, and when. The lifecycle stamps a separate actor column per
  // stage, so the most recent one is the furthest along that is populated.
  const lastActor =
    invoice.payment_requested_by_principal_id ??
    invoice.approved_by_principal_id ??
    invoice.validated_by_principal_id ??
    invoice.created_by_principal_id;
  const lastActedAt =
    invoice.payment_requested_at ??
    invoice.approved_at ??
    invoice.validated_at ??
    invoice.created_at;

  const feedback =
    state.status === "error"
      ? { tone: "error" as const, message: state.message }
      : state.status === "out-of-sequence"
        ? { tone: "warning" as const, message: state.message }
        : state.status === "advanced"
          ? { tone: "success" as const, message: state.message }
          : null;

  return (
    <>
      <tr className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60">
        <td className={cn(CELL, "text-slate-900 dark:text-slate-100")}>
          <span className="block break-words font-medium">{invoice.invoice_number}</span>
          <span className="mt-0.5 block break-words text-xs text-slate-500 dark:text-slate-400">
            {invoice.vendor_id}
          </span>
          <CopyableId value={invoice.invoice_id} className="mt-0.5" />
        </td>

        <td
          className={cn(
            CELL,
            "whitespace-nowrap text-right tabular-nums text-slate-900 dark:text-slate-100",
          )}
        >
          {formatMoney(invoice.amount, invoice.currency_code)}
        </td>

        <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
          {formatDate(formatDueDate(invoice.due_date))}
          {overdue && (
            <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
              <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
              overdue
            </span>
          )}
        </td>

        <td className={CELL}>
          <Badge tone={STAGE_TONE[invoice.status]} dot={invoice.status !== "PAYMENT_REQUESTED"}>
            {invoice.status}
          </Badge>
          <StageMeter status={invoice.status} />
        </td>

        <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
          <CopyableId value={lastActor} className="text-xs" />
          <p className="mt-0.5 whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-500">
            {formatDateTime(lastActedAt)}
          </p>
        </td>

        <td className={cn(CELL, "text-right")}>
          {next ? (
            <form action={action} className="inline-flex">
              <input type="hidden" name="invoice_id" value={invoice.invoice_id} />
              <input type="hidden" name="action" value={next.action} />
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                loading={pending}
                aria-label={`${next.label} invoice ${invoice.invoice_number}`}
                className="shrink-0"
              >
                {next.label}
                {!pending && <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
              </Button>
            </form>
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Terminal — handed to Treasury
            </span>
          )}
        </td>
      </tr>

      {feedback && (
        <tr>
          <td colSpan={columnCount} className="px-4 pb-3">
            <div
              className={cn(
                "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm animate-fade-up",
                feedback.tone === "error" &&
                  "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
                feedback.tone === "warning" &&
                  "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
                feedback.tone === "success" &&
                  "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
              )}
              role="status"
              aria-live="polite"
            >
              {feedback.tone === "error" ? (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : feedback.tone === "warning" ? (
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span className="break-words">{feedback.message}</span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
