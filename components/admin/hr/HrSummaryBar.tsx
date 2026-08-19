"use client";

import { useState, useEffect } from "react";
import { Users, Calendar, UserCheck, ShieldCheck } from "lucide-react";

type Kpi = {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  accent: string;
  bg: string;
};

function useLiveHrKpis(): { kpis: Kpi[]; loading: boolean } {
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetch_() {
      try {
        const [empRes, leaveRes] = await Promise.allSettled([
          fetch("/api/v1/employees", { signal: AbortSignal.timeout(5000) }),
          fetch("/api/v1/leave/requests", { signal: AbortSignal.timeout(5000) }),
        ]);
        if (cancelled) return;

        const empJson = empRes.status === "fulfilled" && empRes.value.ok
          ? await empRes.value.json().catch(() => ({ employees: [] }))
          : { employees: [] };
        const leaveJson = leaveRes.status === "fulfilled" && leaveRes.value.ok
          ? await leaveRes.value.json().catch(() => ({ requests: [] }))
          : { requests: [] };

        const employees: Array<{ status?: string }> = empJson.employees ?? [];
        const requests: Array<{ status?: string }> = leaveJson.requests ?? [];
        const active = employees.filter((e) => !e.status || e.status === "ACTIVE").length;
        const pendingLeave = requests.filter((r) => !r.status || r.status === "PENDING").length;

        if (!cancelled) {
          setKpis([
            {
              icon: Users,
              label: "Total Active Workforce",
              value: String(active || employees.length),
              sub: `${employees.length} total employees`,
              accent: "text-teal-600 dark:text-teal-400",
              bg: "bg-teal-100 dark:bg-teal-500/20",
            },
            {
              icon: Calendar,
              label: "Pending Leave Requests",
              value: String(pendingLeave),
              sub: `${requests.length} total requests`,
              accent: "text-amber-600 dark:text-amber-400",
              bg: "bg-amber-100 dark:bg-amber-500/20",
            },
            {
              icon: UserCheck,
              label: "Employee Records",
              value: String(employees.length),
              sub: "Loaded from employee-master-svc",
              accent: "text-emerald-600 dark:text-emerald-400",
              bg: "bg-emerald-100 dark:bg-emerald-500/20",
            },
            {
              icon: ShieldCheck,
              label: "Departments",
              value: "—",
              sub: "View org structure for details",
              accent: "text-indigo-600 dark:text-indigo-400",
              bg: "bg-indigo-100 dark:bg-indigo-500/20",
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

export function HrSummaryBar() {
  const { kpis, loading } = useLiveHrKpis();

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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="HR KPI summary">
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
