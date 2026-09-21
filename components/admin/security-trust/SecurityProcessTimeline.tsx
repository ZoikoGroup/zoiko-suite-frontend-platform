"use client";

import { useState } from "react";
import { Shield, Key, Eye, Lock, CheckCircle2, AlertCircle } from "lucide-react";

type Stage = {
  id: string;
  title: string;
  svc: string;
  port: string;
  status: "active" | "pending" | "healthy";
  icon: React.ElementType;
  description: string;
};

const STAGES: Stage[] = [
  {
    id: "mtls",
    title: "mTLS Mutual Auth",
    svc: "mtls-management-svc",
    port: "8140",
    status: "healthy",
    icon: Shield,
    description: "Every inter-service gRPC / HTTP payload verified via X.509 client certificates and strict SAN pinning.",
  },
  {
    id: "kms",
    title: "Envelope Encryption",
    svc: "key-management-svc",
    port: "8169",
    status: "healthy",
    icon: Key,
    description: "AES-256-GCM data keys generated and wrapped via HSM-backed root keys with automated 90-day rotation.",
  },
  {
    id: "siem",
    title: "Threat Telemetry",
    svc: "siem-integration-svc",
    port: "8167",
    status: "healthy",
    icon: Eye,
    description: "Streaming audit trails, authentication anomalies, and rate-limit triggers routed directly to SIEM (Datadog/Splunk).",
  },
  {
    id: "carta",
    title: "Equity Ledger Integrity",
    svc: "carta-svc",
    port: "8168",
    status: "healthy",
    icon: Lock,
    description: "Cap table mutations, ISO/NSO grants, and shareholder registers synced with immutable cryptographic receipts.",
  },
];

export function SecurityProcessTimeline() {
  const [selected, setSelected] = useState<Stage | null>(null);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Cryptographic Trust Chain
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            End-to-end zero-trust architecture protecting services, keys, and equity registers
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Zero Trust Active
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((stage, idx) => {
          const Icon = stage.icon;
          const isSelected = selected?.id === stage.id;

          return (
            <div
              key={stage.id}
              onClick={() => setSelected(isSelected ? null : stage)}
              className={`group cursor-pointer rounded-lg border p-3.5 transition ${
                isSelected
                  ? "border-emerald-500 bg-emerald-50/50 shadow-sm dark:border-emerald-500/60 dark:bg-emerald-950/20"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 dark:border-slate-800 dark:hover:border-slate-700 dark:hover:bg-slate-800/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
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
                <span className="font-mono">{stage.svc}</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">:{stage.port}</span>
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="mt-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              {selected.title} — Implementation Details
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
            {selected.description} Service running at <code className="font-mono font-bold text-emerald-600 dark:text-emerald-400">:{selected.port}</code> with strict mutual TLS and tenant verification.
          </p>
        </div>
      )}
    </div>
  );
}
