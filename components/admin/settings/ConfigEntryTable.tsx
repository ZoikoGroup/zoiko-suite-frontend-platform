import { CloudOff, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui";
import { PanelEmptyState, CopyableId } from "@/components/admin/shared";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  describeConfigValue,
  describeScope,
  explainConfigurationError,
  listConfigEntries,
} from "@/lib/api/configuration";
import { formatDateTime } from "@/lib/format";
import { ConfigValue } from "./ConfigEntrySummary";

/**
 * Currently-effective config entries from configuration-feature-flag-svc.
 *
 * Scoped to the caller's own tenant plus the environment-wide globals that apply
 * to it. This table used to rely on an omitted tenant_id meaning "no filter" on
 * that route, so it rendered every tenant's configuration — a cross-tenant read
 * dressed as an admin view. The scope column still distinguishes a tenant row
 * from a global one, which is now the only distinction left to make.
 */
export async function ConfigEntryTable() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in again to see the settings in force."
      />
    );
  }

  const result = await listConfigEntries(session.tenantId);

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Cannot reach the configuration service"
        hint={explainConfigurationError(result.error.message)}
      />
    );
  }

  if (result.data.length === 0) {
    return (
      <PanelEmptyState
        icon={SlidersHorizontal}
        label="No settings have been recorded yet"
        hint="Save one with the form above and it will appear here, with every later change kept as history."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left dark:border-slate-800">
            {["Setting", "Where", "Who", "What it is set to", "Set"].map((h) => (
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
          {result.data.map((entry) => {
            const scope = describeScope(entry.tenant_id);

            return (
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
                  {/* "Tenant" and "Global" are the column's own words, and
                      "Global" in particular reads as "everywhere" when what it
                      means is "the default that a tenant's own value overrides". */}
                  <Badge tone={scope.tone}>{scope.label}</Badge>
                </td>
                {/* The value, not a JSON dump of it. Every field is listed, in
                    payload order, with the original still one click away — see
                    PayloadDetails. This cell used to be a scrolling <pre> of
                    braces and snake_case keys inside a table row. */}
                <td className="max-w-[22rem] py-3 pr-4">
                  <p className="mb-1 text-xs text-slate-400 dark:text-slate-500">
                    {describeConfigValue(entry.value)}
                  </p>
                  <ConfigValue value={entry.value} />
                </td>
                <td className="py-3 text-xs text-slate-500 dark:text-slate-400">
                  {formatDateTime(entry.effective_from)}
                  <span className="ml-1.5 text-slate-400 dark:text-slate-500">
                    by <CopyableId value={entry.created_by_principal_id} />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
