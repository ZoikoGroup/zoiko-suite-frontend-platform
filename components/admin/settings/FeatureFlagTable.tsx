import { ToggleLeft, ToggleRight, Flag, CloudOff } from "lucide-react";
import { Badge } from "@/components/ui";
import { PanelEmptyState } from "@/components/admin/shared";
import { listFeatureFlags } from "@/lib/api/configuration";
import { toggleFlag } from "@/app/admin/settings/actions";

/** Live feature flags from configuration-feature-flag-svc (:8086), with toggles. */
export async function FeatureFlagTable() {
  const result = await listFeatureFlags();

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
        icon={Flag}
        label="No feature flags recorded yet"
        hint="Record one with the form above — it will be written to the append-only configuration store and appear here."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left dark:border-slate-800">
            {["Key", "Environment", "Rollout", "State", "Recorded", ""].map((h) => (
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
          {result.data.map((flag) => (
            <tr
              key={flag.flag_id}
              className="transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <td className="py-3 pr-4">
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-navy-700 dark:bg-slate-800 dark:text-navy-300">
                  {flag.key}
                </code>
              </td>
              <td className="py-3 pr-4 text-slate-600 dark:text-slate-400">{flag.environment}</td>
              <td className="py-3 pr-4 text-slate-600 dark:text-slate-400">
                {flag.rollout_percentage}%
              </td>
              <td className="py-3 pr-4">
                <Badge tone={flag.enabled ? "success" : "neutral"} dot>
                  {flag.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </td>
              <td className="py-3 pr-4 text-xs text-slate-500 dark:text-slate-400">
                {new Date(flag.effective_from).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                <span className="ml-1.5 text-slate-400 dark:text-slate-500">
                  by {flag.created_by_principal_id}
                </span>
              </td>
              <td className="py-3">
                {/* Each row is its own form so the toggle is a real server-side
                    write, and still works without JavaScript. */}
                <form action={toggleFlag}>
                  <input type="hidden" name="key" value={flag.key} />
                  <input type="hidden" name="environment" value={flag.environment} />
                  <input type="hidden" name="rollout_percentage" value={flag.rollout_percentage} />
                  <input type="hidden" name="next_enabled" value={String(!flag.enabled)} />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                    aria-label={`${flag.enabled ? "Disable" : "Enable"} ${flag.key} in ${flag.environment}`}
                  >
                    {flag.enabled ? (
                      <ToggleRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <ToggleLeft className="h-4 w-4" />
                    )}
                    {flag.enabled ? "Disable" : "Enable"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
