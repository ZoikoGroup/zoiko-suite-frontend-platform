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
import { PageHeader } from "@/components/admin/shared";
import {
  DecisionFilterBar,
  DecisionLogPanel,
  DecisionLookup,
  RecordDecisionForm,
} from "@/components/admin/governance";
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

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>What you are looking at</CardTitle>
            <CardDescription>Worth knowing before you read anything below</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Every row here is a record of a governed action being{" "}
            <strong className="font-medium">allowed</strong>,{" "}
            <strong className="font-medium">refused</strong>, or{" "}
            <strong className="font-medium">sent for review</strong>, together with the rule that
            settled it. Records are written automatically by the services that make those
            decisions, and{" "}
            <strong className="font-medium">nothing here can be edited or deleted</strong>
            {" — a correction is made by recording a new decision, never by changing an old one."}{" "}
            You are
            seeing only your own organisation&rsquo;s decisions; the log is scoped to your tenant
            and enforces that in the database.
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
              By decision ID — the reference recorded with the decision, shown in the log above
              and quotable back to whoever asks about it
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <DecisionLookup />
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
