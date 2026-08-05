import type { Metadata } from "next";
import { Suspense } from "react";
import { History } from "lucide-react";
import { DOMAINS } from "@/lib/constants";
import { getAuditEvents } from "@/lib/api/audit-events";
import {
  AuditEventLedgerPanel,
  AuditEventActionHeader,
  AuditEventsSummaryBar,
  AuditEventsProcessTimeline,
} from "@/components/admin/audit-events";

export const metadata: Metadata = { title: "Audit Event Store & Cryptographic Hash-Chain | Zoiko Suite" };

function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}

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
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
            <Icon className="h-4.5 w-4.5 text-slate-700 dark:text-slate-300" aria-hidden="true" />
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

export default async function AuditEventsPage() {
  const domain = DOMAINS.find((d) => d.key === "audit-events")!;
  const auditRes = await getAuditEvents();

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {domain.label}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{domain.purpose}</p>
      </div>

      <Suspense fallback={<PanelSkeleton rows={4} />}>
        <AuditEventsSummaryBar />
      </Suspense>

      <AuditEventActionHeader />

      <AuditEventsProcessTimeline />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {domain.coreServices.map((svc) => (
          <div
            key={svc}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <span className="truncate">{svc}</span>
            <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-slate-500" />
          </div>
        ))}
      </div>

      <hr className="border-slate-200 dark:border-slate-800" />

      <SectionCard
        icon={History}
        title="Cryptographic Hash-Chain Event Stream"
        subtitle="audit-event-store-svc & governance-decision-log-svc — append-only event ingestion and SHA-256 tamper verification"
        ports="8083, 8084"
      >
        <Suspense fallback={<PanelSkeleton rows={5} />}>
          <AuditEventLedgerPanel events={auditRes.data} summary={auditRes.summary} isMock={auditRes.isMock} />
        </Suspense>
      </SectionCard>
    </div>
  );
}
