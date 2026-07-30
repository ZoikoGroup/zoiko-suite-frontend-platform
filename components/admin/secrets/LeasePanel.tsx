import { CloudOff, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui";
import { PanelEmptyState } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDateTime, shortId } from "@/lib/format";
import { listLeases, summariseLeases, isLeaseLive } from "@/lib/api/secret-vault";

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
 */
export async function LeasePanel() {
  const result = await listLeases({ limit: 100 });

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

  if (result.data.length === 0) {
    return (
      <PanelEmptyState
        icon={KeyRound}
        label="No leases issued"
        hint="Broker a secret below. A denied request never becomes a lease — it appears in the audit log instead."
      />
    );
  }

  const stats = summariseLeases(result.data);

  return (
    <div className="space-y-5">
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
          <code>expires_at</code> but still read <code>GRANTED</code>. This service has no expiry
          sweep, so a lease is never transitioned to EXPIRED on its own — anything relying on
          <code> status</code> alone to decide whether access is current would be wrong.
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
            {result.data.map((lease) => {
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
                    <span title={lease.requested_by_principal_id}>
                      {shortId(lease.requested_by_principal_id)}
                    </span>
                  </td>
                  <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
                    {formatDateTime(lease.granted_at)}
                  </td>
                  <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
                    {formatDateTime(lease.expires_at)}
                  </td>
                  <td className={cn(CELL, "font-mono text-xs text-slate-500 dark:text-slate-400")}>
                    <span title={lease.lease_id}>{shortId(lease.lease_id)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
