import type { Metadata } from "next";
import { Lock, Shield, Key, Network } from "lucide-react";
import { PageHeader } from "@/components/admin/shared";
import { Card } from "@/components/ui";
import {
  SecurityActionHeader,
  SecuritySummaryBar,
  MtlsManagementPanel,
  SiemIntegrationPanel,
  CartaCapTablePanel,
  KeyManagementPanel,
} from "@/components/admin/security-trust";

export const metadata: Metadata = {
  title: "Security & Trust | Zoiko Suite",
};

const PANELS = [
  { name: "mtls-management-svc", port: 8140, purpose: "Mutual TLS x509 service-to-service certificates & CA rotation", icon: Network, Panel: MtlsManagementPanel },
  { name: "siem-integration-svc", port: 8141, purpose: "Security telemetry, audit logging & SIEM event streaming", icon: Shield, Panel: SiemIntegrationPanel },
  { name: "carta-svc", port: 8142, purpose: "Shareholder equity registry, Carta cap table synchronization & compliance", icon: Lock, Panel: CartaCapTablePanel },
  { name: "key-management-svc", port: 8143, purpose: "Hardware Security Module (HSM) master key management & envelope encryption", icon: Key, Panel: KeyManagementPanel },
];

export default function SecurityPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Security & Trust Governance"
        description="Govern cryptographic keys, mTLS infrastructure, SIEM security event streaming, and cap table equity records."
      />

      <SecurityActionHeader />
      <SecuritySummaryBar />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {PANELS.map(({ name, port, purpose, icon: Icon, Panel }) => (
          <Card key={name} className="p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 text-navy-700 dark:bg-navy-500/10 dark:text-navy-300">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold font-mono text-slate-900 dark:text-slate-100">{name}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{purpose}</p>
              </div>
              <span className="shrink-0 font-mono text-[11px] font-bold text-navy-700 dark:text-navy-300">:{port}</span>
            </div>
            <Panel />
          </Card>
        ))}
      </div>
    </div>
  );
}
