"use client";

import { useState, useEffect } from "react";
import { GitMerge, RefreshCw } from "lucide-react";
import { fetchPanelList } from "@/lib/panel-fetch";
import { ReconciliationCreateForm } from "./IntelligenceCreateForms";
import type { ReconciliationJob } from "@/lib/api/intelligence";

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  FAILED: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  ARCHIVED: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
};

export function ReconciliationIntelligencePanel() {
  const [records, setRecords] = useState<ReconciliationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRecords(
        await fetchPanelList<ReconciliationJob>(
          "/api/v1/intelligence/reconciliations",
          "reconciliations",
          "reconciliation-intelligence-svc",
        ),
      );
    } catch (e) {
      setRecords([]);
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
          <GitMerge className="h-4 w-4 text-purple-500" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Reconciliation Intelligence</p>
          <code className="text-[10px] font-mono text-slate-400">reconciliation-intelligence-svc</code>
        </div>
        <button
          id="recon-refresh-btn"
          onClick={load}
          disabled={loading}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-800"
          aria-label="Refresh reconciliation data"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="p-5">
        <div className="mb-4">
          <ReconciliationCreateForm onCreated={load} />
        </div>

        {error && (
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">{error}</p>
        )}

        {!error && !loading && records.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
            No reconciliation records found — reconciliation-intelligence-svc returned an empty register.
          </p>
        )}

        {records.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 dark:text-slate-500">
                <th className="pb-2 font-medium">Job</th>
                <th className="pb-2 font-medium">Source</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Unmatched</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {records.map((r) => (
                <tr key={r.id} className="text-slate-700 dark:text-slate-300">
                  <td className="py-2 truncate max-w-[120px]">{r.job_name}</td>
                  <td className="py-2 truncate max-w-[120px]">{r.source_system_a.replace(/_/g, " ")}</td>
                  <td className="py-2">
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLES[r.status] ?? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums font-mono">
                    {r.unmatched_count > 0
                      ? `${r.unmatched_count} of ${r.total_processed_count}`
                      : <span className="text-emerald-600 dark:text-emerald-400">0 of {r.total_processed_count}</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
