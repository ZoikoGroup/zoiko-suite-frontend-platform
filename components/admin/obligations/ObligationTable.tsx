import { CopyableId } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { daysUntil, isTerminal, type Obligation } from "@/lib/api/obligations";
import { ObligationStatusBadge, SeverityBadge } from "./ObligationStatusBadge";

/**
 * The register table.
 *
 * The deadline column carries the fact that matters most and is not in the data:
 * whether a row is past due. Because nothing in obligations-svc sweeps deadlines,
 * "8 days overdue" and a status of OPEN can both be true at once, and the table
 * shows both rather than trusting the status field to tell the story.
 *
 * A CLOSED row's deadline is deliberately not annotated with how late it was. The
 * duty is discharged; how close it ran is a different question from what still
 * needs attention, and colouring it would put permanent red in a register whose
 * red should mean "act now".
 */
export function ObligationTable({
  obligations,
  jurisdictionCodes,
  jurisdictionsResolved,
}: {
  obligations: Obligation[];
  jurisdictionCodes: Map<string, string>;
  jurisdictionsResolved: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] border-collapse text-left">
          <thead className="border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th scope="col" className={HEAD}>
                Obligation
              </th>
              <th scope="col" className={HEAD}>
                Deadline
              </th>
              <th scope="col" className={HEAD}>
                Status
              </th>
              <th scope="col" className={HEAD}>
                Severity
              </th>
              <th scope="col" className={HEAD}>
                Owner
              </th>
              <th scope="col" className={HEAD}>
                Raised from
              </th>
              <th scope="col" className={HEAD}>
                Obligation ID
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {obligations.map((obligation) => {
              const closed = isTerminal(obligation.obligation_status);
              const days = daysUntil(obligation.due_date);
              const pastDue = !closed && days < 0;
              const unflagged = pastDue && obligation.obligation_status !== "OVERDUE";
              const code = jurisdictionCodes.get(obligation.jurisdiction_id);

              return (
                <tr
                  key={obligation.obligation_id}
                  className={cn(
                    "align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60",
                    closed && "opacity-60",
                  )}
                >
                  <td className={cn(CELL, "font-medium text-slate-900 dark:text-slate-100")}>
                    {obligation.obligation_code}
                    <p className="mt-0.5 text-[11px] font-normal text-slate-400 dark:text-slate-500">
                      {obligation.obligation_type.replace(/_/g, " ")}
                      {code ? ` · ${code}` : ""}
                    </p>
                  </td>
                  <td className={cn(CELL, "whitespace-nowrap")}>
                    {formatDate(obligation.due_date)}
                    {closed ? (
                      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                        {obligation.closed_at
                          ? `closed ${formatDate(obligation.closed_at)}`
                          : "closed"}
                      </p>
                    ) : (
                      <p
                        className={cn(
                          "mt-0.5 text-[11px]",
                          pastDue
                            ? "text-rose-600 dark:text-rose-400"
                            : days <= 7
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-slate-400 dark:text-slate-500",
                        )}
                      >
                        {pastDue
                          ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
                          : days === 0
                            ? "due today"
                            : `in ${days} day${days === 1 ? "" : "s"}`}
                      </p>
                    )}
                  </td>
                  <td className={CELL}>
                    <ObligationStatusBadge status={obligation.obligation_status} />
                    {unflagged && (
                      <p className="mt-1 max-w-[13rem] text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                        Past its deadline but not marked OVERDUE — nothing in this service sweeps
                        due dates.
                      </p>
                    )}
                  </td>
                  <td className={CELL}>
                    <SeverityBadge severity={obligation.severity_level} />
                  </td>
                  <td className={cn(CELL, "whitespace-nowrap")}>
                    {obligation.responsible_function}
                  </td>
                  <td className={cn(CELL, "max-w-[16rem]")}>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {obligation.obligation_source_type.replace(/_/g, " ")}
                    </span>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                      {obligation.source_reference}
                    </p>
                  </td>
                  <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                    <CopyableId value={obligation.obligation_id} className="text-xs" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!jurisdictionsResolved && (
        <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-400">
          jurisdiction-rules-svc could not be reached, so jurisdiction codes are not shown. The
          obligations themselves are unaffected — but note that raising a new one will fail closed
          while that service is down, because every obligation must be jurisdiction-bound.
        </p>
      )}
    </div>
  );
}
