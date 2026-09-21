import type { Metadata } from "next";
import { Suspense } from "react";
import { Shield, Key, Eye, Lock } from "lucide-react";
import { DOMAINS } from "@/lib/constants";
import {
  SecuritySummaryBar,
  SecurityActionHeader,
  SecurityProcessTimeline,
  MtlsManagementPanel,
  SiemIntegrationPanel,
  CartaCapTablePanel,
  KeyManagementPanel,
} from "@/components/admin/security-trust";

export const metadata: Metadata = {
  title: "Security & Trust | Zoiko Suite",
  description: "Cryptographic identity, zero-trust mTLS verification, KMS envelope keys, SIEM streaming, and cap table integrity",
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
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/20">
            <Icon className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
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
  "mtls-management-svc :8140",
  "siem-integration-svc :8167",
  "carta-svc :8168",
  "key-management-svc :8169",
];

export default async function SecurityPage() {
  const domain = DOMAINS.find((d) => d.key === "security-trust") ?? {
    label: "Security & Trust",
    purpose: "Cryptographic service identity, automated mutual TLS, SIEM forwarding, and hardware KMS key management.",
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <div>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
            <Shield className="h-5 w-5" />
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
        <SecuritySummaryBar />
      </Suspense>

      <SecurityActionHeader />

      <SecurityProcessTimeline />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CORE_SERVICES.map((svc) => (
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          icon={Shield}
          title="Mutual TLS Certificate Authority"
          subtitle="mtls-management-svc — mutual TLS certificate enrollment, rotation & SAN binding"
          ports="8140"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <MtlsManagementPanel />
          </Suspense>
        </SectionCard>

        <SectionCard
          icon={Key}
          title="KMS Envelope Key Operations"
          subtitle="key-management-svc — AES-256 HSM keys, rotation scheduling, and cryptographic lifecycle"
          ports="8169"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <KeyManagementPanel />
          </Suspense>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          icon={Eye}
          title="SIEM Threat Telemetry Stream"
          subtitle="siem-integration-svc — real-time security events, auth failures, and audit ingestion"
          ports="8167"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <SiemIntegrationPanel />
          </Suspense>
        </SectionCard>

        <SectionCard
          icon={Lock}
          title="Carta Equity Grants & Cap Table"
          subtitle="carta-svc — cap table ledger, ISO/NSO allocations, and shareholder cryptographic records"
          ports="8168"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <CartaCapTablePanel />
          </Suspense>
        </SectionCard>
      </div>
    </div>
  );
}
