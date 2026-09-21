"use client";

import { useState } from "react";
import { Network, Building2, Users2, FileSignature, Radio, CheckCircle2 } from "lucide-react";

type Stage = {
  id: string;
  title: string;
  svc: string;
  port: string;
  icon: React.ElementType;
  description: string;
};

const STAGES: Stage[] = [
  {
    id: "bridge",
    title: "Protocol Gateway",
    svc: "connectivity-api-bridge-svc",
    port: "8170",
    icon: Network,
    description: "Transforms REST, GraphQL, SOAP, and Webhook protocols into internal schema events with auth translation.",
  },
  {
    id: "banking",
    title: "Financial Pipelines",
    svc: "banking-connector-svc",
    port: "8171",
    icon: Building2,
    description: "Automated statement ingestion, SWIFT messaging, and ACH reconciliation synced with core ledger.",
  },
  {
    id: "hris",
    title: "Employee Sync",
    svc: "hris-connector-svc",
    port: "8172",
    icon: Users2,
    description: "Bi-directional worker directory sync with Workday, BambooHR, and Rippling for payroll and identity parity.",
  },
  {
    id: "esign",
    title: "Digital Envelopes",
    svc: "esignature-integration-svc",
    port: "8174",
    icon: FileSignature,
    description: "Multi-party contract execution workflows with DocuSign/AdobeSign and tamper-proof signature certificates.",
  },
  {
    id: "feeds",
    title: "Market Feeds",
    svc: "external-data-feed-svc",
    port: "8175",
    icon: Radio,
    description: "Real-time FX rates from ECB, Bloomberg market feeds, and OFAC sanctions lists for automated compliance.",
  },
];

export function IntegrationProcessTimeline() {
  const [selected, setSelected] = useState<Stage | null>(null);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Enterprise Connectivity Fabric
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time multi-protocol ingestion pipelines feeding Zoiko Suite operational domains
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-cyan-600 dark:text-cyan-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          5 Active Adaptors
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {STAGES.map((stage, idx) => {
          const Icon = stage.icon;
          const isSelected = selected?.id === stage.id;

          return (
            <div
              key={stage.id}
              onClick={() => setSelected(isSelected ? null : stage)}
              className={`group cursor-pointer rounded-lg border p-3.5 transition ${
                isSelected
                  ? "border-cyan-500 bg-cyan-50/50 shadow-sm dark:border-cyan-500/60 dark:bg-cyan-950/20"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 dark:border-slate-800 dark:hover:border-slate-700 dark:hover:bg-slate-800/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {stage.title}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">0{idx + 1}</span>
              </div>

              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                {stage.description}
              </p>

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400 dark:border-slate-800">
                <span className="font-mono truncate max-w-[100px]">{stage.svc}</span>
                <span className="font-mono text-cyan-600 dark:text-cyan-400">:{stage.port}</span>
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="mt-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              {selected.title} — Service Architecture
            </h4>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Close
            </button>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {selected.description} Mounted on port <code className="font-mono font-bold text-cyan-600 dark:text-cyan-400">:{selected.port}</code> with multi-tenant data isolation and backpressure management.
          </p>
        </div>
      )}
    </div>
  );
}
