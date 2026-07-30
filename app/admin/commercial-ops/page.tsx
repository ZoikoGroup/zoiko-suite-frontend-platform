import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { FileText, ShieldCheck, Store, Wallet } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton } from "@/components/ui";
import { PageHeader, LookupById } from "@/components/admin/shared";
import { IssueOrderForm, PurchaseOrderPanel } from "@/components/admin/commercial-ops";
import { DOMAINS } from "@/lib/constants";
import type { OrderStatusFilter } from "@/lib/api/purchase-orders";
import { lookupOrder } from "./actions";

export const metadata: Metadata = { title: "Commercial Ops" };

const DOMAIN = DOMAINS.find((d) => d.key === "commercial-ops")!;

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const FILTERS: { label: string; value?: OrderStatusFilter }[] = [
  { label: "All" },
  { label: "Issued", value: "ISSUED" },
  { label: "Closed", value: "CLOSED" },
];

/** Services in this domain that are not yet wired to the console. */
const UPCOMING = [
  {
    icon: FileText,
    title: "Purchase Request Service",
    body: "Pre-commitment approval. An APPROVED request is what a purchase order normally originates from.",
  },
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

  return (
    <div>
      <PageHeader title={DOMAIN.label} description={DOMAIN.purpose} />

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
                  href={filter.value ? `?status=${filter.value}` : "/admin/commercial-ops"}
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

          {/* Its own boundary so a slow backend can't hold up the issue form. */}
          <Suspense key={status ?? "all"} fallback={<TableSkeleton />}>
            <PurchaseOrderPanel status={status} />
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
          <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            What no view here can show: every amendment is written to an append-only ledger with
            the full before/after value, and purchase-order-svc exposes no endpoint to read it. An
            order&apos;s <code>version</code> number is the only visible trace that it was
            restated — the reasons are stored and unreachable.
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
    </div>
  );
}
