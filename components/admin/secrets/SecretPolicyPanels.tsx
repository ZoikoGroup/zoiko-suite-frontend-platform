import { cookies } from "next/headers";
import { CloudOff, Lock, Search, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui";
import { PanelEmptyState } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, shortId } from "@/lib/format";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listApplicableSecretPolicyVersions,
  listSecretPolicyVersions,
  allowedWorkloads,
} from "@/lib/api/secret-vault";

const STATUS_TONE: Record<string, "success" | "warning" | "neutral" | "danger" | "info"> = {
  ACTIVE: "success",
  DRAFT: "neutral",
  SUPERSEDED: "info",
  RETIRED: "danger",
};

function scopeLabel(version: { tenant_id: string | null; legal_entity_id: string | null }) {
  if (version.legal_entity_id) return "Legal entity";
  if (version.tenant_id) return "Tenant";
  return "Global";
}

/** Workload list, or an explicit note that it is empty. An empty list is a real
 *  lockdown rather than missing data, and the two must not look the same. */
function Workloads({ raw }: { raw: unknown }) {
  const workloads = allowedWorkloads(raw);
  if (workloads.length === 0) {
    return (
      <span className="text-xs text-amber-600 dark:text-amber-400">
        empty — denies everyone
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {workloads.map((workload) => (
        <code
          key={workload}
          className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          title={workload}
        >
          {shortId(workload)}
        </code>
      ))}
    </div>
  );
}

/**
 * The ACTIVE secret-policy versions for a class, most-specific first.
 *
 * The top row is the one the broker will resolve for a matching path. Note that
 * the broker resolves by PATH, not by class — this view is per class because the
 * service offers no way to list policies any other way.
 */
export async function ApplicableSecretPolicyPanel({
  secretClass,
  scope,
}: {
  secretClass: string;
  scope: "global" | "tenant" | "entity";
}) {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in again to read the secret policy set."
      />
    );
  }

  const result = await listApplicableSecretPolicyVersions({
    secretClass,
    tenantId: scope === "global" ? undefined : session.tenantId,
    legalEntityId: scope === "entity" ? session.legalEntityId : undefined,
  });

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Secret policy set unavailable"
        hint={result.error.message}
      />
    );
  }

  if (result.data.length === 0) {
    return (
      <PanelEmptyState
        icon={Lock}
        tone="warning"
        label={`Nothing active for ${secretClass}`}
        hint="Any broker request against a path in this class would be refused by absence — a 404, not a decision. Register a policy, add a version, and activate it."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse text-left">
        <thead className="border-b border-slate-200 dark:border-slate-800">
          <tr>
            <th scope="col" className={HEAD}>
              Secret path
            </th>
            <th scope="col" className={HEAD}>
              Scope
            </th>
            <th scope="col" className={HEAD}>
              Allowed workloads
            </th>
            <th scope="col" className={cn(HEAD, "text-right")}>
              Max lease
            </th>
            <th scope="col" className={HEAD}>
              Policy ID
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {result.data.map((version, index) => (
            <tr
              key={version.secret_policy_version_id}
              className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <td className={cn(CELL, "font-mono text-xs text-slate-900 dark:text-slate-100")}>
                {version.secret_path}
                {index === 0 && (
                  <Badge tone="info" className="ml-2 align-middle font-sans">
                    resolves first
                  </Badge>
                )}
              </td>
              <td className={CELL}>
                <Badge tone="neutral">{scopeLabel(version)}</Badge>
              </td>
              <td className={CELL}>
                <Workloads raw={version.allowed_workload_ids} />
              </td>
              <td className={cn(CELL, "text-right tabular-nums")}>
                {version.max_lease_duration_seconds}s
              </td>
              <td className={cn(CELL, "font-mono text-xs text-slate-500 dark:text-slate-400")}>
                <span title={version.secret_policy_id}>{shortId(version.secret_policy_id)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Every version of one secret policy, whatever its status.
 *
 * The audit view — includes drafts that were never activated, which is the single
 * most common reason a broker request is refused by absence.
 */
export async function SecretVersionHistoryPanel({
  secretPolicyId,
}: {
  secretPolicyId?: string;
}) {
  if (!secretPolicyId) {
    return (
      <PanelEmptyState
        icon={Search}
        label="No policy selected"
        hint="Paste a secret policy ID above to read every version it has had, and see which are still DRAFT."
      />
    );
  }

  const result = await listSecretPolicyVersions(secretPolicyId);

  if (!result.ok) {
    if (result.error.status === 404) {
      return (
        <PanelEmptyState
          icon={Lock}
          tone="warning"
          label="No such secret policy"
          hint="secret-vault-integration-svc has no policy with that ID."
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
        icon={Lock}
        tone="warning"
        label="Policy exists but has no versions"
        hint="Nothing can broker this path. Add a version and activate it."
      />
    );
  }

  const active = result.data.filter((v) => v.version_status === "ACTIVE").length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {result.data.length} version{result.data.length === 1 ? "" : "s"}, {active} ACTIVE
        {active === 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            {" "}
            — every version here is a draft or retired, so brokering this path is refused by
            absence
          </span>
        )}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] border-collapse text-left">
          <thead className="border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th scope="col" className={HEAD}>
                Version ID
              </th>
              <th scope="col" className={HEAD}>
                Status
              </th>
              <th scope="col" className={HEAD}>
                Scope
              </th>
              <th scope="col" className={HEAD}>
                Allowed workloads
              </th>
              <th scope="col" className={HEAD}>
                Effective
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {result.data.map((version) => (
              <tr
                key={version.secret_policy_version_id}
                className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <td className={cn(CELL, "font-mono text-xs")}>
                  <span title={version.secret_policy_version_id}>
                    {shortId(version.secret_policy_version_id)}
                  </span>
                </td>
                <td className={CELL}>
                  <Badge tone={STATUS_TONE[version.version_status] ?? "neutral"}>
                    {version.version_status}
                  </Badge>
                </td>
                <td className={CELL}>
                  <Badge tone="neutral">{scopeLabel(version)}</Badge>
                </td>
                <td className={CELL}>
                  <Workloads raw={version.allowed_workload_ids} />
                </td>
                <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
                  {formatDate(version.effective_from)}
                  {version.effective_to ? ` → ${formatDate(version.effective_to)}` : " → open"}
                  <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                    created {formatDateTime(version.created_at)}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
