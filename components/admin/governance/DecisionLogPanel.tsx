import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { CloudOff, FilterX, ScrollText } from "lucide-react";
import { PanelEmptyState, Pagination } from "@/components/admin/shared";
import {
  listDecisionRecords,
  explainDecisionError,
  type DecisionFilters,
} from "@/lib/api/governance";
import { DecisionTable } from "./DecisionTable";

/**
 * The evidence log, filtered.
 *
 * This comment used to read: "this service takes no identity header and applies
 * no tenant filter, so a session would not change what comes back." That was
 * false, and the panel was broken by believing it —
 * governance-decision-log-svc reads the tenant from X-Tenant-Id and answers 400
 * `missing_tenant_id` without one, so the log rendered "those filters were
 * rejected" on a request that carried no filters at all.
 */
export async function DecisionLogPanel({
  filters,
  params,
}: {
  filters: DecisionFilters;
  params: Record<string, string | string[] | undefined>;
}) {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  // One row past the page: this route returns a bare array with no total, so the
  // probe row is the only way to know a next page exists. Before this, the panel
  // guessed — "this is a full page, so there are probably more" — and offered no
  // way to reach them, because nothing wired up the offset the service accepts.
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  const result = await listDecisionRecords({
    ...filters,
    limit: limit + 1,
    offset,
    identity: {
      principalId: session?.principalId,
      tenantId: session?.tenantId,
      legalEntityId: session?.legalEntityId,
    },
  });

  if (!result.ok) {
    // A 400 is a malformed filter — the service is healthy and rejected the
    // query. Reporting it as "unavailable" behind an offline icon sends the
    // reader to check the container when the fix is in the form above them.
    const rejectedQuery = result.error.status === 400;

    return (
      <PanelEmptyState
        icon={rejectedQuery ? FilterX : CloudOff}
        tone="warning"
        label={rejectedQuery ? "Those filters were rejected" : "Decision log unavailable"}
        hint={
          rejectedQuery
            ? explainDecisionError(result.error.message)
            : `${result.error.message} — the service itself could not be reached, so this is not a filter problem.`
        }
      />
    );
  }

  const hasMore = result.data.length > limit;
  const decisions = hasMore ? result.data.slice(0, limit) : result.data;

  if (decisions.length === 0 && offset > 0) {
    return (
      <PanelEmptyState
        icon={ScrollText}
        label="Nothing on this page"
        hint={`Fewer than ${offset + 1} decisions match these filters — go back a page.`}
      />
    );
  }

  if (decisions.length === 0) {
    // Name the filters that are actually applied. Every one of them is an exact
    // equality AND-ed with the rest, so four plausible-looking values can match
    // nothing — and "no results" on its own gives the reader no way to see which
    // one is too narrow. The form keeps its values between searches, so the
    // active set is frequently larger than the reader remembers setting.
    const active: { field: string; value: string }[] = [];
    if (filters.action) active.push({ field: "Action type", value: filters.action });
    if (filters.actor) active.push({ field: "Actor", value: filters.actor });
    if (filters.entity) active.push({ field: "Legal entity", value: filters.entity });
    if (filters.ruleBasis) active.push({ field: "Rule basis", value: filters.ruleBasis });
    if (filters.from) active.push({ field: "From", value: filters.from });
    if (filters.to) active.push({ field: "To", value: filters.to });

    if (active.length === 0) {
      return (
        <PanelEmptyState
          icon={ScrollText}
          label="No decisions recorded yet"
          hint="Record one below, or run a policy evaluation — policy-svc appends a decision here on every evaluation."
        />
      );
    }

    return (
      <div>
        <PanelEmptyState
          icon={FilterX}
          label="No decisions match all of these filters"
          hint={`${active.length} filter${active.length === 1 ? " is" : "s are"} applied. Every one is an exact match, and a row must satisfy all of them at once.`}
        />
        <ul className="mx-auto mb-2 max-w-md space-y-1.5">
          {active.map((filter) => (
            <li
              key={filter.field}
              className="flex items-baseline justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60"
            >
              <span className="shrink-0 text-slate-500 dark:text-slate-400">{filter.field}</span>
              <code className="break-all text-right text-slate-700 dark:text-slate-300">
                {filter.value}
              </code>
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
      <Pagination
        basePath="/admin/governance"
        params={params}
        offsetParam="offset"
        offset={offset}
        limit={limit}
        count={decisions.length}
        hasMore={hasMore}
        noun="record"
        plural="records"
      />
      <DecisionTable decisions={decisions} />
    </div>
  );
}
