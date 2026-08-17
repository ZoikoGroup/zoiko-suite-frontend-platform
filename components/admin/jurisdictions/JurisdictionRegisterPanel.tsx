import { Scale, CloudOff } from "lucide-react";
import { PanelEmptyState, CopyableId } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import {
  explainJurisdictionError,
  listJurisdictions,
  type Jurisdiction,
} from "@/lib/api/jurisdictions";
import { DeactivateJurisdictionButton } from "./JurisdictionForms";

function StateBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium " +
        (active
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400")
      }
      title={
        active
          ? "In force. Obligations and entity assignments can be bound to it."
          : "Deactivated and end-dated. It still appears here, but a lookup by id answers 404 — so every service that validates against this register now fails closed on it, including for records already bound to it."
      }
    >
      {active ? "ACTIVE" : "INACTIVE"}
    </span>
  );
}

function day(value: string | null): string {
  return value ? value.slice(0, 10) : "—";
}

/**
 * The jurisdiction register.
 *
 * The parent column resolves to a code rather than showing the stored UUID: the
 * nesting is the whole point of this table — a rule on GB applies within GB-SCT
 * unless GB-SCT overrides it — and a column of indistinguishable UUIDs would
 * hide exactly the relationship a reader came here to see. A parent id that
 * does not resolve is rendered as the id rather than dropped, because a missing
 * link would misrepresent a nested jurisdiction as a root one.
 */
export async function JurisdictionRegisterPanel() {
  const result = await listJurisdictions();

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Jurisdiction register unavailable"
        hint={`${explainJurisdictionError(result.error.message)} — obligations-svc validates against this same register and fails closed, so while it is unreachable no obligation can be raised either.`}
      />
    );
  }

  const jurisdictions: Jurisdiction[] = result.data;

  if (jurisdictions.length === 0) {
    return (
      <PanelEmptyState
        icon={Scale}
        label="No jurisdictions registered"
        hint="Nothing has been recorded here yet. Until a jurisdiction exists, an obligation cannot be bound to one — the raise form validates against this register."
      />
    );
  }

  const codeById = new Map(jurisdictions.map((j) => [j.jurisdiction_id, j.jurisdiction_code]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-208 border-collapse">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800">
            <th className={HEAD}>Code</th>
            <th className={HEAD}>Name</th>
            <th className={HEAD}>Type</th>
            <th className={HEAD}>Authority</th>
            <th className={HEAD}>Nested in</th>
            <th className={HEAD}>Effective</th>
            <th className={HEAD}>State</th>
            <th className={HEAD}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {jurisdictions.map((j) => (
            <tr
              key={j.jurisdiction_id}
              className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
            >
              <td className={`${CELL} font-mono text-xs font-medium`}>{j.jurisdiction_code}</td>
              <td className={CELL}>{j.jurisdiction_name}</td>
              <td className={`${CELL} text-xs`}>{j.jurisdiction_type}</td>
              <td className={`${CELL} text-xs`}>{j.authority_type}</td>
              <td className={`${CELL} font-mono text-xs`}>
                {j.parent_jurisdiction_id
                  ? (codeById.get(j.parent_jurisdiction_id) ?? j.parent_jurisdiction_id)
                  : <span className="text-slate-400 dark:text-slate-500">root</span>}
              </td>
              <td className={`${CELL} whitespace-nowrap text-xs`}>
                {day(j.effective_from)}
                {j.effective_to ? ` → ${day(j.effective_to)}` : ""}
              </td>
              <td className={CELL}>
                <StateBadge active={j.active_flag} />
              </td>
              <td className={CELL}>
                <div className="flex items-center justify-end gap-2">
                  <CopyableId value={j.jurisdiction_id} />
                  {j.active_flag && <DeactivateJurisdictionButton jurisdictionId={j.jurisdiction_id} />}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
