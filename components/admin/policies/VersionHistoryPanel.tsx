import { CloudOff, History, Search } from "lucide-react";
import { Badge } from "@/components/ui";
import { PanelEmptyState, JsonBlock, CopyableId } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  listPolicyVersionHistory,
  describeScope,
  thresholdAmount,
  type VersionStatus,
} from "@/lib/api/policies";

/**
 * Whether a pasted id still carries the ellipsis a table used to shorten it.
 *
 * Ids are displayed truncated, and pasting what was on screen instead of the real
 * value is a dead end that otherwise reports only "no such policy" — a fact about
 * the store, when the actual problem is the input.
 */
function looksTruncated(value: string): boolean {
  return value.includes("…") || value.includes("...");
}

const STATUS_TONE: Record<string, "success" | "warning" | "neutral" | "danger" | "info"> = {
  ACTIVE: "success",
  DRAFT: "neutral",
  SUPERSEDED: "info",
  RETIRED: "danger",
};

/**
 * Every version of one policy, whatever its status — the audit view.
 *
 * Distinct from the applicable-set panel above it, which shows only what is
 * ACTIVE and in scope. This one includes drafts that were never activated and
 * versions that have since been superseded, which is what makes it possible to
 * answer "what did this policy require in March".
 *
 * Renders nothing until a policy id is given, rather than showing an error: no id
 * is the initial state of the form, not a failure.
 */
export async function VersionHistoryPanel({ policyId }: { policyId?: string }) {
  if (!policyId) {
    return (
      <PanelEmptyState
        icon={Search}
        label="No policy selected"
        hint="Paste a policy ID above to read every version it has ever had, including drafts and superseded ones."
      />
    );
  }

  const result = await listPolicyVersionHistory(policyId);

  if (!result.ok) {
    if (result.error.status === 404) {
      return (
        <PanelEmptyState
          icon={History}
          tone="warning"
          label="No such policy"
          hint={
            looksTruncated(policyId)
              ? "That is a shortened id — the “…” in the middle is display truncation, not part of the value. Click the id in a table to copy it in full."
              : "policy-svc has no policy with that ID. This field wants the policy_id, not a policy_version_id or a decision_id — they are all UUIDs and easy to mix up. The Active policy set above lists both of a policy's ids, labelled. Note this is a 404 on the policy itself, which is different from a policy that exists with no versions."
          }
        />
      );
    }
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Version history unavailable"
        hint={result.error.message}
      />
    );
  }

  if (result.data.length === 0) {
    return (
      <PanelEmptyState
        icon={History}
        tone="warning"
        label="Policy exists but has no versions"
        hint="It enforces nothing and cannot be evaluated. Add a version and activate it."
      />
    );
  }

  const active = result.data.filter((v) => v.version_status === "ACTIVE").length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {result.data.length} version{result.data.length === 1 ? "" : "s"}, {active} currently
        ACTIVE
        {active === 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            {" "}
            — nothing here is in force, so an evaluation against this policy answers 404
          </span>
        )}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[50rem] border-collapse text-left">
          <thead className="border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th scope="col" className={HEAD}>
                Version
              </th>
              <th scope="col" className={HEAD}>
                Status
              </th>
              <th scope="col" className={HEAD}>
                Scope
              </th>
              <th scope="col" className={cn(HEAD, "text-right")}>
                Threshold
              </th>
              <th scope="col" className={HEAD}>
                Effective
              </th>
              <th scope="col" className={HEAD}>
                Created
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {result.data.map((version) => {
              const threshold = thresholdAmount(version.rule_payload);
              const status = version.version_status as VersionStatus;

              return (
                <tr
                  key={version.policy_version_id}
                  className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <td className={CELL}>
                    <CopyableId value={version.policy_version_id} className="text-xs" />
                  </td>
                  <td className={CELL}>
                    <Badge tone={STATUS_TONE[status] ?? "neutral"}>
                      {version.version_status}
                    </Badge>
                    {version.activated_at && (
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                        activated {formatDateTime(version.activated_at)}
                      </p>
                    )}
                  </td>
                  <td className={CELL}>
                    <Badge tone="neutral">{describeScope(version)}</Badge>
                  </td>
                  <td className={cn(CELL, "text-right tabular-nums")}>
                    {threshold === null ? (
                      <JsonBlock value={version.rule_payload} className="max-h-24 text-left" />
                    ) : (
                      threshold.toLocaleString("en-GB")
                    )}
                  </td>
                  <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
                    {formatDate(version.effective_from)}
                    {version.effective_to ? ` → ${formatDate(version.effective_to)}` : " → open"}
                  </td>
                  <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                    {formatDateTime(version.created_at)}
                    <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                      by <CopyableId value={version.created_by_principal_id} />
                    </p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
