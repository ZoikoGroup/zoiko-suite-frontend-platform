"use client";

import { Menu } from "lucide-react";
import { UserMenu } from "./UserMenu";
import { NotificationBell } from "./NotificationBell";
import { GlobalSearch } from "./GlobalSearch";
import { ThemeToggle } from "@/components/theme";

type TopbarProps = {
  onMenuClick: () => void;
  user: { name: string; email: string; role: string };
};

export function Topbar({ onMenuClick, user }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-[76px] shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white px-4 sm:px-6 lg:px-9 dark:border-slate-800 dark:bg-slate-900">
      <button
        onClick={onMenuClick}
        className="rounded-xl border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* search-indexer-svc's governed search. This was a decorative input
          that searched nothing; Search is no longer a page of its own. */}
      <GlobalSearch />

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <ThemeToggle className="h-10 w-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800" />

        <NotificationBell />

        <div className="mx-1 hidden h-9 w-px bg-slate-200 sm:block dark:bg-slate-700" />

        <UserMenu name={user.name} email={user.email} role={user.role} />
      </div>
    </header>
  );
}
