// Building blocks for the Authorization page, shared by every tab so the
// tabs cannot drift apart: one section frame, one table, one field style, one
// status badge (docs/UI_DESIGN_STANDARDS.md §4–§7). No hooks — usable from
// Server and Client Components alike.

import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Badge } from "@/components/ui";
import { CELL, FIELD, HEAD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { describeAdminStatus, explainAuthzError } from "@/lib/api/authorization";
import type { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          {description && <p className="mt-0.5 max-w-3xl text-xs text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
        <thead className="bg-slate-50 dark:bg-slate-900/60">
          <tr>
            {headers.map((h, i) => (
              <th key={h} className={cn(HEAD, i === headers.length - 1 && headers[i] === "" ? "text-right" : "text-left")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((row, r) => (
            <tr key={r} className="align-top">
              {row.map((cell, c) => (
                <td key={c} className={cn(CELL, c === row.length - 1 && headers[c] === "" && "text-right")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = describeAdminStatus(status);
  return (
    <Badge tone={s.tone} title={status ?? undefined}>
      {s.label}
    </Badge>
  );
}

export function ActiveBadge({ active, off = "Retired" }: { active: boolean; off?: string }) {
  return <Badge tone={active ? "success" : "neutral"}>{active ? "Active" : off}</Badge>;
}

/** A register that could not be read. A 403 is "you may not see this", not an empty register. */
export function ReadFailure({ error, what }: { error: ApiError; what: string }) {
  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
      {error.status === 403 ? `You cannot view ${what}. ${explainAuthzError(error)}` : explainAuthzError(error)}
    </p>
  );
}

/** A short list of action codes, collapsing past a few. */
export function ActionList({ actions, max = 4 }: { actions: string[] | null | undefined; max?: number }) {
  const all = actions ?? [];
  if (all.length === 0) return <span className="text-slate-400">—</span>;
  const shown = all.slice(0, max);
  return (
    <span className="font-mono text-xs" title={all.join(", ")}>
      {shown.join(", ")}
      {all.length > max && <span className="text-slate-400"> +{all.length - max} more</span>}
    </span>
  );
}

// ── Fields ──────────────────────────────────────────────────────────────────

type Common = { label: string; hint?: string; optional?: boolean; className?: string };

function Label({ htmlFor, label, optional }: { htmlFor: string; label: string; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className={LABEL}>
      {label} {optional && <span className={OPTIONAL}>(optional)</span>}
    </label>
  );
}

export function Field({ label, hint, optional, className, id, name, ...props }: Common & InputHTMLAttributes<HTMLInputElement> & { name: string }) {
  const fieldId = id ?? name;
  return (
    <div className={className}>
      <Label htmlFor={fieldId} label={label} optional={optional} />
      <input id={fieldId} name={name} required={!optional} autoComplete="off" className={FIELD} {...props} />
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  optional,
  className,
  id,
  name,
  options,
  ...props
}: Common & SelectHTMLAttributes<HTMLSelectElement> & { name: string; options: readonly (readonly [string, string])[] }) {
  const fieldId = id ?? name;
  return (
    <div className={className}>
      <Label htmlFor={fieldId} label={label} optional={optional} />
      <select id={fieldId} name={name} required={!optional} className={FIELD} {...props}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  );
}

export function TextArea({ label, hint, optional, className, id, name, ...props }: Common & TextareaHTMLAttributes<HTMLTextAreaElement> & { name: string }) {
  const fieldId = id ?? name;
  return (
    <div className={className}>
      <Label htmlFor={fieldId} label={label} optional={optional} />
      <textarea id={fieldId} name={name} required={!optional} rows={2} className={FIELD} {...props} />
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  );
}

export function FieldGrid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4",
        cols === 2 && "sm:grid-cols-2",
        cols === 3 && "sm:grid-cols-3",
        cols === 4 && "sm:grid-cols-2 lg:grid-cols-4",
      )}
    >
      {children}
    </div>
  );
}
