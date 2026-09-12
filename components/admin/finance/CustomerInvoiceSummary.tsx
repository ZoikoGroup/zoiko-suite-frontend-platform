import { Badge } from "@/components/ui";
import { CopyableId, DetailList, StoredAs, type Detail } from "@/components/admin/shared";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import {
  AR_STAGES,
  formatDueDate,
  isPastDue,
  stageIndex,
  type CustomerInvoice,
  type InvoiceStatus,
} from "@/lib/api/accounts-receivable";

const STAGE: Record<
  InvoiceStatus,
  { tone: "warning" | "info" | "success" | "neutral"; meaning: string }
> = {
  ISSUED: {
    tone: "info",
    meaning:
      "Taken onto the books, not yet a claim on the customer. Sending it — the evidence gate — and then either declaring it late or recording payment are each further steps, each a separate grant.",
  },
  SENT: {
    tone: "warning",
    meaning:
      "With the customer, awaiting payment. The evidence gate has been passed — the invoice carries a document of record — but the money has not arrived, and if the due date passes without it the invoice still has to be declared overdue before any further step is taken.",
  },
  OVERDUE: {
    tone: "warning",
    meaning:
      "Declared late: a principal holding AR_MARK_OVERDUE recorded it as overdue, with the receivable.overdue event published. It still awaits its money — payment is the only step left, and it will be refused until the general ledger holds a finalized journal for this invoice.",
  },
  PAID: {
    tone: "success",
    meaning:
      "Settled, and terminal here. Payment was recorded — and accepted only because general-ledger-svc held a FINALIZED journal for this invoice — and the payment.received event has been published. No further transition is possible.",
  },
};

/**
 * One customer invoice, in plain English.
 *
 * The same shape as the payables lookup, but answering the receivables page's
 * questions: where does this stand, how much is it, who moved it, then the
 * references. Where the register is bounded and header-only, this is the full
 * record — the AR-05 line items, the supply date, the customer-side references,
 * and any AR-08 cash-application payload — so a payment that cites a date and
 * reference is provable here even though the table shows only the receipt stamp.
 *
 * No "use client": this renders from the client lookup wrapper and needs nothing
 * from the browser runtime beyond what the shared components already handle.
 */
export function CustomerInvoiceSummary({
  invoice,
  className,
}: {
  invoice: CustomerInvoice;
  className?: string;
}) {
  const stage = STAGE[invoice.status];
  const pastDue = isPastDue(invoice);
  const lineCount = invoice.lines?.length ?? 0;

  const details: Detail[] = [
    {
      label: "How much",
      value: formatMoney(invoice.amount, invoice.currency_code),
      hint: `Recorded as net ${formatMoney(invoice.net_amount ?? 0, invoice.currency_code)} plus tax ${formatMoney(invoice.tax_amount ?? 0, invoice.currency_code)}. The service writes nothing until the amount equals the lines' net plus tax to the cent. ${
        lineCount > 0
          ? `The register's list is header-only, so the ${lineCount} ${
              lineCount === 1 ? "line" : "lines"
            } below are only visible here.`
          : "No line items on this read."
      }`,
    },
    {
      label: "Invoice date",
      value: formatDate(formatDueDate(invoice.invoice_date ?? "")),
      hint: "The date printed on the document we issued",
    },
    {
      label: "Supply date",
      value: formatDate(formatDueDate(invoice.supply_date ?? "")),
      hint: "The tax point — decides which tax period the receivable lands in",
    },
    {
      label: "Due date",
      value: formatDate(formatDueDate(invoice.due_date)),
      hint: pastDue && invoice.status !== "OVERDUE"
        ? "Past its due date and not yet declared overdue"
        : undefined,
    },
    {
      label: "Which company it applies to",
      value: <CopyableId value={invoice.legal_entity_id} className="text-sm" />,
    },
  ];

  for (const [label, value] of [
    ["Customer", invoice.customer_id],
    ["Sales order", invoice.sales_order_id],
    ["Customer billing reference", invoice.customer_billing_ref],
    ["Document of record", invoice.invoice_document_id],
  ] as const) {
    if (value) details.push({ label, value });
  }

  if (lineCount > 0 && invoice.lines) {
    details.push({
      label: "Lines",
      value: (
        <ul className="space-y-1.5">
          {invoice.lines.map((line) => (
            <li key={line.invoice_line_id} className="text-sm">
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {line.description || `Line ${line.line_number}`}
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                {" "}
                — {line.quantity} × {formatMoney(line.unit_price, invoice.currency_code)} ={" "}
                {formatMoney(line.net_amount, invoice.currency_code)}
                {line.tax_amount > 0 &&
                  ` + tax ${formatMoney(line.tax_amount, invoice.currency_code)}`}
                {line.tax_code != null && line.tax_code !== "" ? ` (${line.tax_code})` : ""}
              </span>
            </li>
          ))}
        </ul>
      ),
      wide: true,
    });
  }

  // The lifecycle actor stamps: one row per hop that has been reached. Each is a
  // separate authorization grant, so who sent, who declared late and who recorded
  // payment are real governance facts — and the payment one proves the segregation
  // of duties held, since it cannot be the issuer.
  const actors: { id?: string | null; at?: string | null; label: string }[] = [
    { id: invoice.created_by_principal_id, at: invoice.created_at, label: "Who issued it" },
    { id: invoice.sent_by_principal_id, at: invoice.sent_at, label: "Who sent it" },
    {
      id: invoice.marked_overdue_by_principal_id,
      at: invoice.marked_overdue_at,
      label: "Who declared it late",
    },
    {
      id: invoice.payment_received_by_principal_id,
      at: invoice.payment_received_at,
      label: "Who recorded payment",
    },
  ];
  for (const actor of actors) {
    if (!actor.id) continue;
    details.push({
      label: actor.label,
      value: <CopyableId value={actor.id} className="text-sm" />,
      hint: actor.at ? formatDateTime(actor.at) : undefined,
    });
  }

  details.push(
    {
      label: "Payment received",
      value: invoice.payment_date
        ? formatDate(formatDueDate(invoice.payment_date)) +
          (invoice.payment_reference ? ` · ${invoice.payment_reference}` : "")
        : "Not recorded",
      hint: invoice.payment_received_at
        ? "The AR-08 cash-application payload — the customer's own citation, distinct from the receipt stamp above"
        : undefined,
    },
    {
      label: "Invoice ID",
      value: <CopyableId value={invoice.invoice_id} className="text-sm" />,
      hint: "Paste this into the lookup above, or quote it to report a problem",
    },
    {
      label: "Submission reference",
      value: <CopyableId value={invoice.correlation_id} className="text-sm" />,
      hint: "Ties this record to the submission that created it — a retry carrying the same reference resolves to this invoice rather than opening a second receivable, and the general-ledger journal that lets this be paid carries this id as its correlation_id",
    },
  );

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={stage.tone} dot={invoice.status !== "PAID"}>
          {invoice.status}
        </Badge>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {invoice.invoice_number} — {invoice.customer_id}
        </p>
      </div>

      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {stage.meaning} Stage {stageIndex(invoice.status) + 1} of {AR_STAGES.length}
        {pastDue && invoice.status !== "OVERDUE"
          ? ", and currently past due but not yet declared."
          : "."}
      </p>

      {/* The wording above is this console's reading of the record. An operator
          quoting the invoice in a finding needs the value the service actually
          holds. */}
      <StoredAs code={invoice.status} />

      <DetailList items={details} />
    </div>
  );
}