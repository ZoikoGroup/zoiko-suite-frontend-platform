import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Cursor-based pagination for a list route that reports no total count.
 *
 * The backend returns a `next_cursor` when more results exist. The cursor is an
 * opaque base64-encoded keyset (API-4). This component reads it from the URL
 * params and uses it for the "Next" link.
 */
export function CursorPagination({
  basePath,
  params,
  cursorParam = "cursor",
  cursor,
  count,
  hasMore,
  noun,
  plural,
}: {
  basePath: string;
  params: Record<string, string | string[] | undefined>;
  cursorParam?: string;
  /** Current cursor from URL (may be empty). */
  cursor: string | undefined;
  /** Rows displayed on this page. */
  count: number;
  /** True when the backend returned a next_cursor. */
  hasMore: boolean;
  noun: string;
  plural: string;
}) {
  const isFirstPage = !cursor;

  if (isFirstPage && !hasMore) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {count} {count === 1 ? noun : plural}, newest first — the whole set, not a page of it.
      </p>
    );
  }

  const nextCursor = params[cursorParam] as string | undefined;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {plural.charAt(0).toUpperCase() + plural.slice(1)} {count > 0 ? "shown" : "0"}, newest first.{" "}
        <span className="text-slate-400 dark:text-slate-500">
          Cursor-based paging — this service reports no total, so the last page is only known once it comes back without a cursor.
        </span>
      </p>
      <div className="flex items-center gap-2">
        <CursorPageLink
          href={hrefWithCursor(basePath, params, cursorParam, "")}
          disabled={isFirstPage}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Previous
        </CursorPageLink>
        <CursorPageLink
          href={hrefWithCursor(basePath, params, cursorParam, nextCursor || "")}
          disabled={!hasMore || !nextCursor}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </CursorPageLink>
      </div>
    </div>
  );
}

const PAGE_LINK =
  "inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium transition-colors dark:border-slate-700";

function CursorPageLink({
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

/** Current URL with the cursor param replaced, preserving every other filter. */
function hrefWithCursor(
  basePath: string,
  params: Record<string, string | string[] | undefined>,
  cursorParam: string,
  value: string,
) {
  const next = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (key === cursorParam) continue;
    const first = Array.isArray(raw) ? raw[0] : raw;
    if (first) next.set(key, first);
  }
  if (value) next.set(cursorParam, value);
  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}