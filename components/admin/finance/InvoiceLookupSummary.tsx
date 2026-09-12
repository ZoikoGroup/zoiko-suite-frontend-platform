import { Badge } from "@/components/ui";
import { CopyableId, DetailList, StoredAs, type Detail } from "@/components/admin/shared";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import {
  INVOICE_STAGES,
  NEXT_STEP,
  formatDueDate,
  isOverdue,
  stageIndex,
  type InvoiceStatus,
  type VendorInvoice,
} from "@/lib/api/accounts-payable";

const STAGE: Record<
  InvoiceStatus,
  { tone: "warning" | "info" | "success" | "neutral"; meaning: string }
> = {
  RECEIVED: {
    tone: "warning",
    meaning:
      "Taken onto the books but not yet checked. Validation must follow before this is a step closer to paying: no payment may proceed without approval-state and evidence-state validation.",
  },
  VALIDATED: {
    tone: "info",
    meaning:
      "The evidence check has been passed — the invoice has a document of record on file. It still needs approval, which must come from a different principal than the one who recorded it (segregation of duties).",
  },
  APPROVED: {
    tone: "success",
    meaning:
      "Approved for payment; an open payable has been posted to payable-open-item-svc (AP-08). It is a liability awaiting a payment request — executed payments themselves belong to Treasury, not this service.",
  },
  PAYMENT_REQUESTED: {
    tone: "neutral",
    meaning:
      "Terminal here. A payment.requested event has been published; executing the payment belongs to a future Treasury service. No further transition is possible.",
  },
};

/**
 * One vendor invoice, in plain English.
 *
 * The lookup used to render as JSON — `LookupById` falls back to that when no
 * `renderRecord` is passed, and this lookup never passed one. So "paste an
 * invoice ID, read one record" answered a finance operator with a wire format
 * at the exact place whose purpose is telling them whether a liability was
 * recorded, validated, approved, and sent for payment, and by whom.
 *
 * The order is the order the questions get asked in — where does this stand,
 * how much is it, who moved it, then the references that carry the work on
 * — rather than the order the columns are declared in.
 *
 * No "use client": this renders from the client lookup wrapper and needs
 * nothing from the browser runtime beyond what the shared components already
 * handle.
 */
export function InvoiceLookupSummary({
  invoice,
  className,
}: {
  invoice: VendorInvoice;
  className?: string;
}) {
  const stage = STAGE[invoice.status];
  const next = NEXT_STEP[invoice.status];
  const overdue = isOverdue(invoice);
  const lineCount = invoice.lines.length;

  const details: Detail[] = [
    {
      label: "How much",
      value: formatMoney(invoice.amount, invoice.currency_code),
      hint: `Recorded as net ${formatMoney(invoice.net_amount, invoice.currency_code)} plus tax ${formatMoney(invoice.tax_amount, invoice.currency_code)}, across ${lineCount} ${lineCount === 1 ? "line" : "lines"}. Amounts in different currencies are never added together — this service holds no exchange rates.`,
    },
    {
      label: "Supply date",
      value: formatDate(formatDueDate(invoice.supply_date)),
      hint: "The tax point — decides which tax period the invoice lands in",
    },
    {
      label: "Due date",
      value: formatDate(formatDueDate(invoice.due_date)),
      hint: overdue
        ? "Past its due date and not yet sent for payment"
        : undefined,
    },
    {
      label: "Which company it applies to",
      value: <CopyableId value={invoice.legal_entity_id} className="text-sm" />,
    },
    {
      label: "What happens next",
      value: next
        ? `${next.label} — ${next.becomes}`
        : "Terminal — handed to Treasury for execution",
      wide: true,
    },
  ];

  if (lineCount > 0) {
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

  details.push(
    {
      label: "Vendor",
      value: invoice.vendor_id,
      hint: "Free text — no Vendor Master service exists to check it against",
    },
    {
      label: "Document date",
      value: formatDate(formatDueDate(invoice.invoice_date)),
      hint: "The date printed on the supplier's document",
    },
  );

  for (const ref of [
    { present: invoice.purchase_order_id, label: "Purchase order", hint: undefined },
    { present: invoice.goods_receipt_ref, label: "Goods receipt", hint: undefined },
    { present: invoice.invoice_document_id, label: "Document of record", hint: undefined },
  ]) {
    if (ref.present) details.push({ label: ref.label, value: ref.present });
  }

  // The lifecycle actor stamps: one row per stage that has been reached. Each
  // is a separate authorization grant, so who did what is a real governance
  // fact, not history noise.
  const actors: { id?: string | null; at?: string | null; label: string }[] = [
    { id: invoice.created_by_principal_id, at: invoice.created_at, label: "Who recorded it" },
    { id: invoice.validated_by_principal_id, at: invoice.validated_at, label: "Who validated it" },
    { id: invoice.approved_by_principal_id, at: invoice.approved_at, label: "Who approved it" },
    {
      id: invoice.payment_requested_by_principal_id,
      at: invoice.payment_requested_at,
      label: "Who requested payment",
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
      label: "Invoice ID",
      value: <CopyableId value={invoice.invoice_id} className="text-sm" />,
      hint: "Paste this into the lookup above, or quote it to report a problem",
    },
    {
      label: "Submission reference",
      value: <CopyableId value={invoice.correlation_id} className="text-sm" />,
      hint: "Ties this record to the submission that created it — a retry carrying the same reference resolves to this invoice rather than booking the liability twice",
    },
  );

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={stage.tone} dot={invoice.status !== "PAYMENT_REQUESTED"}>
          {invoice.status}
        </Badge>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {invoice.invoice_number} — {invoice.vendor_id}
        </p>
      </div>

      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {stage.meaning} Stage {stageIndex(invoice.status) + 1} of {INVOICE_STAGES.length}
        {overdue && invoice.status !== "PAYMENT_REQUESTED" ? ", and currently past due." : "."}
      </p>

      {/* The wording above is this console's reading of the record. An operator
          quoting the invoice in a finding needs the value the service actually
          holds. */}
      <StoredAs code={invoice.status} />

      <DetailList items={details} />
    </div>
  );
}