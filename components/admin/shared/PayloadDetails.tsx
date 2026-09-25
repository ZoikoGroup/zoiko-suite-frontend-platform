import { cn } from "@/lib/utils";
import { readableRows } from "@/lib/humanize";
import { JsonBlock } from "./JsonBlock";

/**
 * A free-form `jsonb` payload, rendered as readable rows.
 *
 * The counterpart to JsonBlock, and the reason it is no longer the default. The
 * argument for showing raw JSON was that these columns have no fixed shape, so
 * summarising them would invent structure — true of a summary, but flattening is
 * not summarising: every field in the payload gets a row, in payload order, with
 * nothing dropped. What changes is only the presentation of keys and values.
 *
 * The raw JSON stays available under a disclosure, so the diagnostic reading
 * this was written for is one click away and nothing is hidden from an operator
 * who needs the exact stored bytes.
 */
export function PayloadDetails({
  value,
  emptyLabel = "No details recorded",
  className,
  /** Text on the raw-JSON disclosure. */
  rawLabel = "Show the original data",
}: {
  value: unknown;
  emptyLabel?: string;
  className?: string;
  rawLabel?: string;
}) {
  const rows = readableRows(value);

  if (rows.length === 0) {
    return (
      <p className={cn("text-xs italic text-slate-400 dark:text-slate-500", className)}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <ul className="divide-y divide-slate-200/70 overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-200 dark:divide-slate-700/70 dark:bg-slate-800/60 dark:ring-slate-700">
        {rows.map((row) => (
          <li
            key={row.path}
            className={cn(
              "flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4",
              INDENT[Math.min(row.depth, INDENT.length - 1)],
            )}
          >
            <span
              className={cn(
                "shrink-0 text-xs text-slate-500 dark:text-slate-400",
                row.group && "font-medium text-slate-600 dark:text-slate-300",
              )}
            >
              {row.label}
            </span>
            <span
              className={cn(
                "min-w-0 text-xs leading-snug break-words text-slate-800 sm:text-right dark:text-slate-200",
                row.group && "text-slate-400 dark:text-slate-500",
                row.muted && "italic text-slate-400 dark:text-slate-500",
              )}
            >
              {row.value}
            </span>
          </li>
        ))}
      </ul>

      <details className="group">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-slate-400 transition-colors hover:text-navy-700 dark:text-slate-500 dark:hover:text-navy-300">
          <span className="transition-transform group-open:rotate-90" aria-hidden="true">
            ›
          </span>
          {rawLabel}
        </summary>
        <JsonBlock value={value} className="mt-2" emptyLabel={emptyLabel} />
      </details>
    </div>
  );
}

/**
 * Nesting, as left padding. A lookup rather than an interpolated class, because
 * Tailwind only emits classes it can see at build time.
 */
const INDENT = ["", "pl-6", "pl-10", "pl-14", "pl-[4.5rem]"];
