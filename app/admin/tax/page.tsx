import type { Metadata } from "next";
import { Suspense } from "react";
import { Percent, Receipt, Landmark, FileCheck } from "lucide-react";
import { DOMAINS } from "@/lib/constants";
import {
  TaxRulesAndDeterminationPanel,
  VatGstReturnsPanel,
  CorporateAndWithholdingTaxPanel,
  FilingPrepAndAuthorityPanel,
  TaxActionHeader,
  TaxSummaryBar,
  TaxProcessTimeline,
  TaxJurisdictionPanel,
} from "@/components/admin/tax";

export const metadata: Metadata = { title: "Tax Governance & Engine | Zoiko Suite" };

/** Skeleton row used while a panel's Suspense boundary is resolving. */
function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}

/** Skeleton for the KPI summary bar. */
function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-32 rounded-xl bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}

/** Skeleton for the jurisdiction grid. */
function JurisdictionSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-36 rounded-xl bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}

/** Reusable section card with a header strip. */
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
      {/* Card header */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/50">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-100 dark:bg-navy-500/20">
            <Icon className="h-4.5 w-4.5 text-navy-600 dark:text-navy-400" aria-hidden="true" />
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

      {/* Card body */}
      <div className="p-5">{children}</div>
    </section>
  );
}

export default async function TaxPage() {
  const domain = DOMAINS.find((d) => d.key === "tax")!;

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {domain.label}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{domain.purpose}</p>
      </div>

      {/* ── KPI Summary Bar ──────────────────────────────────────────────── */}
      <Suspense fallback={<KpiSkeleton />}>
        <TaxSummaryBar />
      </Suspense>

      {/* ── Interactive Action Header ────────────────────────────────────── */}
      <TaxActionHeader />

      {/* ── Process Timeline ─────────────────────────────────────────────── */}
      <TaxProcessTimeline />

      <hr className="border-slate-200 dark:border-slate-800" />

      {/* ── Jurisdiction Overview ────────────────────────────────────────── */}
      <Suspense fallback={<JurisdictionSkeleton />}>
        <TaxJurisdictionPanel />
      </Suspense>

      <hr className="border-slate-200 dark:border-slate-800" />

      {/* ── Live Service Panels ──────────────────────────────────────────── */}
      <div className="space-y-6">
        {/* 1 — Tax Rules & Determination */}
        <SectionCard
          icon={Percent}
          title="Tax Rules & Determination Engine"
          subtitle="tax-rules-svc & tax-determination-svc — jurisdiction rules and transaction evaluation"
          ports="8125, 8126"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <TaxRulesAndDeterminationPanel />
          </Suspense>
        </SectionCard>

        {/* 2 — VAT / GST Engine */}
        <SectionCard
          icon={Receipt}
          title="VAT / GST Engine"
          subtitle="vat-gst-svc — periodic VAT and GST returns"
          ports="8127"
        >
          <Suspense fallback={<PanelSkeleton rows={3} />}>
            <VatGstReturnsPanel />
          </Suspense>
        </SectionCard>

        {/* 3 — Corporate & Withholding Tax */}
        <SectionCard
          icon={Landmark}
          title="Corporate & Withholding Tax"
          subtitle="corporate-tax-svc & withholding-tax-svc — income tax returns and source withholding"
          ports="8128, 8129"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <CorporateAndWithholdingTaxPanel />
          </Suspense>
        </SectionCard>

        {/* 4 — Filing Preparation & Authority Integration */}
        <SectionCard
          icon={FileCheck}
          title="Filing Preparation & Authority Interfaces"
          subtitle="filing-preparation-svc & tax-authority-interface-svc — draft assembly and tax gateway connections"
          ports="8130, 8147"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <FilingPrepAndAuthorityPanel />
          </Suspense>
        </SectionCard>
      </div>
    </div>
  );
}
