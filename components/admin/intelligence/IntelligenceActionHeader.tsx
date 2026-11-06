import { Server } from "lucide-react";

// Names only: where each service is reached depends on the deployment
// (gateway prefix or ZOIKO_*_URL), so a fixed port here would be wrong somewhere.
const SERVICES = [
  { name: "anomaly-detection-svc" },
  { name: "forecasting-svc" },
  { name: "compliance-risk-scoring-svc" },
  { name: "reconciliation-intelligence-svc" },
  { name: "reporting-orchestration-svc" },
  { name: "decision-support-svc" },
  { name: "migration-integrity-svc" },
];

export function IntelligenceActionHeader() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-500/20">
          <Server className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />
        </span>
        <div className="flex-1">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Intelligence &amp; Reporting Services
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {SERVICES.map((svc) => (
              <span
                key={svc.name}
                className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-400"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                {svc.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
