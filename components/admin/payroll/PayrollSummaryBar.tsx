"use client";

import { useState, useEffect } from "react";
import { Wallet, DollarSign, Percent, AlertCircle } from "lucide-react";

type Kpi = {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  accent: string;
  bg: string;
};

function useLivePayrollKpis(): { kpis: Kpi[]; loading: boolean } {
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetch_() {
      try {
        const [runsRes, structsRes, exceptionsRes] = await Promise.allSettled([
          fetch("/api/v1/payroll-runs", { signal: AbortSignal.timeout(5000) }),
          fetch("/api/v1/compensation/structures", { signal: AbortSignal.timeout(5000) }),
          fetch("/api/v1/payroll-exceptions", { signal: AbortSignal.timeout(5000) }),
        ]);
        if (cancelled) return;

        const runsJson = runsRes.status === "fulfilled" && runsRes.value.ok
          ? await runsRes.value.json().catch(() => ({ payroll_runs: [] }))
          : { payroll_runs: [] };
        const structsJson = structsRes.status === "fulfilled" && structsRes.value.ok
          ? await structsRes.value.json().catch(() => ({ structures: [] }))
          : { structures: [] };
        const exceptionsJson = exceptionsRes.status === "fulfilled" && exceptionsRes.value.ok
          ? await exceptionsRes.value.json().catch(() => ({ exceptions: [] }))
          : { exceptions: [] };

        const runs: Array<{ status?: string; net_pay_amount?: number }> = runsJson.payroll_runs ?? [];
        const structs: Array<Record<string, unknown>> = structsJson.structures ?? [];
        const exceptions: Array<{ status?: string }> = exceptionsJson.exceptions ?? [];
        const openExceptions = exceptions.filter((e) => !e.status || e.status === "OPEN").length;

        if (!cancelled) {
          setKpis([
            {
              icon: Wallet,
              label: "Payroll Runs",
              value: String(runs.length),
              sub: `${structs.length} compensation structures configured`,
              accent: "text-emerald-600 dark:text-emerald-400",
              bg: "bg-emerald-100 dark:bg-emerald-500/20",
            },
            {
              icon: Percent,
              label: "Compensation Structures",
              value: String(structs.length),
              sub: "Salary grades and benefit plans",
              accent: "text-blue-600 dark:text-blue-400",
              bg: "bg-blue-100 dark:bg-blue-500/20",
            },
            {
              icon: DollarSign,
              label: "Total Runs Processed",
              value: String(runs.length),
              sub: "From payroll-run-svc",
              accent: "text-purple-600 dark:text-purple-400",
              bg: "bg-purple-100 dark:bg-purple-500/20",
            },
            {
              icon: AlertCircle,
              label: "Payroll Exceptions",
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

export function PayrollSummaryBar() {
  const { kpis, loading } = useLivePayrollKpis();

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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Payroll KPI summary">
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
