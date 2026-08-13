"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

type AdminShellProps = {
  children: ReactNode;
  user: { name: string; email: string; role: string };
};

const COLLAPSE_STORAGE_KEY = "zoiko_sidebar_collapsed";

export function AdminShell({ children, user }: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // One-time sync from a browser API on mount — intentionally not an
    // external-store subscription, so a direct setState here is correct.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    // `fixed inset-0`, not `h-screen`: with the shell in normal flow the
    // document itself stayed scrollable, so a page long enough to scroll <main>
    // could ALSO be scrolled at the document level — dragging the sticky Topbar
    // and the sidebar off the top of the screen and leaving dead space below.
    // Measured before the change: documentElement.scrollHeight 6067 against an
    // 834px viewport, and window.scrollTo(0, 600) moved the header to -600 even
    // though every overflowing descendant was already clipped by <main>. Taking
    // the shell out of flow leaves the document with nothing to scroll, so
    // <main> and the sidebar's nav are the only scrollers.
    <div className="fixed inset-0 flex overflow-hidden bg-slate-50 dark:bg-slate-950">
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setMobileOpen(true)} user={user} />
        <main className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
