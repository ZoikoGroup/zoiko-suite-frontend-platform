// The Authorization area's building blocks. One page frame, one panel, one
// table, one status pill, one way of naming a person — so every screen reads
// the same and a reviewer learns the layout once (docs/UI_DESIGN_STANDARDS.md).
// Server-safe: no hooks. Interactive pieces live in ./ActionDialog and ./Filter.

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, CircleAlert, LogIn } from "lucide-react";
import type { ApiError } from "@/lib/api/client";
import { describeAdminStatus, explainAuthzError, needsAttention } from "@/lib/api/authorization";
import { person as lookup, initials } from "@/lib/directory";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

// ── page frame ───────────────────────────────────────────────────────────────

export function PageTitle({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  flush = false,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** No inner padding — for a table that runs edge to edge. */
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

/** A figure that answers "how many", linking to where they are. */
export function Stat({
  label,
  value,
  hint,
  href,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  href?: string;
  tone?: "neutral" | "attention" | "alert";
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
        {href && <ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />}
      </div>
      <p
        className={cn(
          "mt-2 text-3xl font-semibold tabular-nums tracking-tight",
          tone === "attention" ? "text-amber-600 dark:text-amber-400" : tone === "alert" ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-slate-50",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
    </>
  );
  const cls = "group block rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-navy-300 dark:hover:border-navy-500")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// ── tables ───────────────────────────────────────────────────────────────────

export type Column = { label: string; align?: "left" | "right"; className?: string };

/**
 * One table for every register. `rows` carry an optional `search` string; the
 * Filter component hides rows that do not match, without a round trip.
 */
export function Table({
  columns,
  rows,
  empty,
  id,
}: {
  columns: Column[];
  rows: { key: string; cells: ReactNode[]; search?: string; muted?: boolean }[];
  empty: ReactNode;
  /** Ties the table to a Filter. */
  id?: string;
}) {
  if (rows.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm" id={id}>
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-800">
            {columns.map((c) => (
              <th
                key={c.label}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-5 py-3 text-xs font-medium text-slate-500 dark:text-slate-400",
                  c.align === "right" ? "text-right" : "text-left",
                  c.className,
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r) => (
            <tr
              key={r.key}
              data-search={r.search?.toLowerCase()}
              className={cn("align-middle transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40", r.muted && "opacity-60")}
            >
              {r.cells.map((cell, i) => (
                <td
                  key={i}
                  className={cn(
                    "px-5 py-3.5 text-slate-700 dark:text-slate-300",
                    columns[i]?.align === "right" && "text-right",
                    columns[i]?.className,
                  )}
                >
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

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">{children}</div>;
}

// ── values ───────────────────────────────────────────────────────────────────

const TONES = {
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  danger: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400",
  neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  info: "bg-navy-50 text-navy-700 dark:bg-navy-500/10 dark:text-navy-300",
} as const;

export function Pill({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", TONES[tone])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}

/** A lifecycle status in words, coloured by what it means for access. */
export function Status({ value }: { value: string | null | undefined }) {
  const s = describeAdminStatus(value);
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

/** A person by name, with their ID on hover. */
export function PersonName({ id, withTitle = false }: { id: string | null | undefined; withTitle?: boolean }) {
  const p = lookup(id);
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5" title={p.principalId}>
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
          p.known ? "bg-navy-100 text-navy-800 dark:bg-navy-500/20 dark:text-navy-200" : "bg-slate-100 text-slate-500 dark:bg-slate-800",
        )}
      >
        {initials(p)}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-slate-900 dark:text-slate-100">{p.name}</span>
        {withTitle && p.title && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{p.title}</span>}
      </span>
    </span>
  );
}

/** Action codes as quiet chips, collapsing after a few. */
export function Actions({ list, max = 3 }: { list: string[] | null | undefined; max?: number }) {
  const all = list ?? [];
  if (all.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <span className="flex flex-wrap gap-1" title={all.join(", ")}>
      {all.slice(0, max).map((a) => (
        <code key={a} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {a}
        </code>
      ))}
      {all.length > max && <span className="text-xs text-slate-400">+{all.length - max}</span>}
    </span>
  );
}

export function When({ at, empty = "—" }: { at: string | null | undefined; empty?: string }) {
  if (!at) return <span className="text-slate-400">{empty}</span>;
  return <span className="whitespace-nowrap tabular-nums">{formatDateTime(at)}</span>;
}

/** Key / value facts, the shape every detail view uses. */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{i.label}</dt>
          <dd className="mt-1 break-words text-sm text-slate-900 dark:text-slate-100">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── failures ─────────────────────────────────────────────────────────────────

/**
 * A register that could not be read. Distinguishes the three cases a reader
 * acts on differently: sign in again, you may not see this, and the service
 * is not answering.
 */
export function ReadProblem({ error, what, returnTo }: { error: ApiError; what: string; returnTo?: string }) {
  if (needsAttention(error) === "signin") return <SignInAgain returnTo={returnTo} />;
  const forbidden = error.status === 403;
  return (
    <div className="flex items-start gap-3 px-5 py-6 text-sm">
      <CircleAlert className={cn("mt-0.5 h-4 w-4 shrink-0", forbidden ? "text-slate-400" : "text-amber-500")} />
      <p className="text-slate-600 dark:text-slate-300">
        {forbidden ? `You don't have access to ${what}. ${explainAuthzError(error)}` : explainAuthzError(error)}
      </p>
    </div>
  );
}

/** The verified sign-in behind this session ended (expired, logged out, or never signed). */
export function SignInAgain({ returnTo }: { returnTo?: string }) {
  const href = `/login?redirect=${encodeURIComponent(returnTo ?? "/admin/authorization")}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-6">
      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Your secure session has ended</p>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          For your protection, verified sessions time out after a short period. Sign in again to continue.
        </p>
      </div>
      <Link
        href={href}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800 dark:bg-navy-600"
      >
        <LogIn className="h-4 w-4" /> Sign in again
      </Link>
    </div>
  );
}

/** A tab strip for views within one page (?view=). */
export function Views({ base, current, views }: { base: string; current: string; views: { key: string; label: string; count?: number }[] }) {
  return (
    <nav className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60" aria-label="Views">
      {views.map((v) => (
        <Link
          key={v.key}
          href={`${base}?view=${v.key}`}
          aria-current={v.key === current ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
            v.key === current
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
          )}
        >
          {v.label}
          {v.count !== undefined && v.count > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
              {v.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
