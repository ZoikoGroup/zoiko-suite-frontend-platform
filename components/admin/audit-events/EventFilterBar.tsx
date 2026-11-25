import { Search, X } from "lucide-react";
import Link from "next/link";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import type { EventFilters } from "@/lib/api/audit-events";

/**
 * Filters for the event log.
 *
 * A plain GET form with no `action`, so it submits to this same route and the
 * filters live in the URL — same pattern as the Governance log's filter bar,
 * which this console treats as the template for "append-only evidence log,
 * filtered". No client JavaScript needed for a read-only filter.
 */
export function EventFilterBar({ filters }: { filters: EventFilters }) {
  const active = Boolean(
    filters.actor || filters.entity || filters.action || filters.workflow || filters.from || filters.to,
  );

  return (
    <form className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="action" className={LABEL}>
            Event type
          </label>
          <input
            id="action"
            name="action"
            defaultValue={filters.action ?? ""}
            placeholder="TENANT_PROVISIONED"
            className={FIELD}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="actor" className={LABEL}>
            Actor <span className={OPTIONAL}>(principal ID)</span>
          </label>
          <input id="actor" name="actor" defaultValue={filters.actor ?? ""} className={FIELD} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="entity" className={LABEL}>
            Legal entity
          </label>
          <input id="entity" name="entity" defaultValue={filters.entity ?? ""} className={FIELD} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="workflow" className={LABEL}>
            Workflow / request <span className={OPTIONAL}>(correlation ID)</span>
          </label>
          <input
            id="workflow"
            name="workflow"
            defaultValue={filters.workflow ?? ""}
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
          <label htmlFor="to" className={LABEL}>
            To <span className={OPTIONAL}>(RFC3339)</span>
          </label>
          <input
            id="to"
            name="to"
            defaultValue={filters.to ?? ""}
            placeholder="2026-08-01T00:00:00Z"
            className={FIELD}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="limit" className={LABEL}>
            Per page <span className={OPTIONAL}>(1–200)</span>
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
            href="/admin/audit-events"
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
