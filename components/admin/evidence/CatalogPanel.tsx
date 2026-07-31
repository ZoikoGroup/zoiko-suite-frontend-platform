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
  isRequirementEffective,
  describeRequirement,
  readSpec,
  VERIFIED_EVIDENCE_TYPE,
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
        label={filtered ? "No requirements match those filters" : "The catalog is empty"}
        hint={
          filtered
            ? "Nothing gates this action, so an evaluation of it answers NO_REQUIREMENTS_DEFINED — which is not the same as satisfied."
            : "Every action in the platform is currently ungated. Evaluations will answer NO_REQUIREMENTS_DEFINED rather than SATISFIED, which is the honest signal — but nothing is being enforced."
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
          <span className="text-xs text-slate-500 dark:text-slate-400">Retired</span>
          <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {stats.retired}
          </span>
        </div>
        <div className={TILE}>
          <span className="text-xs text-slate-500 dark:text-slate-400">Actions gated</span>
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
                Gated action
              </th>
              <th scope="col" className={HEAD}>
                Requires
              </th>
              <th scope="col" className={HEAD}>
                Scope
              </th>
              <th scope="col" className={HEAD}>
                Effective
              </th>
              <th scope="col" className={HEAD}>
                Requirement ID
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {result.data.map((requirement) => {
              const inForce = isRequirementEffective(requirement);
              const spec = readSpec(requirement.requirement_payload);
              const verifiable = requirement.evidence_type === VERIFIED_EVIDENCE_TYPE;

              return (
                <tr
                  key={requirement.evidence_requirement_id}
                  className={cn(
                    "align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60",
                    !inForce && "opacity-60",
                  )}
                >
                  <td className={cn(CELL, "font-medium text-slate-900 dark:text-slate-100")}>
                    {requirement.action_type}
                    <p className="mt-0.5 text-[11px] font-normal text-slate-400 dark:text-slate-500">
                      {requirement.domain_code}
                    </p>
                  </td>
                  <td className={cn(CELL, "max-w-[18rem]")}>
                    {describeRequirement(requirement)}
                    {!verifiable && (
                      <p className="mt-1 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                        Taken on the caller&apos;s word — only {VERIFIED_EVIDENCE_TYPE} references
                        are verified against document-vault-svc.
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
                      {requirement.legal_entity_id ? "Legal entity" : "Tenant-wide"}
                    </Badge>
                  </td>
                  <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
                    {formatDate(requirement.effective_from)}
                    {requirement.effective_to ? (
                      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                        retired {formatDate(requirement.effective_to)}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                        open-ended
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
