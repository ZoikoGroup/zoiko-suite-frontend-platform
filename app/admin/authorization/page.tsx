import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import { CheckTab } from "@/components/admin/authorization/CheckTab";
import { ConditionsTab } from "@/components/admin/authorization/ConditionsTab";
import { DelegationTab } from "@/components/admin/authorization/DelegationTab";
import { ElevatedTab } from "@/components/admin/authorization/ElevatedTab";
import { GrantsTab } from "@/components/admin/authorization/GrantsTab";
import { LogTab } from "@/components/admin/authorization/LogTab";
import { SodTab } from "@/components/admin/authorization/SodTab";
import { WorkloadsTab } from "@/components/admin/authorization/WorkloadsTab";
import { SESSION_COOKIE, decodeSession, toIdentity } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Authorization | Zoiko Suite" };

/** One tab per job (authorization-svc's admin surface, grouped by task). */
const TABS = [
  { key: "check", label: "Check access" },
  { key: "grants", label: "Grants" },
  { key: "sod", label: "Separation of duties" },
  { key: "delegation", label: "Delegation" },
  { key: "conditions", label: "Conditions" },
  { key: "elevated", label: "Elevated access" },
  { key: "workloads", label: "Workloads" },
  { key: "log", label: "Decision log" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Read once per request, outside render, so a re-render cannot change it. */
function requestTime(): number {
  return Date.now();
}

function TabSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export default async function AuthorizationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const tab: TabKey = TABS.some((t) => t.key === requested) ? (requested as TabKey) : "check";

  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  const identity = session ? toIdentity(session) : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader
        title="Authorization"
        description="Who may do what: grants, separation of duties, delegation, conditions, elevated access and the record of every decision."
      />

      <nav aria-label="Authorization sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1 dark:border-slate-800">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/authorization?tab=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              t.key === tab
                ? "border-navy-700 text-navy-900 dark:border-navy-300 dark:text-slate-100"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {!identity ? (
        <p className="text-sm text-slate-500">Your session has expired — sign in again.</p>
      ) : (
        <Suspense key={tab} fallback={<TabSkeleton />}>
          {tab === "check" && <CheckTab identity={identity} />}
          {tab === "grants" && <GrantsTab identity={identity} />}
          {tab === "sod" && <SodTab identity={identity} />}
          {tab === "delegation" && <DelegationTab identity={identity} now={requestTime()} />}
          {tab === "conditions" && <ConditionsTab identity={identity} />}
          {tab === "elevated" && <ElevatedTab identity={identity} />}
          {tab === "workloads" && <WorkloadsTab identity={identity} />}
          {tab === "log" && <LogTab />}
        </Suspense>
      )}
    </div>
  );
}
