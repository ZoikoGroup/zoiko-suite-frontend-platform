import { CloudOff, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui";
import { PanelEmptyState, JsonBlock } from "@/components/admin/shared";
import { listConfigEntries } from "@/lib/api/configuration";
import { formatDateTime, shortId } from "@/lib/format";

/**
 * Currently-effective config entries from configuration-feature-flag-svc.
 *
 * No tenant filter is applied. On this route an omitted tenant_id means "no
 * filter", so this returns entries across every tenant AND the environment-wide
 * globals — which is the right view for an admin console, and the opposite of
 * what an omitted tenant_id means on the single-key lookup. The scope column
 * distinguishes them.
 */
export async function ConfigEntryTable() {
  const result = await listConfigEntries();

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Configuration service unavailable"
        hint={result.error.message}
      />
    );
  }

  if (result.data.length === 0) {
    return (
      <PanelEmptyState
        icon={SlidersHorizontal}
        label="No config entries recorded yet"
        hint="Record one with the form above — it will be written to the append-only store and appear here."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left dark:border-slate-800">
            {["Key", "Environment", "Scope", "Value", "Recorded"].map((h) => (
              <th
                key={h}
                className="pb-2 pr-4 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {result.data.map((entry) => (
            <tr
              key={entry.config_id}
              className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <td className="py-3 pr-4">
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-navy-700 dark:bg-slate-800 dark:text-navy-300">
                  {entry.key}
                </code>
              </td>
              <td className="py-3 pr-4 text-slate-600 dark:text-slate-400">
                {entry.environment}
              </td>
              <td className="py-3 pr-4">
                <Badge tone={entry.tenant_id ? "neutral" : "info"}>
                  {entry.tenant_id ? "Tenant" : "Global"}
                </Badge>
              </td>
              <td className="max-w-[18rem] py-3 pr-4">
                <JsonBlock value={entry.value} className="max-h-28" emptyLabel="Empty value" />
              </td>
              <td className="py-3 text-xs text-slate-500 dark:text-slate-400">
                {formatDateTime(entry.effective_from)}
                <span
                  className="ml-1.5 text-slate-400 dark:text-slate-500"
                  title={entry.created_by_principal_id}
                >
                  by {shortId(entry.created_by_principal_id)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
