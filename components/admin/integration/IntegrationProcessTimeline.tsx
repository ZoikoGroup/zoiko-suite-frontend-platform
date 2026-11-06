"use client";

import { useState } from "react";
import { Network, Building2, Users2, FileSignature, Radio } from "lucide-react";

type Stage = {
  id: string;
  title: string;
  svc: string;
  icon: React.ElementType;
  description: string;
};

const STAGES: Stage[] = [
  {
    id: "bridge",
    title: "Protocol Gateway",
    svc: "connectivity-api-bridge-svc",
    icon: Network,
    description: "Registers bridge endpoints and integration connections (protocol, auth type, destination), with maker-checker on changes. No external connector is exercised yet.",
  },
  {
    id: "banking",
    title: "Bank Connections",
    svc: "banking-connector-svc",
    icon: Building2,
    description: "Records bank connections and accepts pushed statement files for validation and normalization. No bank API adapter is connected yet.",
  },
  {
    id: "hris",
    title: "HRIS Integrations",
    svc: "hris-connector-svc",
    icon: Users2,
    description: "Records HRIS integrations. A sync request is refused (503) until a real HRIS provider adapter is configured.",
  },
  {
    id: "esign",
    title: "Signature Envelopes",
    svc: "esignature-integration-svc",
    icon: FileSignature,
    description: "Tracks signature envelopes. Sending one is refused (503) until a DocuSign or Adobe adapter is configured.",
  },
  {
    id: "feeds",
    title: "Data Feeds",
    svc: "external-data-feed-svc",
    icon: Radio,
    description: "Records feed subscriptions (provider, feed type, symbol). It calls no provider; events are pushed in by callers.",
  },
];

export function IntegrationProcessTimeline() {
  const [selected, setSelected] = useState<Stage | null>(null);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Integration Services
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            What each connector does today. No live provider adapter is configured in this environment.
          </p>
        </div>
        <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Service map, not a status check</span>
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
                <span className="font-mono truncate">{stage.svc}</span>
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="mt-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              {selected.title} ({selected.svc})
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
            {selected.description}
          </p>
        </div>
      )}
    </div>
  );
}
