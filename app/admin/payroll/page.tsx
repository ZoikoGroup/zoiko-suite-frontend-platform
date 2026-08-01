import type { Metadata } from "next";
import { Suspense } from "react";
import { Wallet, Layers, AlertCircle } from "lucide-react";
import { DOMAINS } from "@/lib/constants";
import {
  PayrollRunsPanel,
  CompensationAndBenefitsPanel,
  PayrollTaxAndExceptionsPanel,
  PayrollActionHeader,
} from "@/components/admin/payroll";

export const metadata: Metadata = { title: "Payroll & Remuneration | Zoiko Suite" };

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

      {/* Card body */}
      <div className="p-5">{children}</div>
    </section>
  );
}

export default async function PayrollPage() {
  const domain = DOMAINS.find((d) => d.key === "payroll")!;

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {domain.label}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{domain.purpose}</p>
      </div>

      {/* ── Interactive Action Header ───────────────────────────────── */}
      <PayrollActionHeader />

      {/* ── Core Service Badges ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {domain.coreServices.map((svc) => (
          <div
            key={svc}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <span className="truncate">{svc}</span>
            <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          </div>
        ))}
      </div>

      <hr className="border-slate-200 dark:border-slate-800" />

      {/* ── Live Service Panels ─────────────────────────────────────── */}
      <div className="space-y-6">
        {/* 1 — Payroll Runs */}
        <SectionCard
          icon={Wallet}
          title="Payroll Run Orchestration"
          subtitle="payroll-run-svc — monthly pay period processing, net pay calculation, and finalization"
          ports="8105"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <PayrollRunsPanel />
          </Suspense>
        </SectionCard>

        {/* 2 — Compensation & Benefits */}
        <SectionCard
          icon={Layers}
          title="Compensation & Benefits Management"
          subtitle="compensation-svc & benefits-svc — pay grades, salary structures, and corporate benefit plans"
          ports="8111, 8112"
        >
          <Suspense fallback={<PanelSkeleton rows={3} />}>
            <CompensationAndBenefitsPanel />
          </Suspense>
        </SectionCard>

        {/* 3 — Payroll Tax & Exceptions */}
        <SectionCard
          icon={AlertCircle}
          title="Payroll Tax & Exceptions"
          subtitle="payroll-tax-svc & payroll-exceptions-svc — tax profile withholding and pay period exceptions"
          ports="8113, 8114"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <PayrollTaxAndExceptionsPanel />
          </Suspense>
        </SectionCard>
      </div>
    </div>
  );
}
