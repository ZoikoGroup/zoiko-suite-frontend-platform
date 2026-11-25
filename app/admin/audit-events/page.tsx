import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CloudOff } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/components/ui";
import { PageHeader, PanelEmptyState } from "@/components/admin/shared";
import { AuditEventLedgerPanel, EventFilterBar, EventLogPanel, ChainVerifyPanel, ArchiveCreateForm, ArchiveLookup } from "@/components/admin/audit-events";
import { currentSession } from "@/lib/authz-inbox";
import { getAuditEvents } from "@/lib/api/audit-events";
import type { EventFilters } from "@/lib/api/audit-events";

export const metadata: Metadata = { title: "Audit Events | Zoiko Suite" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : undefined;
}

function LogSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

export default async function AuditEventsPage({ searchParams }: PageProps) {
  const current = await currentSession();
  if (!current) redirect("/login");

  const params = await searchParams;

  // Read with the session's own identity: audit-event-store-svc checks
  // AUDIT_EVENT_READ and scopes the log to the caller's tenant.
  const audit = await getAuditEvents(current.identity);

  const limitRaw = Number(one(params.limit));
  const offsetRaw = Number(one(params.offset));
  const filters: EventFilters = {
    actor: one(params.actor),
    entity: one(params.entity),
    action: one(params.action),
    workflow: one(params.workflow),
    from: one(params.from),
    to: one(params.to),
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50,
    offset: Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : undefined,
  };
  const suspenseKey = JSON.stringify(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Events"
        description="The append-only, audit-grade event store behind every material action in the suite. Each event carries the hash of the one before it, and nothing on this page edits or removes a row."
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Event ledger</CardTitle>
            <CardDescription>Latest events from audit-event-store-svc for your tenant.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {audit.ok ? (
            <AuditEventLedgerPanel events={audit.data} summary={audit.summary} />
          ) : (
            <PanelEmptyState icon={CloudOff} tone="warning" label="audit-event-store-svc could not be read" hint={audit.error} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Search the full log</CardTitle>
            <CardDescription>
              Server-side filters (actor, entity, event type, workflow, time range) and pagination over
              the whole store — the ledger above shows one page with client-side search only. Filters
              live in the URL, so a filtered view is linkable.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <EventFilterBar filters={filters} />
          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <Suspense key={suspenseKey} fallback={<LogSkeleton />}>
              <EventLogPanel filters={filters} params={params} />
            </Suspense>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Verify chain integrity</CardTitle>
            <CardDescription>
              Walks every event end to end and confirms no link in the chain is broken
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ChainVerifyPanel />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Seal an archive</CardTitle>
            <CardDescription>
              A permanent, re-verifiable claim that a sequence range formed an unbroken chain as of
              right now
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ArchiveCreateForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Look up an archive</CardTitle>
            <CardDescription>
              By archive ID — read it back, see its full re-verification history, and re-verify it on
              the spot
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ArchiveLookup />
        </CardContent>
      </Card>
    </div>
  );
}
