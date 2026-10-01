"use client";

import { useState } from "react";
import { Shield, Key, Eye, ShieldCheck, Bot, CheckCircle2 } from "lucide-react";

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
    id: "siem",
    title: "Threat Telemetry",
    svc: "siem-integration-svc",
    port: "8141",
    status: "healthy",
    icon: Eye,
    description: "Streaming audit trails, authentication anomalies, and rate-limit triggers routed directly to SIEM (Datadog/Splunk).",
  },
  {
    id: "carta",
    title: "CARTA Zero-Trust Risk",
    svc: "carta-svc",
    port: "8142",
    status: "healthy",
    icon: ShieldCheck,
    description: "Continuous Adaptive Risk and Trust Assessment evaluating subject identity, device posture, and action authorization.",
  },
  {
    id: "kms",
    title: "Envelope Encryption",
    svc: "key-management-svc",
    port: "8143",
    status: "healthy",
    icon: Key,
    description: "AES-256-GCM data keys generated and wrapped via HSM-backed root keys with automated rotation & BYOK / HYOK support.",
  },
  {
    id: "ai-gov",
    title: "AI Safety Guardrails",
    svc: "ai-governance-svc",
    port: "8183",
    status: "healthy",
    icon: Bot,
    description: "Dynamic LLM output moderation, data residency enforcement, and autonomous action risk tier classification.",
  },
];

export function SecurityProcessTimeline() {
  const [selected, setSelected] = useState<Stage | null>(null);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Cryptographic Trust Chain & AI Governance Pipeline
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            End-to-end zero-trust architecture protecting transport, keys, telemetry, access risk, and autonomous agents
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Zero-Trust Verified
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
              className={`group relative flex cursor-pointer flex-col justify-between rounded-lg border p-3.5 transition ${
                isSelected
                  ? "border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500 dark:border-emerald-400 dark:bg-emerald-950/20"
                  : "border-slate-200 bg-slate-50/50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-slate-700"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white shadow-xs dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-slate-400">Step {idx + 1}</span>
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  </div>
                </div>

                <div className="mt-3">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">{stage.title}</h4>
                  <div className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    <span>{stage.svc}</span>
                    <span>:{stage.port}</span>
                  </div>
                </div>
              </div>

              <p className="mt-2 text-[11px] text-slate-500 line-clamp-2 dark:text-slate-400">
                {stage.description}
              </p>
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-slate-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-slate-200">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-emerald-900 dark:text-emerald-300">
              {selected.title} Deep Dive ({selected.svc}:{selected.port})
            </span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              ✕ Close
            </button>
          </div>
          <p className="mt-1 text-[11px] text-emerald-950/80 dark:text-emerald-200/90">
            {selected.description}
          </p>
        </div>
      )}
    </div>
  );
}
