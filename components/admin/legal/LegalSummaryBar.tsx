"use client";

import { useState, useEffect } from "react";
import { Scale, FileText, CheckSquare, Vote } from "lucide-react";

type Kpi = {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  accent: string;
  bg: string;
};

function useLiveLegalKpis(): { kpis: Kpi[]; loading: boolean } {
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetch_() {
      try {
        const [contractsRes, clausesRes, obligationsRes, resolutionsRes] = await Promise.allSettled([
          fetch("/api/v1/contracts", { signal: AbortSignal.timeout(5000) }),
          fetch("/api/v1/clauses", { signal: AbortSignal.timeout(5000) }),
          fetch("/api/v1/obligations", { signal: AbortSignal.timeout(5000) }),
          fetch("/api/v1/resolutions", { signal: AbortSignal.timeout(5000) }),
        ]);
        if (cancelled) return;

        const contractsJson = contractsRes.status === "fulfilled" && contractsRes.value.ok
          ? await contractsRes.value.json().catch(() => ({ contracts: [] }))
          : { contracts: [] };
        const clausesJson = clausesRes.status === "fulfilled" && clausesRes.value.ok
          ? await clausesRes.value.json().catch(() => ({ clauses: [] }))
          : { clauses: [] };
        const obligationsJson = obligationsRes.status === "fulfilled" && obligationsRes.value.ok
          ? await obligationsRes.value.json().catch(() => ({ obligations: [] }))
          : { obligations: [] };
        const resolutionsJson = resolutionsRes.status === "fulfilled" && resolutionsRes.value.ok
          ? await resolutionsRes.value.json().catch(() => ({ resolutions: [] }))
          : { resolutions: [] };

        const contracts: Array<Record<string, unknown>> = contractsJson.contracts ?? [];
        const clauses: Array<Record<string, unknown>> = clausesJson.clauses ?? [];
        const obligations: Array<Record<string, unknown>> = obligationsJson.obligations ?? [];
        const resolutions: Array<Record<string, unknown>> = resolutionsJson.resolutions ?? [];

        if (!cancelled) {
          setKpis([
            {
              icon: FileText,
              label: "Active Contracts",
              value: String(contracts.length),
              sub: "From contract-lifecycle-svc",
              accent: "text-indigo-600 dark:text-indigo-400",
              bg: "bg-indigo-100 dark:bg-indigo-500/20",
            },
            {
              icon: Scale,
              label: "Clause Library",
              value: String(clauses.length),
              sub: "Pre-vetted templates & terms",
              accent: "text-purple-600 dark:text-purple-400",
              bg: "bg-purple-100 dark:bg-purple-500/20",
            },
            {
              icon: CheckSquare,
              label: "Tracked Obligations",
              value: String(obligations.length),
              sub: "Compliance & SLA tracking",
              accent: "text-amber-600 dark:text-amber-400",
              bg: "bg-amber-100 dark:bg-amber-500/20",
            },
            {
              icon: Vote,
              label: "Board Resolutions",
              value: String(resolutions.length),
              sub: "From board-resolutions-svc",
              accent: "text-emerald-600 dark:text-emerald-400",
              bg: "bg-emerald-100 dark:bg-emerald-500/20",
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

export function LegalSummaryBar() {
  const { kpis, loading } = useLiveLegalKpis();

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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Legal KPI summary">
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
