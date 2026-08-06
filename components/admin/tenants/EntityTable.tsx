import { CopyableId, PanelEmptyState } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { isEntityTerminal, type LegalEntity } from "@/lib/api/tenants";
import { Building2 } from "lucide-react";

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  DORMANT: "bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300",
  SUSPENDED: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  DISSOLVED: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

export function EntityStatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.DORMANT;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {status}
      {isEntityTerminal(status) ? " · terminal" : ""}
    </span>
  );
}

/**
 * The legal entity register for a tenant.
 *
 * Shows legal_entity_id as a copyable value rather than truncating it: three
 * forms on this page require one, and an id the reader can see but not copy is
 * an invitation to retype it — which is how a malformed UUID reaches the
 * database driver and comes back looking like an outage.
 */
export function EntityTable({ entities }: { entities: LegalEntity[] }) {
  if (entities.length === 0) {
    return (
      <PanelEmptyState
        icon={Building2}
        label="No legal entities yet"
        hint="Create one below — it needs a jurisdiction the registry can validate and this tenant's residency policy."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
        <thead className="bg-slate-50 dark:bg-slate-800/50">
          <tr>
            <th className={HEAD}>Entity</th>
            <th className={HEAD}>Type</th>
            <th className={HEAD}>Status</th>
            <th className={HEAD}>Currency</th>
            <th className={HEAD}>Legal entity ID</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
          {entities.map((e) => (
            <tr key={e.legal_entity_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <td className={CELL}>
                <div className="font-medium text-slate-800 dark:text-slate-200">{e.entity_code}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{e.legal_name}</div>
              </td>
              <td className={CELL}>{e.entity_type}</td>
              <td className={CELL}>
                <EntityStatusBadge status={e.entity_status} />
              </td>
              <td className={CELL}>{e.default_currency_code}</td>
              <td className={CELL}>
                <CopyableId value={e.legal_entity_id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
