"use client";

import { useState, useEffect } from "react";
import { GitMerge, RefreshCw } from "lucide-react";

type ReconciliationRecord = {
  reconciliation_id: string;
  source_a: string;
  source_b: string;
  match_status: string;
  discrepancy_amount: number;
  currency: string;
  resolved_at: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  MATCHED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  UNMATCHED: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  PARTIAL: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  EXCEPTION: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
};

export function ReconciliationIntelligencePanel() {
  const [records, setRecords] = useState<ReconciliationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/intelligence/reconciliations", { signal: AbortSignal.timeout(5000) });
      const json = await res.json().catch(() => ({ reconciliations: [] }));
      setRecords(json.reconciliations ?? []);
    } catch {
      setError("reconciliation-intelligence-svc (:8163) could not be reached.");
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
          <code className="text-[10px] font-mono text-slate-400">reconciliation-intelligence-svc :8163</code>
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
                <th className="pb-2 font-medium">Source A</th>
                <th className="pb-2 font-medium">Source B</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Discrepancy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {records.map((r) => (
                <tr key={r.reconciliation_id} className="text-slate-700 dark:text-slate-300">
                  <td className="py-2 truncate max-w-[120px]">{r.source_a}</td>
                  <td className="py-2 truncate max-w-[120px]">{r.source_b}</td>
                  <td className="py-2">
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLES[r.match_status] ?? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"}`}>
                      {r.match_status}
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums font-mono">
                    {r.discrepancy_amount !== 0
                      ? `${r.currency} ${r.discrepancy_amount.toLocaleString()}`
                      : <span className="text-emerald-600 dark:text-emerald-400">0</span>
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
