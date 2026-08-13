import { CloudOff, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui";
import { PanelEmptyState, CopyableId, Pagination } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  listLeases,
  summariseLeases,
  isLeaseLive,
  type LeaseFilters,
} from "@/lib/api/secret-vault";

const TILE =
  "flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3.5 py-3 dark:border-slate-800";

/**
 * Issued leases.
 *
 * The stale-GRANTED count is the number worth looking at. Nothing in this service
 * transitions a lease to EXPIRED — there is no expiry sweep — so a lease whose
 * `expires_at` has passed keeps `status: GRANTED` forever. Counting raw statuses
 * would report long-dead access as live, so live/stale is decided by the
 * timestamp and the two are shown apart.
 *
 * The tiles count THIS PAGE, not the register. The route returns no total, so a
 * filtered or paged view cannot know the whole set — and a "Live: 3" tile that
 * silently meant "3 on this page" would misreport how much access is current.
 * Where the view is narrowed, the tiles say so.
 */
export async function LeasePanel({
  filters,
  params,
}: {
  filters: LeaseFilters;
  params: Record<string, string | string[] | undefined>;
}) {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  // One row beyond the page — see AuditPanel: the probe row is how a next page
  // is detected on a route that reports no total.
  const result = await listLeases({ ...filters, limit: limit + 1, offset });

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Leases unavailable"
        hint={result.error.message}
      />
    );
  }

  const hasMore = result.data.length > limit;
  const leases = hasMore ? result.data.slice(0, limit) : result.data;
  const narrowed = Boolean(
    filters.principal || filters.secretClass || filters.tenantId || filters.from || filters.to,
  );

  if (leases.length === 0) {
    return (
      <PanelEmptyState
        icon={KeyRound}
        label={
          offset > 0
            ? "Nothing on this page"
            : narrowed
              ? "No leases match those filters"
              : "No leases issued"
        }
        hint={
          offset > 0
            ? `Fewer than ${offset + 1} leases match — go back a page.`
            : narrowed
              ? "Filters compose with AND. Clear one and try again."
              : "Broker a secret below. A denied request never becomes a lease — it appears in the audit log instead."
        }
      />
    );
  }

  const stats = summariseLeases(leases);
  const partial = narrowed || offset > 0 || hasMore;

  return (
    <div className="space-y-5">
      {partial && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          These four counts describe the {leases.length} lease
          {leases.length === 1 ? "" : "s"} shown below, not the whole register — this view is
          filtered or paged.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={TILE}>
          <span className="text-xs text-slate-500 dark:text-slate-400">Live</span>
          <span className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {stats.live}
          </span>
        </div>
        <div className={TILE}>
          <span className="text-xs text-slate-500 dark:text-slate-400">Past expiry, still GRANTED</span>
          <span
            className={cn(
              "text-lg font-semibold tabular-nums",
              stats.staleGranted > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-slate-900 dark:text-slate-100",
            )}
          >
            {stats.staleGranted}
          </span>
        </div>
        <div className={TILE}>
          <span className="text-xs text-slate-500 dark:text-slate-400">Revoked</span>
          <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {stats.revoked}
          </span>
        </div>
        <div className={TILE}>
          <span className="text-xs text-slate-500 dark:text-slate-400">Marked EXPIRED</span>
          <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {stats.expired}
          </span>
        </div>
      </div>

      {stats.staleGranted > 0 && (
        <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          {stats.staleGranted} lease{stats.staleGranted === 1 ? "" : "s"} passed{" "}
          <code>expires_at</code> but still read <code>GRANTED</code>. That should not be
          reachable: this service computes status on every read as{" "}
          <code>GRANTED AND expires_at &lt; NOW() → EXPIRED</code>, so a lease in this state means
          something returned a raw stored status instead of the computed one. Treat it as a bug in
          whatever served this list, not as access that is still current.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-left">
          <thead className="border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th scope="col" className={HEAD}>
                Secret path
              </th>
              <th scope="col" className={HEAD}>
                State
              </th>
              <th scope="col" className={HEAD}>
                Principal
              </th>
              <th scope="col" className={HEAD}>
                Granted
              </th>
              <th scope="col" className={HEAD}>
                Expires
              </th>
              <th scope="col" className={HEAD}>
                Lease ID
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {leases.map((lease) => {
              const live = isLeaseLive(lease);
              const stale = lease.status === "GRANTED" && !live;

              return (
                <tr
                  key={lease.lease_id}
                  className="transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <td className={cn(CELL, "font-mono text-xs text-slate-900 dark:text-slate-100")}>
                    {lease.secret_path}
                    <p className="mt-0.5 font-sans text-[11px] text-slate-400 dark:text-slate-500">
                      {lease.secret_class}
                    </p>
                  </td>
                  <td className={CELL}>
                    {lease.status === "REVOKED" ? (
                      <Badge tone="danger">Revoked</Badge>
                    ) : stale ? (
                      <Badge tone="warning">Expired but GRANTED</Badge>
                    ) : live ? (
                      <Badge tone="success" dot>
                        Live
                      </Badge>
                    ) : (
                      <Badge tone="neutral">{lease.status}</Badge>
                    )}
                  </td>
                  <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                    <CopyableId value={lease.requested_by_principal_id} />
                  </td>
                  <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
                    {formatDateTime(lease.granted_at)}
                  </td>
                  <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
                    {formatDateTime(lease.expires_at)}
                  </td>
                  <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                    <CopyableId value={lease.lease_id} className="text-xs" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination
        basePath="/admin/secrets"
        params={params}
        offsetParam="lease_offset"
        offset={offset}
        limit={limit}
        count={leases.length}
        hasMore={hasMore}
        noun="lease"
        plural="leases"
      />
    </div>
  );
}
