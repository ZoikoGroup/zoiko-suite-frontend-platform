import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import {
  CreateMetricForm,
  MetricCatalogPanel,
  PublishVersionForm,
} from "@/components/admin/metrics";
import { listActiveMetrics } from "@/lib/api/metric-registry";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Metric Registry | Zoiko Suite" };

// searchParams no longer needed — MetricCatalogPanel reads the URL param
// client-side via useSearchParams() and fetches versions via an API route.

async function sessionIdentity() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.principalId) return null;
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };
}

export default async function MetricsPage() {
  const identity = await sessionIdentity();

  let activeMetrics: any[] = [];

  if (identity) {
    const res = await listActiveMetrics(identity);
    if (res.ok && res.data) {
      activeMetrics = res.data;
    }
  }

  const correlationId = crypto.randomUUID();

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <PageHeader
        title="Executive Metric Registry"
        description="Authoritative platform register for executive metrics (Doc7 §27 REP-01). Metrics are defined, versioned, source-traceable, and labeled so operational intelligence is not misrepresented as financial or legal assurance."
      />

      {/* Metric Catalog & History */}
      <Card>
        <CardHeader>
          <CardTitle>Active Executive Metrics</CardTitle>
          <CardDescription>
            The canonical definitions of all executive metrics in production. This registry defines what
            a metric is and means; calculation values are computed in the reporting layer and must label
            their numbers with these definitions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Suspense is required because MetricCatalogPanel uses
              useSearchParams() internally to drive the History panel. */}
          <Suspense fallback={<div className="py-6 text-center text-sm text-slate-400">Loading metrics…</div>}>
            <MetricCatalogPanel metrics={activeMetrics} />
          </Suspense>
        </CardContent>
      </Card>

      {/* Forms Grid */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Register New Metric */}
        <Card>
          <CardHeader>
            <CardTitle>Register a new metric</CardTitle>
            <CardDescription>
              Creates Version 1 of a new executive metric. The code is permanent and shared across every
              future version. All metrics carry an immutable intelligence disclaimer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateMetricForm
              principalId={identity?.principalId ?? ""}
              correlationId={correlationId}
            />
          </CardContent>
        </Card>

        {/* Publish New Version */}
        <Card>
          <CardHeader>
            <CardTitle>Publish a new version</CardTitle>
            <CardDescription>
              Evolves an existing metric definition. Atomically supersedes whatever version was active
              and installs the new version as active in a single transaction.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PublishVersionForm
              activeMetrics={activeMetrics}
              principalId={identity?.principalId ?? ""}
              correlationId={crypto.randomUUID()}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
