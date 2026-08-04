import { cn } from "@/lib/utils";
import type { ObligationSummary } from "@/lib/api/obligations";

const TILE =
  "flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3.5 py-3 dark:border-slate-800";

/**
 * Register roll-up.
 *
 * `pastDueNotFlagged` is the tile worth having and the reason this is not just a
 * status count. obligations-svc has no deadline sweep — nothing moves a row to
 * OVERDUE when its due_date passes, and the service's own docs say an external
 * caller is expected to drive that transition. So a register can hold obligations
 * that are past their deadline while still reading OPEN, and a status-only summary
 * would report those as fine. This counts them and the page explains why they
 * exist.
 */
export function ObligationStats({ summary }: { summary: ObligationSummary }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className={TILE}>
        <span className="text-xs text-slate-500 dark:text-slate-400">Outstanding</span>
        <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {summary.open + summary.inProgress + summary.overdue}
        </span>
      </div>
      <div className={TILE}>
        <span className="text-xs text-slate-500 dark:text-slate-400">Marked overdue</span>
        <span
          className={cn(
            "text-lg font-semibold tabular-nums",
            summary.overdue > 0
              ? "text-rose-600 dark:text-rose-400"
              : "text-slate-900 dark:text-slate-100",
          )}
        >
          {summary.overdue}
        </span>
      </div>
      <div className={TILE}>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Past due, not flagged
        </span>
        <span
          className={cn(
            "text-lg font-semibold tabular-nums",
            summary.pastDueNotFlagged > 0
              ? "text-amber-600 dark:text-amber-400"
              : "text-slate-900 dark:text-slate-100",
          )}
        >
          {summary.pastDueNotFlagged}
        </span>
      </div>
      <div className={TILE}>
        <span className="text-xs text-slate-500 dark:text-slate-400">Discharged</span>
        <span className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
          {summary.closed}
        </span>
      </div>
    </div>
  );
}
