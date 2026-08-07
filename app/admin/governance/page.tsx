import type { Metadata } from "next";
import { Suspense } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Skeleton,
} from "@/components/ui";
import { PageHeader, LookupById } from "@/components/admin/shared";
import {
  DecisionFilterBar,
  DecisionLogPanel,
  RecordDecisionForm,
} from "@/components/admin/governance";
import { lookupDecision } from "./actions";
import type { DecisionFilters } from "@/lib/api/governance";

export const metadata: Metadata = { title: "Governance Log" };

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

export default async function GovernancePage({ searchParams }: PageProps) {
  const params = await searchParams;

  const limitRaw = Number(one(params.limit));
  const offsetRaw = Number(one(params.offset));
  const filters: DecisionFilters = {
    actor: one(params.actor),
    entity: one(params.entity),
    action: one(params.action),
    ruleBasis: one(params.rule_basis),
    from: one(params.from),
    to: one(params.to),
    // Clamped to 199, one below the service's own 200 ceiling: the panel asks for
    // `limit + 1` rows to detect a next page, and a request for 201 would be
    // silently capped at 200 — making a full page look like the last one.
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 199) : 50,
    offset: Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : undefined,
  };

  // The panel re-reads whenever the filters change, and Suspense keys off them
  // so the fallback shows on each new query rather than only the first.
  const suspenseKey = JSON.stringify(filters);

  return (
    <div>
      <PageHeader
        title="Governance Log"
        description="The append-only evidence store behind every governed decision in the suite. Records are written here by policy-svc on each evaluation, and by any service that must preserve the basis for an action it took."
      />

      <Card className="mb-6 border-amber-200 dark:border-amber-500/30">
        <CardHeader>
          <div>
            <CardTitle>This log is not tenant-scoped</CardTitle>
            <CardDescription>
              Worth knowing before you read anything below
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            governance-decision-log-svc reads no identity headers and applies no row-level
            security. <strong className="font-medium">Every</strong> decision in the store is
            returned, filtered only by the query parameters given — so the entity filter is the
            only thing scoping a read, and there is no tenant boundary to rely on. Writes are
            equally ungated: the service authorizes nothing, so anything the gateway admits can
            append evidence. Both are properties of the service, not of this console.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Decision log</CardTitle>
            <CardDescription>
              Newest first. Filters live in the URL, so a filtered view is linkable.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <DecisionFilterBar filters={filters} />
          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <Suspense key={suspenseKey} fallback={<LogSkeleton />}>
              <DecisionLogPanel filters={filters} params={params} />
            </Suspense>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Look up a decision</CardTitle>
            <CardDescription>
              By decision ID — the id a caller supplied when the decision was recorded, which is
              also the idempotency key
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <LookupById
            action={lookupDecision}
            inputName="decision_id"
            label="Decision ID"
            placeholder="4f8c2a91-…"
            hint="Shown as JSON, including the evaluation context the table truncates."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Record a decision</CardTitle>
            <CardDescription>
              Live, writable. Appends one immutable row. Normally a service does this — recording
              by hand is for backfilling a decision made outside the suite, and it is
              indistinguishable in the log from one a service wrote.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <RecordDecisionForm />
        </CardContent>
      </Card>
    </div>
  );
}
