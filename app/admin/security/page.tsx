import type { Metadata } from "next";
import { Lock, Shield, Key, Network, Bot } from "lucide-react";
import { PageHeader } from "@/components/admin/shared";
import { Card } from "@/components/ui";
import {
  SecurityActionHeader,
  SecuritySummaryBar,
  SecurityProcessTimeline,
  MtlsManagementPanel,
  SiemIntegrationPanel,
  CartaAssessmentPanel,
  KeyManagementPanel,
  AIGovernancePanel,
} from "@/components/admin/security-trust";

export const metadata: Metadata = {
  title: "Security & Trust | Zoiko Suite",
  description: "Govern cryptographic keys, mTLS infrastructure, SIEM security streaming, CARTA zero-trust risk assessments, and AI safety guardrails.",
};

const PANELS = [
  {
    name: "mtls-management-svc",
    port: 8140,
    purpose: "Mutual TLS x509 service-to-service certificates, CA rotation & SAN pinning",
    icon: Network,
    Panel: MtlsManagementPanel,
  },
  {
    name: "siem-integration-svc",
    port: 8141,
    purpose: "Security telemetry, audit logging & real-time SIEM event streaming",
    icon: Shield,
    Panel: SiemIntegrationPanel,
  },
  {
    name: "carta-svc",
    port: 8142,
    purpose: "Continuous Adaptive Risk & Trust Assessment (CARTA) zero-trust access evaluation",
    icon: Lock,
    Panel: CartaAssessmentPanel,
  },
  {
    name: "key-management-svc",
    port: 8143,
    purpose: "Hardware Security Module (HSM) master key management, BYOK & envelope encryption",
    icon: Key,
    Panel: KeyManagementPanel,
  },
  {
    name: "ai-governance-svc",
    port: 8183,
    purpose: "AI safety guardrails, automated cost tracking, and action risk tier classification",
    icon: Bot,
    Panel: AIGovernancePanel,
  },
];

export default function SecurityPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Security & Trust Governance"
        description="Govern cryptographic keys, mTLS infrastructure, SIEM security event streaming, CARTA zero-trust access evaluations, and AI safety policies."
      />

      <SecurityActionHeader />
      <SecuritySummaryBar />
      <SecurityProcessTimeline />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {PANELS.map(({ name, port, purpose, icon: Icon, Panel }, index) => {
          // If odd number of panels (5 items), make the last one span full width on xl screens
          const isLastSingle = index === PANELS.length - 1 && PANELS.length % 2 !== 0;

          return (
            <Card
              key={name}
              className={`p-5 transition hover:shadow-md ${isLastSingle ? "xl:col-span-2" : ""}`}
            >
              <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold font-mono text-slate-900 dark:text-slate-100">
                      {name}
                    </h3>
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      LIVE
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{purpose}</p>
                </div>
                <span className="shrink-0 font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                  :{port}
                </span>
              </div>
              <Panel />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
