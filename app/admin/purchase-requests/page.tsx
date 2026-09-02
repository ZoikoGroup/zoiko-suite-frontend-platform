import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton } from "@/components/ui";
import { PageHeader, LookupById } from "@/components/admin/shared";
import {
  PurchaseRequestPanel,
  RaiseRequestForm,
  DecideRequestForm,
} from "@/components/admin/purchase-requests";
import { DOMAINS } from "@/lib/constants";
import type { RequestStatus } from "@/lib/api/purchase-requests";
import { lookupPurchaseRequest } from "./actions";

export const metadata: Metadata = { title: "Purchase Requests | Zoiko Suite" };

const DOMAIN = DOMAINS.find((d) => d.key === "purchase-requests")!;

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const REQUEST_FILTERS: { label: string; value?: RequestStatus }[] = [
  { label: "All" },
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : undefined;
}

export default async function PurchaseRequestsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const status: RequestStatus | undefined =
    rawStatus === "PENDING" || rawStatus === "APPROVED" || rawStatus === "REJECTED"
      ? rawStatus
      : undefined;

  // legal_entity_id is a uuid column, so a malformed value dies in the Postgres
  // driver and surfaces as a 503 that reads like an outage. Validated here and
  // dropped if it is not a UUID, with the register saying so rather than
  // filtering by a value the service never received.
  const entityRaw = one(params.entity);
  const entity = entityRaw && isUuid(entityRaw) ? entityRaw : undefined;
  const entityRejected = Boolean(entityRaw) && !entity;

  /** The current query string with some keys overridden, so a status chip does
   *  not silently drop the entity filter. */
  const hrefWith = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const first = Array.isArray(value) ? value[0] : value;
      if (first) next.set(key, first);
    }
    for (const [key, value] of Object.entries(overrides)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    return query ? "/admin/purchase-requests?" + query : "/admin/purchase-requests";
  };

  return (
    <div>
      <PageHeader title={DOMAIN.label} description={DOMAIN.purpose} />

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Raise a purchase request</CardTitle>
            <CardDescription>
              The requisition that a purchase order originates from. A request lands PENDING and
              authorises nothing — purchase-order-svc refuses to issue against anything that is
              not APPROVED and owned by this tenant and legal entity.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <RaiseRequestForm />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Approve or reject a request</CardTitle>
            <CardDescription>
              One transition out of PENDING, two branches, both terminal. A second decision is
              refused rather than applied, so who decided a request and when cannot be overwritten.
              Rejecting requires a reason — that reason is the audit record for the refusal.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <DecideRequestForm />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Requisition register</CardTitle>
            <CardDescription>
              Every request for this tenant, newest first, with value awaiting a decision reported
              per currency and never summed across them — there is no FX rate in this service.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {REQUEST_FILTERS.map((filter) => {
              const active = status === filter.value;
              return (
                <Link
                  key={filter.label}
                  href={hrefWith({ status: filter.value })}
                  className={
                    active
                      ? "rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-navy-600"
                      : "rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-navy-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  }
                  aria-current={active ? "page" : undefined}
                >
                  {filter.label}
                </Link>
              );
            })}
          </div>

          <form action="/admin/purchase-requests" method="get" className="flex flex-wrap items-center gap-2">
            <input
              type="hidden"
              name="status"
              value={status ?? ""}
              disabled={!status}
            />
            <label htmlFor="entity_filter" className="sr-only">
              Legal entity ID
            </label>
            <input
              id="entity_filter"
              name="entity"
              defaultValue={entity ?? ""}
              placeholder="Legal entity ID (UUID)"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
              autoComplete="off"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Filter by entity
            </button>
          </form>

          {entityRejected && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              The entity filter was ignored: it must be a UUID, and this one is not.
            </p>
          )}

          <Suspense key={`${status ?? "all"}-${entity ?? "all"}`} fallback={<TableSkeleton />}>
            <PurchaseRequestPanel status={status} legalEntityId={entity} />
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Look up a request</CardTitle>
            <CardDescription>
              Fetch one request by ID to read its decision trail — who approved or rejected it,
              when, and the reason recorded for a rejection.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <LookupById
            action={lookupPurchaseRequest}
            inputName="lookup_request_id"
            label="Purchase request ID"
            placeholder="00000000-0000-0000-0000-000000000000"
            hint="Paste a request ID from the register above, or from an order that was issued against it."
            buttonLabel="Look up"
          />
        </CardContent>
      </Card>

      <div className="mt-6 space-y-2">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Self-approval is refused — the same principal cannot decide its own request.</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" title="Wired to this console and verified live" />
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {DOMAIN.coreServices[0]} — wired to this console and verified live (:8100).
          </span>
        </div>
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
