import { ToggleLeft, ToggleRight, Flag, CloudOff, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui";
import { PanelEmptyState, CopyableId } from "@/components/admin/shared";
import {
  describeScope,
  explainConfigurationError,
  explainFlag,
  listFeatureFlags,
} from "@/lib/api/configuration";
import { formatDateTime } from "@/lib/format";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { toggleFlag } from "@/app/admin/settings/actions";

/**
 * Live feature flags from configuration-feature-flag-svc (:8086), with toggles.
 *
 * Scoped to the caller's own tenant plus the globals. An omitted tenant filter
 * used to mean "no filter" on this route, so this table showed other tenants'
 * feature state — and offered a toggle next to it.
 */
export async function FeatureFlagTable() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in again to see which features are switched on."
      />
    );
  }

  const result = await listFeatureFlags(session.tenantId);

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
        icon={Flag}
        label="No features have been set yet"
        hint="Set one with the form above and it will appear here. Nothing is switched on or off until a setting exists for it."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left dark:border-slate-800">
            {["Feature", "Where", "Who", "Is it on?", "Set", ""].map((h) => (
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
          {result.data.map((flag) => {
            const explained = explainFlag(flag);
            const scope = describeScope(flag.tenant_id);

            return (
              <tr
                key={flag.flag_id}
                className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <td className="py-3 pr-4">
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-navy-700 dark:bg-slate-800 dark:text-navy-300">
                    {flag.key}
                  </code>
                </td>
                <td className="py-3 pr-4 text-slate-600 dark:text-slate-400">{flag.environment}</td>
                <td className="py-3 pr-4">
                  <Badge tone={scope.tone}>{scope.label}</Badge>
                </td>
                {/* One column, not two. "Enabled" and "20%" side by side left
                    the reader to combine them, and a flag that is disabled at
                    20% is off for everyone — the percentage is dormant, not a
                    partial release. explainFlag does that reading once. */}
                <td className="py-3 pr-4">
                  <Badge tone={explained.tone} dot>
                    {explained.shortLabel}
                  </Badge>
                  {explained.reach && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {explained.reach}
                    </p>
                  )}
                </td>
                <td className="py-3 pr-4 text-xs text-slate-500 dark:text-slate-400">
                  {formatDateTime(flag.effective_from)}
                  <span className="ml-1.5 text-slate-400 dark:text-slate-500">
                    by <CopyableId value={flag.created_by_principal_id} />
                  </span>
                </td>
                <td className="py-3">
                  {/* Each row is its own form so the toggle is a real server-side
                      write, and still works without JavaScript. The row's scope
                      travels with it: writing the flip back without a tenant
                      would move an organisation's own setting to the
                      environment-wide default. */}
                  <form action={toggleFlag}>
                    <input type="hidden" name="key" value={flag.key} />
                    <input type="hidden" name="environment" value={flag.environment} />
                    <input
                      type="hidden"
                      name="rollout_percentage"
                      value={flag.rollout_percentage}
                    />
                    <input type="hidden" name="next_enabled" value={String(!flag.enabled)} />
                    <input
                      type="hidden"
                      name="tenant_scoped"
                      value={String(flag.tenant_id !== null)}
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      aria-label={`Switch ${flag.enabled ? "off" : "on"} ${flag.key} in ${flag.environment}`}
                    >
                      {flag.enabled ? (
                        <ToggleRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <ToggleLeft className="h-4 w-4" />
                      )}
                      {flag.enabled ? "Switch off" : "Switch on"}
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
