import { Badge } from "@/components/ui";
import { PayloadDetails, CopyableId } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { humanizeCode } from "@/lib/humanize";
import type { AuditEvent } from "@/lib/api/audit-events";

/**
 * The event records, as a scannable table.
 *
 * Modelled on the Governance log's DecisionTable: the event type reads as
 * prose first and as the stored code second, and every id is copyable rather
 * than only visible. The hash fields are folded under a disclosure per row —
 * they matter for verifying one specific row by hand, not for scanning the
 * page, and showing three hex strings per row by default would bury the rows
 * themselves.
 */
export function EventTable({ events }: { events: AuditEvent[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[64rem] border-collapse text-left">
        <thead className="border-b border-slate-200 dark:border-slate-800">
          <tr>
            <th scope="col" className={HEAD}>
              What happened
            </th>
            <th scope="col" className={HEAD}>
              Resource
            </th>
            <th scope="col" className={HEAD}>
              Actor
            </th>
            <th scope="col" className={HEAD}>
              Legal entity
            </th>
            <th scope="col" className={HEAD}>
              Source
            </th>
            <th scope="col" className={HEAD}>
              Recorded
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {events.map((event) => {
            const hasPayload = event.payload !== null && event.payload !== undefined;

            return (
              <tr
                key={event.id}
                className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <td className={cn(CELL, "font-medium text-slate-900 dark:text-slate-100")}>
                  {humanizeCode(event.event_type) || "Not recorded"}
                  <p className="mt-0.5 font-mono text-[11px] font-normal text-slate-400 dark:text-slate-500">
                    {event.event_type}
                  </p>
                  {event.status && (
                    <Badge tone="neutral" className="mt-1">
                      {event.status}
                    </Badge>
                  )}
                  <p className="mt-0.5">
                    <CopyableId value={event.event_id} className="font-normal" />
                  </p>
                </td>
                <td className={cn(CELL, "max-w-[14rem]")}>
                  <span className="break-words">
                    {event.resource ? humanizeCode(event.resource) : "Not recorded"}
                  </span>
                  {event.resource_id && (
                    <p className="mt-0.5">
                      <CopyableId value={event.resource_id} />
                    </p>
                  )}
                  {hasPayload && (
                    <details className="group mt-2">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-navy-700 dark:text-slate-500 dark:hover:text-navy-300">
                        <span className="transition-transform group-open:rotate-90" aria-hidden="true">
                          ›
                        </span>
                        What was recorded
                      </summary>
                      <PayloadDetails
                        value={event.payload}
                        className="mt-2"
                        emptyLabel="No payload recorded."
                        rawLabel="Show the original data"
                      />
                    </details>
                  )}
                </td>
                <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                  <CopyableId value={event.principal_id} label={event.principal_name || undefined} />
                </td>
                <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                  <CopyableId value={event.legal_entity_id} />
                </td>
                <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                  {event.source_service || "Not recorded"}
                  <details className="group mt-1">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-navy-700 dark:text-slate-500 dark:hover:text-navy-300">
                      <span className="transition-transform group-open:rotate-90" aria-hidden="true">
                        ›
                      </span>
                      Chain links
                    </summary>
                    <dl className="mt-1.5 space-y-1 font-mono text-[10px] leading-snug text-slate-400 dark:text-slate-500">
                      <div>
                        <dt className="inline">seq </dt>
                        <dd className="inline">{event.sequence_number}</dd>
                      </div>
                      <div>
                        <dt className="inline">prev </dt>
                        <dd className="inline break-all">{event.previous_hash || "(none — chain start)"}</dd>
                      </div>
                      <div>
                        <dt className="inline">hash </dt>
                        <dd className="inline break-all">{event.hash_signature}</dd>
                      </div>
                    </dl>
                  </details>
                </td>
                <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
                  {formatDateTime(event.stored_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
