import type { Metadata } from "next";
import { Plug, Landmark, Users, FileCheck, Globe, Database } from "lucide-react";
import { PageHeader } from "@/components/admin/shared";
import { Card, Badge } from "@/components/ui";

export const metadata: Metadata = {
  title: "Integrations & Connectors | Zoiko Suite",
};

const INTEGRATION_SERVICES = [
  { name: "connectivity-api-bridge-svc", port: 8144, purpose: "External API gateway bridge and webhook ingress routing", icon: Plug },
  { name: "banking-connector-svc", port: 8145, purpose: "Open Banking CMA9 and institutional bank account connectivity", icon: Landmark },
  { name: "hris-connector-svc", port: 8146, purpose: "Workday, BambooHR and corporate human resource systems", icon: Users },
  { name: "tax-authority-interface-svc", port: 8147, purpose: "HMRC MTD and international statutory revenue service connectors", icon: FileCheck },
  { name: "esignature-integration-svc", port: 8148, purpose: "DocuSign, Adobe Sign and governed electronic signature envelopes", icon: Globe },
  { name: "external-data-feed-svc", port: 8149, purpose: "ECB FX exchange rates, financial indices and reference data feeds", icon: Database },
];

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Integration & Extensibility Connectors"
        description="Govern real-time integrations with external banking, HRIS, tax authority, electronic signature, and market data feeds."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {INTEGRATION_SERVICES.map((svc) => (
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
