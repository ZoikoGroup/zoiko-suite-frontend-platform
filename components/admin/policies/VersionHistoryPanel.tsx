import { cookies } from "next/headers";
import { CloudOff, History, Search, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui";
import { PanelEmptyState, PayloadDetails, CopyableId } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listPolicyVersionHistory,
  describeScope,
  describeVersionStatus,
  explainBadReference,
  explainPolicyError,
  formatThreshold,
  looksLikeReference,
} from "@/lib/api/policies";

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
        label="No rule chosen yet"
        hint="Paste a rule's reference above to see every limit it has ever had — including ones that were never brought into force and ones since replaced."
      />
    );
  }

  // The tenant is not optional here. policy-svc scopes a rule's history to the
  // caller's tenant plus any global versions, and refuses a read that does not
  // say who is asking.
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="You are not signed in"
        hint="Sign in again to read a rule's history."
      />
    );
  }

  // Refused before the request, for the same reason the write forms refuse it:
  // the service casts this to a uuid in SQL, so a rule code pasted here comes
  // back as a database outage rather than as a bad reference.
  if (!looksLikeReference(policyId)) {
    return (
      <PanelEmptyState
        icon={Search}
        tone="warning"
        label="That is not a rule reference"
        hint={explainBadReference(policyId, "rule")}
      />
    );
  }

  const result = await listPolicyVersionHistory(policyId, session.tenantId);

  if (!result.ok) {
    if (result.error.status === 404) {
      return (
        <PanelEmptyState
          icon={History}
          tone="warning"
          label="No rule with that reference"
          // A shortened or mistyped value no longer reaches here — the format
          // check above catches those and names the likely mistake. What is
          // left is a well-formed reference that simply matches nothing, so the
          // hint only has to cover that one case.
          hint="That is a well-formed reference, but nothing on record matches it. This box wants the reference for the rule, not for one of its limits and not for a check that was filed — they all look alike. The table above shows both of a rule's references, labelled. Note this means the rule itself is unknown, which is different from a rule that exists with no limits set."
        />
      );
    }
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="The history could not be read"
        // Explained, not echoed. This used to print the client's own diagnostic
        // — "policy-svc rejected the request (401) — tenant_scope_missing" was
        // on screen for months — which is the one thing this page is not
        // supposed to do.
        hint={explainPolicyError(result.error.message, { status: result.error.status })}
      />
    );
  }

  if (result.data.length === 0) {
    return (
      <PanelEmptyState
        icon={History}
        tone="warning"
        label="This rule exists but has no limits set"
        hint="It applies to nothing and cannot decide anything. Set a limit below and bring it into force."
      />
    );
  }

  const active = result.data.filter((v) => v.version_status === "ACTIVE").length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {result.data.length} version{result.data.length === 1 ? "" : "s"} on record,{" "}
        {active === 0 ? "none" : active} in force
        {active === 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            {" "}
            — so this rule is deciding nothing, and checking anything against it comes back
            undecided
          </span>
        )}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[50rem] border-collapse text-left">
          <thead className="border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th scope="col" className={HEAD}>
                Reference
              </th>
              <th scope="col" className={HEAD}>
                Standing
              </th>
              <th scope="col" className={HEAD}>
                Applies to
              </th>
              <th scope="col" className={cn(HEAD, "text-right")}>
                Limit
              </th>
              <th scope="col" className={HEAD}>
                Dated from
              </th>
              <th scope="col" className={HEAD}>
                Written
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {result.data.map((version) => {
              const threshold = formatThreshold(version.rule_payload);
              const status = describeVersionStatus(version.version_status);

              return (
                <tr
                  key={version.policy_version_id}
                  className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <td className={CELL}>
                    <CopyableId value={version.policy_version_id} className="text-xs" />
                  </td>
                  <td className={CELL}>
                    {/* The plain standing, with the stored code beneath it. A
                        history table is the view most likely to be quoted to
                        someone outside this console, so both have to be here. */}
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <p className="mt-1 font-mono text-[10px] text-slate-400 dark:text-slate-500">
                      {status.raw}
                    </p>
                    {version.activated_at && (
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                        in force from {formatDateTime(version.activated_at)}
                      </p>
                    )}
                  </td>
                  <td className={CELL}>
                    <Badge tone="neutral">{describeScope(version)}</Badge>
                  </td>
                  <td className={cn(CELL, "text-right tabular-nums")}>
                    {threshold ?? (
                      <PayloadDetails
                        value={version.rule_payload}
                        className="text-left"
                        emptyLabel="Nothing was recorded on this version."
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
