"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, X } from "lucide-react";
import { PRIMARY_NAV, SECONDARY_NAV } from "@/lib/constants";
import { Logo } from "@/components/ui";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type NavItem = { label: string; href: string; icon: (typeof PRIMARY_NAV)[number]["icon"] };

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex items-center rounded-lg py-2.5 text-sm font-medium transition-all duration-200",
        collapsed ? "justify-center px-0" : "gap-3 px-3",
        active
          ? "bg-navy-900 text-white shadow-sm dark:bg-navy-700"
          : "text-slate-600 hover:bg-slate-100 hover:text-navy-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
      )}
    >
      {active && (
        <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gold-400" />
      )}
      <item.icon
        className={cn(
          "h-4.5 w-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110",
          active
            ? "text-gold-300"
            : "text-slate-400 group-hover:text-navy-700 dark:text-slate-500 dark:group-hover:text-slate-200",
        )}
      />
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap transition-all duration-200 ease-in-out",
          collapsed ? "max-w-0 opacity-0" : "max-w-[10rem] opacity-100",
        )}
      >
        {item.label}
      </span>

      {collapsed && (
        <span className="pointer-events-none absolute left-full z-50 ml-3 origin-left scale-95 whitespace-nowrap rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-all duration-150 group-hover:scale-100 group-hover:opacity-100 dark:bg-slate-800 dark:ring-1 dark:ring-slate-700">
          {item.label}
        </span>
      )}
    </Link>
  );
}

function NavList({
  pathname,
  collapsed = false,
  onNavigate,
}: {
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden scrollbar-thin px-3 py-6">
      <div className="space-y-0.5">
        <p
          className={cn(
            "mb-2 overflow-hidden whitespace-nowrap px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 transition-all duration-200 dark:text-slate-500",
            collapsed ? "max-h-0 opacity-0" : "max-h-5 opacity-100",
          )}
        >
          Platform
        </p>
        {PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      <div className="mt-auto space-y-0.5 border-t border-slate-200 pt-4 dark:border-slate-800">
        {SECONDARY_NAV.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </nav>
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
          "relative hidden shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-300 ease-in-out dark:border-slate-800 dark:bg-slate-900 lg:flex",
          collapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center border-b border-slate-200 transition-all duration-200 dark:border-slate-800",
            collapsed ? "justify-center px-0" : "px-5",
          )}
        >
          <Logo height={28} markOnly={collapsed} />
        </div>

        <NavList pathname={pathname} collapsed={collapsed} />

        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-7 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-navy-300 hover:text-navy-700 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-navy-400 dark:hover:text-slate-100"
        >
          <ChevronLeft
            className={cn("h-3.5 w-3.5 transition-transform duration-300 ease-in-out", collapsed && "rotate-180")}
          />
        </button>
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
            "absolute inset-0 bg-slate-900/40 transition-opacity duration-200",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl transition-transform duration-300 ease-out dark:bg-slate-900",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
            <Logo height={28} />
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
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
