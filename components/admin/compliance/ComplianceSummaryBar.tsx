"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, FileCheck, ShieldAlert, AlertTriangle } from "lucide-react";

type Kpi = {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  accent: string;
  bg: string;
};

function useLiveComplianceKpis(): { kpis: Kpi[]; loading: boolean } {
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetch_() {
      try {
        const [reqsRes, evalsRes, excRes] = await Promise.allSettled([
          fetch("/api/v1/filing-tracker/requirements", { signal: AbortSignal.timeout(5000) }),
          fetch("/api/v1/compliance-status", { signal: AbortSignal.timeout(5000) }),
          fetch("/api/v1/exception-escalation/exceptions", { signal: AbortSignal.timeout(5000) }),
        ]);
        if (cancelled) return;

        const reqsJson = reqsRes.status === "fulfilled" && reqsRes.value.ok
          ? await reqsRes.value.json().catch(() => ({ requirements: [] }))
          : { requirements: [] };
        const evalsJson = evalsRes.status === "fulfilled" && evalsRes.value.ok
          ? await evalsRes.value.json().catch(() => ({ evaluations: [] }))
          : { evaluations: [] };
        const excJson = excRes.status === "fulfilled" && excRes.value.ok
          ? await excRes.value.json().catch(() => ({ exceptions: [] }))
          : { exceptions: [] };

        const requirements: Array<{ status?: string }> = reqsJson.requirements ?? [];
        const evaluations: Array<{ status?: string; compliance_score?: number }> = evalsJson.evaluations ?? [];
        const exceptions: Array<{ status?: string }> = excJson.exceptions ?? [];
        const openExceptions = exceptions.filter((e) => !e.status || e.status === "OPEN" || e.status === "ESCALATED").length;
        const totalReqs = requirements.length;
        const totalEvals = evaluations.length;

        if (!cancelled) {
          setKpis([
            {
              icon: ShieldCheck,
              label: "Compliance Evaluations",
              value: String(totalEvals),
              sub: `${totalReqs} filing requirements tracked`,
              accent: "text-emerald-600 dark:text-emerald-400",
              bg: "bg-emerald-100 dark:bg-emerald-500/20",
            },
            {
              icon: FileCheck,
              label: "Filing Requirements",
              value: String(totalReqs),
              sub: "From filing-tracker-svc",
              accent: "text-blue-600 dark:text-blue-400",
              bg: "bg-blue-100 dark:bg-blue-500/20",
            },
            {
              icon: ShieldAlert,
              label: "Evidence Manifests",
              value: String(totalEvals),
              sub: "Verified compliance evaluations",
              accent: "text-purple-600 dark:text-purple-400",
              bg: "bg-purple-100 dark:bg-purple-500/20",
            },
            {
              icon: AlertTriangle,
              label: "Escalated Exceptions",
              value: String(openExceptions),
              sub: `${exceptions.length} total exceptions`,
              accent: openExceptions > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
              bg: openExceptions > 0 ? "bg-amber-100 dark:bg-amber-500/20" : "bg-emerald-100 dark:bg-emerald-500/20",
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

export function ComplianceSummaryBar() {
  const { kpis, loading } = useLiveComplianceKpis();

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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Compliance KPI summary">
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
