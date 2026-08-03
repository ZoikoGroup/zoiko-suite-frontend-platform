import type { Metadata } from "next";
import { DOMAINS } from "@/lib/constants";
import { AccountsReceivableView, FinanceActionHeader } from "@/components/admin/finance";

export const metadata: Metadata = { title: "Finance & Accounts Receivable | Zoiko Suite" };

export default async function FinancePage() {
  const domain = DOMAINS.find((d) => d.key === "finance")!;

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header section */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          {domain.label} Domain & Microservices
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          {domain.purpose}
        </p>
      </div>

      {/* Interactive Action Header */}
      <FinanceActionHeader />

      {/* Core Services grid badges */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {domain.coreServices.map((svc) => (
          <div
            key={svc}
            className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center justify-between"
          >
            <span className="truncate">{svc}</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 ml-2" />
          </div>
        ))}
      </div>

      <hr className="border-zinc-200 dark:border-zinc-800" />

      {/* Accounts Receivable Microservice Integration Widget */}
      <AccountsReceivableView />
    </div>
  );
}
