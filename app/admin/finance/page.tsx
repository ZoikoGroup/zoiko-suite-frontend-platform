import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton } from "@/components/ui";
import { LookupById } from "@/components/admin/shared";
import { DOMAINS } from "@/lib/constants";
import {
  AccountsPayablePanel,
  AccountsReceivableView,
  FinanceActionHeader,
  FinanceSummaryBar,
  FinanceProcessTimeline,
  RecordInvoiceForm,
} from "@/components/admin/finance";
import type { InvoiceStatus } from "@/lib/api/accounts-payable";
import { lookupVendorInvoice } from "./actions";

export const metadata: Metadata = { title: "Finance, Payables & Receivables | Zoiko Suite" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const STAGE_FILTERS: { label: string; value?: InvoiceStatus }[] = [
  { label: "All" },
  { label: "Received", value: "RECEIVED" },
  { label: "Validated", value: "VALIDATED" },
  { label: "Approved", value: "APPROVED" },
  { label: "Payment requested", value: "PAYMENT_REQUESTED" },
];

const FILTER_LABEL = "mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400";

const FILTER_FIELD =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "outline-none transition-colors placeholder:text-slate-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 " +
  "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

const FILTER_SUBMIT =
  "h-9 shrink-0 rounded-lg bg-navy-900 px-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-navy-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2 dark:bg-navy-600 dark:hover:bg-navy-500 dark:focus-visible:ring-offset-slate-900";

const CHIP_ACTIVE =
  "rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-navy-600";

const CHIP_IDLE =
  "rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-navy-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : undefined;
}

function isInvoiceStatus(value: string): value is InvoiceStatus {
  return (
    value === "RECEIVED" ||
    value === "VALIDATED" ||
    value === "APPROVED" ||
    value === "PAYMENT_REQUESTED"
  );
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-32 rounded-xl bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}

function RegisterSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default async function FinancePage({ searchParams }: PageProps) {
  const domain = DOMAINS.find((d) => d.key === "finance")!;
  const params = await searchParams;

  const stageRaw = one(params.stage);
  const stage = stageRaw && isInvoiceStatus(stageRaw) ? stageRaw : undefined;

  // Exact match on a plain VARCHAR — the service compares `vendor_id = $3`, with
  // no LIKE and no normalisation. A partial reference returns an empty register
  // rather than a near miss, which is why the hint says so.
  const vendor = one(params.vendor);

  // The service compares `legal_entity_id::text = $2`, casting the COLUMN to text
  // rather than the parameter to uuid — so a malformed value does not error, it
  // silently matches nothing. That is worse than a 503: an empty register reads
  // as "this entity has no invoices". Checked here and dropped, with the register
  // saying it was ignored.
  const entityRaw = one(params.entity);
  const entity = entityRaw && isUuid(entityRaw) ? entityRaw : undefined;
  const entityRejected = Boolean(entityRaw) && !entity;

  /** The current query string with some keys overridden, so a stage chip does not
   *  silently drop the vendor or entity filter. */
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
    return query ? `/admin/finance?${query}` : "/admin/finance";
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      {/* Header section */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {domain.label} Domain & Microservices
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{domain.purpose}</p>
      </div>

      {/* ── accounts-payable-svc (:8099) ──────────────────────────────────────
          Live and writable, and first on the page for that reason: everything
          below it is either a read-only summary or indicative sample data, so
          putting the real register underneath would bury the only part of this
          page that reflects what is actually in the database. */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Record a vendor invoice</CardTitle>
            <CardDescription>
              Live, writable. Backed by accounts-payable-svc — the liability side of the ledger.
              An invoice enters RECEIVED and travels a strictly linear path to payment:
              RECEIVED → VALIDATED → APPROVED → PAYMENT_REQUESTED. No stage can be skipped, and
              that sequence is itself the evidence that every prior check happened — which is how
              the service enforces &ldquo;no payable proceeds to payment without approval-state
              validation&rdquo;. Each hop is a separate authorization grant, checked against
              authorization-svc and failing closed.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <RecordInvoiceForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Payables register</CardTitle>
            <CardDescription>
              Every vendor invoice for this tenant, newest first. Each row offers only the one
              transition that is legal from where it stands — the service moves an invoice with an
              atomic <code>WHERE status = &lt;expected&gt;</code>, so the other two would be
              refused, and offering them would be offering a refusal.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Stage is filtered by the service, not client-side, so the register
              never holds rows it was not asked for. */}
          <div className="flex flex-wrap items-center gap-2">
            {STAGE_FILTERS.map((filter) => {
              const active = stage === filter.value;
              return (
                <Link
                  key={filter.label}
                  href={hrefWith({ stage: filter.value })}
                  className={active ? CHIP_ACTIVE : CHIP_IDLE}
                  aria-current={active ? "page" : undefined}
                >
                  {filter.label}
                </Link>
              );
            })}
          </div>

          {/* One GET form carrying both text filters. The stage chip lives in the
              URL, so it is replayed as a hidden input — a GET form submits only
              its own fields, and without it filtering by vendor would silently
              clear the stage. */}
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <input type="hidden" name="stage" value={stage ?? ""} />
            <div className="flex-1">
              <label htmlFor="vendor" className={FILTER_LABEL}>
                Vendor reference{" "}
                <span className="font-normal text-slate-400">
                  (exact match, blank = all vendors)
                </span>
              </label>
              <input
                id="vendor"
                name="vendor"
                defaultValue={vendor ?? ""}
                placeholder="VND-DELL-UK"
                className={FILTER_FIELD}
                autoComplete="off"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="entity" className={FILTER_LABEL}>
                Legal entity{" "}
                <span className="font-normal text-slate-400">
                  (UUID, blank = all entities in this tenant)
                </span>
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
              Filter invoices
            </button>
          </form>
          {entityRejected && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              That legal entity filter was ignored — it must be a UUID, so it was not sent. The
              service compares it as text rather than casting it, so a malformed value would not
              have errored: it would have matched nothing and shown an empty register, which reads
              as &ldquo;this entity has no invoices&rdquo;.
            </p>
          )}

          {/* Its own boundary, keyed on the filters, so a slow backend cannot hold
              up the intake form above it. */}
          <Suspense
            key={`${stage ?? "all"}:${vendor ?? "all"}:${entity ?? "all"}`}
            fallback={<RegisterSkeleton />}
          >
            <AccountsPayablePanel status={stage} legalEntityId={entity} vendorId={vendor} />
          </Suspense>

          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <LookupById
              action={lookupVendorInvoice}
              inputName="lookup_invoice_id"
              label="Read one invoice"
              placeholder="Must be a UUID"
              hint="The full record: every actor and timestamp along the lifecycle, and the correlation ID that ties this invoice to its vendor.invoice.* and payment.requested events. An unknown id, another tenant's invoice, and a malformed one all read as absent — the service deliberately does not distinguish them."
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Domain overview ───────────────────────────────────────────────────
          Everything below reads sample data, not the services. Labelled rather
          than removed: it is the domain's shape, and quietly presenting it next
          to a live register would make both look equally real. */}
      <div>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Domain overview
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Indicative figures for the wider Finance domain. Only the payables register above reads a
          live service — treat the panels below as the domain&apos;s shape, not its contents.
        </p>
      </div>

      {/* KPI Summary Bar */}
      <Suspense fallback={<KpiSkeleton />}>
        <FinanceSummaryBar />
      </Suspense>

      {/* Interactive Action Header */}
      <FinanceActionHeader />

      {/* Financial Process Timeline */}
      <FinanceProcessTimeline />

      {/* Core Services badges */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {domain.coreServices.map((svc) => (
          <div
            key={svc}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <span className="truncate">{svc}</span>
            <span
              className={
                svc === "Accounts Payable Service"
                  ? "ml-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                  : "ml-2 h-2 w-2 shrink-0 rounded-full bg-blue-500"
              }
              title={
                svc === "Accounts Payable Service"
                  ? "Wired to this console and verified live"
                  : "In the domain, not yet wired to this console"
              }
            />
          </div>
        ))}
      </div>

      <hr className="border-slate-200 dark:border-slate-800" />

      {/* Accounts Receivable & General Ledger Widget */}
      <AccountsReceivableView />
    </div>
  );
}
