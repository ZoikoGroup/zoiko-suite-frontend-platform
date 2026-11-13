"use client";

import type { ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A register filter that applies as soon as it changes, by submitting the
 * toolbar's GET form — so the filter state lives in the URL and survives a
 * reload or a shared link. Without JavaScript the "Filters" button applies it.
 */
export function FilterSelect({
  options,
  className,
  icon,
  selectClassName,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  options: readonly (readonly [string, string])[];
  /** A leading icon inside the box (e.g. a calendar on a period picker). */
  icon?: ReactNode;
  /** Extra classes for the <select> itself (height, text size). */
  selectClassName?: string;
}) {
  return (
    <span className={cn("relative inline-flex", className)}>
      {icon && <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">{icon}</span>}
      <select
        {...props}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cn(
          "h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-[12.5px] font-medium text-slate-700 outline-none transition-colors hover:border-slate-300 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
          icon && "pl-9",
          selectClassName,
        )}
      >
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
    </span>
  );
}
