import { HEAD } from "@/components/admin/shared/form";
import type { StatementLine } from "@/lib/api/bank-reconciliation";
import { StatementLineRow } from "./StatementLineRow";

/** Kept next to the header cells so a column added to one is added to the other —
 *  the row's feedback banner spans this, and a stale count clips it. */
const COLUMNS = ["Bank line", "Amount", "Reconciliation", "Last action", "Resolve"] as const;

/**
 * The bank statement register.
 *
 * Newest first, as the service orders it. Every id here is copyable because the
 * match form takes a journal id by hand and the ids are what has to move between
 * this page, the ledger register above it, and a bank statement PDF.
 */
export function StatementLineTable({ lines }: { lines: StatementLine[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] border-collapse text-left">
        <thead className="border-b border-slate-200 dark:border-slate-800">
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column}
                scope="col"
                className={column === "Resolve" ? `${HEAD} text-right` : HEAD}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {lines.map((line) => (
            <StatementLineRow
              key={line.statement_line_id}
              line={line}
              columnCount={COLUMNS.length}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
