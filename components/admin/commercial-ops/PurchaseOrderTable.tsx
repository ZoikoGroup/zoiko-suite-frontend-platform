import { OrderRow } from "./OrderRow";
import type { PurchaseOrder } from "@/lib/api/purchase-orders";

const COLUMNS = [
  { key: "po_number", label: "PO number", align: "left" },
  { key: "status", label: "Status", align: "left" },
  { key: "total", label: "Total", align: "right" },
  { key: "version", label: "Version", align: "right" },
  { key: "issued", label: "Issued", align: "left" },
  { key: "actions", label: "Actions", align: "right" },
] as const;

const HEAD =
  "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400";

/**
 * The order register. A server component holding client rows — only the row
 * actions need interactivity, so the table itself never ships to the browser.
 */
export function PurchaseOrderTable({ orders }: { orders: PurchaseOrder[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] border-collapse text-left">
        <thead className="border-b border-slate-200 dark:border-slate-800">
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`${HEAD} ${column.align === "right" ? "text-right" : "text-left"}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {orders.map((order) => (
            <OrderRow
              key={order.purchase_order_id}
              order={order}
              columnCount={COLUMNS.length}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
