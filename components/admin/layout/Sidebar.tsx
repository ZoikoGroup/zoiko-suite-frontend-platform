"use client";

import { useId, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ChevronRight, ChevronsLeft, ChevronsRight, Sparkles, X } from "lucide-react";
import {
  NAV_SECTIONS,
  SECONDARY_NAV,
  findNavLocation,
  isNavActive,
  type NavEntry,
  type NavSection,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

const ROW =
  "group relative flex w-full items-center rounded-lg text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/70";
const ROW_IDLE = "text-navy-100 hover:bg-white/[0.06] hover:text-white";
const ICON_IDLE = "text-navy-300 group-hover:text-white";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/70";
const TOGGLE = "rounded-lg p-1.5 text-navy-300 transition-colors hover:bg-white/10 hover:text-white";

/** The logo recoloured for the navy rail (public/logo-on-dark.png): the navy
 *  strokes of the source asset are white here, so it needs no light chip. */
function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return collapsed ? (
    <Image src="/logo-mark-on-dark.png" alt="ZoikoSuite" width={37} height={56} priority style={{ width: 37, height: 56 }} />
  ) : (
    <Image src="/logo-on-dark.png" alt="ZoikoSuite" width={163} height={70} priority style={{ width: 163, height: 70 }} />
  );
}

/** The gold edge marking the group that holds the current page. */
function ActiveBar({ className }: { className?: string }) {
  return <span className={cn("absolute inset-y-0 w-1 bg-rail-bar", className)} />;
}

/** A top-level row that is a page: the footer links. */
function NavRow({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavEntry;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        ROW,
        collapsed ? "justify-center py-2.5" : "gap-3 px-3.5 py-2.5",
        active ? "bg-nav-active font-semibold text-white shadow-sm" : ROW_IDLE,
      )}
    >
      <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-white" : ICON_IDLE)} />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && (
        <ChevronRight className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-navy-300/70 group-hover:text-white")} />
      )}
    </Link>
  );
}

/** One domain group: a heading that opens and closes, with its pages under it. */
function SectionGroup({
  section,
  open,
  activeHref,
  collapsed,
  onToggle,
  onNavigate,
}: {
  section: NavSection;
  open: boolean;
  activeHref: string | undefined;
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const panelId = useId();
  const holdsActive = section.items.some((item) => item.href === activeHref);
  const Icon = section.icon;

  if (collapsed) {
    // The rail has no room for the pages, so the group icon opens the sidebar
    // on that group rather than navigating somewhere the operator did not pick.
    return (
      <button
        type="button"
        onClick={onToggle}
        title={section.title}
        aria-label={`${section.title} — open the menu`}
        className={cn(ROW, "justify-center py-2.5", holdsActive ? "bg-rail-raised text-white" : ROW_IDLE)}
      >
        {holdsActive && <ActiveBar className="-left-3" />}
        <Icon className={cn("h-4 w-4 shrink-0", holdsActive ? "text-gold-300" : ICON_IDLE)} />
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          ROW,
          "gap-3 py-2.5 text-left",
          // The group holding the current page is raised edge to edge, with the
          // gold bar on the rail's own edge (the nav's px-4 is cancelled out).
          holdsActive
            ? "-mx-4 w-[calc(100%+2rem)] rounded-none bg-rail-raised px-[1.875rem] text-white"
            : cn("px-3.5", ROW_IDLE),
        )}
      >
        {holdsActive && <ActiveBar className="left-0" />}
        <Icon className={cn("h-4 w-4 shrink-0", holdsActive ? "text-gold-300" : ICON_IDLE)} />
        <span className="flex-1 leading-snug">{section.title}</span>
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            holdsActive ? "text-white" : "text-navy-300/70 group-hover:text-white",
            open && "-rotate-90",
          )}
        />
      </button>

      {/* grid-rows 0fr -> 1fr animates to the content's own height. `inert`
          keeps the links of a closed group out of the tab order. */}
      <div
        id={panelId}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          {/* ml-4 starts the pill under the group icon rather than at the rail's padding. */}
          <ul className="ml-4 space-y-0.5 py-1.5">
            {section.items.map((item) => {
              const active = item.href === activeHref;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-2 rounded-lg py-2 pl-2.5 pr-3 text-[12px] leading-5 transition-colors duration-150",
                      FOCUS,
                      active
                        ? "bg-nav-active font-semibold text-white shadow-sm"
                        : "text-navy-200 hover:bg-white/[0.06] hover:text-white",
                    )}
                  >
                    <ChevronRight
                      className={cn("h-3 w-3 shrink-0", active ? "text-white" : "text-navy-300/60 group-hover:text-navy-100")}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** The assistant's entry point. No assistant service exists yet, so the card
 *  says so instead of opening a chat that cannot answer. */
function AskSuivoCard({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <button
        type="button"
        aria-disabled="true"
        title="Ask Suivo — coming soon"
        aria-label="Ask Suivo, ZoikoSuite AI assistant — coming soon"
        className={cn(ROW, "cursor-default justify-center py-2.5", ROW_IDLE)}
      >
        <Sparkles className="h-5 w-5 text-rail-spark" />
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-disabled="true"
      title="Coming soon"
      className={cn(
        "flex w-full cursor-default items-start gap-3 rounded-xl border border-rail-card-line bg-rail-card p-4 text-left",
        FOCUS,
      )}
    >
      <Sparkles className="mt-0.5 h-7 w-7 shrink-0 fill-rail-spark/25 text-rail-spark" />
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-base font-semibold text-white">Ask Suivo</span>
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-navy-200">
            Soon
          </span>
        </span>
        <span className="mt-1 block text-[13px] text-navy-200">ZoikoSuite AI assistant</span>
        <span className="mt-1.5 flex items-center gap-1 text-[13px] text-navy-200">
          Help &amp; guidance <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </span>
    </button>
  );
}

function NavList({
  pathname,
  collapsed = false,
  onNavigate,
  onExpand,
}: {
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
  onExpand?: () => void;
}) {
  // Explicit open/closed choices by group title. A group nobody has toggled is
  // open exactly when it holds the current page, so navigating into a group
  // opens it without an effect.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const activeHref = findNavLocation(pathname)?.item.href;

  function isOpen(section: NavSection) {
    // /admin is the Overview dashboard but no menu entry, so open its group there.
    const holdsPage =
      section.items.some((item) => item.href === activeHref) ||
      (pathname === "/admin" && section === NAV_SECTIONS[0]);
    return toggled[section.title] ?? holdsPage;
  }

  function toggle(section: NavSection) {
    if (collapsed) {
      setToggled((prev) => ({ ...prev, [section.title]: true }));
      onExpand?.();
      return;
    }
    setToggled((prev) => ({ ...prev, [section.title]: !isOpen(section) }));
  }

  return (
    <>
      <nav
        aria-label="Main"
        className={cn(
          "scrollbar-dark flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden py-3",
          collapsed ? "px-3" : "px-4",
        )}
      >
        {/* One group per domain, so a page is found where its subject is. */}
        {NAV_SECTIONS.map((section) => (
          <SectionGroup
            key={section.title}
            section={section}
            open={isOpen(section)}
            activeHref={activeHref}
            collapsed={collapsed}
            onToggle={() => toggle(section)}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className={cn("shrink-0 space-y-3 border-t border-rail-line py-3", collapsed ? "px-3" : "px-4")}>
        <div className="space-y-0.5">
          {SECONDARY_NAV.map((item) => (
            <NavRow
              key={item.href}
              item={item}
              active={isNavActive(pathname, item.href)}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
        <AskSuivoCard collapsed={collapsed} />
      </div>
    </>
  );
}

export function Sidebar({
  mobileOpen,
  onClose,
  collapsed,
  onToggleCollapse,
}: {
  mobileOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "bg-sidebar relative hidden shrink-0 flex-col text-navy-100 transition-[width] duration-300 ease-in-out lg:flex",
          collapsed ? "w-20" : "w-[17.5rem]",
        )}
      >
        <div
          className={cn(
            "flex h-[76px] shrink-0 items-center border-b border-rail-line",
            collapsed ? "justify-center" : "justify-between pl-3 pr-4",
          )}
        >
          <Link href="/admin" aria-label="ZoikoSuite — Overview" className={cn("rounded-xl", FOCUS)}>
            <Brand collapsed={collapsed} />
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className={cn(TOGGLE, FOCUS)}
            >
              <ChevronsLeft className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* The 80px rail has no room beside the logo mark, so expand sits just under it. */}
        {collapsed && (
          <div className="flex shrink-0 justify-center border-b border-rail-line py-2">
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className={cn(TOGGLE, FOCUS)}
            >
              <ChevronsRight className="h-5 w-5" />
            </button>
          </div>
        )}

        <NavList pathname={pathname} collapsed={collapsed} onExpand={onToggleCollapse} />
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-40 lg:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={onClose}
          className={cn(
            "absolute inset-0 bg-slate-950/50 transition-opacity duration-200",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <aside
          className={cn(
            "bg-sidebar absolute inset-y-0 left-0 flex w-[18rem] flex-col text-navy-100 shadow-2xl transition-transform duration-300 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex h-[76px] shrink-0 items-center justify-between border-b border-rail-line pl-3 pr-4">
            <Link href="/admin" onClick={onClose} aria-label="ZoikoSuite — Overview" className={cn("rounded-xl", FOCUS)}>
              <Brand />
            </Link>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="rounded-lg p-1.5 text-navy-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <NavList pathname={pathname} onNavigate={onClose} />
        </aside>
      </div>
    </>
  );
}
