"use client";

import { useState } from "react";
import { Shield, Key, Eye, ShieldCheck, Bot } from "lucide-react";

// A map of what each service does today, not a live status: nothing here is
// probed. Descriptions state current capability only (fix/blocks-6-10-final).
type Stage = {
  id: string;
  title: string;
  svc: string;
  icon: React.ElementType;
  description: string;
};

const STAGES: Stage[] = [
  {
    id: "mtls",
    title: "mTLS Certificates",
    svc: "mtls-management-svc",
    icon: Shield,
    description: "Issues and rotates X.509 service certificates from an internal CA and records service-to-service policies. Lifecycle changes are not yet sent to the audit trail.",
  },
  {
    id: "siem",
    title: "SIEM Events",
    svc: "siem-integration-svc",
    icon: Eye,
    description: "Records security events against configured exporters. No external SIEM delivery exists yet: an event the service stores is recorded, not sent.",
  },
  {
    id: "carta",
    title: "CARTA Access Risk",
    svc: "carta-svc",
    icon: ShieldCheck,
    description: "Scores an access request on device trust, location, resource sensitivity and time, and returns ALLOW, STEP_UP_MFA, ISOLATE or DENY.",
  },
  {
    id: "kms",
    title: "Key Registry",
    svc: "key-management-svc",
    icon: Key,
    description: "Registers customer keys (alias, provider, ARN, version, state). Metadata only: it performs no encryption, wrapping or HSM operation.",
  },
  {
    id: "ai-gov",
    title: "AI Governance",
    svc: "ai-governance-svc",
    icon: Bot,
    description: "Records AI runs, action risk classifications and model providers. It has no list of AI runs, so run counts here are not available.",
  },
];

export function SecurityProcessTimeline() {
  const [selected, setSelected] = useState<Stage | null>(null);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Security &amp; Trust Services
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            What each service does today. Live data is in the panels below.
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
                    <span className="inline-block h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                  </div>
                </div>

                <div className="mt-3">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">{stage.title}</h4>
                  <div className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    <span>{stage.svc}</span>
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
              {selected.title} ({selected.svc})
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
