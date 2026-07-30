import { Badge } from "@/components/ui";
import { JsonBlock } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDateTime, shortId } from "@/lib/format";
import { bucketOutcome, type GovernanceDecision } from "@/lib/api/governance";

const TONE = {
  authorized: "success",
  escalated: "warning",
  denied: "danger",
} as const;

/**
 * Raw decision records.
 *
 * The outcome column is VARCHAR with no CHECK constraint, so a value outside
 * GRANTED / DENIED / ESCALATED is possible. Those render in the review bucket
 * AND keep their raw text visible — an unrecognised outcome must never be
 * displayed as though it were an authorization.
 */
export function DecisionTable({ decisions }: { decisions: GovernanceDecision[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] border-collapse text-left">
        <thead className="border-b border-slate-200 dark:border-slate-800">
          <tr>
            <th scope="col" className={HEAD}>
              Action
            </th>
            <th scope="col" className={HEAD}>
              Outcome
            </th>
            <th scope="col" className={HEAD}>
              Rule basis
            </th>
            <th scope="col" className={HEAD}>
              Actor
            </th>
            <th scope="col" className={HEAD}>
              Entity
            </th>
            <th scope="col" className={HEAD}>
              Decided
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {decisions.map((decision) => {
            const { outcome, unmapped } = bucketOutcome(decision.outcome);
            const hasContext =
              decision.evaluation_context !== null &&
              decision.evaluation_context !== undefined;

            return (
              <tr
                key={decision.decision_id}
                className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <td className={cn(CELL, "font-medium text-slate-900 dark:text-slate-100")}>
                  {decision.action_type}
                  <p
                    className="mt-0.5 font-mono text-[11px] font-normal text-slate-400 dark:text-slate-500"
                    title={decision.decision_id}
                  >
                    {shortId(decision.decision_id)}
                  </p>
                </td>
                <td className={CELL}>
                  <Badge tone={TONE[outcome]} dot={outcome !== "denied"}>
                    {decision.outcome}
                  </Badge>
                  {unmapped && (
                    <p className="mt-1 max-w-[12rem] text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                      Unrecognised outcome — shown in the review bucket, not treated as an
                      authorization.
                    </p>
                  )}
                </td>
                <td className={cn(CELL, "max-w-[16rem]")}>
                  <span className="break-words">{decision.rule_basis}</span>
                  {hasContext && (
                    <JsonBlock
                      value={decision.evaluation_context}
                      className="mt-2 max-h-32"
                      emptyLabel="No evaluation context"
                    />
                  )}
                </td>
                <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                  <span title={decision.actor_id}>{shortId(decision.actor_id)}</span>
                </td>
                <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                  <span title={decision.legal_entity_id}>
                    {shortId(decision.legal_entity_id)}
                  </span>
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
