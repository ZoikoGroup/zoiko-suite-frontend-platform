import { HEAD } from "@/components/admin/shared/form";
import type { CustomerInvoice } from "@/lib/api/accounts-receivable";
import { CustomerInvoiceRow } from "./CustomerInvoiceRow";

/** Kept next to the header cells so a column added to one is added to the other —
 *  the row's feedback banner spans this, and a stale count clips it. */
const COLUMNS = ["Invoice", "Amount", "Due", "Status", "Last action", "Actions"] as const;

/**
 * The receivables register.
 *
 * Newest first, as the service orders it. The invoice ID is copyable in the first
 * column because recording a payment needs the matching general-ledger journal to
 * carry this id as its correlation_id — so this is the value that has to move by
 * hand between this table and the journal form above it.
 */
export function ReceivablesTable({ invoices }: { invoices: CustomerInvoice[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] border-collapse text-left">
        <thead className="border-b border-slate-200 dark:border-slate-800">
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column}
                scope="col"
                className={column === "Amount" || column === "Actions" ? `${HEAD} text-right` : HEAD}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {invoices.map((invoice) => (
            <CustomerInvoiceRow
              key={invoice.invoice_id}
              invoice={invoice}
              columnCount={COLUMNS.length}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
