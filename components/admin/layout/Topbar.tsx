"use client";

import { Bell, Menu, Search } from "lucide-react";
import { UserMenu } from "./UserMenu";
import { ThemeToggle } from "@/components/theme";

type TopbarProps = {
  onMenuClick: () => void;
  user: { name: string; email: string; role: string };
};

export function Topbar({ onMenuClick, user }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-sm sm:px-6 dark:border-slate-800 dark:bg-slate-900/80">
      <button
        onClick={onMenuClick}
        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative hidden max-w-sm flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="search"
          placeholder="Search entities, obligations, contracts…"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 outline-none transition-all duration-150 placeholder:text-slate-400 focus:border-navy-400 focus:bg-white focus:ring-2 focus:ring-navy-500/15 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-navy-400 dark:focus:bg-slate-800"
        />
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
        <ThemeToggle />

        <button
          className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-500" />
          </span>
        </button>

        <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

        <UserMenu name={user.name} email={user.email} role={user.role} />
      </div>
    </header>
  );
}
