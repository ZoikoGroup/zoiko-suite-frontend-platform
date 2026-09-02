"use client";

// The topbar bell.
//
// It replaces a decorative one. The previous markup rendered a gold dot with
// `animate-ping` unconditionally — permanently pulsing, on every page, for
// every user, whether or not a single notification existed. The button had no
// onClick. A badge that is always lit says nothing, and worse, it trains people
// to ignore the one place the platform has to tell them something is waiting.
//
// This one shows a real count from the signed-in principal's own inbox, and
// shows nothing at all when that count is zero.

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, Check, Loader2 } from "lucide-react";

import { acknowledge, loadBell, type BellState } from "@/app/admin/notifications/bell-actions";

/**
 * How often the bell re-reads the inbox.
 *
 * 60s, not a websocket. In-app notices here are payroll, approval and workflow
 * events — things a person acts on over minutes, not seconds — and a poll is
 * one request per user per minute against a register read that is already
 * indexed on (tenant_id, recipient_principal_id). A push channel for this
 * would be a standing connection per signed-in user to save at most 59 seconds
 * of latency on a payslip-availability notice.
 */
const POLL_MS = 60_000;

const EMPTY: BellState = { unread: 0, items: [] };

export function NotificationBell() {
  const [state, setState] = useState<BellState>(EMPTY);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    startTransition(async () => {
      setState(await loadBell());
    });
  }, []);

  // Initial read plus the poll. Cleared on unmount so a signed-out tab stops
  // asking.
  useEffect(() => {
    let cancelled = false;
    void loadBell().then((s) => {
      if (!cancelled) setState(s);
    });

    const timer = window.setInterval(() => {
      // Skip the poll while the tab is hidden. A backgrounded dashboard left
      // open overnight would otherwise make ~500 pointless round trips before
      // anyone looked at it.
      if (document.visibilityState === "visible") {
        void loadBell().then((s) => {
          if (!cancelled) setState(s);
        });
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Close on an outside click or Escape — the two ways anyone expects a
  // dropdown to go away.
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

  function toggle() {
    const next = !open;
    setOpen(next);
    // Re-read on open so the list is current even if the poll is mid-interval.
    if (next) refresh();
  }

  function onAcknowledge(id: string) {
    // Optimistic: drop the row and decrement immediately, then reconcile with
    // what the server actually says. The server response is authoritative —
    // if the mark failed, the row comes back.
    setState((prev) => ({
      ...prev,
      unread: Math.max(0, prev.unread - 1),
      items: prev.items.filter((item) => item.id !== id),
    }));
    startTransition(async () => {
      setState(await acknowledge(id));
    });
  }

  const hasUnread = state.unread > 0;

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={toggle}
        className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        aria-label={
          state.error
            ? "Notifications — inbox could not be read"
            : hasUnread
              ? `Notifications — ${state.unread} unread`
              : "Notifications — none unread"
        }
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Bell className="h-5 w-5" />

        {/* The badge carries the number. An unreadable inbox gets a neutral
            marker rather than a count, because "0" and "we could not find out"
            are different facts and only one of them is safe to imply. */}
        {state.error ? (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-400 text-[10px] font-bold text-white dark:bg-slate-500"
            title="The inbox could not be read"
          >
            ?
          </span>
        ) : hasUnread ? (
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
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          </div>

          {state.error ? (
            <p className="px-4 py-6 text-sm text-slate-600 dark:text-slate-300">
              Your inbox could not be read, so this is unknown rather than empty.
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                {state.error}
              </span>
            </p>
          ) : state.items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              {hasUnread
                ? // Count without items: the count read succeeded and the list
                  // did not. Say so rather than showing "nothing unread"
                  // underneath a badge saying otherwise.
                  "Unread notices exist but could not be listed here."
                : "Nothing unread."}
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {state.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-2 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {item.subject}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {item.sourceEventType ? `${item.sourceEventType} · ` : ""}
                      {formatWhen(item.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => onAcknowledge(item.id)}
                    className="mt-0.5 shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    aria-label={`Mark "${item.subject}" as read`}
                    title="Mark as read"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/admin/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-200 px-4 py-2.5 text-center text-xs font-medium text-navy-600 hover:bg-slate-50 dark:border-slate-700 dark:text-navy-300 dark:hover:bg-slate-800/60"
          >
            Open the notification register
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * A short relative time, falling back to the raw value.
 *
 * An unparseable timestamp is shown as-is rather than rendered as "just now",
 * which is what `new Date(NaN)` arithmetic quietly produces.
 */
function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}
