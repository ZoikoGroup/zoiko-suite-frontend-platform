import type { Metadata } from "next";
import { Suspense } from "react";
import { DOMAINS } from "@/lib/constants";
import {
  EmployeeMasterPanel,
  HrActionHeader,
  HrSummaryBar,
  HrProcessTimeline,
} from "@/components/admin/hr";

export const metadata: Metadata = { title: "HR & Workforce Governance | Zoiko Suite" };

function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}

export default async function HrPage() {
  const domain = DOMAINS.find((d) => d.key === "hr")!;

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {domain.label}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{domain.purpose}</p>
      </div>

      <Suspense fallback={<PanelSkeleton rows={4} />}>
        <HrSummaryBar />
      </Suspense>

      <HrActionHeader />

      <HrProcessTimeline />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {domain.coreServices.map((svc) => (
          <div
            key={svc}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <span className="truncate">{svc}</span>
            <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-teal-500" />
          </div>
        ))}
      </div>

      <hr className="border-slate-200 dark:border-slate-800" />

      <Suspense fallback={<PanelSkeleton rows={4} />}>
        <EmployeeMasterPanel />
      </Suspense>
    </div>
  );
}
