"use client";

import { useState, useEffect } from "react";
import { TrendingUp, RefreshCw } from "lucide-react";
import { fetchPanelList } from "@/lib/panel-fetch";
import { ForecastCreateForm } from "./IntelligenceCreateForms";
import type { Forecast } from "@/lib/api/intelligence";

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  APPROVED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  REVIEWED: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  CALCULATED: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
  SUPERSEDED: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
  ARCHIVED: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
};

export function ForecastingPanel() {
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setForecasts(await fetchPanelList<Forecast>("/api/v1/intelligence/forecasts", "forecasts", "forecasting-svc"));
    } catch (e) {
      setForecasts([]);
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
          <TrendingUp className="h-4 w-4 text-blue-500" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Forecasting</p>
          <code className="text-[10px] font-mono text-slate-400">forecasting-svc</code>
        </div>
        <button
          id="forecast-refresh-btn"
          onClick={load}
          disabled={loading}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-800"
          aria-label="Refresh forecast data"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="p-5">
        <div className="mb-4">
          <ForecastCreateForm onCreated={load} />
        </div>

        {error && (
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">{error}</p>
        )}

        {!error && !loading && forecasts.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
            No forecasts found — forecasting-svc returned an empty register.
          </p>
        )}

        {forecasts.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 dark:text-slate-500">
                <th className="pb-2 font-medium">Domain</th>
                <th className="pb-2 font-medium">Period</th>
                <th className="pb-2 font-medium">Model</th>
                <th className="pb-2 font-medium text-right">Confidence</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {forecasts.map((f) => (
                <tr key={f.id} className="text-slate-700 dark:text-slate-300">
                  <td className="py-2 font-medium">{f.domain.replace(/_/g, " ")}</td>
                  <td className="py-2">
                    {f.historical_start_date} → {f.historical_end_date} · {f.horizon_periods} {f.granularity.toLowerCase()} periods
                  </td>
                  <td className="py-2 font-mono text-[10px] text-slate-500">
                    {f.model_name} · {f.algorithm_type.replace(/_/g, " ")}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {f.confidence_level != null ? `${f.confidence_level}%` : "—"}
                  </td>
                  <td className="py-2">
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLES[f.status] ?? STATUS_STYLES.CALCULATED}`}>
                      {f.status}
                    </span>
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
