import { cookies } from "next/headers";
import { CloudOff, Scale, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui";
import { PanelEmptyState, PayloadDetails, CopyableId } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listApplicablePolicyVersions,
  describePolicyType,
  describeScope,
  explainPolicyError,
  formatThreshold,
  startsInFuture,
  thresholdAmount,
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
        label="You are not signed in"
        hint="Sign in again to see which rules are in force."
      />
    );
  }

  const type = describePolicyType(policyType);

  const result = await listApplicablePolicyVersions({
    policyType,
    tenantId: scope === "global" ? undefined : session.tenantId,
    legalEntityId: scope === "entity" ? session.legalEntityId : undefined,
    // A global-only read still has to say who is asking.
    callerTenantId: session.tenantId,
  });

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="These rules could not be read"
        // Explained rather than echoed, for the same reason every other message
        // on this page is: the client's diagnostic names a port and a status.
        hint={explainPolicyError(result.error.message, { status: result.error.status })}
      />
    );
  }

  if (result.data.length === 0) {
    return (
      <PanelEmptyState
        icon={Scale}
        tone="warning"
        label={`No ${type.label.toLowerCase()} is in force here`}
        hint="Checking an amount against this would come back undecided — the service will not invent a limit where none was set. Create a rule below, give it a limit, and bring it into force."
      />
    );
  }

  return (
    <div className="space-y-3">
      {!type.enforceable && (
        <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          These are in force and still decide nothing. Nothing on the platform can act on a{" "}
          {type.label.toLowerCase()} yet, so no check will ever consult them. Being in force is
          not the same as being applied.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] border-collapse text-left">
          <thead className="border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th scope="col" className={HEAD}>
                Rule
              </th>
              <th scope="col" className={HEAD}>
                Applies to
              </th>
              <th scope="col" className={cn(HEAD, "text-right")}>
                Limit
              </th>
              {/* "Dated from", not "In force from". Everything in this table
                  is already in force whatever this column says — see the
                  warning below it. */}
              <th scope="col" className={HEAD}>
                Dated from
              </th>
              <th scope="col" className={HEAD}>
                Brought into force
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {result.data.map((version, index) => {
              const threshold = formatThreshold(version.rule_payload);
              return (
                <tr
                  key={version.policy_version_id}
                  className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <td className={cn(CELL, "font-medium text-slate-900 dark:text-slate-100")}>
                    {version.policy_code}
                    {index === 0 && (
                      <Badge tone="info" className="ml-2 align-middle">
                        this one decides
                      </Badge>
                    )}
                    {/* Both references, labelled. The three forms below this panel
                        each ask for one of them, they look identical, and the rule
                        reference appeared nowhere on the page once the create
                        banner was gone — so it had to be recoverable from the read
                        view, and it has to be obvious which is which. */}
                    <dl className="mt-1 space-y-0.5 font-normal">
                      <div className="flex items-baseline gap-1.5">
                        <dt className="w-[3.25rem] shrink-0 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          rule
                        </dt>
                        <dd>
                          <CopyableId value={version.policy_id} />
                        </dd>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <dt className="w-[3.25rem] shrink-0 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          limit
                        </dt>
                        <dd>
                          <CopyableId value={version.policy_version_id} />
                        </dd>
                      </div>
                    </dl>
                  </td>
                  <td className={CELL}>
                    <Badge tone="neutral">{describeScope(version)}</Badge>
                  </td>
                  <td className={cn(CELL, "text-right tabular-nums")}>
                    {threshold ?? (
                      <span className="text-xs text-rose-600 dark:text-rose-400">
                        No limit set
                      </span>
                    )}
                    {/* What the rule does hold instead, as readable rows rather
                        than the raw record — the reader still has to see it, and
                        this is the one row on the page where the stored content
                        is the whole story. */}
                    {threshold === null && (
                      <PayloadDetails
                        value={version.rule_payload}
                        className="mt-2 text-left"
                        emptyLabel="Nothing was recorded on this rule at all."
                        rawLabel="Show this in its original form"
                      />
                    )}
                  </td>
                  <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
                    {formatDate(version.effective_from)}
                    {version.effective_to
                      ? ` until ${formatDate(version.effective_to)}`
                      : " — no end date"}
                  </td>
                  <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                    {version.activated_at ? (
                      <>
                        {formatDateTime(version.activated_at)}
                        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                          by <CopyableId value={version.activated_by_principal_id} />
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

      {/* A future date on something that is already deciding is the most
          misleading thing this table can show, so it is called out rather than
          left for the reader to infer from a column. */}
      {result.data.some(startsInFuture) && (
        <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          A rule above is dated to start in the future and is being applied
          <strong className="font-medium"> already</strong>. The date is recorded but not acted
          on — once a limit is brought into force it decides immediately, whatever its start
          date says. Do not rely on a future date to hold a limit back.
        </p>
      )}

      {result.data.some((v) => thresholdAmount(v.rule_payload) === null) && (
        <p className="text-xs leading-relaxed text-rose-600 dark:text-rose-400">
          One of the rules above has no limit on it. It was saved without one, and it will fail
          outright the first time it is the rule asked to decide something. It needs replacing
          with a version that sets a limit.
        </p>
      )}
    </div>
  );
}
