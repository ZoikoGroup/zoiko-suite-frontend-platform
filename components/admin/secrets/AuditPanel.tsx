import { CloudOff, FileClock } from "lucide-react";
import { Badge } from "@/components/ui";
import { PanelEmptyState, CopyableId, Pagination } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { listSecretAudit, type AuditFilters } from "@/lib/api/secret-vault";

const EVENT_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  REQUESTED: "neutral",
  GRANTED: "success",
  DENIED: "danger",
  REVOKED: "warning",
  ROTATED: "info",
};

/**
 * The append-only access audit log.
 *
 * Denials are recorded here as fully as grants, which is what makes this evidence
 * rather than a success log — and it is the only place a refused request is
 * visible at all, since a denial never becomes a lease.
 *
 * Every broker attempt writes a REQUESTED entry before the outcome is known, so a
 * granted request produces two rows and a denied one also produces two. A lone
 * REQUESTED with no following entry means the service died mid-decision.
 */
export async function AuditPanel({
  filters,
  params,
}: {
  filters: AuditFilters;
  params: Record<string, string | string[] | undefined>;
}) {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  // One row beyond the page: its presence is the only signal a next page exists,
  // since this route returns a bare array with no total.
  const result = await listSecretAudit({ ...filters, limit: limit + 1, offset });

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Audit log unavailable"
        hint={result.error.message}
      />
    );
  }

  const hasMore = result.data.length > limit;
  const entries = hasMore ? result.data.slice(0, limit) : result.data;

  if (entries.length === 0) {
    const filtered = Boolean(
      filters.principal || filters.secretPath || filters.eventType || filters.from || filters.to,
    );
    return (
      <PanelEmptyState
        icon={FileClock}
        label={
          offset > 0
            ? "Nothing on this page"
            : filtered
              ? "No entries match those filters"
              : "No access events recorded"
        }
        hint={
          offset > 0
            ? `The log has fewer than ${offset + 1} entries under these filters — go back a page.`
            : filtered
              ? "Filters compose with AND. Clear one and try again."
              : "Broker a secret below — every attempt is recorded here, granted or not."
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <Pagination
        basePath="/admin/secrets"
        params={params}
        offsetParam="audit_offset"
        offset={offset}
        limit={limit}
        count={entries.length}
        hasMore={hasMore}
        noun="entry"
        plural="entries"
      />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[54rem] border-collapse text-left">
          <thead className="border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th scope="col" className={HEAD}>
                Event
              </th>
              <th scope="col" className={HEAD}>
                Secret path
              </th>
              <th scope="col" className={HEAD}>
                Principal
              </th>
              <th scope="col" className={HEAD}>
                Detail
              </th>
              <th scope="col" className={HEAD}>
                Recorded
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {entries.map((entry) => (
              <tr
                key={entry.audit_log_id}
                className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <td className={CELL}>
                  <Badge tone={EVENT_TONE[entry.event_type] ?? "neutral"}>
                    {entry.event_type}
                  </Badge>
                </td>
                <td className={cn(CELL, "font-mono text-xs")}>
                  {entry.secret_path}
                  {entry.secret_class ? (
                    <p className="mt-0.5 font-sans text-[11px] text-slate-400 dark:text-slate-500">
                      {entry.secret_class}
                    </p>
                  ) : (
                    <p className="mt-0.5 font-sans text-[11px] italic text-slate-400 dark:text-slate-500">
                      class unknown — no policy was resolved
                    </p>
                  )}
                </td>
                <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                  <CopyableId value={entry.requested_by_principal_id} />
                </td>
                <td className={cn(CELL, "max-w-[18rem]")}>
                  <span className="break-words text-slate-600 dark:text-slate-300">
                    {entry.outcome_detail || (
                      <span className="italic text-slate-400 dark:text-slate-500">—</span>
                    )}
                  </span>
                  {entry.lease_id && (
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                      lease <CopyableId value={entry.lease_id} />
                    </p>
                  )}
                </td>
                <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
                  {formatDateTime(entry.recorded_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
