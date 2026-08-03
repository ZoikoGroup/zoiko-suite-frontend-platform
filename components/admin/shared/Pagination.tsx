import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Offset pagination for a list route that reports no total count.
 *
 * None of the suite's list endpoints return a row count — they return an array
 * and nothing else — so "page 3 of 9" cannot be rendered honestly. The caller
 * instead asks for one row more than it displays; if that extra row arrives, a
 * next page exists. That is the most this API can support, and it is why the
 * range below reads "rows 51–100" rather than a page number.
 *
 * Plain links, no client JavaScript: paging is a URL change, which keeps the
 * panel a server component and every paged view linkable.
 */
export function Pagination({
  basePath,
  params,
  offsetParam,
  offset,
  limit,
  count,
  hasMore,
  noun,
  plural,
}: {
  basePath: string;
  /** Every current search param, so paging preserves the active filters. */
  params: Record<string, string | string[] | undefined>;
  /** Which offset param this control drives — two paged panels share one URL. */
  offsetParam: string;
  offset: number;
  limit: number;
  /** Rows displayed on this page, after the probe row is dropped. */
  count: number;
  /** True when the probe row came back, so at least one more row exists. */
  hasMore: boolean;
  noun: string;
  plural: string;
}) {
  const prevOffset = Math.max(0, offset - limit);
  const first = count === 0 ? 0 : offset + 1;
  const last = offset + count;

  if (offset === 0 && !hasMore) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {count} {count === 1 ? noun : plural}, newest first — the whole set, not a page of it.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {plural.charAt(0).toUpperCase() + plural.slice(1)} {first}–{last}, newest first.{" "}
        <span className="text-slate-400 dark:text-slate-500">
          This service reports no total, so the last page is only known once it comes back short.
        </span>
      </p>
      <div className="flex items-center gap-2">
        <PageLink
          href={hrefWithOffset(basePath, params, offsetParam, prevOffset)}
          disabled={offset === 0}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Previous
        </PageLink>
        <PageLink
          href={hrefWithOffset(basePath, params, offsetParam, offset + limit)}
          disabled={!hasMore}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </PageLink>
      </div>
    </div>
  );
}

const PAGE_LINK =
  "inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium transition-colors dark:border-slate-700";

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={`${PAGE_LINK} cursor-not-allowed text-slate-300 dark:text-slate-600`}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      scroll={false}
      className={`${PAGE_LINK} text-slate-600 hover:border-navy-300 hover:text-navy-700 dark:text-slate-300 dark:hover:border-navy-500 dark:hover:text-navy-300`}
    >
      {children}
    </Link>
  );
}

/** Current URL with one offset param replaced, preserving every other filter. */
function hrefWithOffset(
  basePath: string,
  params: Record<string, string | string[] | undefined>,
  offsetParam: string,
  value: number,
) {
  const next = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (key === offsetParam) continue;
    const first = Array.isArray(raw) ? raw[0] : raw;
    if (first) next.set(key, first);
  }
  if (value > 0) next.set(offsetParam, String(value));
  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}
