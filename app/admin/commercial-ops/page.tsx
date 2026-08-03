import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ShieldCheck, Store, Wallet, ShoppingCart } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton } from "@/components/ui";
import { PageHeader, LookupById } from "@/components/admin/shared";
import {
  IssueOrderForm,
  PurchaseOrderPanel,
  PurchaseRequestPanel,
  RaiseRequestForm,
  DecideRequestForm,
  CommercialOpsActionHeader,
  PurchaseOrdersAndSpendPanel,
} from "@/components/admin/commercial-ops";
import { DOMAINS } from "@/lib/constants";
import type { OrderStatusFilter } from "@/lib/api/purchase-orders";
import type { RequestStatus } from "@/lib/api/purchase-requests";
import { lookupOrder, lookupOrderAmendments, lookupPurchaseRequest } from "./actions";

export const metadata: Metadata = { title: "Commercial Ops" };

const DOMAIN = DOMAINS.find((d) => d.key === "commercial-ops")!;

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const FILTERS: { label: string; value?: OrderStatusFilter }[] = [
  { label: "All" },
  { label: "Issued", value: "ISSUED" },
  { label: "Closed", value: "CLOSED" },
];

// Separate param from the order filter (`status`) so the two registers can be
// filtered independently — one shared param would make picking a request status
// silently re-filter the orders too.
const REQUEST_FILTERS: { label: string; value?: RequestStatus }[] = [
  { label: "All" },
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
];

/** Services in this domain that are not yet wired to the console. */
const UPCOMING = [
  {
    icon: Store,
    title: "Vendor Due Diligence",
    body: "Counterparty screening and vendor approval state, checked before spend is committed.",
  },
  {
    icon: Wallet,
    title: "Invoice Approval Service",
    body: "Three-way match between order, receipt, and invoice before payment is released.",
  },
  {
    icon: ShieldCheck,
    title: "Spend Controls",
    body: "Per-entity limits and signatory authority enforced through the approval matrix.",
  },
];

const FILTER_LABEL = "mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400";

const FILTER_FIELD =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "outline-none transition-colors placeholder:text-slate-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 " +
  "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

const FILTER_SUBMIT =
  "h-9 shrink-0 rounded-lg bg-navy-900 px-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-navy-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2 dark:bg-navy-600 dark:hover:bg-navy-500 dark:focus-visible:ring-offset-slate-900";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : undefined;
}

/**
 * Section wrapper for the domain-summary panel that came from the platform work
 * on main. Kept alongside the procurement workflow above rather than replacing
 * it: the workflow is the verified write path against purchase-request-svc and
 * purchase-order-svc, this is a read-only summary that also covers spend
 * controls, and both are wanted.
 */
function SectionCard({
  icon: Icon,
  title,
  subtitle,
  ports,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  ports: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/50">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/20">
            <Icon className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </span>
          <div>
            <h2
              id={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}
              className="text-sm font-semibold text-slate-800 dark:text-slate-200"
            >
              {title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-mono font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          :{ports}
        </span>
      </div>

      <div className="p-5">{children}</div>
    </section>
  );
}

function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-5">
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

export default async function CommercialOpsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const raw = Array.isArray(params.status) ? params.status[0] : params.status;
  const status: OrderStatusFilter | undefined =
    raw === "ISSUED" || raw === "CLOSED" ? raw : undefined;

  const rawRequest = Array.isArray(params.request_status)
    ? params.request_status[0]
    : params.request_status;
  const requestStatus: RequestStatus | undefined =
    rawRequest === "PENDING" || rawRequest === "APPROVED" || rawRequest === "REJECTED"
      ? rawRequest
      : undefined;

  // Both services accept legal_entity_id on their list route and compare it
  // against a uuid column, so a malformed value dies in the Postgres driver and
  // surfaces as a 503 that reads like an outage. Validated here and dropped if
  // it is not a UUID, with the register saying so rather than filtering by a
  // value the service never received.
  const entityRaw = one(params.entity);
  const entity = entityRaw && isUuid(entityRaw) ? entityRaw : undefined;
  const entityRejected = Boolean(entityRaw) && !entity;

  const requestEntityRaw = one(params.request_entity);
  const requestEntity =
    requestEntityRaw && isUuid(requestEntityRaw) ? requestEntityRaw : undefined;
  const requestEntityRejected = Boolean(requestEntityRaw) && !requestEntity;

  /** The current query string with some keys overridden, so a status chip does
   *  not silently drop the entity filter (or the other register's filters). */
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
    return query ? `/admin/commercial-ops?${query}` : "/admin/commercial-ops";
  };

  return (
    <div>
      <PageHeader title={DOMAIN.label} description={DOMAIN.purpose} />

      {/* Requisitions come first because the order flow depends on them: an
          order can only be issued against a request that is already APPROVED. */}
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
              Every request for this tenant, newest first. Copy an APPROVED request&apos;s ID into
              the issue form below to originate an order from it.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {REQUEST_FILTERS.map((filter) => {
              const active = requestStatus === filter.value;
              return (
                <Link
                  key={filter.label}
                  href={hrefWith({ request_status: filter.value })}
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

          {/* Hidden inputs carry the other register's filters through: a GET form
              submits only its own fields, so without them choosing a request
              entity would silently clear the order filters. */}
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <input type="hidden" name="status" value={status ?? ""} />
            <input type="hidden" name="request_status" value={requestStatus ?? ""} />
            <input type="hidden" name="entity" value={entity ?? ""} />
            <div className="flex-1">
              <label htmlFor="request_entity" className={FILTER_LABEL}>
                Legal entity <span className="font-normal text-slate-400">(UUID, blank = all entities in this tenant)</span>
              </label>
              <input
                id="request_entity"
                name="request_entity"
                defaultValue={requestEntityRaw ?? ""}
                placeholder="22222222-2222-2222-2222-222222222222"
                className={`${FILTER_FIELD} font-mono text-xs`}
                autoComplete="off"
              />
            </div>
            <button type="submit" className={FILTER_SUBMIT}>
              Filter requests
            </button>
          </form>
          {requestEntityRejected && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              That legal entity filter was ignored — it must be a UUID. It was not sent, because a
              malformed value fails inside the Postgres driver and comes back as a 503 that reads
              like an outage rather than a typo.
            </p>
          )}

          <Suspense
            key={`${requestStatus ?? "all"}:${requestEntity ?? "all"}`}
            fallback={<TableSkeleton />}
          >
            <PurchaseRequestPanel status={requestStatus} legalEntityId={requestEntity} />
          </Suspense>

          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <LookupById
              action={lookupPurchaseRequest}
              inputName="lookup_request_id"
              label="Read one request"
              placeholder="Must be a UUID"
              hint="The full record, including the rejection reason and who decided it. A non-UUID fails inside the Postgres driver and surfaces as a 503, so it is rejected here first."
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Issue a purchase order</CardTitle>
            <CardDescription>
              Live, writable. Backed by purchase-order-svc, reached on the single gateway
              port at /purchase-order-svc. Issue, amend, and close are each checked against
              authorization-svc first and fail closed — if authorization cannot be
              determined, the action is refused rather than allowed.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <IssueOrderForm />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Order register</CardTitle>
            <CardDescription>
              Every order for this tenant. Amending restates the total and appends an
              immutable amendment record — it never overwrites history, and it does not
              change the order&apos;s status. Closing is terminal.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Status is filtered by the service, not client-side, so the register
              never holds rows it was not asked for. */}
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((filter) => {
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

          <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <input type="hidden" name="status" value={status ?? ""} />
            <input type="hidden" name="request_status" value={requestStatus ?? ""} />
            <input type="hidden" name="request_entity" value={requestEntity ?? ""} />
            <div className="flex-1">
              <label htmlFor="entity" className={FILTER_LABEL}>
                Legal entity <span className="font-normal text-slate-400">(UUID, blank = all entities in this tenant)</span>
              </label>
              <input
                id="entity"
                name="entity"
                defaultValue={entityRaw ?? ""}
                placeholder="22222222-2222-2222-2222-222222222222"
                className={`${FILTER_FIELD} font-mono text-xs`}
                autoComplete="off"
              />
            </div>
            <button type="submit" className={FILTER_SUBMIT}>
              Filter orders
            </button>
          </form>
          {entityRejected && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              That legal entity filter was ignored — it must be a UUID, so it was not sent.
            </p>
          )}

          {/* Its own boundary so a slow backend can't hold up the issue form. */}
          <Suspense key={`${status ?? "all"}:${entity ?? "all"}`} fallback={<TableSkeleton />}>
            <PurchaseOrderPanel status={status} legalEntityId={entity} />
          </Suspense>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Read one order</CardTitle>
            <CardDescription>
              The full record, including the linked purchase request, vendor profile, and the
              correlation ID that ties this order to its events elsewhere in the suite.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <LookupById
            action={lookupOrder}
            inputName="purchase_order_id"
            label="Purchase order ID"
            placeholder="Must be a UUID"
            hint="A non-UUID fails inside the Postgres driver and surfaces as a 503, so it is rejected here first."
          />
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            This is the order&apos;s current state. How it got there — every restatement, with the
            before/after value and the reason given — is in the amendment ledger below.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Amendment ledger</CardTitle>
            <CardDescription>
              Append-only, oldest first. Each row is one restatement: the version it moved from and
              to, the total before and after, and the reason the operator gave.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <LookupById
            action={lookupOrderAmendments}
            inputName="amendments_purchase_order_id"
            label="Purchase order ID"
            placeholder="Must be a UUID"
            hint="An unknown order is reported as absent; an order that simply has no amendments is reported as an empty ledger. They are different facts."
          />
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            The reasons were written from the first amendment onwards but had no route to read them
            back, so an order&apos;s <code>version</code> was the only evidence it had ever been
            restated. Nothing in this ledger can be edited or deleted.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Rest of the domain</CardTitle>
            <CardDescription>Wired to the console as each service comes online</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {UPCOMING.map((item) => (
              <div
                key={item.title}
                className="flex gap-3 rounded-lg border border-slate-200 p-3.5 transition-colors duration-150 hover:border-navy-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-navy-500 dark:hover:bg-slate-800/60"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 dark:bg-navy-500/10">
                  <item.icon className="h-4.5 w-4.5 text-navy-700 dark:text-navy-300" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {item.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Domain summary from the platform work on main, kept below the workflow
          rather than in place of it. Note its own note: this panel falls back to
          sample rows when the service response does not match the shape it
          expects, so treat its contents as indicative — the registers above read
          purchase-order-svc and purchase-request-svc directly. */}
      <CommercialOpsActionHeader />

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {DOMAIN.coreServices.map((svc) => (
          <div
            key={svc}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <span className="truncate">{svc}</span>
            <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          </div>
        ))}
      </div>

      <div className="mt-6">
        <SectionCard
          icon={ShoppingCart}
          title="Procurement & Spend Controls"
          subtitle="purchase-order-svc & spend-controls-svc — purchase order management and departmental spend limits"
          ports="8129, 8136"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <PurchaseOrdersAndSpendPanel />
          </Suspense>
        </SectionCard>
      </div>
    </div>
  );
}
