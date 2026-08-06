import { FileJson } from "lucide-react";
import { cookies } from "next/headers";
import { PanelEmptyState } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { getLatest, isExempt, listEventNames, type EventSchema } from "@/lib/api/schemas";

async function sessionIdentity() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  return {
    principalId: session?.principalId,
    tenantId: session?.tenantId,
    legalEntityId: session?.legalEntityId,
  };
}

function ModeBadge({ mode }: { mode: string }) {
  const exempt = isExempt(mode);
  return (
    <span
      className={
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium " +
        (exempt
          ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300")
      }
      title={
        exempt
          ? "This version was registered without a compatibility check"
          : "This version was checked against the previous one"
      }
    >
      {mode}
    </span>
  );
}

/**
 * The contract register: every event and its current version.
 *
 * Reads the latest version of each event rather than only the names, because
 * the names alone answer nothing a reader wants to know — the questions are
 * "what is the current contract", "who owns it", and "was it checked". The
 * compatibility mode is shown per row for the last question, and an exempt
 * version is coloured differently because a contract that evolved without a
 * check is exactly what a governance reader is looking for.
 */
export async function SchemaRegisterPanel() {
  const identity = await sessionIdentity();
  const namesResult = await listEventNames(identity);

  if (!namesResult.ok) {
    return (
      <PanelEmptyState
        icon={FileJson}
        label="Schema registry unavailable"
        hint={namesResult.error.message}
        tone="warning"
      />
    );
  }

  if (namesResult.data.length === 0) {
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
    namesResult.data.map(async (name) => {
      const result = await getLatest(name, identity);
      return { name, schema: result.ok ? result.data : null };
    }),
  );

  const exemptCount = latest.filter((r) => r.schema && isExempt(r.schema.compatibility_mode)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span>
          <strong className="text-slate-800 dark:text-slate-200">{latest.length}</strong> event contracts
        </span>
        <span>
          <strong className="text-slate-800 dark:text-slate-200">{exemptCount}</strong> current version
          {exemptCount === 1 ? "" : "s"} registered without a compatibility check
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th className={HEAD}>Event</th>
              <th className={HEAD}>Current</th>
              <th className={HEAD}>Mode</th>
              <th className={HEAD}>Owner</th>
              <th className={HEAD}>Registered</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {latest.map(({ name, schema }) => (
              <tr key={name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className={`${CELL} font-mono text-xs`}>{name}</td>
                <td className={CELL}>{schema ? `v${schema.version}` : "—"}</td>
                <td className={CELL}>{schema ? <ModeBadge mode={schema.compatibility_mode} /> : "—"}</td>
                <td className={CELL}>
                  {schema?.owning_service ?? (
                    <span className="text-slate-400 dark:text-slate-500">not recorded</span>
                  )}
                </td>
                <td className={CELL}>
                  {schema ? new Date(schema.registered_at).toLocaleDateString("en-GB") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export type { EventSchema };
