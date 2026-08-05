import type { Metadata } from "next";
import { Suspense } from "react";
import { DOMAINS } from "@/lib/constants";
import {
  AccountsReceivableView,
  FinanceActionHeader,
  FinanceSummaryBar,
  FinanceProcessTimeline,
} from "@/components/admin/finance";

export const metadata: Metadata = { title: "Finance & Accounts Receivable | Zoiko Suite" };

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-32 rounded-xl bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}

export default async function FinancePage() {
  const domain = DOMAINS.find((d) => d.key === "finance")!;

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      {/* Header section */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {domain.label} Domain & Microservices
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{domain.purpose}</p>
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
            <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
          </div>
        ))}
      </div>

      <hr className="border-slate-200 dark:border-slate-800" />

      {/* Accounts Receivable & General Ledger Widget */}
      <AccountsReceivableView />
    </div>
  );
}
