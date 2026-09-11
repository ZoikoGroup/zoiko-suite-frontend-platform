import { cookies } from "next/headers";
import { CloudOff, ClipboardCheck, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui";
import { PanelEmptyState, CopyableId } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listEvidenceRequirements,
  summariseCatalog,
  describeRequirement,
  describeRequirementScope,
  describeRequirementStatus,
  describeEvidenceType,
  actionLabel,
  domainLabel,
  readSpec,
} from "@/lib/api/evidence";

const TILE =
  "flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3.5 py-3 dark:border-slate-800";

/**
 * The requirement catalog, including retired rows.
 *
 * `as_of` is left unset deliberately. Passing "now" would return only what is
 * currently in force, and a catalog listing that silently hid retired rows would
 * misrepresent what the gate used to require — which is exactly the question an
 * auditor arrives with. Retired rows are shown and labelled instead.
 */
export async function CatalogPanel({
  domainCode,
  actionType,
}: {
  domainCode?: string;
  actionType?: string;
}) {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in again to read the requirement catalog."
      />
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const result = await listEvidenceRequirements(
    { tenantId: session.tenantId, domainCode, actionType },
    identity,
  );

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Requirement catalog unavailable"
        hint={result.error.message}
      />
    );
  }

  if (result.data.length === 0) {
    const filtered = Boolean(domainCode || actionType);
    return (
      <PanelEmptyState
        icon={ClipboardCheck}
        tone="warning"
        label={filtered ? "Nothing matches what you asked for" : "No requirements have been set up"}
        hint={
          filtered
            ? "No evidence is required for this, so checking it will report that nothing is being checked — which is not the same as approving it."
            : "Nothing on the platform currently requires evidence. Checks will honestly report that nothing is set up to check, but no action is being held to anything."
        }
      />
    );
  }

  const stats = summariseCatalog(result.data);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className={TILE}>
          <span className="text-xs text-slate-500 dark:text-slate-400">In force</span>
          <span className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {stats.effective}
          </span>
        </div>
        <div className={TILE}>
          <span className="text-xs text-slate-500 dark:text-slate-400">Withdrawn</span>
          <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {stats.retired}
          </span>
        </div>
        <div className={TILE}>
          <span className="text-xs text-slate-500 dark:text-slate-400">Actions covered</span>
          <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {stats.gatedActions}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-left">
          <thead className="border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th scope="col" className={HEAD}>
                Action
              </th>
              <th scope="col" className={HEAD}>
                What must be on file
              </th>
              <th scope="col" className={HEAD}>
                Applies to
              </th>
              <th scope="col" className={HEAD}>
                Status
              </th>
              <th scope="col" className={HEAD}>
                Reference
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {result.data.map((requirement) => {
              const status = describeRequirementStatus(requirement);
              const scope = describeRequirementScope(requirement);
              const type = describeEvidenceType(requirement.evidence_type);
              const spec = readSpec(requirement.requirement_payload);

              return (
                <tr
                  key={requirement.evidence_requirement_id}
                  className={cn(
                    "align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60",
                    !status.inForce && "opacity-60",
                  )}
                >
                  <td className={cn(CELL, "font-medium text-slate-900 dark:text-slate-100")}>
                    {actionLabel(requirement.action_type)}
                    <p className="mt-0.5 text-[11px] font-normal text-slate-400 dark:text-slate-500">
                      {domainLabel(requirement.domain_code)}
                    </p>
                    {/* The stored codes, because this table is what an auditor
                        reads a reference out of. */}
                    <p className="mt-0.5 font-mono text-[10px] font-normal text-slate-400 dark:text-slate-500">
                      {requirement.action_type}
                    </p>
                  </td>
                  <td className={cn(CELL, "max-w-[18rem]")}>
                    {describeRequirement(requirement)}
                    {!type.verified && (
                      <p className="mt-1 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                        Recorded as stated — the platform does not look this up. Only documents are
                        actually checked.
                      </p>
                    )}
                    {spec.description && (
                      <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                        {spec.description}
                      </p>
                    )}
                  </td>
                  <td className={CELL}>
                    <Badge tone={requirement.legal_entity_id ? "neutral" : "info"}>
                      {scope.label}
                    </Badge>
                  </td>
                  <td className={cn(CELL, "whitespace-nowrap")}>
                    <Badge tone={status.tone} dot={status.tone === "success"}>
                      {status.label}
                    </Badge>
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                      From {formatDate(requirement.effective_from)}
                    </p>
                    {requirement.effective_to && (
                      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                        {status.inForce ? "Until" : "Ended"}{" "}
                        {formatDate(requirement.effective_to)}
                      </p>
                    )}
                  </td>
                  <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                    <CopyableId value={requirement.evidence_requirement_id} className="text-xs" />
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
