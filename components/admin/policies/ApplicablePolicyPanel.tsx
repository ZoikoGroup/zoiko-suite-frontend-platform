import { cookies } from "next/headers";
import { CloudOff, Scale, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui";
import { PanelEmptyState, JsonBlock } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, shortId } from "@/lib/format";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listApplicablePolicyVersions,
  describeScope,
  thresholdAmount,
  EVALUABLE_POLICY_TYPES,
} from "@/lib/api/policies";

/**
 * The ACTIVE policy versions that apply to a scope, in the order the service
 * returns them — most specific first.
 *
 * That order is load-bearing rather than cosmetic: evaluation uses the FIRST
 * match, so the top row is the one that will actually decide. The panel labels it
 * as such, because a list of "applicable" versions reads as though they all apply.
 */
export async function ApplicablePolicyPanel({
  policyType,
  scope,
}: {
  policyType: string;
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
        hint="Sign in again to read the applicable policy set."
      />
    );
  }

  const result = await listApplicablePolicyVersions({
    policyType,
    tenantId: scope === "global" ? undefined : session.tenantId,
    legalEntityId: scope === "entity" ? session.legalEntityId : undefined,
  });

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Policy set unavailable"
        hint={result.error.message}
      />
    );
  }

  if (result.data.length === 0) {
    return (
      <PanelEmptyState
        icon={Scale}
        tone="warning"
        label={`Nothing active for ${policyType}`}
        hint="An evaluation against this type and scope would answer 404 — policy-svc does not fall back to a default. Create a version below and activate it."
      />
    );
  }

  const unevaluable = !EVALUABLE_POLICY_TYPES.includes(policyType);

  return (
    <div className="space-y-3">
      {unevaluable && (
        <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          These versions are ACTIVE but unenforceable: policy-svc implements no evaluation logic
          for {policyType}, so any evaluation against it answers 501. Being active is not the
          same as being applied.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] border-collapse text-left">
          <thead className="border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th scope="col" className={HEAD}>
                Policy
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
                Activated
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {result.data.map((version, index) => {
              const threshold = thresholdAmount(version.rule_payload);
              return (
                <tr
                  key={version.policy_version_id}
                  className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <td className={cn(CELL, "font-medium text-slate-900 dark:text-slate-100")}>
                    {version.policy_code}
                    {index === 0 && (
                      <Badge tone="info" className="ml-2 align-middle">
                        decides
                      </Badge>
                    )}
                    <p
                      className="mt-0.5 font-mono text-[11px] font-normal text-slate-400 dark:text-slate-500"
                      title={version.policy_version_id}
                    >
                      {shortId(version.policy_version_id)}
                    </p>
                  </td>
                  <td className={CELL}>
                    <Badge tone="neutral">{describeScope(version)}</Badge>
                  </td>
                  <td className={cn(CELL, "text-right tabular-nums")}>
                    {threshold === null ? (
                      <span className="text-xs text-rose-600 dark:text-rose-400">
                        no threshold_amount
                      </span>
                    ) : (
                      threshold.toLocaleString("en-GB")
                    )}
                    {threshold === null && (
                      <JsonBlock value={version.rule_payload} className="mt-2 max-h-24" />
                    )}
                  </td>
                  <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
                    {formatDate(version.effective_from)}
                    {version.effective_to ? ` → ${formatDate(version.effective_to)}` : " → open"}
                  </td>
                  <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                    {version.activated_at ? (
                      <>
                        {formatDateTime(version.activated_at)}
                        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                          by{" "}
                          <span title={version.activated_by_principal_id ?? undefined}>
                            {shortId(version.activated_by_principal_id ?? "—")}
                          </span>
                        </p>
                      </>
                    ) : (
                      <span className="text-xs italic text-slate-400 dark:text-slate-500">
                        not recorded
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {result.data.some((v) => thresholdAmount(v.rule_payload) === null) && (
        <p className="text-xs leading-relaxed text-rose-600 dark:text-rose-400">
          A version above has no numeric <code>threshold_amount</code>. policy-svc accepted it at
          creation without validating the payload, and will answer 500{" "}
          <code>invalid_policy_payload</code> if it is ever the deciding version. It needs
          replacing.
        </p>
      )}
    </div>
  );
}
