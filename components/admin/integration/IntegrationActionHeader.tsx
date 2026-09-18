"use client";

import { Network, RefreshCw, PlusCircle, ArrowRightLeft, Radio } from "lucide-react";

export function IntegrationActionHeader() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400">
          <Network className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Integration Fabric & Connectors
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Synchronize external banking feeds, HRIS directories, eSignature envelopes, and market data
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Poll Connectors
        </button>

        <button
          type="button"
          onClick={() => alert("Triggering Global Sync across Banking & HRIS pipelines...")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-cyan-700"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          Sync All Feeds
        </button>

        <button
          type="button"
          onClick={() => alert("New Bridge Connection dialog")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-600/30 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-700 hover:bg-cyan-100 dark:border-cyan-500/30 dark:bg-cyan-950/40 dark:text-cyan-300"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          Add Connection
        </button>
      </div>
    </div>
  );
}
