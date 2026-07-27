import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CardHeader, CardTitle, CardDescription, CardContent, Card } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import {
  KpiCardGrid,
  GovernedActionsChart,
  ApprovalOutcomesChart,
  DomainStatusGrid,
  DecisionLogFeed,
  ObligationsPanel,
} from "@/components/admin/overview";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Overview",
};

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
        <KpiCardGrid />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Governed actions over time</CardTitle>
                <CardDescription>Authorized vs. escalated executions, last 14 days</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <GovernedActionsChart />
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
              <ApprovalOutcomesChart />
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Domain status</h2>
          <DomainStatusGrid />
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
              <DecisionLogFeed />
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
              <ObligationsPanel />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
