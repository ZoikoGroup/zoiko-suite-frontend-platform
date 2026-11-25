"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, TrendingUp, ShieldCheck, GitMerge } from "lucide-react";
import { fetchPanelListOrNull } from "@/lib/panel-fetch";

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
        const [anomalies, forecasts, scores, recons] = await Promise.all([
          fetchPanelListOrNull<{ severity?: string; status?: string }>("/api/v1/intelligence/anomalies", "anomalies"),
          fetchPanelListOrNull<{ confidence_level?: number }>("/api/v1/intelligence/forecasts", "forecasts"),
          fetchPanelListOrNull<{ composite_risk_score?: string }>("/api/v1/intelligence/risk-scores", "scores"),
          fetchPanelListOrNull<{ unmatched_count?: number; total_processed_count?: number }>(
            "/api/v1/intelligence/reconciliations",
            "reconciliations",
          ),
        ]);
        if (cancelled) return;

        // A tile whose read failed says so; it never shows 0 or a green state.
        const unavailable = (label: string, icon: Kpi["icon"], svc: string): Kpi => ({
          icon,
          label,
          value: "Unavailable",
          sub: `${svc} could not be read`,
          accent: "text-amber-600 dark:text-amber-400",
          bg: "bg-amber-100 dark:bg-amber-500/20",
        });

        const unresolved = new Set(["OPEN", "UNDER_INVESTIGATION", "CONFIRMED_ANOMALY"]);
        const openAnomalies = anomalies?.filter((a) => a.status && unresolved.has(a.status)).length ?? 0;
        const criticalAnomalies = anomalies?.filter((a) => a.severity === "CRITICAL" || a.severity === "HIGH").length ?? 0;
        const avgConfidence = forecasts && forecasts.length > 0
          ? Math.round(forecasts.reduce((s, f) => s + (f.confidence_level ?? 0), 0) / forecasts.length)
          : null;
        const riskValues = (scores ?? []).map((s) => Number.parseFloat(s.composite_risk_score ?? "")).filter(Number.isFinite);
        const avgRisk = riskValues.length > 0 ? Math.round(riskValues.reduce((a, b) => a + b, 0) / riskValues.length) : null;
        const unmatched = recons?.reduce((s, r) => s + (r.unmatched_count ?? 0), 0) ?? 0;
        const processed = recons?.reduce((s, r) => s + (r.total_processed_count ?? 0), 0) ?? 0;

        if (!cancelled) {
          setKpis([
            anomalies
              ? {
                  icon: AlertTriangle,
                  label: "Open Anomalies",
                  value: String(openAnomalies),
                  sub: `${criticalAnomalies} critical / high severity`,
                  accent: openAnomalies > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400",
                  bg: openAnomalies > 0 ? "bg-red-100 dark:bg-red-500/20" : "bg-emerald-100 dark:bg-emerald-500/20",
                }
              : unavailable("Open Anomalies", AlertTriangle, "anomaly-detection-svc"),
            forecasts
              ? {
                  icon: TrendingUp,
                  label: "Forecast Confidence",
                  value: avgConfidence != null ? `${avgConfidence}%` : "—",
                  sub: `${forecasts.length} forecasts`,
                  accent: "text-blue-600 dark:text-blue-400",
                  bg: "bg-blue-100 dark:bg-blue-500/20",
                }
              : unavailable("Forecast Confidence", TrendingUp, "forecasting-svc"),
            scores
              ? {
                  icon: ShieldCheck,
                  label: "Avg. Risk Score",
                  value: avgRisk != null ? String(avgRisk) : "—",
                  sub: `${scores.length} scores evaluated`,
                  accent: (avgRisk ?? 0) > 70 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
                  bg: (avgRisk ?? 0) > 70 ? "bg-amber-100 dark:bg-amber-500/20" : "bg-emerald-100 dark:bg-emerald-500/20",
                }
              : unavailable("Avg. Risk Score", ShieldCheck, "compliance-risk-scoring-svc"),
            recons
              ? {
                  icon: GitMerge,
                  label: "Unmatched Items",
                  value: String(unmatched),
                  sub: `of ${processed} processed in ${recons.length} analyses`,
                  accent: "text-purple-600 dark:text-purple-400",
                  bg: "bg-purple-100 dark:bg-purple-500/20",
                }
              : unavailable("Unmatched Items", GitMerge, "reconciliation-intelligence-svc"),
          ]);
        }
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
