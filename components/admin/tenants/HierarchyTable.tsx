import { CopyableId, PanelEmptyState } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import type { EntityHierarchy, LegalEntity } from "@/lib/api/tenants";
import { Network } from "lucide-react";

/**
 * Entity hierarchy relationships across the tenant.
 *
 * Parent and child are separate columns rather than a "direction" relative to
 * some current entity. The registry answers /entities/{id}/hierarchies with
 * every relationship that entity appears in — as parent AND as child — so a
 * merged view has no single vantage point, and calling one side "the
 * counterparty" would invert half the rows depending on which entity's read
 * they arrived from.
 */
export function HierarchyTable({
  hierarchies,
  entities,
}: {
  hierarchies: EntityHierarchy[];
  entities: LegalEntity[];
}) {
  if (hierarchies.length === 0) {
    return (
      <PanelEmptyState
        icon={Network}
        label="No hierarchy relationships"
        hint="No parent/child relationships are recorded between this tenant's entities. Create one below."
      />
    );
  }

  // Entity codes read better than UUIDs, but an id with no matching entity is
  // not an error — it may sit outside the list this page loaded — so it falls
  // back to the raw id rather than blanking.
  const codeFor = (id: string) =>
    entities.find((e) => e.legal_entity_id === id)?.entity_code ?? id;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
        <thead className="bg-slate-50 dark:bg-slate-800/50">
          <tr>
            <th className={HEAD}>Parent</th>
            <th className={HEAD}>Child</th>
            <th className={HEAD}>Type</th>
            <th className={HEAD}>Effective</th>
            <th className={HEAD}>Hierarchy ID</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
          {hierarchies.map((h) => {
            const open = h.effective_to === null;
            return (
              <tr key={h.hierarchy_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className={CELL}>
                  <div className="font-medium text-slate-800 dark:text-slate-200">
                    {codeFor(h.parent_legal_entity_id)}
                  </div>
                </td>
                <td className={CELL}>
                  <div className="font-medium text-slate-800 dark:text-slate-200">
                    {codeFor(h.child_legal_entity_id)}
                  </div>
                </td>
                <td className={CELL}>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {h.relationship_type}
                  </span>
                </td>
                <td className={CELL}>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    from {h.effective_from.slice(0, 10)}
                  </div>
                  {/* An end-dated row stays in the register — that is the
                      no-hard-delete doctrine, so it is shown, not hidden. */}
                  <div
                    className={
                      open
                        ? "text-xs text-emerald-600 dark:text-emerald-400"
                        : "text-xs text-slate-400 dark:text-slate-500"
                    }
                  >
                    {open ? "open" : `ended ${h.effective_to?.slice(0, 10)}`}
                  </div>
                </td>
                <td className={CELL}>
                  <CopyableId value={h.hierarchy_id} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
