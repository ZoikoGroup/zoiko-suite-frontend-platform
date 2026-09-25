import { FileJson } from "lucide-react";
import { cookies } from "next/headers";
import { PanelEmptyState } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  describeContract,
  describeVersionDiscipline,
  explainRegistryFailure,
  getLatest,
  listEventNames,
  type EventSchema,
} from "@/lib/api/schemas";
import { formatDate } from "@/lib/format";

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
 * Whether a version was checked, in the words of the question it answers.
 *
 * This used to print the stored code — BACKWARD or NONE — coloured green or
 * amber. The colour carried the entire meaning, and only to a reader who
 * already knew which code meant what. The code is still here, under the answer,
 * because it is what an auditor quotes.
 */
function ModeCell({ mode, version }: { mode: string; version: number }) {
  const explained = describeVersionDiscipline(mode, version);
  // A single-version contract is neither checked nor unchecked: nothing was
  // compared, because there was nothing to compare it with. This cell used to
  // read as a clean green "checked" for every such event — a comparison the
  // registry never made.
  const first = version <= 1;
  const tone = first
    ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
    : explained.checked
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
    : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";

  return (
    <div className="space-y-1">
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}
        title={explained.meaning}
      >
        {first ? "First version" : explained.checked ? "Checked" : "Not checked"}
      </span>
      <span className="block font-mono text-[11px] text-slate-400 dark:text-slate-500">
        {explained.raw}
      </span>
    </div>
  );
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
  const namesResult = await listEventNames(identity);

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

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th className={HEAD}>Event</th>
              <th className={HEAD}>In use now</th>
              <th className={HEAD}>What it must contain</th>
              <th className={HEAD}>Was the change checked?</th>
              <th className={HEAD}>Published by</th>
              <th className={HEAD}>Registered</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {latest.map(({ name, schema }) => (
              <tr key={name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className={`${CELL} font-mono text-xs`}>{name}</td>
                {schema ? (
                  <>
                    <td className={CELL}>Version {schema.version}</td>
                    <td className={CELL}>{describeContract(schema.json_schema)}</td>
                    <td className={CELL}>
                      <ModeCell mode={schema.compatibility_mode} version={schema.version} />
                    </td>
                    <td className={CELL}>
                      {/* Truthy, not nullish: the column is omitted when empty,
                          but a stored "" would otherwise render a blank cell
                          that reads as a value nobody wrote down. */}
                      {schema.owning_service ? (
                        schema.owning_service
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">Not recorded</span>
                      )}
                    </td>
                    <td className={CELL}>{formatDate(schema.registered_at)}</td>
                  </>
                ) : (
                  // The name came back from the register, so the event exists;
                  // only this read of its current version failed. Saying so
                  // beats five dashes, which read as "nothing is registered".
                  <td className={`${CELL} text-slate-400 dark:text-slate-500`} colSpan={5}>
                    Its current version could not be read just now
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export type { EventSchema };
