import type { Metadata } from "next";
import { Suspense } from "react";
import {
  BrainCircuit,
  AlertTriangle,
  TrendingUp,
  ShieldCheck,
  GitMerge,
  BarChart2,
  Lightbulb,
  ArrowLeftRight,
} from "lucide-react";
import { DOMAINS } from "@/lib/constants";
import {
  IntelligenceSummaryBar,
  IntelligenceActionHeader,
  IntelligenceProcessTimeline,
  AnomalyDetectionPanel,
  ForecastingPanel,
  RiskScoringPanel,
  ReconciliationIntelligencePanel,
  ReportingOrchestrationPanel,
  DecisionSupportPanel,
  MigrationIntegrityPanel,
} from "@/components/admin/intelligence";

export const metadata: Metadata = {
  title: "Intelligence & Reporting | Zoiko Suite",
  description: "Cross-domain ML forecasting, real-time anomaly detection, risk scoring, and automated reporting orchestration",
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
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-500/20">
            <Icon className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
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
  "anomaly-detection-svc :8160",
  "forecasting-svc :8161",
  "compliance-risk-scoring-svc :8162",
  "reconciliation-intelligence-svc :8163",
  "reporting-orchestration-svc :8164",
  "decision-support-svc :8165",
  "migration-integrity-svc :8166",
];

export default async function IntelligencePage() {
  const domain = DOMAINS.find((d) => d.key === "intelligence") ?? {
    label: "Intelligence & Reporting",
    purpose: "Machine learning forecasting, automated reconciliation intelligence, risk scoring, and reporting orchestrations across all platform microservices.",
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <div>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
            <BrainCircuit className="h-5 w-5" />
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
        <IntelligenceSummaryBar />
      </Suspense>

      <IntelligenceActionHeader />

      <IntelligenceProcessTimeline />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
        {CORE_SERVICES.map((svc) => (
          <div
            key={svc}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <span className="truncate">{svc}</span>
            <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
          </div>
        ))}
      </div>

      <hr className="border-slate-200 dark:border-slate-800" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          icon={AlertTriangle}
          title="Real-Time Anomaly Detection"
          subtitle="anomaly-detection-svc — statistical drift and transaction anomalies"
          ports="8160"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <AnomalyDetectionPanel />
          </Suspense>
        </SectionCard>

        <SectionCard
          icon={TrendingUp}
          title="Predictive Forecasting"
          subtitle="forecasting-svc — multi-variate cashflow and operational projections"
          ports="8161"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <ForecastingPanel />
          </Suspense>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          icon={ShieldCheck}
          title="Compliance Risk Scoring"
          subtitle="compliance-risk-scoring-svc — dynamic entity posture and risk factors"
          ports="8162"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <RiskScoringPanel />
          </Suspense>
        </SectionCard>

        <SectionCard
          icon={GitMerge}
          title="Reconciliation Intelligence"
          subtitle="reconciliation-intelligence-svc — automated fuzzy matching and exception resolution"
          ports="8163"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <ReconciliationIntelligencePanel />
          </Suspense>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard
          icon={BarChart2}
          title="Reporting Orchestrations"
          subtitle="reporting-orchestration-svc — scheduled and on-demand report batches"
          ports="8164"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <ReportingOrchestrationPanel />
          </Suspense>
        </SectionCard>

        <SectionCard
          icon={Lightbulb}
          title="Decision Support"
          subtitle="decision-support-svc — algorithmic recommendations and impact analyses"
          ports="8165"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <DecisionSupportPanel />
          </Suspense>
        </SectionCard>

        <SectionCard
          icon={ArrowLeftRight}
          title="Migration Integrity"
          subtitle="migration-integrity-svc — legacy cutover checksums and ledger parity"
          ports="8166"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <MigrationIntegrityPanel />
          </Suspense>
        </SectionCard>
      </div>
    </div>
  );
}
