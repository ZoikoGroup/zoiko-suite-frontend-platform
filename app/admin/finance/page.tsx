import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton } from "@/components/ui";
import { LookupById } from "@/components/admin/shared";
import { DOMAINS } from "@/lib/constants";
import {
  AccountsPayablePanel,
  AccountsReceivableView,
  BankReconciliationPanel,
  FinanceActionHeader,
  FinanceSummaryBar,
  FinanceProcessTimeline,
  FinancialClosePanel,
  GeneralLedgerPanel,
  IngestStatementLineForm,
  RecordInvoiceForm,
  RecordJournalForm,
  RegisterPeriodForm,
} from "@/components/admin/finance";
import type { InvoiceStatus } from "@/lib/api/accounts-payable";
import type { StatementLineStatus } from "@/lib/api/bank-reconciliation";
import type { JournalStatus } from "@/lib/api/general-ledger";
import { lookupJournal, lookupStatementLine, lookupVendorInvoice } from "./actions";

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

/** The services on this page that read a live backend, by their label in
 *  lib/constants. Add to this only when a service is actually wired — a green
 *  dot is this page vouching for something, and vouching for a panel of sample
 *  data is worse than showing no dot at all. */
const WIRED_SERVICES = new Set([
  "General Ledger Service",
  "Bank Reconciliation Service",
  "Accounts Payable Service",
  "Financial Close Service",
]);

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

const JOURNAL_STAGE_FILTERS: { label: string; value?: JournalStatus }[] = [
  { label: "All" },
  { label: "Pending", value: "PENDING" },
  { label: "Validated", value: "VALIDATED" },
  { label: "Finalized", value: "FINALIZED" },
  { label: "Reversed", value: "REVERSED" },
];

function isJournalStatus(value: string): value is JournalStatus {
  return (
    value === "PENDING" ||
    value === "VALIDATED" ||
    value === "FINALIZED" ||
    value === "REVERSED"
  );
}

const RECONCILIATION_STATUS_FILTERS: { label: string; value?: StatementLineStatus }[] = [
  { label: "All" },
  { label: "Unmatched", value: "UNMATCHED" },
  { label: "Matched", value: "MATCHED" },
  { label: "Exception", value: "EXCEPTION" },
];

function isStatementLineStatus(value: string): value is StatementLineStatus {
  return value === "UNMATCHED" || value === "MATCHED" || value === "EXCEPTION";
}

/** The service compares statement_date against a DATE column as an exact day,
 *  so a half-typed date matches nothing rather than narrowing — checked here
 *  and dropped, with the register saying it was ignored. */
const STATEMENT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-07". The service compares fiscal_period as an exact string, so a
 *  half-typed period matches nothing rather than narrowing — an empty register
 *  reads as "this period has no journals", which is why it is checked here. */
const FISCAL_PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

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

  // ── general-ledger-svc filters ──────────────────────────────────────────
  // Namespaced (jstage, jperiod, jentity) so the two registers on this page
  // filter independently — a shared `stage` key would mean narrowing the
  // payables register silently emptied the ledger one, and vice versa.
  const journalStageRaw = one(params.jstage);
  const journalStage =
    journalStageRaw && isJournalStatus(journalStageRaw) ? journalStageRaw : undefined;

  const journalPeriodRaw = one(params.jperiod);
  const journalPeriod =
    journalPeriodRaw && FISCAL_PERIOD_RE.test(journalPeriodRaw) ? journalPeriodRaw : undefined;
  const journalPeriodRejected = Boolean(journalPeriodRaw) && !journalPeriod;

  const journalEntityRaw = one(params.jentity);
  const journalEntity =
    journalEntityRaw && isUuid(journalEntityRaw) ? journalEntityRaw : undefined;
  const journalEntityRejected = Boolean(journalEntityRaw) && !journalEntity;

  // ── bank-reconciliation-svc filters ────────────────────────────────────
  // Namespaced (rstatus, rbank, rdate) so the three registers on this page
  // filter independently — a shared `stage` key would mean narrowing one
  // register silently emptied the others.
  const reconciliationStatusRaw = one(params.rstatus);
  const reconciliationStatus =
    reconciliationStatusRaw && isStatementLineStatus(reconciliationStatusRaw)
      ? reconciliationStatusRaw
      : undefined;

  const reconciliationBankRaw = one(params.rbank);
  const reconciliationBank =
    reconciliationBankRaw && isUuid(reconciliationBankRaw) ? reconciliationBankRaw : undefined;
  const reconciliationBankRejected = Boolean(reconciliationBankRaw) && !reconciliationBank;

  const reconciliationDateRaw = one(params.rdate);
  const reconciliationDate =
    reconciliationDateRaw && STATEMENT_DATE_RE.test(reconciliationDateRaw)
      ? reconciliationDateRaw
      : undefined;
  const reconciliationDateRejected = Boolean(reconciliationDateRaw) && !reconciliationDate;

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

      {/* ── general-ledger-svc (:8098) ────────────────────────────────────────
          Live and writable, and first on the page because it is the domain's
          authority: treasury, financial close, bank reconciliation,
          intercompany and consolidation all read this register, and bank
          reconciliation will only match against a journal it reports
          FINALIZED. Everything below the live registers is either a
          read-only summary or indicative sample data. */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Record a journal</CardTitle>
            <CardDescription>
              Live, writable. Backed by general-ledger-svc — the authoritative record of
              journalized postings. A journal travels the Tri-Phase Commit path PENDING →
              VALIDATED → FINALIZED, and each hop is a separate authorization grant checked
              against authorization-svc, failing closed. Validation is where the double-entry
              invariant is enforced: a draft may be unbalanced, a validated journal may not.
              Posting is the immutability boundary — after it, no journal may be edited, and the
              only sanctioned correction is a reversal that posts a separate inverse entry.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <RecordJournalForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Journal register</CardTitle>
            <CardDescription>
              Every journal for this tenant, newest first, scoped by the session&apos;s verified
              tenant rather than by any value on this page. Each row offers only the one action
              that is legal from where it stands — the service moves a journal with an atomic{" "}
              <code>WHERE status = &lt;expected&gt;</code>, so the others would be refused, and
              offering them would be offering a refusal.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {JOURNAL_STAGE_FILTERS.map((filter) => {
              const active = journalStage === filter.value;
              return (
                <Link
                  key={filter.label}
                  href={hrefWith({ jstage: filter.value })}
                  className={active ? CHIP_ACTIVE : CHIP_IDLE}
                  aria-current={active ? "page" : undefined}
                >
                  {filter.label}
                </Link>
              );
            })}
          </div>

          <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <input type="hidden" name="jstage" value={journalStage ?? ""} />
            {/* The payables filters live in the same query string, so a GET form
                that did not replay them would clear that register on every
                ledger filter. */}
            <input type="hidden" name="stage" value={stage ?? ""} />
            <input type="hidden" name="vendor" value={vendor ?? ""} />
            <input type="hidden" name="entity" value={entityRaw ?? ""} />
            <div className="flex-1">
              <label htmlFor="jperiod" className={FILTER_LABEL}>
                Fiscal period{" "}
                <span className="font-normal text-slate-400">(YYYY-MM, blank = all periods)</span>
              </label>
              <input
                id="jperiod"
                name="jperiod"
                defaultValue={journalPeriodRaw ?? ""}
                placeholder="2026-07"
                className={FILTER_FIELD}
                autoComplete="off"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="jentity" className={FILTER_LABEL}>
                Legal entity{" "}
                <span className="font-normal text-slate-400">
                  (UUID, blank = all entities in this tenant)
                </span>
              </label>
              <input
                id="jentity"
                name="jentity"
                defaultValue={journalEntityRaw ?? ""}
                placeholder="22222222-2222-2222-2222-222222222222"
                className={`${FILTER_FIELD} font-mono text-xs`}
                autoComplete="off"
              />
            </div>
            <button type="submit" className={FILTER_SUBMIT}>
              Filter journals
            </button>
          </form>
          {journalPeriodRejected && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              That fiscal period filter was ignored — it must be YYYY-MM, so it was not sent. The
              service compares the period as an exact string, so a half-typed value would not have
              errored: it would have matched nothing and shown an empty register, which reads as
              &ldquo;this period has no journals&rdquo;.
            </p>
          )}
          {journalEntityRejected && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              That legal entity filter was ignored — it must be a UUID, so it was not sent. The
              service compares it as text rather than casting it, so a malformed value would have
              matched nothing rather than erroring.
            </p>
          )}

          <Suspense
            key={`${journalStage ?? "all"}:${journalPeriod ?? "all"}:${journalEntity ?? "all"}`}
            fallback={<RegisterSkeleton />}
          >
            <GeneralLedgerPanel
              status={journalStage}
              fiscalPeriod={journalPeriod}
              legalEntityId={journalEntity}
            />
          </Suspense>

          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <LookupById
              action={lookupJournal}
              inputName="lookup_journal_id"
              label="Read one journal"
              placeholder="Must be a UUID"
              hint="The full record including every line: each actor and timestamp along the lifecycle, the reversal link if this journal is one, and the Atomic Linking references tying the posting to the upstream event or governance decision that caused it. An unknown id, another tenant's journal, and a malformed one all read as absent — the service deliberately does not distinguish them."
            />
          </div>
        </CardContent>
      </Card>

      {/* ── bank-reconciliation-svc (:8102) ─────────────────────────────────
          Live and writable. The register below is the BANK's claim about what
          happened; the journal register above it is the BUSINESS's claim.
          Reconciling is proving the two agree, and the service only matches a
          line against a journal it verifies as FINALIZED, on the same legal
          entity, moving the same amount through this bank account's ledger
          account in the same direction. */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Ingest a statement line</CardTitle>
            <CardDescription>
              Live, writable. Backed by bank-reconciliation-svc — it records what the bank says
              happened and asserts nothing about the ledger yet. The line lands UNMATCHED; matching
              it to a FINALIZED journal above, or flagging it as an exception when nothing accounts
              for it, are the two honest answers. The ledger account code for this bank account is
              required at ingest, because it is what lets the service verify the DIRECTION of a
              future match — a journal of exactly the right size that moved money the other way is
              refused.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <IngestStatementLineForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Reconciliation register</CardTitle>
            <CardDescription>
              Every statement line for this tenant, newest first. Each row offers only the actions
              that are legal from where it stands — the service refuses the rest atomically, and
              MATCHED is terminal. A statement is declared reconciled per bank account and date,
              below, once every line is either matched or recorded as an exception.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {RECONCILIATION_STATUS_FILTERS.map((filter) => {
              const active = reconciliationStatus === filter.value;
              return (
                <Link
                  key={filter.label}
                  href={hrefWith({ rstatus: filter.value })}
                  className={active ? CHIP_ACTIVE : CHIP_IDLE}
                  aria-current={active ? "page" : undefined}
                >
                  {filter.label}
                </Link>
              );
            })}
          </div>

          <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <input type="hidden" name="rstatus" value={reconciliationStatus ?? ""} />
            {/* The other registers' filters share this query string — replayed
                for the same reason the stage chip is, so filtering
                reconciliation does not silently clear the journal or payables
                registers above. */}
            <input type="hidden" name="stage" value={stage ?? ""} />
            <input type="hidden" name="vendor" value={vendor ?? ""} />
            <input type="hidden" name="entity" value={entityRaw ?? ""} />
            <input type="hidden" name="jstage" value={journalStage ?? ""} />
            <input type="hidden" name="jperiod" value={journalPeriodRaw ?? ""} />
            <input type="hidden" name="jentity" value={journalEntityRaw ?? ""} />
            <div className="flex-1">
              <label htmlFor="rbank" className={FILTER_LABEL}>
                Bank account{" "}
                <span className="font-normal text-slate-400">(UUID, blank = all accounts)</span>
              </label>
              <input
                id="rbank"
                name="rbank"
                defaultValue={reconciliationBankRaw ?? ""}
                placeholder="00000000-0000-0000-0000-000000000000"
                className={`${FILTER_FIELD} font-mono text-xs`}
                autoComplete="off"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="rdate" className={FILTER_LABEL}>
                Statement date{" "}
                <span className="font-normal text-slate-400">(YYYY-MM-DD, blank = all dates)</span>
              </label>
              <input
                id="rdate"
                name="rdate"
                type="date"
                defaultValue={reconciliationDateRaw ?? ""}
                className={FILTER_FIELD}
              />
            </div>
            <button type="submit" className={FILTER_SUBMIT}>
              Filter statement lines
            </button>
          </form>
          {reconciliationBankRejected && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              That bank account filter was ignored — it must be a UUID, so it was not sent. The
              service compares it as text rather than casting it, so a malformed value would not
              have errored: it would have matched nothing and shown an empty register, which reads
              as &ldquo;this account has no lines&rdquo;.
            </p>
          )}
          {reconciliationDateRejected && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              That statement date filter was ignored — it must be YYYY-MM-DD, so it was not sent.
              The service compares the date as an exact day, so a half-typed value would have
              matched nothing rather than erroring.
            </p>
          )}

          <Suspense
            key={`${reconciliationStatus ?? "all"}:${reconciliationBank ?? "all"}:${reconciliationDate ?? "all"}`}
            fallback={<RegisterSkeleton />}
          >
            <BankReconciliationPanel
              status={reconciliationStatus}
              bankAccountId={reconciliationBank}
              statementDate={reconciliationDate}
            />
          </Suspense>

          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <LookupById
              action={lookupStatementLine}
              inputName="lookup_statement_line_id"
              label="Read one statement line"
              placeholder="Must be a UUID"
              hint="The full record: the signed amount and the ledger account code that makes its direction verifiable, plus every actor and timestamp along the reconciliation lifecycle. An unknown id, another tenant's line, and a malformed one all read as absent — the service deliberately does not distinguish them."
            />
          </div>
        </CardContent>
      </Card>

      {/* ── accounts-payable-svc (:8099) ──────────────────────────────────────
          The second live, writable register on this page: the liability side,
          feeding the ledger above. */}
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
            {/* The ledger filters share this query string — replayed for the
                same reason the stage chip is, so filtering payables does not
                silently clear the journal register above. */}
            <input type="hidden" name="jstage" value={journalStage ?? ""} />
            <input type="hidden" name="jperiod" value={journalPeriodRaw ?? ""} />
            <input type="hidden" name="jentity" value={journalEntityRaw ?? ""} />
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

      {/* ── financial-close-svc (:8104) ───────────────────────────────────────
          Last of the three live registers, and deliberately after the ledger:
          a period is closed on the strength of what is in the journal register
          above it, and the readiness check reports on exactly that. */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Register a fiscal period</CardTitle>
            <CardDescription>
              Live, writable. Backed by financial-close-svc — the authority on which periods are
              open. general-ledger-svc asks this service before every journal create, post and
              reverse and fails closed on the answer, so a period sealed here can no longer be
              posted into. Periods are scoped to this session&apos;s legal entity, and the lifecycle
              is one-way: OPEN → LOCKED, with no unlock.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <RegisterPeriodForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Period close register</CardTitle>
            <CardDescription>
              Every fiscal period registered for this legal entity. Closing runs three checks —
              unposted journals, unsettled payables, unsettled receivables, each bounded to the
              period — then compiles the trial balance from every posted journal in it, files that
              in the document vault, and records a signed hash of it. Any of those failing refuses
              the close outright. Check readiness first: it runs the same checks and changes
              nothing.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<RegisterSkeleton />}>
            <FinancialClosePanel />
          </Suspense>
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
          Indicative figures for the wider Finance domain. Only the journal, reconciliation,
          payables and period close registers above read live services — treat the panels below as
          the domain&apos;s shape, not its contents.
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
                WIRED_SERVICES.has(svc)
                  ? "ml-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                  : "ml-2 h-2 w-2 shrink-0 rounded-full bg-blue-500"
              }
              title={
                WIRED_SERVICES.has(svc)
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
