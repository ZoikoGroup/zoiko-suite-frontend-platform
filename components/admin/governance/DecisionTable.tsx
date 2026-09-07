import { Badge } from "@/components/ui";
import { PayloadDetails, CopyableId } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { humanizeCode } from "@/lib/humanize";
import { explainDecision, splitRuleBasis, type GovernanceDecision } from "@/lib/api/governance";

const TONE = {
  authorized: "success",
  escalated: "warning",
  denied: "danger",
} as const;

/**
 * The decision records, as a scannable table.
 *
 * Every column reads as prose first and as stored data second: the action shows
 * its humanised name with the code beneath, and the outcome shows "Allowed" /
 * "Refused" / "Needs review" with the stored value beneath. Both halves are
 * present deliberately — a reader scanning the log should not have to decode
 * GRANTED, and a reader quoting a row to support should not have to guess what
 * the service actually holds.
 *
 * The outcome column is VARCHAR with no CHECK constraint, so a value outside
 * GRANTED / DENIED / ESCALATED is possible. Those render in the review bucket AND
 * keep their raw text visible — an unrecognised outcome must never be displayed
 * as though it were an authorization.
 */
export function DecisionTable({ decisions }: { decisions: GovernanceDecision[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] border-collapse text-left">
        <thead className="border-b border-slate-200 dark:border-slate-800">
          <tr>
            <th scope="col" className={HEAD}>
              What was decided
            </th>
            <th scope="col" className={HEAD}>
              Outcome
            </th>
            <th scope="col" className={HEAD}>
              Why
            </th>
            <th scope="col" className={HEAD}>
              Triggered by
            </th>
            <th scope="col" className={HEAD}>
              Legal entity
            </th>
            <th scope="col" className={HEAD}>
              Decided
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {decisions.map((decision) => {
            const explained = explainDecision(decision.outcome, decision.action_type);
            const basis = splitRuleBasis(decision.rule_basis);
            const hasContext =
              decision.evaluation_context !== null &&
              decision.evaluation_context !== undefined;

            return (
              <tr
                key={decision.decision_id}
                className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <td className={cn(CELL, "font-medium text-slate-900 dark:text-slate-100")}>
                  {humanizeCode(decision.action_type) || "Not recorded"}
                  <p className="mt-0.5 font-mono text-[11px] font-normal text-slate-400 dark:text-slate-500">
                    {decision.action_type}
                  </p>
                  <p className="mt-0.5">
                    <CopyableId value={decision.decision_id} className="font-normal" />
                  </p>
                </td>
                <td className={CELL}>
                  <Badge
                    tone={TONE[explained.outcome]}
                    dot={explained.outcome !== "denied"}
                  >
                    {explained.shortLabel}
                  </Badge>
                  <p className="mt-1 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                    {explained.raw}
                  </p>
                  {explained.unmapped && (
                    <p className="mt-1 max-w-[12rem] text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                      Not an outcome this console recognises — shown as needing review, not
                      treated as an approval.
                    </p>
                  )}
                </td>
                <td className={cn(CELL, "max-w-[18rem]")}>
                  <span className="break-words">{basis.rule || "Not recorded"}</span>
                  {basis.reference && (
                    <p className="mt-0.5 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                      Ref {basis.reference}
                    </p>
                  )}
                  {hasContext && (
                    // Folded away by default: the table is for scanning, and a
                    // context blob open on every row buries the rows themselves.
                    // Expanded, it is a readable list rather than the JSON that
                    // used to sit here.
                    <details className="group mt-2">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-navy-700 dark:text-slate-500 dark:hover:text-navy-300">
                        <span
                          className="transition-transform group-open:rotate-90"
                          aria-hidden="true"
                        >
                          ›
                        </span>
                        What this was based on
                      </summary>
                      <PayloadDetails
                        value={decision.evaluation_context}
                        className="mt-2"
                        emptyLabel="Nothing extra was recorded."
                        rawLabel="Show the original data"
                      />
                    </details>
                  )}
                </td>
                <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                  <CopyableId value={decision.actor_id} />
                </td>
                <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                  <CopyableId value={decision.legal_entity_id} />
                </td>
                <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
                  {formatDateTime(decision.decided_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
