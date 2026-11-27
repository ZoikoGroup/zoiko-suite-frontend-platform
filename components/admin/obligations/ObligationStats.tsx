import { cn } from "@/lib/utils";
import type { ObligationStats } from "@/lib/api/obligations";

const TILE =
  "flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3.5 py-3 dark:border-slate-800";

/**
 * Register roll-up.
 *
 * Uses the summariseObligations return type which includes open, inProgress,
 * overdue, closed, pastDueNotFlagged, and dueWithin7Days.
 */
export function ObligationStats({ summary }: { summary: ObligationStats }) {
  const openTotal = summary.open + summary.inProgress;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className={TILE}>
        <span className="text-xs text-slate-500 dark:text-slate-400">Outstanding</span>
        <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {openTotal}
        </span>
      </div>
      <div className={TILE}>
        <span className="text-xs text-slate-500 dark:text-slate-400">Due Soon (7d)</span>
        <span className="text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">
          {summary.dueWithin7Days}
        </span>
      </div>
      <div className={TILE}>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Marked overdue
        </span>
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
        <span className="text-xs text-slate-500 dark:text-slate-400">Discharged</span>
        <span className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
          {summary.closed}
        </span>
      </div>
    </div>
  );
}