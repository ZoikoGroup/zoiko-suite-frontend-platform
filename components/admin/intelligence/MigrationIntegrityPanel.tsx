"use client";

import { useState, useEffect } from "react";
import { ArrowLeftRight, RefreshCw } from "lucide-react";
import { fetchPanelList } from "@/lib/panel-fetch";
import type { MigrationJob } from "@/lib/api/intelligence";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
  RUNNING: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  COMPLETED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  FAILED: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

export function MigrationIntegrityPanel() {
  const [jobs, setJobs] = useState<MigrationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setJobs(await fetchPanelList<MigrationJob>("/api/v1/intelligence/migrations", "jobs", "migration-integrity-svc"));
    } catch (e) {
      setJobs([]);
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
          <ArrowLeftRight className="h-4 w-4 text-teal-500" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Migration Integrity</p>
          <code className="text-[10px] font-mono text-slate-400">migration-integrity-svc</code>
        </div>
        <button
          id="migration-refresh-btn"
          onClick={load}
          disabled={loading}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-800"
          aria-label="Refresh migration data"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="p-5">
        {error && (
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">{error}</p>
        )}

        {!error && !loading && jobs.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
            No migration jobs found — migration-integrity-svc returned an empty register.
          </p>
        )}

        {jobs.length > 0 && (
          <div className="space-y-4">
            {jobs.map((j) => {
              const progress = j.total_records_count > 0
                ? Math.round((j.valid_records_count / j.total_records_count) * 100)
                : 0;
              return (
                <div key={j.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {j.source_system} → {j.target_service}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">
                        {j.valid_records_count.toLocaleString()} / {j.total_records_count.toLocaleString()} records valid · {j.invalid_records_count} invalid · integrity {j.integrity_score} (threshold {j.integrity_score_threshold})
                      </p>
                    </div>
                    <span className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLES[j.status] ?? STATUS_STYLES.PENDING}`}>
                      {j.status}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-1.5 rounded-full transition-all ${j.invalid_records_count > 0 ? "bg-red-500" : "bg-teal-500"}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
