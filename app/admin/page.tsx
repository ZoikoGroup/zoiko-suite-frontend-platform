import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { CardHeader, CardTitle, CardDescription, CardContent, Card, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import {
  KpiCardGrid,
  GovernedActionsPanel,
  ApprovalOutcomesPanel,
  DomainStatusGrid,
  DecisionLogFeed,
  ObligationsPanel,
} from "@/components/admin/overview";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Overview",
};

/** Fallback while the KPI reads are in flight. */
function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-xl" />
      ))}
    </div>
  );
}

/** Fallback while every domain's services are being probed. */
function DomainGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} className="h-36 rounded-xl" />
      ))}
    </div>
  );
}

/** Fallback for a panel that is still fetching from its backend service. */
function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

async function getSessionUser() {
  // Simulates a governed data fetch through the identity + evidence layer.
  await new Promise((resolve) => setTimeout(resolve, 350));
  const cookieStore = await cookies();
  return decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
}

export default async function AdminOverviewPage() {
  const session = await getSessionUser();
  const firstName = session?.name?.split(" ")[0] ?? "there";

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Platform governance status across all legal entities, jurisdictions, and domains."
      />

      <div className="space-y-6">
        <Suspense fallback={<KpiSkeleton />}>
          <KpiCardGrid />
        </Suspense>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Governed actions over time</CardTitle>
                <CardDescription>Authorized vs. escalated executions, last 14 days</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<Skeleton className="h-72 w-full rounded-lg" />}>
                <GovernedActionsPanel />
              </Suspense>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Approval outcomes</CardTitle>
                <CardDescription>Governance Plane decisions, trailing 30 days</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<Skeleton className="h-56 w-full rounded-lg" />}>
                <ApprovalOutcomesPanel />
              </Suspense>
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Domain status</h2>
          <Suspense fallback={<DomainGridSkeleton />}>
            <DomainStatusGrid />
          </Suspense>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Decision log</CardTitle>
                <CardDescription>Recent governance decisions and their evidence trail</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {/* Reads governance-decision-log-svc at request time. Its own
                  boundary so a slow backend can't hold up the whole page. */}
              <Suspense fallback={<PanelSkeleton rows={5} />}>
                <DecisionLogFeed />
              </Suspense>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Upcoming obligations</CardTitle>
                <CardDescription>Statutory and filing deadlines</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {/* Reads obligations-svc at request time. */}
              <Suspense fallback={<PanelSkeleton rows={4} />}>
                <ObligationsPanel />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
