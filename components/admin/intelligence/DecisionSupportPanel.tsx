"use client";

import { useState, useEffect } from "react";
import { Lightbulb, RefreshCw } from "lucide-react";
import { fetchPanelList } from "@/lib/panel-fetch";
import { RecommendationRequestForm } from "./IntelligenceCreateForms";
import type { Recommendation } from "@/lib/api/intelligence";

const STATUS_STYLES: Record<string, string> = {
  REVIEW_REQUIRED: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  ACCEPTED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  REJECTED: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
  EXPIRED: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
  SUPERSEDED: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
};

export function DecisionSupportPanel() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRecommendations(
        await fetchPanelList<Recommendation>(
          "/api/v1/intelligence/recommendations",
          "recommendations",
          "decision-support-svc",
        ),
      );
    } catch (e) {
      setRecommendations([]);
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
          <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Decision Support</p>
          <code className="text-[10px] font-mono text-slate-400">decision-support-svc</code>
        </div>
        <button
          id="decision-refresh-btn"
          onClick={load}
          disabled={loading}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-800"
          aria-label="Refresh decision support data"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="p-5">
        <div className="mb-4">
          <RecommendationRequestForm onCreated={load} />
        </div>

        {error && (
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">{error}</p>
        )}

        {!error && !loading && recommendations.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
            No recommendations pending — decision-support-svc returned an empty register.
          </p>
        )}

        {recommendations.length > 0 && (
          <div className="space-y-3">
            {recommendations.map((r) => (
              <div key={r.recommendation_id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {r.action_type.replace(/_/g, " ")}: {r.recommended_action.replace(/_/g, " ")}
                  </p>
                  <span className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLES[r.status] ?? STATUS_STYLES.REVIEW_REQUIRED}`}>
                    {r.status.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{r.rationale}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {r.subject_type.replace(/_/g, " ")} {r.subject_reference} · {r.assurance_state.toLowerCase()}
                  </span>
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    Confidence: {Math.round(r.confidence_score * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
