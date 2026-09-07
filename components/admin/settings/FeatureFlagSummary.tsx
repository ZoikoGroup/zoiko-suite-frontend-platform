import { Badge } from "@/components/ui";
import { DetailList, CopyableId, StoredAs, type Detail } from "@/components/admin/shared";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  describeEnvironment,
  describeScope,
  explainFlag,
  type FeatureFlag,
} from "@/lib/api/configuration";

/**
 * One feature flag, in plain English.
 *
 * This replaces the JSON dump the lookup used to show. The record has ten
 * columns and a reader has one question — "is this feature on, and for whom" —
 * which no single column answers: `enabled` and `rollout_percentage` have to be
 * read together, and `tenant_id: null` means "the default for everybody", which
 * is the opposite of the "no value" a null normally reads as.
 *
 * The order is the order the questions get asked in — is it on, for whom, where,
 * since when, who turned it on — rather than the order the columns are declared.
 *
 * No "use client": this renders from the table (a Server Component) and from the
 * form's result banner (a Client Component), and needs nothing from either.
 */
export function FeatureFlagSummary({
  flag,
  /** `compact` drops the explanatory paragraph and the audit ids — used right
   *  after a write, where the reader knows what they just did and wants the
   *  service's confirmation of it, not the full record. */
  variant = "full",
  className,
}: {
  flag: FeatureFlag;
  variant?: "full" | "compact";
  className?: string;
}) {
  const explained = explainFlag(flag);
  const scope = describeScope(flag.tenant_id);
  const environment = describeEnvironment(flag.environment);
  const full = variant === "full";

  const details: Detail[] = [
    {
      label: "Which feature",
      value: flag.key,
      hint: "The name services use to ask whether this feature is on",
      wide: true,
    },
    {
      label: "Who it applies to",
      value: scope.label,
      hint: full ? scope.meaning : undefined,
    },
    {
      label: "Where it applies",
      value: flag.environment,
      hint: environment ? `${flag.environment} is ${environment}` : "Recorded as written",
    },
  ];

  if (explained.reach) {
    details.push({
      label: "How many people get it",
      value: explained.reach,
      hint: `Recorded as ${flag.rollout_percentage}%`,
    });
  }

  details.push({
    label: "In force since",
    value: formatDateTime(flag.effective_from),
    hint: flag.effective_to
      ? `Superseded on ${formatDateTime(flag.effective_to)} — this is no longer the current setting`
      : "This is the setting in force now",
  });

  if (full) {
    details.push(
      {
        label: "Who set it",
        value: <CopyableId value={flag.created_by_principal_id} className="text-sm" />,
        hint: "The person or service that recorded this version",
      },
      {
        label: "Version reference",
        value: <CopyableId value={flag.flag_id} className="text-sm" />,
        hint: "Quote this to find this exact version again, or to report a problem with it",
      },
    );

    if (flag.tenant_id) {
      details.push({
        label: "Organisation",
        value: <CopyableId value={flag.tenant_id} className="text-sm" />,
      });
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={explained.tone} dot>
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

      {/* The stored values behind the wording above. The plain reading is this
          console's, not the record's, and an operator quoting this row to
          support needs what the service actually holds. */}
      <StoredAs
        code={`enabled=${flag.enabled}, rollout_percentage=${flag.rollout_percentage}`}
      />

      <DetailList items={details} />
    </div>
  );
}
