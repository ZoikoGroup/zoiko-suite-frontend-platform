import { CloudOff, FilterX, ScrollText } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import {
  listDecisionRecords,
  explainDecisionError,
  type DecisionFilters,
} from "@/lib/api/governance";
import { DecisionTable } from "./DecisionTable";

/**
 * The evidence log, filtered.
 *
 * No session check here, unlike the other read panels in this console: this
 * service takes no identity header and applies no tenant filter, so a session
 * would not change what comes back. The page states that rather than implying a
 * scoping that does not exist.
 */
export async function DecisionLogPanel({ filters }: { filters: DecisionFilters }) {
  const result = await listDecisionRecords(filters);

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

  if (result.data.length === 0) {
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
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {result.data.length} record{result.data.length === 1 ? "" : "s"}
        {result.data.length >= (filters.limit ?? 50) && (
          <span className="text-amber-600 dark:text-amber-400">
            {" "}
            — this is a full page, so there are probably more. Raise the limit or page with
            offset.
          </span>
        )}
      </p>
      <DecisionTable decisions={result.data} />
    </div>
  );
}
