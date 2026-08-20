import { HEAD } from "@/components/admin/shared/form";
import type { FiscalPeriod } from "@/lib/api/financial-close";
import { FiscalPeriodRow } from "./FiscalPeriodRow";

/** Kept next to the header cells so a column added to one is added to the other —
 *  the row's feedback banner spans this, and a stale count clips it. */
const COLUMNS = ["Period", "Window", "Status", "Evidence", "Close"] as const;

/**
 * The fiscal period register.
 *
 * Ordered by the service (period_start DESC), so the most recent period is
 * first — but month-end is worked oldest-first, which is why the panel above
 * calls out the oldest period still open rather than leaving it to be found at
 * the bottom of the table.
 */
export function FiscalPeriodTable({ periods }: { periods: FiscalPeriod[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse text-left">
        <thead className="border-b border-slate-200 dark:border-slate-800">
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column}
                scope="col"
                className={column === "Close" ? `${HEAD} text-right` : HEAD}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {periods.map((period) => (
            <FiscalPeriodRow
              key={period.fiscal_period_id}
              period={period}
              columnCount={COLUMNS.length}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
