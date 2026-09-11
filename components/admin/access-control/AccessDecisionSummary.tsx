import { Badge } from "@/components/ui";
import { CopyableId, DetailList, StoredAs, type Detail } from "@/components/admin/shared";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  describeDecisionOutcome,
  explainDecisionBasis,
  type AccessDecision,
  type AuthorizeDecision,
} from "@/lib/api/authorization";

/**
 * One authorization decision, in plain English.
 *
 * `{"decision_outcome":"DENIED","decision_basis":"sod:conflict_with=PAYMENT_INITIATE"}`
 * is the most consequential sentence this platform produces and one of the
 * least readable. It answers "why was I not allowed to do that", and the people
 * who need it — the person refused, whoever administers their access, an
 * auditor reconstructing the refusal months later — are not the people who
 * wrote the service.
 *
 * Three things are held apart here on purpose, because collapsing any of them
 * would mislead in the direction that matters:
 *
 *  - The OUTCOME (yes or no) from the BASIS (which of five layers decided, and
 *    why). A bare "denied" is what the service deliberately never records.
 *  - A denial from a failure. A denial is the service working; a failure is it
 *    refusing to guess. This component only ever renders a real decision — the
 *    failure case belongs to the caller's error state, never here.
 *  - This console's wording from the stored value. An auditor cites what the
 *    service holds, not our paraphrase, so the raw basis stays visible.
 *
 * Takes either shape the service returns: the three fields from `POST
 * /v1/authorize`, or a full recorded row from `GET /v1/access-decisions/{id}`.
 * The extra fields on the recorded row are rendered when present, so one
 * component serves both and the two cannot drift apart.
 *
 * No "use client": renders from the client-side evaluation form and from the
 * lookup, and needs nothing from either runtime.
 */
export function AccessDecisionSummary({
  decision,
  /** `compact` drops the meaning paragraph — used right after a check, where
   *  the label and the next step carry it. */
  variant = "full",
  className,
}: {
  decision: AuthorizeDecision | Partial<AccessDecision>;
  variant?: "full" | "compact";
  className?: string;
}) {
  const outcome = describeDecisionOutcome(decision.decision_outcome ?? "");
  const basis = explainDecisionBasis(decision.decision_basis ?? "");
  const full = variant === "full";

  const recorded = decision as Partial<AccessDecision>;

  const details: Detail[] = [
    {
      label: "Why",
      value: basis.meaning,
      wide: true,
    },
    {
      label: "What to do about it",
      value: basis.nextStep,
      wide: true,
    },
  ];

  if (recorded.action_type) {
    details.push({
      label: "The action asked about",
      value: recorded.action_type,
      hint: "Matched exactly — nothing normalises this at the point of the check, so a near-miss reads as no grant at all",
    });
  }
  if (recorded.principal_id) {
    details.push({
      label: "Who it was about",
      value: <CopyableId value={recorded.principal_id} className="text-sm" />,
    });
  }
  if (recorded.legal_entity_id) {
    details.push({
      label: "The company it applied to",
      value: <CopyableId value={recorded.legal_entity_id} className="text-sm" />,
      hint: "A grant held in one company says nothing about another — the scope is part of the question",
    });
  }
  if (recorded.decided_at) {
    details.push({
      label: "When it was decided",
      value: formatDateTime(recorded.decided_at),
      hint: "The decision reflects the grants, delegations and rules as they stood at this moment, not as they stand now",
    });
  }

  const decisionId = decision.access_decision_id;
  if (decisionId) {
    details.push({
      label: "Decision reference",
      value: <CopyableId value={decisionId} className="text-sm" />,
      hint: "Quote this to retrieve the rationale again, or to report a decision that looks wrong",
    });
  }
  if (recorded.correlation_id) {
    details.push({
      label: "Request reference",
      value: <CopyableId value={recorded.correlation_id} className="text-sm" />,
      hint: "Ties this decision to everything else the same request did",
    });
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={outcome.tone} dot={!outcome.granted}>
          {outcome.label}
        </Badge>
        <Badge tone={basis.tone}>{basis.label}</Badge>
      </div>

      {full && (
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{basis.meaning}</p>
      )}

      {/* Both stored values, always visible. The labels above are this
          console's reading of them; these two strings are the record, and an
          auditor citing this decision cites these. */}
      <div className="space-y-1">
        <StoredAs code={outcome.raw} />
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Reason recorded as{" "}
          <span className="font-mono text-slate-500 dark:text-slate-400">{basis.raw}</span>
          {basis.unmapped ? " — not a reason this console recognises." : ""}
        </p>
      </div>

      <DetailList items={full ? details : details.slice(0, 2)} />
    </div>
  );
}
