import { Badge } from "@/components/ui";
import {
  DetailList,
  PayloadDetails,
  CopyableId,
  type Detail,
} from "@/components/admin/shared";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  configValueOneLine,
  describeConfigValue,
  describeEnvironment,
  describeScope,
  type ConfigEntry,
} from "@/lib/api/configuration";

/**
 * One config entry, in plain English.
 *
 * The value itself is free-form — the column is `jsonb` and holds whatever the
 * setting needs — so there is no fixed set of fields to label. It is rendered
 * through PayloadDetails, which flattens it into labelled rows and keeps the
 * original JSON one click away. A value that is a single number or word skips
 * that entirely and is just shown, because wrapping `17` in a row list makes it
 * harder to read, not easier.
 *
 * No "use client": renders from the table and from the form's result banner.
 */
export function ConfigEntrySummary({
  entry,
  /** `compact` drops the explanatory hints and the audit ids — used right after
   *  a write to confirm what the service recorded. */
  variant = "full",
  className,
}: {
  entry: ConfigEntry;
  variant?: "full" | "compact";
  className?: string;
}) {
  const scope = describeScope(entry.tenant_id);
  const environment = describeEnvironment(entry.environment);
  const oneLine = configValueOneLine(entry.value);
  const full = variant === "full";

  const details: Detail[] = [
    {
      label: "Which setting",
      value: entry.key,
      hint: "The name services use to look this setting up",
      wide: true,
    },
    {
      label: "Who it applies to",
      value: scope.label,
      hint: full ? scope.meaning : undefined,
    },
    {
      label: "Where it applies",
      value: entry.environment,
      hint: environment ? `${entry.environment} is ${environment}` : "Recorded as written",
    },
    {
      label: "In force since",
      value: formatDateTime(entry.effective_from),
      hint: entry.effective_to
        ? `Superseded on ${formatDateTime(entry.effective_to)} — this is no longer the current value`
        : "This is the value in force now",
    },
  ];

  if (full) {
    details.push(
      {
        label: "Who set it",
        value: <CopyableId value={entry.created_by_principal_id} className="text-sm" />,
        hint: "The person or service that recorded this version",
      },
      {
        label: "Version reference",
        value: <CopyableId value={entry.config_id} className="text-sm" />,
        hint: "Quote this to find this exact version again, or to report a problem with it",
      },
    );

    if (entry.tenant_id) {
      details.push({
        label: "Organisation",
        value: <CopyableId value={entry.tenant_id} className="text-sm" />,
      });
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* What KIND of value this is, so the shape is known before it is read.
            Neutral: a config value is not an outcome, and colouring it would
            imply a verdict on a setting this console has no opinion about. */}
        <Badge tone="neutral">{describeConfigValue(entry.value)}</Badge>
        <Badge tone={scope.tone}>{scope.label}</Badge>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {entry.key} is set{oneLine === undefined ? "" : ` to ${oneLine}`} in {entry.environment}
        </p>
      </div>

      <DetailList items={details} />

      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          What the setting says
        </p>
        <ConfigValue value={entry.value} />
      </div>
    </div>
  );
}

/**
 * A config value, rendered as whatever it actually is.
 *
 * A scalar is one line of text; anything structured goes through PayloadDetails,
 * which lists every field and keeps the raw JSON under a disclosure. Two paths
 * rather than one because a single number rendered as a one-row table reads as a
 * table with a number in it — the reader then looks for the other rows.
 */
export function ConfigValue({ value, className }: { value: unknown; className?: string }) {
  const oneLine = configValueOneLine(value);

  if (oneLine !== undefined) {
    return (
      <p
        className={cn(
          "rounded-lg bg-slate-50 px-3 py-2 text-sm break-words text-slate-800 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-200 dark:ring-slate-700",
          className,
        )}
      >
        {oneLine}
      </p>
    );
  }

  return (
    <PayloadDetails
      value={value}
      className={className}
      emptyLabel="The setting is recorded but holds nothing."
      rawLabel="Show the setting in its original form"
    />
  );
}
