import { CopyableId, PanelEmptyState } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { isBillableClassification, type Workspace } from "@/lib/api/tenants";
import { Layers } from "lucide-react";

/**
 * Billing classification, coloured by whether it can ever produce a charge.
 *
 * Commercial classes are amber rather than green: this is not a health signal,
 * it is a "real money can come out of this" signal, and rendering it in the
 * same colour as an ACTIVE status would make the one thing an operator most
 * needs to notice look like a pass.
 */
function BillingBadge({ classification }: { classification: string }) {
  const billable = isBillableClassification(classification);
  const tone = billable
    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
    : "bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300";

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {classification}
      {billable ? " · billable" : ""}
    </span>
  );
}

/**
 * Workspaces under a tenant.
 *
 * The classification is a column, not a detail-view field, because whether a
 * workspace can generate a live charge is not derivable from its name or its
 * age — the backend refuses to guess it, and neither should this table.
 */
export function WorkspaceTable({ workspaces }: { workspaces: Workspace[] }) {
  if (workspaces.length === 0) {
    return (
      <PanelEmptyState
        icon={Layers}
        label="No workspaces yet"
        hint="A workspace sits beneath the tenant and may optionally scope to one legal entity. Create one below."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
        <thead className="bg-slate-50 dark:bg-slate-800/50">
          <tr>
            <th className={HEAD}>Workspace</th>
            <th className={HEAD}>Billing classification</th>
            <th className={HEAD}>Source</th>
            <th className={HEAD}>Status</th>
            <th className={HEAD}>Scope</th>
            <th className={HEAD}>Workspace ID</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
          {workspaces.map((w) => (
            <tr key={w.workspace_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <td className={CELL}>
                <div className="font-medium text-slate-800 dark:text-slate-200">{w.name}</div>
                {w.business_unit ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400">{w.business_unit}</div>
                ) : null}
              </td>
              <td className={CELL}>
                <BillingBadge classification={w.billing_classification} />
              </td>
              <td className={CELL}>
                <span className="text-xs text-slate-500 dark:text-slate-400">{w.billing_source}</span>
              </td>
              <td className={CELL}>
                <span className="text-xs text-slate-500 dark:text-slate-400">{w.status}</span>
              </td>
              <td className={CELL}>
                {/* A workspace with no entity hangs from the tenant — that is a
                    legitimate shape, so it is named rather than left blank. */}
                {w.legal_entity_id ? (
                  <CopyableId value={w.legal_entity_id} />
                ) : (
                  <span className="text-xs text-slate-400 dark:text-slate-500">tenant-wide</span>
                )}
              </td>
              <td className={CELL}>
                <CopyableId value={w.workspace_id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
