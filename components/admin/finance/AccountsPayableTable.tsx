import { HEAD } from "@/components/admin/shared/form";
import type { VendorInvoice } from "@/lib/api/accounts-payable";
import { InvoiceRow } from "./InvoiceRow";

/** Kept next to the header cells so a column added to one is added to the other —
 *  the row's feedback banner spans this, and a stale count clips it. */
const COLUMNS = ["Invoice", "Amount", "Due", "Stage", "Last action", "Next step"] as const;

/**
 * The payables register.
 *
 * Newest first, as the service orders it. The invoice ID is copyable in the first
 * column because the read-one panel takes it by hand, and every principal id is
 * copyable for the same reason — they are the values that have to move between
 * this page and a log.
 */
export function AccountsPayableTable({ invoices }: { invoices: VendorInvoice[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] border-collapse text-left">
        <thead className="border-b border-slate-200 dark:border-slate-800">
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column}
                scope="col"
                className={
                  column === "Amount" || column === "Next step" ? `${HEAD} text-right` : HEAD
                }
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {invoices.map((invoice) => (
            <InvoiceRow
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
