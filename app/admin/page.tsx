import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import {
  KpiCardGrid,
  DomainStatusGrid,
  ActiveServicesTable,
} from "@/components/admin/overview";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Overview | Zoiko Suite",
};

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-xl" />
      ))}
    </div>
  );
}

function DomainGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 9 }).map((_, i) => (
        <Skeleton key={i} className="h-36 rounded-xl" />
      ))}
    </div>
  );
}

async function getSessionUser() {
  const cookieStore = await cookies();
  return decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
}

export default async function AdminOverviewPage() {
  const session = await getSessionUser();
  const firstName = session?.name?.split(" ")[0] ?? "Administrator";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Platform governance and live health status across all active services and domains."
      />

      <Suspense fallback={<KpiSkeleton />}>
        <KpiCardGrid />
      </Suspense>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Domain Operational Status
        </h2>
        <Suspense fallback={<DomainGridSkeleton />}>
          <DomainStatusGrid />
        </Suspense>
      </div>

      <div>
        <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-xl" />}>
          <ActiveServicesTable />
        </Suspense>
      </div>
    </div>
  );
}
