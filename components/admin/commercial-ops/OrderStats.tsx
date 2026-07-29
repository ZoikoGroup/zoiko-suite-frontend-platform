import { CircleDot, CircleCheck, Coins } from "lucide-react";
import type { OrderStats as Stats } from "@/lib/api/purchase-orders";

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

const TILE =
  "flex items-center gap-3 rounded-lg border border-slate-200 px-3.5 py-3 dark:border-slate-800";

/**
 * Register summary.
 *
 * Open commitment is reported per currency and never summed across them: there
 * is no FX rate in this service, and inventing one would misstate the number.
 */
export function OrderStats({ stats }: { stats: Stats }) {
  const commitments = Object.entries(stats.openCommitmentByCurrency).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className={TILE}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10">
          <CircleDot className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        </span>
        <div>
          <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {stats.issued}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Open orders</p>
        </div>
      </div>

      <div className={TILE}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
          <CircleCheck className="h-4.5 w-4.5 text-slate-600 dark:text-slate-300" aria-hidden="true" />
        </span>
        <div>
          <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {stats.closed}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Closed</p>
        </div>
      </div>

      <div className={TILE}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 dark:bg-navy-500/10">
          <Coins className="h-4.5 w-4.5 text-navy-700 dark:text-navy-300" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {commitments.length === 0
              ? "—"
              : commitments
                  .map(([currency, amount]) => formatAmount(amount, currency))
                  .join(" · ")}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Open commitment</p>
        </div>
      </div>
    </div>
  );
}
