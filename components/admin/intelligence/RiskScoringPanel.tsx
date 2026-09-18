"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, RefreshCw } from "lucide-react";

type RiskScore = {
  score_id: string;
  legal_entity_id: string;
  risk_score: number;
  risk_level: string;
  factors: string[];
  evaluated_at: string;
  valid_until: string;
};

const LEVEL_STYLES: Record<string, { bar: string; badge: string }> = {
  LOW: { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" },
  MEDIUM: { bar: "bg-amber-500", badge: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" },
  HIGH: { bar: "bg-orange-500", badge: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400" },
  CRITICAL: { bar: "bg-red-500", badge: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400" },
};

export function RiskScoringPanel() {
  const [scores, setScores] = useState<RiskScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/intelligence/risk-scores", { signal: AbortSignal.timeout(5000) });
      const json = await res.json().catch(() => ({ scores: [] }));
      setScores(json.scores ?? []);
    } catch {
      setError("compliance-risk-scoring-svc (:8162) could not be reached.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-violet-500" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Compliance Risk Scores</p>
          <code className="text-[10px] font-mono text-slate-400">compliance-risk-scoring-svc :8162</code>
        </div>
        <button
          id="risk-score-refresh-btn"
          onClick={load}
          disabled={loading}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-800"
          aria-label="Refresh risk score data"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="p-5">
        {error && (
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">{error}</p>
        )}

        {!error && !loading && scores.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
            No risk scores found — compliance-risk-scoring-svc returned an empty register.
          </p>
        )}

        {scores.length > 0 && (
          <div className="space-y-4">
            {scores.map((sc) => {
              const style = LEVEL_STYLES[sc.risk_level] ?? LEVEL_STYLES.MEDIUM;
              const pct = Math.min(sc.risk_score, 100);
              return (
                <div key={sc.score_id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 font-mono">
                        {sc.legal_entity_id.slice(0, 8)}…
                      </p>
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${style.badge}`}>
                        {sc.risk_level}
                      </span>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-slate-800 dark:text-slate-200">
                      {sc.risk_score}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-1.5 rounded-full transition-all ${style.bar}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {sc.factors.length > 0 && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      Factors: {sc.factors.join(", ")}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                    Valid until {new Date(sc.valid_until).toLocaleDateString()}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
