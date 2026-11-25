import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import {
  EventFilterBar,
  EventLogPanel,
  ChainVerifyPanel,
  ArchiveCreateForm,
  ArchiveLookup,
} from "@/components/admin/audit-events";
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
  const params = await searchParams;

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
        description="The append-only, audit-grade event store behind every material action in the suite. Records are written here automatically by the service that performed the action — nothing on this page edits or removes a row."
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>What you are looking at</CardTitle>
            <CardDescription>Worth knowing before you read anything below</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Every row below is a fact about something that happened — who did it, what it was done
            to, and when — written once by the service that did it and{" "}
            <strong className="font-medium">never edited or deleted afterwards</strong>. Each row is
            linked to the one before it by a hash, so the chain as a whole can be checked for tampering
            without trusting any single row in isolation. Access here is{" "}
            <strong className="font-medium">
              granted at the platform level (Compliance Auditor / System Admin)
            </strong>
            , not per tenant — if a section below reports you are not authorized, that is the grant to
            ask about.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Event log</CardTitle>
            <CardDescription>
              Newest first. Filters live in the URL, so a filtered view is linkable.
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
