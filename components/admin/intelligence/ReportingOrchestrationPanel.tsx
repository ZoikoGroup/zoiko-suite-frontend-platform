"use client";

import { useState, useEffect } from "react";
import { BarChart2, RefreshCw } from "lucide-react";
import { fetchPanelList } from "@/lib/panel-fetch";
import { ReportDefinitionCreateForm } from "./IntelligenceCreateForms";
import type { ReportDefinition } from "@/lib/api/intelligence";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
  VALIDATED: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  ACTIVE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  RETIRED: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
};

export function ReportingOrchestrationPanel() {
  const [reports, setReports] = useState<ReportDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setReports(
        await fetchPanelList<ReportDefinition>("/api/v1/intelligence/reports", "reports", "reporting-orchestration-svc"),
      );
    } catch (e) {
      setReports([]);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-indigo-500" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Reporting Orchestration</p>
          <code className="text-[10px] font-mono text-slate-400">reporting-orchestration-svc</code>
        </div>
        <button
          id="reports-refresh-btn"
          onClick={load}
          disabled={loading}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-800"
          aria-label="Refresh reports data"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="p-5">
        <div className="mb-4">
          <ReportDefinitionCreateForm onCreated={load} />
        </div>

        {error && (
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">{error}</p>
        )}

        {!error && !loading && reports.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
            No report definitions — reporting-orchestration-svc returned an empty register.
          </p>
        )}

        {!error && !loading && (
          <p className="mb-3 text-[10px] text-slate-400 dark:text-slate-500">
            Report definitions only. reporting-orchestration-svc records report runs as NOT_IMPLEMENTED: no report data is produced yet.
          </p>
        )}

        {reports.length > 0 && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {reports.map((r) => (
              <div key={r.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{r.report_name}</p>
                  <span className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLES[r.status] ?? STATUS_STYLES.DRAFT}`}>
                    {r.status}
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                  {r.report_type.replace(/_/g, " ")} · {r.output_format} · Created by {r.created_by} · {new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
