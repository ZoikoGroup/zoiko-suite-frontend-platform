import { Badge } from "@/components/ui";
import { CopyableId, DetailList, StoredAs, JsonBlock, type Detail } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  compareContracts,
  describeContract,
  describeVersionDiscipline,
  explainViolation,
  readContract,
  type ContractReading,
  type EventSchema,
} from "@/lib/api/schemas";

/**
 * What schema-registry-svc returns, in plain English.
 *
 * The registry answers with JSON Schema documents. That is the right thing for
 * it to store — it is the contract a producer is held to — and the wrong thing
 * to put in front of the people who read this page, who are asking what an
 * event has to contain, whether the last change was checked, and what broke.
 * None of those questions is answered by a document whose reader is assumed to
 * have written a publisher.
 *
 * Nothing here drops or rewrites a stored value. Every declared field gets a
 * row, in the order the schema declares it, the compatibility mode is shown as
 * both a sentence and the code the registry holds, and the schema itself stays
 * one disclosure away at every call site.
 *
 * No "use client": these render from the register panel on the server and from
 * the register form on the client, and need nothing from either runtime.
 */

/**
 * One version of one event's contract.
 *
 * `compact` is for the moment straight after a registration, where the reader
 * wants confirmation of what they just did rather than the whole audit trail.
 */
export function ContractSummary({
  schema,
  variant = "full",
  className,
}: {
  schema: EventSchema;
  variant?: "full" | "compact";
  className?: string;
}) {
  const mode = describeVersionDiscipline(schema.compatibility_mode, schema.version);
  const reading = readContract(schema.json_schema);
  const full = variant === "full";

  const details: Detail[] = [
    {
      label: "What the payload must contain",
      value: describeContract(schema.json_schema),
      hint: "Listed in full below",
    },
    {
      label: "Who publishes this event",
      value: schema.owning_service || "Not recorded",
      hint:
        schema.owning_service
          ? "The team to talk to before this contract changes"
          : "Nobody is named as the publisher, which is the first thing anyone asks when a contract breaks",
    },
    {
      label: "Reference to quote",
      // `label` so it is shown whole: CopyableId shortens by default, which is
      // right for a UUID and wrong for a name someone has to read back.
      value: (
        <CopyableId
          value={`${schema.event_name} v${schema.version}`}
          label={`${schema.event_name} v${schema.version}`}
          className="text-sm"
        />
      ),
      hint: "Names this exact version. Click to copy it in full.",
    },
  ];

  if (full) {
    details.push({
      label: "Event name",
      value: <span className="font-mono text-xs">{schema.event_name}</span>,
      hint: "The exact name a publisher puts on the event. It is this register's key and can never be changed.",
    });
  }

  details.push({
    label: "Registered",
    value: formatDateTime(schema.registered_at),
    hint: full ? "Versions are never edited or removed — a change always adds the next one" : undefined,
  });

  if (schema.registered_by) {
    details.push({
      label: "Registered by",
      value: <CopyableId value={schema.registered_by} className="text-sm" />,
    });
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={mode.tone} dot={mode.checked}>
          {mode.label}
        </Badge>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          Version {schema.version} of <span className="font-mono text-xs">{schema.event_name}</span>
        </p>
      </div>

      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{mode.meaning}</p>

      <StoredAs code={mode.raw} />

      <DetailList items={details} />

      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          What an event of this kind must carry
        </p>
        <ContractFieldTable reading={reading} />
      </div>

      <RawSchema value={schema.json_schema} />
    </div>
  );
}

/**
 * The declared fields, as a table.
 *
 * "Compulsory" rather than "required": the reader is being told whether an
 * event is allowed to arrive without the field, and `required` is the word the
 * schema uses, not the word that answers the question.
 */
export function ContractFieldTable({
  reading,
  className,
}: {
  reading: ContractReading;
  className?: string;
}) {
  if (!reading.readable) {
    return (
      <div className={cn("space-y-2", className)}>
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          {reading.note}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {(reading.title || reading.description) && (
        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          {[reading.title, reading.description].filter(Boolean).join(" — ")}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th className={HEAD}>Field</th>
              <th className={HEAD}>Kind of value</th>
              <th className={HEAD}>Always present?</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {reading.fields.map((field) => (
              <tr key={field.name}>
                <td className={CELL}>
                  <span className="block">{field.label}</span>
                  {/* The exact key, because a publisher has to spell it. */}
                  <span className="block font-mono text-[11px] text-slate-400 dark:text-slate-500">
                    {field.name}
                  </span>
                </td>
                <td className={CELL}>
                  {field.type}
                  {field.nested && (
                    <span className="block text-[11px] text-amber-600 dark:text-amber-400">
                      Contents not checked
                    </span>
                  )}
                </td>
                <td className={CELL}>
                  {field.required ? (
                    <span className="text-slate-800 dark:text-slate-200">Compulsory</span>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">Optional</span>
                  )}
                  {field.orphaned && (
                    <span className="block text-[11px] text-amber-600 dark:text-amber-400">
                      Not declared
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reading.note && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          {reading.note}
        </p>
      )}

      {reading.nestedCount > 0 && (
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {reading.nestedCount === 1
            ? "One of these fields holds a group or a list of its own."
            : `${reading.nestedCount} of these fields hold a group or a list of their own.`}{" "}
          Nothing inside them is compared when a new version is registered, so a breaking change made
          inside one would be accepted.
        </p>
      )}
    </div>
  );
}

/**
 * Why the registry refused a version.
 *
 * Each violation is one field and one reason, so each gets its own block: what
 * broke, why that breaks something, and the checker's own words underneath for
 * whoever has to quote them. A bare list of `field "x" is newly required and
 * existing producers don't populate it` tells the reader nothing about what to
 * do instead, which is the only thing they need.
 */
export function ViolationList({
  violations,
  className,
}: {
  violations: string[];
  className?: string;
}) {
  if (violations.length === 0) return null;

  return (
    <ul className={cn("mt-1 space-y-3", className)}>
      {violations.map((violation) => {
        const explained = explainViolation(violation);
        return (
          <li key={violation} className="space-y-1">
            <p className="text-sm font-medium">{explained.headline}</p>
            <p className="text-xs leading-relaxed opacity-90">{explained.meaning}</p>
            {explained.kind !== "other" && <StoredAs code={explained.raw} className="opacity-80" />}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The whole history of one contract, newest first.
 *
 * The service returns versions oldest first, which is the order to compute
 * changes in and the wrong order to read them in — the question is what the
 * contract says now and how it got there. Each entry says what changed from the
 * version below it, computed from the same two members the registry's own
 * checker compares, so the history cannot claim to have noticed a change the
 * check itself would have missed.
 */
export function VersionHistory({
  versions,
  className,
}: {
  /** As the service returns them: oldest first. */
  versions: EventSchema[];
  className?: string;
}) {
  if (versions.length === 0) return null;

  const newestFirst = [...versions].reverse();
  const earliestShown = versions[0].version;

  return (
    <div className={cn("space-y-3", className)}>
      {earliestShown > 1 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Showing versions {earliestShown} and later. Earlier ones exist and are still readable — this
          register never deletes a version.
        </p>
      )}

      <ol className="space-y-3">
        {newestFirst.map((schema, index) => {
          const mode = describeVersionDiscipline(schema.compatibility_mode, schema.version);
          // The version below this one in the list, which is the one it evolved
          // from. Absent for the earliest version on the page.
          const previous = newestFirst[index + 1];
          const change = previous ? compareContracts(previous.json_schema, schema.json_schema) : null;
          const current = index === 0;

          return (
            <li
              key={schema.version}
              className={cn(
                "rounded-lg border p-3.5",
                current
                  ? "border-navy-200 bg-navy-50/50 dark:border-navy-500/30 dark:bg-navy-500/5"
                  : "border-slate-200 dark:border-slate-800",
              )}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Version {schema.version}
                </p>
                {current && <Badge tone="info">In use now</Badge>}
                <Badge tone={mode.tone} dot={mode.checked}>
                  {mode.label}
                </Badge>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {formatDateTime(schema.registered_at)}
                </span>
              </div>

              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {describeContract(schema.json_schema)}
                {schema.owning_service ? ` · published by ${schema.owning_service}` : ""}
              </p>

              {change === null ? (
                <p className="mt-2 text-xs italic text-slate-400 dark:text-slate-500">
                  {schema.version === 1
                    ? "The first version of this contract, so there was nothing to compare it with."
                    : "The version before this one is not on this page, so no comparison is shown."}
                </p>
              ) : !change.readable ? (
                <p className="mt-2 text-xs italic text-slate-400 dark:text-slate-500">
                  One of these two versions declares no field list, so what changed cannot be worked out.
                </p>
              ) : change.identical ? (
                <p className="mt-2 text-xs italic text-slate-400 dark:text-slate-500">
                  Nothing changed in the fields the registry compares. Something inside a nested group
                  may still have changed.
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {change.lines.map((line) => (
                    <li key={line} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <span
                        className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current opacity-50"
                        aria-hidden="true"
                      />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              )}

              {!mode.checked && previous && (
                <p className="mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                  This change was accepted without being compared to version {previous.version}.
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * The schema exactly as stored, one click away.
 *
 * The field table above is a reading of the contract, and a reading is not
 * evidence: anyone writing a producer, or citing the contract in a finding,
 * needs the document itself. PayloadDetails is the usual pairing for a jsonb
 * column, but its flattened rows would restate the table — for a JSON Schema
 * specifically, the readable form is the field list, so only the disclosure is
 * borrowed.
 */
function RawSchema({ value }: { value: unknown }) {
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-slate-400 transition-colors hover:text-navy-700 dark:text-slate-500 dark:hover:text-navy-300">
        <span className="transition-transform group-open:rotate-90" aria-hidden="true">
          ›
        </span>
        Show the contract as it is stored
      </summary>
      <JsonBlock value={value} className="mt-2" emptyLabel="No schema recorded" />
    </details>
  );
}
