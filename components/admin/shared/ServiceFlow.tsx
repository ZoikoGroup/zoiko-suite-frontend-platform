"use client";

// A domain's services as a sequence of stages: what each one does, nothing
// more. The Block 6/7 timelines used to show per-stage counts that fell back
// to invented figures (142, 28, 15…) whenever a read failed, sample records
// ("$2.5M Global Infrastructure"), fixed complete/active/pending states and
// ports that belonged to other services. Live figures belong in the panels,
// which show a failed read as a failure.

import { useState } from "react";

export type ServiceFlowStage = {
  id: string;
  title: string;
  svc: string;
  icon: React.ElementType;
  description: string;
};

export function ServiceFlow({
  title,
  subtitle,
  stages,
}: {
  title: string;
  subtitle: string;
  stages: ServiceFlowStage[];
}) {
  const [selected, setSelected] = useState<ServiceFlowStage | null>(null);
  const cols = stages.length >= 6 ? "lg:grid-cols-6" : stages.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Service map, not a status check</span>
      </div>

      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${cols}`}>
        {stages.map((stage, idx) => {
          const Icon = stage.icon;
          const isSelected = selected?.id === stage.id;
          return (
            <button
              type="button"
              key={stage.id}
              onClick={() => setSelected(isSelected ? null : stage)}
              aria-expanded={isSelected}
              className={`rounded-lg border p-3.5 text-left transition ${
                isSelected
                  ? "border-indigo-500 bg-indigo-50/50 shadow-sm dark:border-indigo-500/60 dark:bg-indigo-950/20"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 dark:border-slate-800 dark:hover:border-slate-700 dark:hover:bg-slate-800/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{stage.title}</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">0{idx + 1}</span>
              </div>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{stage.description}</p>
              <div className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-400 dark:border-slate-800">
                <span className="font-mono truncate">{stage.svc}</span>
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
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
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{selected.description}</p>
        </div>
      )}
    </div>
  );
}
