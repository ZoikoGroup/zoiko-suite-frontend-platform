import { cn } from "@/lib/utils";

/**
 * A JSON value from a backend `jsonb` column, rendered readably.
 *
 * Several services carry free-form payloads — evaluation_context, rule_payload,
 * requirement_payload, allowed_workload_ids — that have no fixed shape and
 * therefore no meaningful field-by-field rendering. Showing the JSON is the
 * honest option; summarising it would invent structure the column does not have.
 *
 * Renders a labelled placeholder rather than an empty box when there is nothing
 * to show, so a panel never collapses into blank space.
 */
export function JsonBlock({
  value,
  emptyLabel = "No payload recorded",
  className,
}: {
  value: unknown;
  emptyLabel?: string;
  className?: string;
}) {
  if (value === null || value === undefined || value === "") {
    return (
      <p className={cn("text-xs italic text-slate-400 dark:text-slate-500", className)}>
        {emptyLabel}
      </p>
    );
  }

  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    // A cyclic value cannot come off the wire, but a caller could pass one.
    text = String(value);
  }

  if (text === "{}" || text === "[]") {
    return (
      <p className={cn("text-xs italic text-slate-400 dark:text-slate-500", className)}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <pre
      className={cn(
        "max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700",
        className,
      )}
    >
      <code>{text}</code>
    </pre>
  );
}
