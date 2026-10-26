"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Gauge,
  Handshake,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Scale,
  ScrollText,
  Search,
  Server,
  Siren,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin/authorization", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/authorization/approvals", label: "Approvals", icon: Inbox, badge: "approvals" },
  { href: "/admin/authorization/people", label: "People & roles", icon: Users },
  { href: "/admin/authorization/elevated", label: "Elevated access", icon: Siren },
  { href: "/admin/authorization/controls", label: "Rules & controls", icon: Scale },
  { href: "/admin/authorization/limits", label: "Authority limits", icon: Gauge },
  { href: "/admin/authorization/delegations", label: "Delegations", icon: Handshake },
  { href: "/admin/authorization/check", label: "Check access", icon: Search },
  { href: "/admin/authorization/decisions", label: "Decision log", icon: ScrollText },
  { href: "/admin/authorization/services", label: "Service access", icon: Server },
] as const;

export function SectionNav({ approvals }: { approvals: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Authorization" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
      {ITEMS.map((item) => {
        const active = "exact" in item && item.exact ? path === item.href : path === item.href || path.startsWith(item.href + "/");
        const Icon = item.icon;
        const count = "badge" in item ? approvals : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-navy-900 text-white shadow-sm dark:bg-navy-600"
                : "text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100",
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-slate-400")} />
            <span className="flex-1">{item.label}</span>
            {count > 0 && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                  active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
                )}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
      <div className="mt-4 hidden border-t border-slate-200 pt-4 dark:border-slate-800 lg:block">
        <Link
          href="/admin/account/security"
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900"
        >
          <KeyRound className="h-4 w-4 text-slate-400" />
          Two-step verification
        </Link>
      </div>
    </nav>
  );
}
