import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, toIdentity } from "@/lib/auth";
import { CloudOff, FilterX, ShieldAlert, ScrollText } from "lucide-react";
import { PanelEmptyState, Pagination, ResultBanner } from "@/components/admin/shared";
import { listEvents, explainAuditEventError, type EventFilters } from "@/lib/api/audit-events";
import { EventTable } from "./EventTable";

/**
 * The event log, filtered.
 *
 * Unlike the Governance log this route reports `total` and `hash_chain_valid`
 * directly — no "ask for one extra row" probe needed for pagination, and the
 * chain-validity flag is shown as its own banner because it is evidence about
 * this exact page, separate from the "verify the whole store" action below it
 * on the page.
 */
export async function EventLogPanel({
  filters,
  params,
}: {
  filters: EventFilters;
  params: Record<string, string | string[] | undefined>;
}) {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  const result = await listEvents({
    ...filters,
    limit,
    offset,
    identity: session ? toIdentity(session) : undefined,
  });

  if (!result.ok) {
    const rejectedQuery = result.error.status === 400;
    const forbidden = result.error.status === 403;

    return (
      <PanelEmptyState
        icon={forbidden ? ShieldAlert : rejectedQuery ? FilterX : CloudOff}
        tone="warning"
        label={
          forbidden
            ? "Not authorized to read the event log"
            : rejectedQuery
              ? "Those filters were rejected"
              : "Event log unavailable"
        }
        hint={
          rejectedQuery || forbidden
            ? explainAuditEventError(result.error.message)
            : `${result.error.message} — the service itself could not be reached, so this is not a filter problem.`
        }
      />
    );
  }

  const { events, total, hash_chain_valid } = result.data;
  const hasMore = offset + events.length < total;

  if (events.length === 0 && offset > 0) {
    return (
      <PanelEmptyState
        icon={ScrollText}
        label="Nothing on this page"
        hint={`Fewer than ${offset + 1} events match these filters — go back a page.`}
      />
    );
  }

  if (events.length === 0) {
    const active: { field: string; value: string }[] = [];
    if (filters.action) active.push({ field: "Event type", value: filters.action });
    if (filters.actor) active.push({ field: "Actor", value: filters.actor });
    if (filters.entity) active.push({ field: "Legal entity", value: filters.entity });
    if (filters.workflow) active.push({ field: "Workflow / request", value: filters.workflow });
    if (filters.from) active.push({ field: "From", value: filters.from });
    if (filters.to) active.push({ field: "To", value: filters.to });

    if (active.length === 0) {
      return (
        <PanelEmptyState
          icon={ScrollText}
          label="No events recorded yet"
          hint="Events are appended here automatically by the services that produce them — there is nothing to record by hand."
        />
      );
    }

    return (
      <div>
        <PanelEmptyState
          icon={FilterX}
          label="No events match all of these filters"
          hint={`${active.length} filter${active.length === 1 ? " is" : "s are"} applied. Every one is an exact match, and a row must satisfy all of them at once.`}
        />
        <ul className="mx-auto mb-2 max-w-md space-y-1.5">
          {active.map((filter) => (
            <li
              key={filter.field}
              className="flex items-baseline justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60"
            >
              <span className="shrink-0 text-slate-500 dark:text-slate-400">{filter.field}</span>
              <code className="break-all text-right text-slate-700 dark:text-slate-300">{filter.value}</code>
            </li>
          ))}
        </ul>
        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          Empty a field and apply again, or use Clear to drop all of them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!hash_chain_valid && (
        <ResultBanner
          tone="error"
          message="The hash chain across this page is not intact. This is a store-integrity finding — treat it as an incident, not a display glitch."
        />
      )}
      <Pagination
        basePath="/admin/audit-events"
        params={params}
        offsetParam="offset"
        offset={offset}
        limit={limit}
        count={events.length}
        hasMore={hasMore}
        noun="event"
        plural="events"
      />
      <EventTable events={events} />
    </div>
  );
}
