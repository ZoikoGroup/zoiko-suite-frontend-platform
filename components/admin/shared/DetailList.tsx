import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Detail = {
  /** The plain-English question this field answers, not the column name. */
  label: string;
  value: ReactNode;
  /** Secondary line — the stored code behind a humanised value, or a caveat. */
  hint?: string;
  /** Give the field the full row rather than one column. */
  wide?: boolean;
};

/**
 * The first-class fields of one record, as labelled rows.
 *
 * A record read from a service used to render as pretty-printed JSON, which asks
 * the reader to know the column names. This asks nothing: each row is a label a
 * person can read and a value already formatted.
 *
 * Rows with no value are dropped rather than shown empty — an absent optional
 * field is not a fact worth a line. Where absence IS the fact, the call site
 * passes an explicit value saying so.
 */
export function DetailList({
  items,
  className,
  columns = 2,
}: {
  items: Detail[];
  className?: string;
  columns?: 1 | 2;
}) {
  const visible = items.filter(
    (item) => item.value !== null && item.value !== undefined && item.value !== "",
  );

  if (visible.length === 0) return null;

  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-3.5",
        columns === 2 && "sm:grid-cols-2",
        className,
      )}
    >
      {visible.map((item) => (
        <div key={item.label} className={cn("min-w-0", item.wide && "sm:col-span-2")}>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {item.label}
          </dt>
          <dd className="mt-1 text-sm leading-snug break-words text-slate-800 dark:text-slate-200">
            {item.value}
          </dd>
          {item.hint && (
            <dd className="mt-1 text-xs leading-snug text-slate-400 dark:text-slate-500">
              {item.hint}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}
