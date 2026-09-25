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
  describePolicyType,
  describeScope,
  describeScopeMeaning,
  describeVersionStatus,
  explainEvaluation,
  formatThreshold,
  splitRuleBasis,
  startsInFuture,
  type EvaluateResult,
  type Policy,
  type PolicyVersion,
} from "@/lib/api/policies";

/**
 * The three records policy-svc returns, in plain English.
 *
 * These replace the JSON blocks the four forms on this page used to show. The
 * argument for the JSON was that it proved what the service actually stored —
 * but nothing here drops or rewrites a stored value: every field is present,
 * with a label instead of a column name, and the rule payload keeps its raw form
 * one disclosure away. What changes is only who can read the answer.
 *
 * The order in each is the order the questions get asked in — what happened,
 * what it means, then the references needed to carry on — rather than the order
 * the columns are declared in.
 *
 * No "use client": these render from the client forms and from the server-side
 * panels, and need nothing from either runtime.
 */

const EVAL_TONE = {
  within: "success",
  "approval-required": "warning",
  unrecognised: "warning",
} as const;

/**
 * A policy container — the thing that was just created, or that already existed.
 *
 * The one fact that has to survive into this summary is that a policy on its own
 * decides nothing. It reads like a completed step, and it is the first of three.
 */
export function PolicySummary({
  policy,
  className,
}: {
  policy: Policy;
  className?: string;
}) {
  const type = describePolicyType(policy.policy_type);

  const details: Detail[] = [
    {
      label: "What this rule is for",
      value: type.meaning,
      wide: true,
    },
    {
      label: "Its code",
      value: <span className="font-mono text-xs">{policy.policy_code}</span>,
      hint: "The name you will use to find it again. It cannot be changed.",
    },
    {
      label: "Reference for this rule",
      value: <CopyableId value={policy.policy_id} className="text-sm" />,
      hint: "Paste this into “Set the limit” below. Click to copy it in full.",
    },
    {
      label: "Created",
      value: formatDateTime(policy.created_at),
    },
    {
      label: "Created by",
      value: <CopyableId value={policy.created_by_principal_id} className="text-sm" />,
    },
  ];

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={type.enforceable ? "info" : "warning"}>{type.label}</Badge>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {policy.policy_name}
        </p>
      </div>

      {!type.enforceable && (
        <p className="text-sm leading-relaxed text-amber-700 dark:text-amber-400">
          Nothing on the platform can act on this kind of rule yet. It can be given a limit and
          brought into force, and it will still decide nothing.
        </p>
      )}

      <StoredAs code={type.raw} />

      <DetailList items={details} />
    </div>
  );
}

/**
 * One version of a policy — the rule content, its scope, and whether it is doing
 * anything.
 *
 * "Whether it is doing anything" leads, because it is the question the version
 * model exists to answer and the one the raw status code answers worst: DRAFT
 * and ACTIVE look equally final next to each other in a JSON blob.
 */
export function VersionSummary({
  version,
  /** `compact` drops the audit trail — used right after a write, where the
   *  reader wants confirmation of what they just did, not the full record. */
  variant = "full",
  className,
}: {
  version: PolicyVersion;
  variant?: "full" | "compact";
  className?: string;
}) {
  const status = describeVersionStatus(version.version_status);
  const threshold = formatThreshold(version.rule_payload);
  const full = variant === "full";

  const details: Detail[] = [
    {
      label: "The limit it sets",
      value: threshold ?? "No limit recorded",
      hint: threshold
        ? "Anything at or under this goes ahead; anything above it needs approval."
        : "Without a limit this version cannot decide anything, and will fail if it is ever the one asked. It needs replacing.",
      wide: !full,
    },
    {
      label: "Who it applies to",
      value: describeScope(version),
      hint: describeScopeMeaning(version),
      wide: true,
    },
    {
      label: "Dated from",
      value: formatDate(version.effective_from),
      // Not "in force from". The service records this date and never checks it,
      // so it cannot be used to schedule a limit — and a reader who believes it
      // can would activate a future-dated limit thinking it is dormant.
      hint: startsInFuture(version)
        ? "This date is in the future, and it will not hold the limit back — once brought into force it decides straight away."
        : version.effective_to
          ? `Until ${formatDate(version.effective_to)}`
          : "With no end date set",
    },
    {
      label: "Reference for this version",
      value: <CopyableId value={version.policy_version_id} className="text-sm" />,
      hint: "Paste this into “Bring a limit into force” below. Click to copy it in full.",
    },
  ];

  if (full) {
    details.push(
      {
        label: "Reference for the rule it belongs to",
        value: <CopyableId value={version.policy_id} className="text-sm" />,
      },
      {
        label: "Written",
        value: formatDateTime(version.created_at),
        hint: "When this version was drafted, which is not when it came into force",
      },
      {
        label: "Written by",
        value: <CopyableId value={version.created_by_principal_id} className="text-sm" />,
      },
    );
  }

  if (version.activated_at) {
    details.push({
      label: "Brought into force",
      value: formatDateTime(version.activated_at),
      hint: "Recorded once, at the first activation, and never rewritten afterwards",
    });
    details.push({
      label: "Brought into force by",
      value: <CopyableId value={version.activated_by_principal_id} className="text-sm" />,
    });
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={status.tone} dot={status.tone === "success"}>
          {status.label}
        </Badge>
        {threshold && (
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Approval needed above {threshold}
          </p>
        )}
      </div>

      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {status.meaning}
      </p>

      <StoredAs code={status.raw} />

      <DetailList items={details} />

      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Everything recorded on this version
        </p>
        <PayloadDetails
          value={version.rule_payload}
          emptyLabel="No rule content was recorded, so this version can decide nothing."
          rawLabel="Show this in its original form"
        />
      </div>
    </div>
  );
}

/**
 * The answer to "does this need approving".
 *
 * The service returns three fields, and on its own each is unreadable: an
 * outcome code, a version reference, and a rule basis that is two identifiers
 * glued together with a colon. The amount and the limit are not in the response
 * at all — the page supplies them, because an answer that cannot say what it
 * compared against is not an explanation.
 */
export function EvaluationSummary({
  result,
  amount,
  threshold,
  policyName,
  decisionId,
  className,
}: {
  result: EvaluateResult;
  /** The amount that was tested. */
  amount?: number;
  /** The limit on the deciding version, read back separately — the evaluate
   *  response does not carry it. Undefined when that read did not succeed. */
  threshold?: number;
  /** Name of the rule that decided, where it could be read back. */
  policyName?: string;
  /** The evidence reference the evaluation was filed under. */
  decisionId?: string;
  className?: string;
}) {
  const explained = explainEvaluation(
    result.result,
    amount ?? null,
    threshold ?? null,
  );
  const basis = splitRuleBasis(result.rule_basis);

  const details: Detail[] = [
    {
      label: "Amount tested",
      value: amount === undefined ? "Not recorded" : amount.toLocaleString("en-GB"),
    },
    {
      label: "Limit it was tested against",
      value:
        threshold === undefined ? "Could not be read back" : threshold.toLocaleString("en-GB"),
      hint:
        threshold === undefined
          ? "The decision itself is unaffected — only this console's read of the limit failed."
          : undefined,
    },
    {
      label: "Rule that decided",
      value: policyName || basis.policyCode || "Not recorded",
      // Only worth a second line when the friendly name and the stored code are
      // actually different strings.
      hint:
        policyName && basis.policyCode && policyName !== basis.policyCode
          ? `Its code is ${basis.policyCode}`
          : undefined,
      wide: true,
    },
    {
      label: "Version that decided",
      value: <CopyableId value={result.policy_version_id} className="text-sm" />,
      hint: "The exact wording applied — quote this if the answer is ever questioned",
    },
  ];

  if (decisionId) {
    details.push({
      label: "Evidence reference",
      value: <CopyableId value={decisionId} className="text-sm" />,
      hint: "Look this up in the governance log to confirm the answer was recorded",
    });
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={EVAL_TONE[explained.outcome]} dot={explained.outcome === "within"}>
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

      <DetailList items={details} />
    </div>
  );
}
