import { Badge } from "@/components/ui";
import {
  DetailList,
  PayloadDetails,
  CopyableId,
  StoredAs,
  type Detail,
} from "@/components/admin/shared";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  describeEvidenceType,
  describeRequirement,
  describeRequirementScope,
  describeRequirementStatus,
  domainLabel,
  actionLabel,
  explainEvidenceOutcome,
  explainUnmetReason,
  readSpec,
  readUnmet,
  readPresentArtifacts,
  type EvidenceEvaluation,
  type EvidenceEvaluationResult,
  type EvidenceRequirement,
  type UnmetRequirement,
} from "@/lib/api/evidence";

/**
 * The three records evidence-requirements-svc returns, in plain English.
 *
 * These replace the JSON blocks the forms and lookups on this page used to
 * show. Nothing here drops or rewrites a stored value: every field is present,
 * with a label instead of a column name, and the free-form payloads keep their
 * raw form one disclosure away. What changes is only who can read the answer.
 *
 * The order within each is the order the questions get asked in — what happened,
 * what it means, then the references needed to carry on — rather than the order
 * the columns are declared in.
 *
 * No "use client": these render from the client forms and from the server-side
 * catalog panel, and need nothing from either runtime.
 */

/** One unmet requirement, as the three separate facts it actually is. */
function UnmetItem({ item }: { item: UnmetRequirement }) {
  const explained = explainUnmetReason(item.reason, item.evidence_type);
  const type = describeEvidenceType(item.evidence_type);

  return (
    <li className="rounded-lg bg-white/60 px-3 py-2.5 ring-1 ring-rose-200/70 dark:bg-slate-900/40 dark:ring-rose-500/20">
      <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
        {explained.headline}
      </p>

      {explained.description && (
        <p className="mt-1 text-xs leading-snug text-slate-600 dark:text-slate-300">
          What to produce: {explained.description}
        </p>
      )}

      {explained.rejected && (
        <p className="mt-1 text-xs leading-snug text-amber-700 dark:text-amber-400">
          {explained.rejected}
        </p>
      )}

      {!type.verified && !explained.unreadable && (
        <p className="mt-1 text-[11px] leading-snug text-slate-400 dark:text-slate-500">
          This kind of evidence is recorded as stated — the platform does not look it up.
        </p>
      )}

      {item.evidence_requirement_id && (
        <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          Requirement{" "}
          <CopyableId value={item.evidence_requirement_id} className="text-[11px]" />
        </p>
      )}
    </li>
  );
}

/** The unmet requirements from a determination, listed. */
export function UnmetList({
  unmet,
  className,
}: {
  unmet: UnmetRequirement[];
  className?: string;
}) {
  if (unmet.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {unmet.length === 1 ? "What is missing" : `What is missing (${unmet.length})`}
      </p>
      <ul className="space-y-2">
        {unmet.map((item, index) => (
          <UnmetItem key={item.evidence_requirement_id || `unmet-${index}`} item={item} />
        ))}
      </ul>
    </div>
  );
}

/**
 * One requirement from the catalog.
 *
 * What it demands leads, because that is the question the record exists to
 * answer and the one the raw row answers worst — evidence_type and
 * requirement_payload have to be read together before they mean anything.
 */
export function RequirementSummary({
  requirement,
  /** `compact` drops the audit trail — used right after a write, where the
   *  reader wants confirmation of what they just did, not the full record. */
  variant = "full",
  className,
}: {
  requirement: EvidenceRequirement;
  variant?: "full" | "compact";
  className?: string;
}) {
  const status = describeRequirementStatus(requirement);
  const scope = describeRequirementScope(requirement);
  const type = describeEvidenceType(requirement.evidence_type);
  const spec = readSpec(requirement.requirement_payload);
  const full = variant === "full";

  const details: Detail[] = [
    {
      label: "What must be on file",
      value: describeRequirement(requirement),
      hint: type.meaning,
      wide: true,
    },
    {
      label: "Which action it gates",
      value: `${actionLabel(requirement.action_type)} — ${domainLabel(requirement.domain_code)}`,
      hint: `Stored as ${requirement.action_type} in ${requirement.domain_code}`,
      wide: true,
    },
    {
      label: "Who it applies to",
      value: scope.label,
      hint: scope.meaning,
      wide: true,
    },
    {
      label: "Applies from",
      value: formatDate(requirement.effective_from),
      hint: requirement.effective_to
        ? `Until ${formatDate(requirement.effective_to)}`
        : "With no end date set",
    },
    {
      label: "Reference for this requirement",
      value: <CopyableId value={requirement.evidence_requirement_id} className="text-sm" />,
      hint: "Paste this into “Withdraw a requirement” below. Click to copy it in full.",
    },
  ];

  if (spec.description) {
    details.push({
      label: "Note for whoever gets blocked",
      value: spec.description,
      hint: "Shown to anyone this requirement stops, so they know what to produce",
      wide: true,
    });
  }

  if (full) {
    details.push(
      {
        label: "Added",
        value: formatDateTime(requirement.created_at),
      },
      {
        label: "Added by",
        value: <CopyableId value={requirement.created_by_principal_id} className="text-sm" />,
      },
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={status.tone} dot={status.tone === "success"}>
          {status.label}
        </Badge>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {describeRequirement(requirement)} — {actionLabel(requirement.action_type)}
        </p>
      </div>

      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {status.meaning}
      </p>

      {!type.verified && (
        <p className="text-sm leading-relaxed text-amber-700 dark:text-amber-400">
          Evidence of this kind is recorded exactly as it is stated. The platform does not look it
          up, so this requirement is met by someone asserting the evidence exists — only documents
          are actually checked.
        </p>
      )}

      <StoredAs code={type.raw} />

      <DetailList items={details} />

      {full && (
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Everything recorded on this requirement
          </p>
          <PayloadDetails
            value={requirement.requirement_payload}
            emptyLabel="Nothing beyond the basics was recorded, so one item of this kind is what it asks for."
            rawLabel="Show this in its original form"
          />
        </div>
      )}
    </div>
  );
}

/**
 * The answer to "can this action go ahead".
 *
 * The determination itself is a record, so its reference is part of the answer
 * rather than a technical detail: it is what someone quotes later to show the
 * check was made and what it said.
 */
export function OutcomeSummary({
  result,
  domainCode,
  actionType,
  className,
}: {
  result: EvidenceEvaluationResult;
  /** What was asked about. Not in the response — the form supplies it, because
   *  an answer that cannot say what it was about is not an explanation. */
  domainCode?: string;
  actionType?: string;
  className?: string;
}) {
  const unmet = result.unmet ?? [];
  const explained = explainEvidenceOutcome(result.outcome, unmet.length);

  const details: Detail[] = [
    {
      label: "What was checked",
      value:
        actionType && domainCode
          ? `${actionLabel(actionType)} — ${domainLabel(domainCode)}`
          : "Not recorded",
      wide: true,
    },
    {
      label: "Checked at",
      value: formatDateTime(result.evaluated_at),
    },
    {
      label: "Reference for this check",
      value: <CopyableId value={result.evaluation_id} className="text-sm" />,
      hint: "Quote this to show the check was made and what it said. It is kept permanently and never rewritten.",
    },
  ];

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={explained.tone} dot={explained.kind === "satisfied"}>
          {explained.shortLabel}
        </Badge>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {explained.headline}
        </p>
      </div>

      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {explained.meaning}
      </p>

      <StoredAs code={explained.raw} />

      <UnmetList unmet={unmet} />

      <DetailList items={details} />
    </div>
  );
}

/**
 * A check that was made in the past, read back by reference.
 *
 * Worth reading rather than re-running: this record froze what was required and
 * what was supplied at the moment it was made, so it still explains itself after
 * the catalog has moved on. A fresh check of the same action can legitimately
 * disagree with it, and that is not a discrepancy to reconcile — it is the point.
 */
export function StoredEvaluationSummary({
  evaluation,
  className,
}: {
  evaluation: EvidenceEvaluation;
  className?: string;
}) {
  const unmet = readUnmet(evaluation.unmet_payload);
  const artifacts = readPresentArtifacts(evaluation.present_artifacts_payload);
  const explained = explainEvidenceOutcome(evaluation.outcome, unmet.length);

  const details: Detail[] = [
    {
      label: "What was checked",
      value: `${actionLabel(evaluation.action_type)} — ${domainLabel(evaluation.domain_code)}`,
      hint: `Stored as ${evaluation.action_type} in ${evaluation.domain_code}`,
      wide: true,
    },
    {
      label: "Checked at",
      value: formatDateTime(evaluation.evaluated_at),
      hint: "What was required at this moment, not what is required now",
    },
    {
      label: "Checked for",
      value: <CopyableId value={evaluation.evaluated_for_principal_id} className="text-sm" />,
    },
    {
      label: "Company it was checked for",
      value: <CopyableId value={evaluation.legal_entity_id} className="text-sm" />,
    },
  ];

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={explained.tone} dot={explained.kind === "satisfied"}>
          {explained.shortLabel}
        </Badge>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {explained.headline}
        </p>
      </div>

      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {explained.meaning}
      </p>

      <StoredAs code={explained.raw} />

      <UnmetList unmet={unmet} />

      <DetailList items={details} />

      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          What was supplied at the time
        </p>
        {artifacts.length === 0 ? (
          <p className="text-xs italic text-slate-400 dark:text-slate-500">
            Nothing was supplied with this check.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {artifacts.map((artifact, index) => {
              const type = describeEvidenceType(artifact.evidence_type);
              return (
                <li
                  key={`${artifact.evidence_type}-${artifact.reference_id}-${index}`}
                  className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-700 dark:text-slate-300"
                >
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {type.label}
                  </span>
                  <CopyableId value={artifact.reference_id} className="text-xs" />
                  {artifact.artifact_subtype && (
                    <span className="text-slate-400 dark:text-slate-500">
                      of the kind “{artifact.artifact_subtype}”
                    </span>
                  )}
                  {!type.verified && (
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      (taken as stated)
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Everything recorded on this check
        </p>
        <PayloadDetails
          value={{
            unmet: evaluation.unmet_payload,
            present_artifacts: evaluation.present_artifacts_payload,
          }}
          emptyLabel="No payloads were recorded on this check."
          rawLabel="Show this in its original form"
        />
      </div>
    </div>
  );
}
