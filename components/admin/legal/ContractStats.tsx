import { FileSignature, Clock, PenLine, Coins } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { ContractStats as Stats } from "@/lib/api/contracts";

const TILE =
  "flex items-center gap-3 rounded-lg border border-slate-200 px-3.5 py-3 dark:border-slate-800";

type TileProps = {
  icon: typeof FileSignature;
  iconWrap: string;
  iconColor: string;
  value: string;
  label: string;
  truncate?: boolean;
};

function Tile({ icon: Icon, iconWrap, iconColor, value, label, truncate }: TileProps) {
  return (
    <div className={TILE}>
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconWrap}`}
      >
        <Icon className={`h-4.5 w-4.5 ${iconColor}`} aria-hidden="true" />
      </span>
      <div className={truncate ? "min-w-0" : undefined}>
        <p
          className={`text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100 ${
            truncate ? "truncate" : ""
          }`}
        >
          {value}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}

/**
 * Register summary.
 *
 * Contracted value counts ACTIVE agreements only — a draft is not an obligation
 * and adding it to the total would overstate what the entity is committed to.
 * Reported per currency and never summed across them.
 */
export function ContractStats({ stats }: { stats: Stats }) {
  const values = Object.entries(stats.activeValueByCurrency).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        icon={FileSignature}
        iconWrap="bg-emerald-50 dark:bg-emerald-500/10"
        iconColor="text-emerald-600 dark:text-emerald-400"
        value={String(stats.active)}
        label="In force"
      />
      <Tile
        icon={Clock}
        iconWrap="bg-amber-50 dark:bg-amber-500/10"
        iconColor="text-amber-600 dark:text-amber-400"
        value={String(stats.awaitingApproval)}
        label="Awaiting approval"
      />
      <Tile
        icon={PenLine}
        iconWrap="bg-slate-100 dark:bg-slate-800"
        iconColor="text-slate-600 dark:text-slate-300"
        value={String(stats.draft)}
        label="Draft"
      />
      <Tile
        icon={Coins}
        iconWrap="bg-navy-50 dark:bg-navy-500/10"
        iconColor="text-navy-700 dark:text-navy-300"
        value={
          values.length === 0
            ? "—"
            : values
                .map(([currency, amount]) =>
                  formatMoney(amount, currency, { maximumFractionDigits: 0 }),
                )
                .join(" · ")
        }
        label="Contracted value in force"
        truncate
      />
    </div>
  );
}
