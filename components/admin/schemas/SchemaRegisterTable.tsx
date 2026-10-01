"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { describeContract, describeVersionDiscipline, type EventSchema } from "@/lib/api/schemas";
import { formatDate } from "@/lib/format";

export type SchemaRegisterRow = { name: string; schema: EventSchema | null };

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
 * The register table, with a client-side search over event name and owning
 * service — the same search-bar pattern the audit-events ledger uses. The
 * rows themselves are fetched server-side (see SchemaRegisterPanel); this
 * component only filters what it was given.
 */
export function SchemaRegisterTable({ rows }: { rows: SchemaRegisterRow[] }) {
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      ({ name, schema }) =>
        name.toLowerCase().includes(term) ||
        (schema?.owning_service ?? "").toLowerCase().includes(term),
    );
  }, [rows, searchTerm]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by event name or owning service..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-navy-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
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
            {filtered.length === 0 ? (
              <tr>
                <td className={`${CELL} text-slate-400 dark:text-slate-500`} colSpan={6}>
                  No registered event matches “{searchTerm}”.
                </td>
              </tr>
            ) : (
              filtered.map(({ name, schema }) => (
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
                        {schema.owning_service ? (
                          schema.owning_service
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">Not recorded</span>
                        )}
                      </td>
                      <td className={CELL}>{formatDate(schema.registered_at)}</td>
                    </>
                  ) : (
                    <td className={`${CELL} text-slate-400 dark:text-slate-500`} colSpan={5}>
                      Its current version could not be read just now
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
