import type { Metadata } from "next";
import { Suspense } from "react";
import { Network, Building2, Users2, FileSignature, Radio } from "lucide-react";
import { DOMAINS } from "@/lib/constants";
import {
  IntegrationSummaryBar,
  IntegrationActionHeader,
  IntegrationProcessTimeline,
  BridgeConnectorPanel,
  BankingConnectorPanel,
  HrisConnectorPanel,
  EsignaturePanel,
  ExternalDataFeedPanel,
} from "@/components/admin/integration";

export const metadata: Metadata = {
  title: "Integration & Extensibility | Zoiko Suite",
  description: "Cross-system connectivity, Open Banking feeds, HRIS synchronization, eSignature routing, and real-time market data ingestion",
};

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
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-500/20">
            <Icon className="h-4.5 w-4.5 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
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

const CORE_SERVICES = [
  "connectivity-api-bridge-svc :8170",
  "banking-connector-svc :8171",
  "hris-connector-svc :8172",
  "esignature-integration-svc :8174",
  "external-data-feed-svc :8175",
];

export default async function IntegrationPage() {
  const domain = DOMAINS.find((d) => d.key === "integration") ?? {
    label: "Integration & Extensibility",
    purpose: "External protocol adaptors, Open Banking feeds, HRIS synchronization, and digital signature pipelines.",
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <div>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-md shadow-cyan-600/20">
            <Network className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {domain.label}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{domain.purpose}</p>
          </div>
        </div>
      </div>

      <Suspense fallback={<PanelSkeleton rows={4} />}>
        <IntegrationSummaryBar />
      </Suspense>

      <IntegrationActionHeader />

      <IntegrationProcessTimeline />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {CORE_SERVICES.map((svc) => (
          <div
            key={svc}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <span className="truncate">{svc}</span>
            <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-cyan-500" />
          </div>
        ))}
      </div>

      <hr className="border-slate-200 dark:border-slate-800" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          icon={Network}
          title="Connectivity API Bridge"
          subtitle="connectivity-api-bridge-svc — protocol transformations (REST, GraphQL, gRPC, Webhooks)"
          ports="8170"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <BridgeConnectorPanel />
          </Suspense>
        </SectionCard>

        <SectionCard
          icon={Building2}
          title="Open Banking & SWIFT Feeds"
          subtitle="banking-connector-svc — bank account verification, transactions, and automated statement sync"
          ports="8171"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <BankingConnectorPanel />
          </Suspense>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard
          icon={Users2}
          title="HRIS Directory Sync"
          subtitle="hris-connector-svc — Workday, BambooHR, and Rippling worker sync"
          ports="8172"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <HrisConnectorPanel />
          </Suspense>
        </SectionCard>

        <SectionCard
          icon={FileSignature}
          title="eSignature Orchestration"
          subtitle="esignature-integration-svc — DocuSign / AdobeSign multi-party signing"
          ports="8174"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <EsignaturePanel />
          </Suspense>
        </SectionCard>

        <SectionCard
          icon={Radio}
          title="External Market Feeds"
          subtitle="external-data-feed-svc — live FX rates and sanctions lists"
          ports="8175"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <ExternalDataFeedPanel />
          </Suspense>
        </SectionCard>
      </div>
    </div>
  );
}
