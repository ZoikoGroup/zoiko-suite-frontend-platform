import { Search, X } from "lucide-react";
import Link from "next/link";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import type { DecisionFilters } from "@/lib/api/governance";

/**
 * Filters for the decision log.
 *
 * A plain GET form with no `action`, so it submits to this same route and the
 * filters live in the URL. That keeps the whole panel a server component, makes
 * a filtered view linkable and reloadable, and needs no client JavaScript — the
 * right trade for a read-only filter over an append-only log.
 */
export function DecisionFilterBar({ filters }: { filters: DecisionFilters }) {
  const active = Boolean(
    filters.actor ||
      filters.entity ||
      filters.action ||
      filters.ruleBasis ||
      filters.from ||
      filters.to,
  );

  return (
    <form className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="action" className={LABEL}>
            Action type
          </label>
          <input
            id="action"
            name="action"
            defaultValue={filters.action ?? ""}
            placeholder="PAYROLL_RELEASE"
            className={FIELD}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="actor" className={LABEL}>
            Actor <span className={OPTIONAL}>(principal ID)</span>
          </label>
          <input
            id="actor"
            name="actor"
            defaultValue={filters.actor ?? ""}
            className={FIELD}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="entity" className={LABEL}>
            Legal entity <span className={OPTIONAL}>(not tenant)</span>
          </label>
          <input
            id="entity"
            name="entity"
            defaultValue={filters.entity ?? ""}
            className={FIELD}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="rule_basis" className={LABEL}>
            Rule basis
          </label>
          <input
            id="rule_basis"
            name="rule_basis"
            defaultValue={filters.ruleBasis ?? ""}
            placeholder="policy-code:version-id"
            className={FIELD}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="from" className={LABEL}>
            From <span className={OPTIONAL}>(RFC3339)</span>
          </label>
          <input
            id="from"
            name="from"
            defaultValue={filters.from ?? ""}
            placeholder="2026-07-01T00:00:00Z"
            className={FIELD}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="limit" className={LABEL}>
            Limit <span className={OPTIONAL}>(service caps at 200)</span>
          </label>
          <input
            id="limit"
            name="limit"
            type="number"
            min="1"
            max="200"
            defaultValue={filters.limit ?? 50}
            className={FIELD}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-navy-900 px-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-navy-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2 dark:bg-navy-600 dark:hover:bg-navy-500 dark:focus-visible:ring-offset-slate-900"
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          Apply filters
        </button>
        {active && (
          <Link
            href="/admin/governance"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-700 dark:text-slate-400 dark:hover:text-navy-300"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Clear
          </Link>
        )}
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Filters compose with AND. An invalid timestamp is a 400, not an empty result.
        </p>
      </div>
    </form>
  );
}
