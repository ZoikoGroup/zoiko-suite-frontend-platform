import { FileJson } from "lucide-react";
import { cookies } from "next/headers";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  describeVersionDiscipline,
  explainRegistryFailure,
  getLatest,
  listEventNames,
  MAX_EVENT_NAMES_PAGE,
  type EventSchema,
} from "@/lib/api/schemas";
import { SchemaRegisterTable, type SchemaRegisterRow } from "./SchemaRegisterTable";

async function sessionIdentity() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  return {
    principalId: session?.principalId,
    tenantId: session?.tenantId,
    legalEntityId: session?.legalEntityId,
  };
}

/**
 * The contract register: every event and its current version.
 *
 * Reads the latest version of each event rather than only the names, because
 * the names alone answer nothing a reader wants to know — the questions are
 * "what does this event have to contain", "who publishes it", and "was the last
 * change checked". Each of those is now a column, and the one about the check
 * says so in words rather than in a colour.
 */
export async function SchemaRegisterPanel() {
  const identity = await sessionIdentity();
  // Ask for the service's own paging ceiling rather than its default page of
  // 100 — the register was previously read with no limit at all, which meant
  // the backend's default silently applied with no way for a reader to know
  // whether the table in front of them was the whole register or its first
  // page. MAX_EVENT_NAMES_PAGE is that same ceiling, so a truncation notice
  // below can now say so honestly when there are more than that.
  const namesResult = await listEventNames(identity, { limit: MAX_EVENT_NAMES_PAGE });

  if (!namesResult.ok) {
    return (
      <PanelEmptyState
        icon={FileJson}
        label="The register could not be read"
        hint={explainRegistryFailure(namesResult.error)}
        tone="warning"
      />
    );
  }

  const eventNames = Array.isArray(namesResult.data)
    ? namesResult.data
    : Array.isArray((namesResult.data as unknown as Record<string, unknown>)?.schemas)
    ? ((namesResult.data as unknown as Record<string, unknown>).schemas as string[])
    : [];

  if (eventNames.length === 0) {
    return (
      <PanelEmptyState
        icon={FileJson}
        label="No event contracts registered"
        hint="Nothing has been registered yet. Every event schema on the platform is meant to live here — register the first one below."
      />
    );
  }

  // One read per event. The registry has no bulk endpoint and the register is
  // small by nature (one row per event type on the platform), so this is a
  // handful of requests rather than an N+1 over unbounded data.
  const latest = await Promise.all(
    eventNames.map(async (name) => {
      const result = await getLatest(name, identity);
      return { name, schema: result.ok ? result.data : null };
    }),
  );

  // Only a version that had a predecessor can have gone in unchecked. Counting
  // first versions inflated this with events that have simply never changed.
  const uncheckedCount = latest.filter(
    (row) =>
      row.schema &&
      row.schema.version > 1 &&
      !describeVersionDiscipline(row.schema.compatibility_mode, row.schema.version).checked,
  ).length;
  const unreadable = latest.filter((row) => !row.schema).length;
  const truncated = eventNames.length === MAX_EVENT_NAMES_PAGE;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span>
          <strong className="text-slate-800 dark:text-slate-200">{latest.length}</strong> event
          {latest.length === 1 ? " contract" : " contracts"} registered
        </span>
        <span>
          {uncheckedCount === 0 ? (
            "No contract in use here was last changed without being checked"
          ) : (
            <>
              <strong className="text-slate-800 dark:text-slate-200">{uncheckedCount}</strong> of them
              {uncheckedCount === 1 ? " was" : " were"} last changed without being checked against the
              version before
            </>
          )}
        </span>
        {unreadable > 0 && (
          <span>
            <strong className="text-slate-800 dark:text-slate-200">{unreadable}</strong> could not be read
            just now
          </span>
        )}
      </div>

      {truncated && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300">
          This register holds at least {MAX_EVENT_NAMES_PAGE} distinct events — the registry's own page
          ceiling — so more may exist beyond what is shown below. Look a specific event up directly if it
          is not in this list.
        </div>
      )}

      <SchemaRegisterTable rows={latest as SchemaRegisterRow[]} />
    </div>
  );
}

export type { EventSchema };
