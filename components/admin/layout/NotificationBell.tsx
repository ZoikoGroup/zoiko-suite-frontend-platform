"use client";

// The topbar notification bell component.
// Self-contained state so layout renders without external dependencies.

import { useEffect, useRef, useState } from "react";
import { Bell, Loader2 } from "lucide-react";

export type BellItem = {
  id: string;
  subject: string;
  createdAt: string;
  sourceEventType?: string;
};

export type BellState = {
  unread: number;
  items: BellItem[];
  error?: string;
};

const EMPTY: BellState = { unread: 0, items: [] };

export function NotificationBell() {
  const [state, setState] = useState<BellState>(EMPTY);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const hasUnread = state.unread > 0;

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        aria-label={
          hasUnread
            ? `Notifications — ${state.unread} unread`
            : "Notifications — none unread"
        }
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Bell className="h-5 w-5" />

        {hasUnread ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-bold leading-none text-slate-900">
            {state.unread > 99 ? "99+" : state.unread}
          </span>
        ) : null}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Notifications
            </span>
          </div>

          <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            All system notifications up to date.
          </p>
        </div>
      )}
    </div>
  );
}
