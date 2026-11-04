"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { findNavLocation } from "@/lib/constants";
import { humanizeKey } from "@/lib/humanize";
import { cn } from "@/lib/utils";

type Crumb = { label: string; href?: string; group?: boolean };

/** A record id in the path (a UUID, CTR-2026-0001) names a row, not a page. */
function looksLikeId(segment: string): boolean {
  return /\d/.test(segment) || segment.startsWith("[");
}

/**
 * The trail after "Workspace", read off the sidebar so a page is named here the
 * way the menu names it: group › page › sub-page.
 */
function trail(pathname: string): Crumb[] {
  if (pathname === "/admin") return [{ label: "Overview" }];

  const location = findNavLocation(pathname);
  if (!location) {
    // A page the sidebar does not list (the search admin, account security).
    return pathname
      .split("/")
      .filter(Boolean)
      .slice(1)
      .filter((segment) => !looksLikeId(segment))
      .map((segment) => ({ label: humanizeKey(segment) }));
  }

  const { section, item } = location;
  const crumbs: Crumb[] = [];
  // A one-page group named after its page ("Security & Trust") would print
  // the same words twice.
  if (section.title !== item.label) crumbs.push({ label: section.title, group: true });
  crumbs.push({ label: item.label, href: item.href, group: section.title === item.label });

  const sub = pathname.slice(item.href.length).split("/").filter(Boolean)[0];
  if (sub && !looksLikeId(sub)) crumbs.push({ label: humanizeKey(sub) });
  return crumbs;
}

export function Breadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname();
  const crumbs = trail(pathname);

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400">
        <li>
          <Link href="/admin" className="transition-colors hover:text-navy-700 dark:hover:text-slate-200">
            Workspace
          </Link>
        </li>
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          const style = cn(
            crumb.group && "font-semibold text-gold-600 dark:text-gold-300",
            last && !crumb.group && "text-slate-600 dark:text-slate-300",
          );
          return (
            <li key={`${i}-${crumb.label}`} className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" aria-hidden />
              {crumb.href && !last ? (
                <Link href={crumb.href} className={cn(style, "transition-colors hover:text-navy-700 dark:hover:text-slate-200")}>
                  {crumb.label}
                </Link>
              ) : (
                <span className={style} aria-current={last ? "page" : undefined}>
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
