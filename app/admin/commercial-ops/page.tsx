import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Wallet, ShoppingCart } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton } from "@/components/ui";
import { PageHeader, LookupById } from "@/components/admin/shared";
import {
  IssueOrderForm,
  PurchaseOrderPanel,
  PurchaseRequestPanel,
  RaiseRequestForm,
  DecideRequestForm,
  PurchaseOrdersAndSpendPanel,
  SpendPolicyForm,
  SpendCheckForm,
  SpendControlsPanel,
  VendorCheckForm,
  VendorDueDiligencePanel,
  CommercialOpsActionHeader,
  CommercialOpsSummaryBar,
  CommercialOpsProcessTimeline,
} from "@/components/admin/commercial-ops";
import { DOMAINS } from "@/lib/constants";
import type { OrderStatusFilter } from "@/lib/api/purchase-orders";
import type { RequestStatus } from "@/lib/api/purchase-requests";
import {
  lookupOrder,
  lookupOrderAmendments,
  lookupPurchaseRequest,
  lookupVendorCheck,
} from "./actions";

export const metadata: Metadata = { title: "Commercial Operations & Procurement | Zoiko Suite" };

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

/** Services in this domain that are not yet wired to the console.
 *
 *  Spend Controls was listed here while the page was simultaneously displaying
 *  hardcoded sample budgets as though they were live — it is now genuinely wired,
 *  so it has moved out of this list. Vendor Due Diligence has now done the same. */
const UPCOMING = [
  {
    icon: Wallet,
    title: "Invoice Approval Service",
    body: "Three-way match between order, receipt, and invoice before payment is released.",
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
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/50">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/20">
            <Icon className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
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

  // Its own param, like the two status filters: one shared key would make
  // filtering the limits silently re-filter the registers.
  const spendCategory = one(params.spend_category);

  // The vendor register's own filter and offset. NOT UUID-validated, unlike the
  // two above: this service's legal_entity_id and counterparty_id are VARCHAR(255)
  // columns rather than uuid ones, so a malformed value is a valid comparison that
  // matches nothing. Rejecting it here would claim a validation the schema does not
  // perform, and the empty register is the honest answer.
  const vendorCounterparty = one(params.vendor_counterparty);
  const vendorOffsetRaw = Number(one(params.vendor_offset) ?? 0);
  const vendorOffset =
    Number.isInteger(vendorOffsetRaw) && vendorOffsetRaw > 0 ? vendorOffsetRaw : 0;

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
            {/* This form previously carried no spend_category either, so choosing a
                request entity silently cleared the limits filter. Four registers now
                share one URL; each GET form must carry every param it does not own. */}
            <input type="hidden" name="spend_category" value={spendCategory ?? ""} />
            <input type="hidden" name="vendor_counterparty" value={vendorCounterparty ?? ""} />
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

      {/* ── vendor-due-diligence-svc (:8135) ──────────────────────────────────
          Above the spend controls, which are themselves above the order flow. The
          sequence is deliberate and it is a governance claim, not a layout
          preference: a limit answers "how much may be committed", an order commits
          it, and this answers the question that precedes both — should this party be
          committed to at all. */}
      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Screen a counterparty</CardTitle>
            <CardDescription>
              Live, writable. Backed by vendor-due-diligence-svc.{" "}
              <strong className="font-medium">
                Read the outcome carefully: a no-match is not a clearance.
              </strong>{" "}
              The only screening implemented is an exact, case-insensitive match against a hardcoded
              list of two names — there is no sanctions or watchlist feed anywhere on this platform
              to call, so the stub stands in for an integration that does not exist rather than
              shortcutting one that does. The screening outcome and the evidence supporting it are
              written in one transaction, so a conclusion can never outlive its evidence. Starting a
              screening (VENDOR_DD_INITIATE) and reading the register (VENDOR_DD_VIEW) are separate
              authorization grants.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <VendorCheckForm />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Screening register</CardTitle>
            <CardDescription>
              Every check for this tenant, newest first — each run, not one row per counterparty,
              because the history is the audit trail. Four outcomes, and they do not collapse into
              pass and fail. <strong className="font-medium">Flagged</strong> is a finding, and the
              counterparty is pushed to REJECTED with risk HIGH.{" "}
              <strong className="font-medium">Screened, no match</strong> means a comparison ran and
              returned nothing — recorded, and not an approval.{" "}
              <strong className="font-medium">No outcome</strong> and{" "}
              <strong className="font-medium">Failed</strong> both mean the counterparty has not been
              screened at all: screening is synchronous here, so a check without a conclusion is a
              lost result rather than one still running, and an empty outcome column is the state
              most easily mistaken for benign.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <input type="hidden" name="status" value={status ?? ""} />
            <input type="hidden" name="request_status" value={requestStatus ?? ""} />
            <input type="hidden" name="entity" value={entity ?? ""} />
            <input type="hidden" name="request_entity" value={requestEntity ?? ""} />
            <input type="hidden" name="spend_category" value={spendCategory ?? ""} />
            <div className="flex-1">
              <label htmlFor="vendor_counterparty" className={FILTER_LABEL}>
                Counterparty{" "}
                <span className="font-normal text-slate-400">(exact match, blank = all)</span>
              </label>
              <input
                id="vendor_counterparty"
                name="vendor_counterparty"
                defaultValue={vendorCounterparty ?? ""}
                placeholder="33333333-3333-3333-3333-333333333333"
                className={`${FILTER_FIELD} font-mono text-xs`}
                autoComplete="off"
              />
            </div>
            <button type="submit" className={FILTER_SUBMIT}>
              Filter checks
            </button>
          </form>

          {/* Keyed on the offset too, so paging re-suspends rather than showing the
              previous page's rows while the next one streams in. */}
          <Suspense
            key={`vendor:${vendorCounterparty ?? "all"}:${vendorOffset}`}
            fallback={<TableSkeleton />}
          >
            <VendorDueDiligencePanel
              counterpartyId={vendorCounterparty}
              offset={vendorOffset}
              params={params}
            />
          </Suspense>

          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <LookupById
              action={lookupVendorCheck}
              inputName="vendor_check_id"
              label="Read one check"
              placeholder="Must be a UUID"
              hint="The full record with every evidence row gathered for it, including any document reference. check_id IS a uuid column here, unlike this service's entity and counterparty columns, so a non-UUID is rejected before it reaches the driver."
            />
          </div>
        </CardContent>
      </Card>

      {/* ── spend-controls-svc (:8131) ────────────────────────────────────────
          Above the order flow because a limit governs it: the point of a spend
          check is to run BEFORE the commitment, not to explain it afterwards. */}
      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Spend controls</CardTitle>
            <CardDescription>
              Live, writable. Backed by spend-controls-svc — the limit across procurement. A limit
              applies to one category on one legal entity, enforced either per transaction or
              cumulatively over a calendar month or year. Setting a limit
              (SPEND_POLICY_MANAGE), reading them (SPEND_POLICY_VIEW), and spending against them
              (SPEND_CHECK_SUBMIT) are three separate authorization grants.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <SpendPolicyForm />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Check a spend before committing it</CardTitle>
            <CardDescription>
              Four outcomes, and they do not collapse into pass and fail.{" "}
              <strong className="font-medium">Permitted</strong> means a limit was evaluated and the
              spend fits, and it is recorded against the budget immediately.{" "}
              <strong className="font-medium">Refused</strong> means the limit was evaluated and says
              no — the control working, not failing, and it consumes none of the budget.{" "}
              <strong className="font-medium">Not evaluated</strong> means the category has no limit
              at all: the service answers ALLOWED, but nothing was checked, so it is not an
              approval. A spend in a currency other than the limit&apos;s is refused rather than
              converted, because nothing in this platform holds an FX rate.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <SpendCheckForm />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Limits in force</CardTitle>
            <CardDescription>
              Every limit for this tenant with what has been committed against it. Enforcement is
              atomic: the running total is summed and the spend recorded in one transaction with the
              policy locked, so simultaneous checks cannot each see the same remaining budget and
              all be admitted.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <input type="hidden" name="status" value={status ?? ""} />
            <input type="hidden" name="request_status" value={requestStatus ?? ""} />
            <input type="hidden" name="entity" value={entity ?? ""} />
            <input type="hidden" name="request_entity" value={requestEntity ?? ""} />
            <input type="hidden" name="vendor_counterparty" value={vendorCounterparty ?? ""} />
            <div className="flex-1">
              <label htmlFor="spend_category" className={FILTER_LABEL}>
                Category <span className="font-normal text-slate-400">(exact match, blank = all)</span>
              </label>
              <input
                id="spend_category"
                name="spend_category"
                defaultValue={spendCategory ?? ""}
                placeholder="PROCUREMENT"
                className={FILTER_FIELD}
                autoComplete="off"
              />
            </div>
            <button type="submit" className={FILTER_SUBMIT}>
              Filter limits
            </button>
          </form>

          <Suspense key={`spend:${spendCategory ?? "all"}`} fallback={<TableSkeleton />}>
            <SpendControlsPanel category={spendCategory} />
          </Suspense>
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
            <input type="hidden" name="spend_category" value={spendCategory ?? ""} />
            <input type="hidden" name="vendor_counterparty" value={vendorCounterparty ?? ""} />
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

      {/* Domain KPI summary. Every figure here is now read live from the four
          wired services; it previously showed hardcoded values, including a
          fabricated "Vendor Due Diligence Pass — 98.4% (AML/UBO)" claim about
          screening that does not exist on this platform. A tile whose service
          cannot be read says so rather than showing a plausible number. */}
      <div className="mt-6">
        <Suspense fallback={<PanelSkeleton rows={4} />}>
          <CommercialOpsSummaryBar />
        </Suspense>
      </div>

      <div className="mt-6">
        <CommercialOpsActionHeader />
      </div>

      <div className="mt-6">
        <CommercialOpsProcessTimeline />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {DOMAIN.coreServices.map((svc) => (
          <div
            key={svc}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <span className="truncate">{svc}</span>
            <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
          </div>
        ))}
      </div>

      <div className="mt-6">
        <SectionCard
          icon={ShoppingCart}
          title="Procurement & Spend Controls"
          subtitle="purchase-order-svc & spend-controls-svc — purchase order management and departmental spend limits"
          ports="8129, 8131"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <PurchaseOrdersAndSpendPanel />
          </Suspense>
        </SectionCard>
      </div>
    </div>
  );
}
