"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, TrendingUp, ShieldCheck, GitMerge, BarChart2, Lightbulb, ArrowLeftRight } from "lucide-react";

type Kpi = {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  accent: string;
  bg: string;
};

function useIntelligenceKpis(): { kpis: Kpi[]; loading: boolean } {
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetch_() {
      try {
        const [anomaliesRes, forecastsRes, scoresRes, reconRes] = await Promise.allSettled([
          fetch("/api/v1/intelligence/anomalies", { signal: AbortSignal.timeout(5000) }),
          fetch("/api/v1/intelligence/forecasts", { signal: AbortSignal.timeout(5000) }),
          fetch("/api/v1/intelligence/risk-scores", { signal: AbortSignal.timeout(5000) }),
          fetch("/api/v1/intelligence/reconciliations", { signal: AbortSignal.timeout(5000) }),
        ]);
        if (cancelled) return;

        const anomaliesJson = anomaliesRes.status === "fulfilled" && anomaliesRes.value.ok
          ? await anomaliesRes.value.json().catch(() => ({ anomalies: [], total: 0 }))
          : { anomalies: [], total: 0 };
        const forecastsJson = forecastsRes.status === "fulfilled" && forecastsRes.value.ok
          ? await forecastsRes.value.json().catch(() => ({ forecasts: [], total: 0 }))
          : { forecasts: [], total: 0 };
        const scoresJson = scoresRes.status === "fulfilled" && scoresRes.value.ok
          ? await scoresRes.value.json().catch(() => ({ scores: [], total: 0 }))
          : { scores: [], total: 0 };
        const reconJson = reconRes.status === "fulfilled" && reconRes.value.ok
          ? await reconRes.value.json().catch(() => ({ reconciliations: [], total: 0 }))
          : { reconciliations: [], total: 0 };

        const anomalies: Array<{ severity?: string; status?: string }> = anomaliesJson.anomalies ?? [];
        const openAnomalies = anomalies.filter((a) => a.status === "OPEN").length;
        const criticalAnomalies = anomalies.filter((a) => a.severity === "CRITICAL" || a.severity === "HIGH").length;
        const forecasts: Array<{ status?: string; accuracy_score?: number }> = forecastsJson.forecasts ?? [];
        const avgAccuracy = forecasts.length > 0
          ? Math.round(forecasts.reduce((s, f) => s + (f.accuracy_score ?? 0), 0) / forecasts.length * 100)
          : 0;
        const scores: Array<{ risk_score?: number }> = scoresJson.scores ?? [];
        const avgRisk = scores.length > 0
          ? Math.round(scores.reduce((s, sc) => s + (sc.risk_score ?? 0), 0) / scores.length)
          : 0;
        const recons: Array<{ match_status?: string }> = reconJson.reconciliations ?? [];
        const matched = recons.filter((r) => r.match_status === "MATCHED").length;

        if (!cancelled) {
          setKpis([
            {
              icon: AlertTriangle,
              label: "Open Anomalies",
              value: String(openAnomalies),
              sub: `${criticalAnomalies} critical / high severity`,
              accent: openAnomalies > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400",
              bg: openAnomalies > 0 ? "bg-red-100 dark:bg-red-500/20" : "bg-emerald-100 dark:bg-emerald-500/20",
            },
            {
              icon: TrendingUp,
              label: "Forecast Accuracy",
              value: forecasts.length > 0 ? `${avgAccuracy}%` : "—",
              sub: `${forecasts.length} forecasting models tracked`,
              accent: "text-blue-600 dark:text-blue-400",
              bg: "bg-blue-100 dark:bg-blue-500/20",
            },
            {
              icon: ShieldCheck,
              label: "Avg. Risk Score",
              value: scores.length > 0 ? String(avgRisk) : "—",
              sub: `${scores.length} entities evaluated`,
              accent: avgRisk > 70 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
              bg: avgRisk > 70 ? "bg-amber-100 dark:bg-amber-500/20" : "bg-emerald-100 dark:bg-emerald-500/20",
            },
            {
              icon: GitMerge,
              label: "Reconciled Records",
              value: String(matched),
              sub: `of ${recons.length} total reconciliations`,
              accent: "text-purple-600 dark:text-purple-400",
              bg: "bg-purple-100 dark:bg-purple-500/20",
            },
          ]);
        }
      } catch {
        if (!cancelled) setLoading(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetch_();
    const interval = setInterval(fetch_, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { kpis, loading };
}

export function IntelligenceSummaryBar() {
  const { kpis, loading } = useIntelligenceKpis();

  if (loading && kpis.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 animate-pulse h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Intelligence & Reporting KPI summary">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col gap-3 hover:shadow-md transition-shadow"
        >
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${kpi.bg}`}>
            <kpi.icon className={`h-4.5 w-4.5 ${kpi.accent}`} aria-hidden="true" />
          </span>
          <div>
            <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
              {kpi.value}
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.label}</p>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2">
            {kpi.sub}
          </p>
          <div className={`absolute bottom-0 left-0 h-0.5 w-full ${kpi.bg} opacity-60`} />
        </div>
      ))}
    </div>
  );
}
