import type { Metadata } from "next";
import { Lock, Shield, Key, Network } from "lucide-react";
import { PageHeader } from "@/components/admin/shared";
import { Card, Badge } from "@/components/ui";

export const metadata: Metadata = {
  title: "Security & Trust | Zoiko Suite",
};

const SECURITY_SERVICES = [
  { name: "mtls-management-svc", port: 8140, purpose: "Mutual TLS x509 service-to-service certificates & CA rotation", icon: Network },
  { name: "siem-integration-svc", port: 8141, purpose: "Security telemetry, audit logging & SIEM event streaming", icon: Shield },
  { name: "carta-svc", port: 8142, purpose: "Shareholder equity registry, Carta cap table synchronization & compliance", icon: Lock },
  { name: "key-management-svc", port: 8143, purpose: "Hardware Security Module (HSM) master key management & envelope encryption", icon: Key },
];

export default function SecurityPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Security & Trust Governance"
        description="Govern cryptographic keys, mTLS infrastructure, SIEM security event streaming, and cap table equity records."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECURITY_SERVICES.map((svc) => (
          <Card key={svc.name} className="p-5 flex flex-col justify-between hover:border-navy-300 dark:hover:border-navy-500 transition-all">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 text-navy-700 dark:bg-navy-500/10 dark:text-navy-300">
                  <svc.icon className="h-5 w-5" />
                </span>
                <Badge tone="success">Operational</Badge>
              </div>
              <h3 className="text-sm font-semibold font-mono text-slate-900 dark:text-slate-100">{svc.name}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{svc.purpose}</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">Local Port:</span>
              <span className="font-mono font-bold text-navy-700 dark:text-navy-300">:{svc.port}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
