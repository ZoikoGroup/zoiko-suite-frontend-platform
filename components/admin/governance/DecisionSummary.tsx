import { Badge } from "@/components/ui";
import { DetailList, PayloadDetails, CopyableId, type Detail } from "@/components/admin/shared";
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
 * One governance decision, in plain English.
 *
 * This replaces the JSON dump that the lookup and the record form used to show.
 * The order is the order a reader asks the questions in — what happened, what it
 * means, why, then who and when — rather than the order the columns happen to be
 * declared in.
 *
 * No "use client": this renders from both a Server Component (the log table) and
 * a Client Component (the two forms), and it needs nothing from either runtime.
 */
export function DecisionSummary({
  decision,
  /** `compact` drops the meaning paragraph and the ids that only matter to an
   *  auditor — used right after a write, where the reader already knows what
   *  they just did and wants confirmation, not a full record. */
  variant = "full",
  className,
}: {
  decision: GovernanceDecision;
  variant?: "full" | "compact";
  className?: string;
}) {
  const explained = explainDecision(decision.outcome, decision.action_type);
  const basis = splitRuleBasis(decision.rule_basis);
  const full = variant === "full";

  const details: Detail[] = [
    {
      label: "What was decided",
      value: humanizeCode(decision.action_type) || "Not recorded",
      hint: `Recorded as ${decision.action_type}`,
      wide: !full,
    },
    {
      label: "Why it was decided that way",
      value: basis.rule || "Not recorded",
      hint: basis.reference
        ? `Reference ${basis.reference} — the rule version or record the decision was checked against`
        : "The rule that produced this outcome",
      wide: true,
    },
    {
      label: "When the decision was made",
      value: formatDateTime(decision.decided_at),
      hint: "When the decision was taken, which may be earlier than when it was logged here",
    },
  ];

  if (full) {
    details.push(
      {
        label: "Who or what triggered it",
        value: <CopyableId value={decision.actor_id} className="text-sm" />,
        hint: "The person or service whose action was checked",
      },
      {
        label: "Which legal entity it applies to",
        value: <CopyableId value={decision.legal_entity_id} className="text-sm" />,
      },
      {
        label: "Organisation",
        value: <CopyableId value={decision.tenant_id} className="text-sm" />,
      },
    );

    if (decision.workflow_instance_id) {
      details.push({
        label: "Part of workflow",
        value: <CopyableId value={decision.workflow_instance_id} className="text-sm" />,
        hint: "This decision was made while that workflow was running",
      });
    }

    if (decision.causation_id) {
      details.push({
        label: "Caused by",
        value: <CopyableId value={decision.causation_id} className="text-sm" />,
        hint: "The event or earlier decision that led to this one",
      });
    }
  }

  details.push(
    {
      label: "Decision reference",
      value: <CopyableId value={decision.decision_id} className="text-sm" />,
      hint: "Quote this to find the record again, or to report a problem with it",
    },
    {
      label: "Request reference",
      value: <CopyableId value={decision.correlation_id} className="text-sm" />,
      hint: "Ties this decision to everything else the same request did",
    },
  );

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={TONE[explained.outcome]} dot={explained.outcome !== "denied"}>
          {explained.shortLabel}
        </Badge>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {explained.headline}
        </p>
      </div>

      {full && (
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {explained.meaning}
        </p>
      )}

      {/* The stored outcome code, always visible. An operator quoting this
          record to support needs the value the service holds, and the plain
          wording above is this console's reading of it, not the record. */}
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Outcome recorded as{" "}
        <span className="font-mono text-slate-500 dark:text-slate-400">{explained.raw}</span>
        {explained.unmapped
          ? " — not a value this console recognises."
          : " by the service that made the decision."}
      </p>

      <DetailList items={details} />

      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Details recorded with the decision
        </p>
        <PayloadDetails
          value={decision.evaluation_context}
          emptyLabel="Nothing extra was recorded with this decision."
          rawLabel="Show these details in their original form"
        />
      </div>
    </div>
  );
}
