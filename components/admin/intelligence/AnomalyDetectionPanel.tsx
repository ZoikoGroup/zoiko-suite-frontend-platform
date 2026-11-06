"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { fetchPanelList } from "@/lib/panel-fetch";
import { AnomalyRuleSection } from "./IntelligenceCreateForms";
import type { Anomaly } from "@/lib/api/intelligence";

/** Statuses that still need someone's attention. */
const UNRESOLVED = new Set(["OPEN", "UNDER_INVESTIGATION", "CONFIRMED_ANOMALY"]);

const SEVERITY_STYLES: Record<string, { badge: string; dot: string }> = {
  CRITICAL: { badge: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300", dot: "bg-red-500" },
  HIGH: { badge: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300", dot: "bg-orange-500" },
  MEDIUM: { badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300", dot: "bg-amber-500" },
  LOW: { badge: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300", dot: "bg-slate-400" },
};

export function AnomalyDetectionPanel() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setAnomalies(await fetchPanelList<Anomaly>("/api/v1/intelligence/anomalies", "anomalies", "anomaly-detection-svc"));
    } catch (e) {
      setAnomalies([]);
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
          <AlertTriangle className="h-4 w-4 text-red-500" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Anomaly Detection</p>
          <code className="text-[10px] font-mono text-slate-400">anomaly-detection-svc</code>
        </div>
        <button
          id="anomaly-refresh-btn"
          onClick={load}
          disabled={loading}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-800"
          aria-label="Refresh anomaly data"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="p-5">
        <div className="mb-4">
          <AnomalyRuleSection onCreated={load} />
        </div>

        {error && (
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">{error}</p>
        )}

        {!error && !loading && anomalies.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
            No anomalies detected — anomaly-detection-svc returned an empty register.
          </p>
        )}

        {anomalies.length > 0 && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {anomalies.map((a) => {
              const style = SEVERITY_STYLES[a.severity] ?? SEVERITY_STYLES.LOW;
              return (
                <div key={a.anomaly_id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {a.domain_name.replace(/_/g, " ")}
                      </p>
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${style.badge}`}>
                        {a.severity}
                      </span>
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        UNRESOLVED.has(a.status)
                          ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                          : "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                      }`}>
                        {a.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{a.description}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                      Observed {a.observed_value} vs expected {a.expected_value} · score {a.anomaly_score} · {a.source_entity_id} · {new Date(a.detected_at).toLocaleString()}
                    </p>
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
