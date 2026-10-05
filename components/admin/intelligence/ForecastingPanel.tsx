"use client";

import { useState, useEffect } from "react";
import { TrendingUp, RefreshCw } from "lucide-react";

type Forecast = {
  forecast_id: string;
  model_type: string;
  domain: string;
  period: string;
  accuracy_score: number;
  status: string;
  generated_at: string;
};

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  RUNNING: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  PENDING: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
  FAILED: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

export function ForecastingPanel() {
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/intelligence/forecasts", { signal: AbortSignal.timeout(5000) });
      const json = await res.json().catch(() => ({ forecasts: [] }));
      setForecasts(json.forecasts ?? []);
    } catch {
      setError("forecasting-svc (:8161) could not be reached.");
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
          <code className="text-[10px] font-mono text-slate-400">forecasting-svc :8161</code>
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
                <th className="pb-2 font-medium text-right">Accuracy</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {forecasts.map((f) => (
                <tr key={f.forecast_id} className="text-slate-700 dark:text-slate-300">
                  <td className="py-2 font-medium">{f.domain}</td>
                  <td className="py-2">{f.period}</td>
                  <td className="py-2 font-mono text-[10px] text-slate-500">{f.model_type.replace(/_/g, " ")}</td>
                  <td className="py-2 text-right tabular-nums">
                    {f.accuracy_score != null ? `${Math.round(f.accuracy_score * 100)}%` : "—"}
                  </td>
                  <td className="py-2">
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLES[f.status] ?? STATUS_STYLES.PENDING}`}>
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
