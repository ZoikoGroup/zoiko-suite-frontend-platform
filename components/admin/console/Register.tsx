import Link from "next/link";
import Form from "next/form";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight, MoreHorizontal, Search, SlidersHorizontal, X } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { FilterSelect } from "./FilterSelect";

// The tabbed register at the foot of every console page: tabs with counts, a
// search-and-filter toolbar, a table, a pager, and a detail drawer for the
// selected row. Everything is driven by the URL (?tab, ?q, filters, ?page,
// ?id, ?pane), so a filtered view or an open record can be bookmarked and
// shared, and the page needs no client state to render it.

export type RegisterTab = { key: string; label: string; count?: number | null; href: string };

export function RegisterCard({
  tabs,
  active,
  actions,
  children,
}: {
  tabs: RegisterTab[];
  active: string;
  /** Commands for the open tab ("New rule"), right of the tabs. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0 overflow-hidden hover:shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-slate-200 px-5 dark:border-slate-800">
        <nav aria-label="Registers" className="-mb-px flex min-w-0 max-w-full gap-5 overflow-x-auto scrollbar-thin">
          {tabs.map((t) => {
            const on = t.key === active;
            return (
              <Link
                key={t.key}
                href={t.href}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap border-b-2 py-3.5 text-[13px] transition-colors",
                  on
                    ? "border-navy-700 font-semibold text-navy-900 dark:border-navy-300 dark:text-slate-100"
                    : "border-transparent font-medium text-slate-500 hover:text-navy-800 dark:text-slate-400 dark:hover:text-slate-200",
                )}
              >
                {t.label}
                {t.count !== undefined && t.count !== null && <span className="tabular-nums"> ({t.count})</span>}
              </Link>
            );
          })}
        </nav>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2 pb-2.5">{actions}</div>}
      </div>
      {children}
    </Card>
  );
}

/** Table on the left, the selected record's drawer on the right (below it on narrow screens). */
export function RegisterBody({ drawer, children }: { drawer?: ReactNode; children: ReactNode }) {
  return (
    <div className={cn("min-w-0", drawer && "xl:grid xl:grid-cols-[minmax(0,1fr)_340px]")}>
      <div className="min-w-0">{children}</div>
      {drawer}
    </div>
  );
}

// ── toolbar ──────────────────────────────────────────────────────────────────

export type RegisterFilter = {
  name: string;
  /** The first option, meaning "no filter" ("All states"). */
  allLabel: string;
  options: readonly (readonly [string, string])[];
  value: string;
};

export function RegisterToolbar({
  action,
  keep,
  search,
  filters = [],
  clearHref,
}: {
  /** The page's path; the form GETs it with the fields below. */
  action: string;
  /** Query params carried through a search (the open tab). */
  keep: Record<string, string>;
  search: { name: string; value: string; placeholder: string };
  filters?: RegisterFilter[];
  /** Shown when anything is filtered. */
  clearHref?: string;
}) {
  return (
    <Form action={action} scroll={false} className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="relative min-w-50 flex-1">
        <span className="sr-only">Search</span>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          name={search.name}
          defaultValue={search.value}
          placeholder={search.placeholder}
          autoComplete="off"
          className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[12.5px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>
      {filters.map((f) => (
        <FilterSelect
          key={f.name}
          name={f.name}
          aria-label={f.allLabel}
          defaultValue={f.value}
          options={[["", f.allLabel], ...f.options]}
          className="min-w-34"
        />
      ))}
      <button
        type="submit"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filters
      </button>
      {clearHref && (
        <Link href={clearHref} scroll={false} className="px-1 text-[12.5px] font-medium text-navy-600 hover:text-navy-800 dark:text-navy-300">
          Clear
        </Link>
      )}
    </Form>
  );
}

// ── table ────────────────────────────────────────────────────────────────────

export type RegisterColumn = { label: string; className?: string; align?: "right" };

export type RegisterRowView = {
  key: string;
  /** Opens this row in the drawer. */
  href: string;
  selected: boolean;
  cells: ReactNode[];
};

export function RegisterTable({ columns, rows, empty }: { columns: RegisterColumn[]; rows: RegisterRowView[]; empty: ReactNode }) {
  if (rows.length === 0) {
    return <div className="px-5 py-14 text-center text-[13px] text-slate-500 dark:text-slate-400">{empty}</div>;
  }
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="min-w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/30">
            {columns.map((c) => (
              <th
                key={c.label}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-4 py-2.5 text-[11.5px] font-semibold text-slate-500 first:pl-5 dark:text-slate-400",
                  c.align === "right" ? "text-right" : "text-left",
                  c.className,
                )}
              >
                {c.label}
              </th>
            ))}
            <th scope="col" className="w-12 pr-5">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r) => (
            <tr
              key={r.key}
              data-selected={r.selected || undefined}
              className={cn(
                "align-middle transition-colors",
                r.selected ? "bg-navy-50/60 dark:bg-navy-500/10" : "hover:bg-slate-50/70 dark:hover:bg-slate-800/30",
              )}
            >
              {r.cells.map((cell, i) => (
                <td
                  key={i}
                  className={cn(
                    "px-4 py-3 text-slate-700 first:pl-5 dark:text-slate-300",
                    columns[i]?.align === "right" && "text-right",
                    columns[i]?.className,
                  )}
                >
                  {cell}
                </td>
              ))}
              <td className="pr-5 text-right">
                <Link
                  href={r.href}
                  scroll={false}
                  aria-label="Open details"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The ID cell: a navy link that opens the row. */
export function RowLink({ href, children, title }: { href: string; children: ReactNode; title?: string }) {
  return (
    <Link href={href} scroll={false} title={title} className="whitespace-nowrap font-mono text-[12px] font-semibold text-navy-600 hover:text-navy-800 hover:underline dark:text-navy-300">
      {children}
    </Link>
  );
}

/** A name over its context ("UK legislation register / legislation.gov.uk"). */
export function TwoLine({ primary, secondary, mono = false }: { primary: ReactNode; secondary?: ReactNode; mono?: boolean }) {
  return (
    <span className="block min-w-0 max-w-65">
      <span className={cn("block truncate font-semibold text-navy-950 dark:text-slate-100", mono && "font-mono text-[12px]")}>{primary}</span>
      {secondary && <span className="block truncate text-[11.5px] text-slate-500 dark:text-slate-400">{secondary}</span>}
    </span>
  );
}

// ── pager ────────────────────────────────────────────────────────────────────

/** Page numbers to show: the ends, and the neighbours of the current page. */
function pageList(page: number, pages: number): (number | "gap")[] {
  const wanted = new Set([1, 2, pages - 1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

const PAGE_BOX =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-[12px] font-medium tabular-nums transition-colors";

export function RegisterPager({
  page,
  pageSize,
  total,
  noun,
  hrefFor,
  note,
}: {
  page: number;
  pageSize: number;
  total: number;
  noun: string;
  hrefFor: (page: number) => string;
  /** e.g. "latest 200" when the register is a window onto a longer record. */
  note?: string;
}) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const idle = "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800";
  const off = "pointer-events-none border-slate-100 text-slate-300 dark:border-slate-800 dark:text-slate-600";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5 text-[12px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <p>
        Showing {from}–{to} of {total} {noun}
        {note && <span className="text-slate-400"> · {note}</span>}
      </p>
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-1">
          <Link href={hrefFor(page - 1)} scroll={false} aria-label="Previous page" aria-disabled={page <= 1} className={cn(PAGE_BOX, page <= 1 ? off : idle)}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Link>
          {pageList(page, pages).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-slate-400">
                …
              </span>
            ) : (
              <Link
                key={p}
                href={hrefFor(p)}
                scroll={false}
                aria-current={p === page ? "page" : undefined}
                className={cn(PAGE_BOX, p === page ? "border-navy-900 bg-navy-900 text-white dark:border-navy-500 dark:bg-navy-600" : idle)}
              >
                {p}
              </Link>
            ),
          )}
          <Link href={hrefFor(page + 1)} scroll={false} aria-label="Next page" aria-disabled={page >= pages} className={cn(PAGE_BOX, page >= pages ? off : idle)}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </nav>
      )}
      <p>{pageSize} rows per page</p>
    </div>
  );
}

// ── drawer ───────────────────────────────────────────────────────────────────

export type DrawerPane = { key: string; label: string; href: string };

export function DetailDrawer({
  heading = "Details",
  closeHref,
  icon: Icon,
  title,
  subtitle,
  status,
  panes = [],
  activePane,
  actions,
  children,
}: {
  heading?: string;
  closeHref: string;
  icon: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" };
  panes?: DrawerPane[];
  activePane?: string;
  /** The footer: a secondary command, then the primary (gold) one. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label={heading}
      className="flex min-w-0 flex-col border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 xl:border-l xl:border-t-0"
    >
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <p className="text-[12.5px] font-semibold text-navy-950 dark:text-slate-100">{heading}</p>
        <Link
          href={closeHref}
          scroll={false}
          aria-label="Close details"
          className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        >
          <X className="h-4 w-4" />
        </Link>
      </div>
      <div className="flex items-start gap-3 px-5 pt-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-navy-50 text-navy-700 dark:border-slate-700 dark:bg-navy-500/15 dark:text-navy-200">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 wrap-break-word text-[14px] font-semibold leading-snug text-navy-950 dark:text-slate-100">{title}</p>
            {status && <Badge tone={status.tone}>{status.label}</Badge>}
          </div>
          {subtitle && <p className="mt-0.5 wrap-break-word text-[11.5px] text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {panes.length > 1 && (
        <nav aria-label="Detail sections" className="mt-4 flex gap-4 overflow-x-auto border-b border-slate-100 px-5 dark:border-slate-800">
          {panes.map((p) => (
            <Link
              key={p.key}
              href={p.href}
              scroll={false}
              aria-current={p.key === activePane ? "page" : undefined}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 pb-2 text-[12px] transition-colors",
                p.key === activePane
                  ? "border-gold-500 font-semibold text-navy-900 dark:text-slate-100"
                  : "border-transparent font-medium text-slate-500 hover:text-navy-800 dark:text-slate-400",
              )}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      )}
      <div className="flex-1 px-5 py-3">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800 *:flex-1">{actions}</div>}
    </aside>
  );
}

/** Key on the left, value on the right, one per line. */
export function DrawerFacts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((i) => (
        <div key={i.label} className="flex items-start justify-between gap-4 py-2.5">
          <dt className="shrink-0 text-[12px] text-slate-500 dark:text-slate-400">{i.label}</dt>
          <dd className="min-w-0 wrap-break-word text-right text-[12px] font-semibold text-navy-950 dark:text-slate-100">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A sentence in the drawer: why there is no button, or what happens next. */
export function DrawerNote({ children }: { children: ReactNode }) {
  return <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">{children}</p>;
}

/** A secondary command that goes somewhere rather than changes something — outline, as in the header. */
export function ButtonLink({
  href,
  icon: Icon,
  size = "sm",
  children,
}: {
  href: string;
  icon?: LucideIcon;
  size?: "sm" | "md";
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white font-medium text-navy-900 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
      )}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </Link>
  );
}

/** The footer line under the register: the controls every record on the page is held to. */
export function ControlsFooter({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate-500 dark:text-slate-400">
      <p>{children}</p>
      {right && <p className="font-semibold text-navy-900 dark:text-slate-300">{right}</p>}
    </div>
  );
}
