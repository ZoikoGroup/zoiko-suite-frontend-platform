"use client";

import { useActionState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { CopyableId } from "@/components/admin/shared";
import { CELL } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { advanceCustomerInvoice } from "@/app/admin/finance/actions";
import { IDLE_RECEIVABLE_STATE, type ReceivableActionState } from "@/app/admin/finance/state";
import {
  LEGAL_HOPS,
  formatDueDate,
  isPastDue,
  type CustomerInvoice,
  type InvoiceStatus,
} from "@/lib/api/accounts-receivable";
/**
 * Navy while issued but not yet with the customer, amber once sent and awaiting
 * money, rose once declared late, emerald when paid. Rose is reserved for OVERDUE
 * because it is the only status that is a claim about the customer rather than
 * about our own progress.
 */
const STATUS_TONE: Record<InvoiceStatus, "info" | "warning" | "danger" | "success"> = {
  ISSUED: "info",
  SENT: "warning",
  OVERDUE: "danger",
  PAID: "success",
};

const PAY_FIELD =
  "h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-navy-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-600";

const OP_NOTE =
  "mt-1 block text-[11px] leading-snug text-slate-400 dark:text-slate-500";

/**
 * One customer invoice, with every transition that is legal from where it stands.
 *
 * Unlike the payables row, which derives a SINGLE next step, this offers the legal
 * SET — because from SENT both "record payment" and "declare overdue" succeed.
 * Reducing that to one would hide a real option; offering all three from every
 * status would offer refusals, since the service moves the invoice with
 * `WHERE status = <expected>` as one conditional statement and answers 422 for the
 * others.
 *
 * There is no stage meter here. The lifecycle branches — SENT goes to OVERDUE or
 * straight to PAID — so a row of four segments would assert that a paid-on-time
 * invoice had skipped a stage it was never due to reach.
 *
 * AR-05 and AR-08 read off this row too. The register's list is header-with-these-
 * fields-only (no lines), so the row can show the invoice and supply dates, the
 * split into net and tax, the document-evidence gate, and on a PAID invoice the
 * customer's own citation — the payment date and reference the payment was
 * recorded with.
 */
export function CustomerInvoiceRow({
  invoice,
  columnCount,
  currentPrincipalId,
}: {
  invoice: CustomerInvoice;
  columnCount: number;
  currentPrincipalId: string;
}) {
  const [state, action, pending] = useActionState<ReceivableActionState, FormData>(
    advanceCustomerInvoice,
    IDLE_RECEIVABLE_STATE,
  );

  const hops = LEGAL_HOPS[invoice.status];
  const pastDue = isPastDue(invoice);
  const canPay = hops.some(({ hop }) => hop === "pay");

  // Who last moved it, and when. The lifecycle stamps a separate actor column per
  // hop, so the most recent one is the furthest along that is populated. Note that
  // OVERDUE and PAID are siblings rather than sequential, so payment is checked
  // first: an invoice paid after being declared late carries both stamps.
  const lastActor =
    invoice.payment_received_by_principal_id ??
    invoice.marked_overdue_by_principal_id ??
    invoice.sent_by_principal_id ??
    invoice.created_by_principal_id;
  const lastActedAt =
    invoice.payment_received_at ??
    invoice.marked_overdue_at ??
    invoice.sent_at ??
    invoice.created_at;

  const feedback =
    state.status === "error"
      ? { tone: "error" as const, message: state.message }
      : state.status === "unledgered" || state.status === "not-yet-due"
        ? { tone: "info" as const, message: state.message }
        : // `unbalanced` is amber, not the neutral tone `unledgered` gets: "nothing
          // has been posted yet" is a step still to take, whereas "the books say a
          // different figure" is a disagreement somebody has to resolve. The two
          // AR refusal states — recording your own invoice's payment, and sending a
          // documentless invoice — are rules with a named remedy, so they warn.
          state.status === "unbalanced" ||
            state.status === "out-of-sequence" ||
            state.status === "entity-refused" ||
            state.status === "self-payment" ||
            state.status === "document-required"
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
            {invoice.customer_id}
          </span>
          <CopyableId value={invoice.invoice_id} className="mt-0.5" />

          {/*
            AR-05's two further dates, both recorded and both distinct from the due
            date column: invoice_date is the date printed on the document, supply
            date the tax point. The register list carries them, so this row proves
            they were stored without needing the detail read.
          */}
          {invoice.invoice_date && (
            <span className={OP_NOTE}>
              issued {formatDate(formatDueDate(invoice.invoice_date))}
              {invoice.supply_date &&
                ` · supplied ${formatDate(formatDueDate(invoice.supply_date))}`}
            </span>
          )}

          {/*
            The SEND evidence gate: a documentless invoice cannot be sent. Said
            here, next to the status, so the remedy is visible before the send
            button is reached and refused. The button stays enabled — the refusal
            is the service's to make, and it is the demonstrable part of the gate.
          */}
          {invoice.status === "ISSUED" && !invoice.invoice_document_id && (
            <span className="mt-1 block text-[11px] font-medium leading-snug text-navy-600 dark:text-navy-300">
              no document on record — sending will be refused
            </span>
          )}

          {/*
            Segregation of duties (§12.3): you issued this invoice, so recording
            ITS payment is refused (403 self_payment_not_allowed) no matter what
            grants you hold — the cash step belongs to a different principal. Shown
            here, given the payer holds AR_PAYMENT_RECEIVE, as guidance rather than
            a locked button, because the refusal itself is part of the demonstration.
          */}
          {canPay && invoice.created_by_principal_id === currentPrincipalId && (
            <span className="mt-1 block text-[11px] font-medium leading-snug text-navy-600 dark:text-navy-300">
              you issued this invoice — recording its payment requires a different
              principal
            </span>
          )}
        </td>

        <td
          className={cn(
            CELL,
            "whitespace-nowrap text-right tabular-nums text-slate-900 dark:text-slate-100",
          )}
        >
          {formatMoney(invoice.amount, invoice.currency_code)}
          {/* The register carries the net and tax split AR-05 stores, so the gross
              above is shown to be exactly the lines' net plus tax — the balance the
              service enforced before writing anything. */}
          {invoice.net_amount != null && (
            <span className="block whitespace-nowrap text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
              net {formatMoney(invoice.net_amount, invoice.currency_code)} · tax{" "}
              {formatMoney(invoice.tax_amount ?? 0, invoice.currency_code)}
            </span>
          )}
        </td>

        <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
          {formatDate(formatDueDate(invoice.due_date))}
          {/* Past due is this page's own arithmetic; OVERDUE is a recorded
              declaration by a principal who holds AR_MARK_OVERDUE. Saying "not
              declared" keeps the two apart — the register is the record of what
              was declared, not of what this table inferred. */}
          {pastDue && invoice.status !== "OVERDUE" && (
            <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
              past due, not declared
            </span>
          )}
        </td>

        <td className={CELL}>
          <Badge tone={STATUS_TONE[invoice.status]} dot={invoice.status !== "PAID"}>
            {invoice.status}
          </Badge>
        </td>

        <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
          <CopyableId value={lastActor} className="text-xs" />
          <p className="mt-0.5 whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-500">
            {formatDateTime(lastActedAt)}
          </p>
          {/* AR-08's cash-application payload, on the row whose terminal hop it
              records: the customer's own citation, distinct from the receipt stamp
              above it. payment_date is the customer's date for the money. */}
          {invoice.status === "PAID" && invoice.payment_date && (
            <p className="mt-0.5 whitespace-nowrap text-[11px] text-emerald-700 dark:text-emerald-400">
              customer cites {formatDate(formatDueDate(invoice.payment_date))}
              {invoice.payment_reference && ` · ${invoice.payment_reference}`}
            </p>
          )}
        </td>

        <td className={cn(CELL, "text-right")}>
          {hops.length > 0 ? (
            <div className="flex flex-wrap items-start justify-end gap-1.5">
              {hops.map(({ hop, label }) =>
                hop === "pay" ? (
                  <form
                    action={action}
                    key={hop}
                    className="inline-flex w-56 flex-col gap-1.5 rounded-lg border border-slate-200 bg-slate-50/60 p-2 text-left dark:border-slate-700 dark:bg-slate-800/40"
                  >
                    <input type="hidden" name="invoice_id" value={invoice.invoice_id} />
                    <input type="hidden" name="hop" value={hop} />
                    <div className="flex items-center gap-1.5">
                      <input name="payment_date" type="date" aria-label="Payment date" className={PAY_FIELD} />
                      <input
                        name="payment_reference"
                        placeholder="Reference"
                        aria-label="Payment reference"
                        className={PAY_FIELD}
                        autoComplete="off"
                        maxLength={200}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant="secondary"
                        loading={pending}
                        aria-label={`Record payment for invoice ${invoice.invoice_number}`}
                        className="shrink-0"
                      >
                        {label}
                        {!pending && <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
                      </Button>
                    </div>
                    <p className="text-[11px] leading-snug text-slate-400 dark:text-slate-500">
                      Both optional — a payment with neither is still a payment.
                    </p>
                  </form>
                ) : (
                  <form action={action} key={hop} className="inline-flex">
                    <input type="hidden" name="invoice_id" value={invoice.invoice_id} />
                    <input type="hidden" name="hop" value={hop} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="secondary"
                      loading={pending}
                      aria-label={`${label} for invoice ${invoice.invoice_number}`}
                      className="shrink-0"
                    >
                      {label}
                      {!pending && <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
                    </Button>
                  </form>
                ),
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Terminal — payment recorded
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
                // Neither a fault nor a success: the ledger has no journal for this
                // invoice yet, or the invoice is not late yet. Both are the control
                // working, and both name the next thing to do — rendered as
                // information so the reader does not read a correct refusal as a
                // malfunction.
                feedback.tone === "info" &&
                  "border-navy-200 bg-navy-50 text-navy-800 dark:border-navy-500/30 dark:bg-navy-500/10 dark:text-navy-200",
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
              ) : feedback.tone === "info" ? (
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
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