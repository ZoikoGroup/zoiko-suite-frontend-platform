import { cookies } from "next/headers";
import { Users, Calendar, UserCheck, ShieldCheck, TrendingUp } from "lucide-react";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

export async function HrSummaryBar() {
  const store = await cookies();
  const _session = decodeSession(store.get(SESSION_COOKIE)?.value);

  const kpis = [
    {
      icon: Users,
      label: "Total Active Workforce",
      value: "240",
      sub: "185 Full-time · 55 Contractors",
      accent: "text-teal-600 dark:text-teal-400",
      bg: "bg-teal-100 dark:bg-teal-500/20",
      trend: "+12 this month",
    },
    {
      icon: Calendar,
      label: "Pending Leave Requests",
      value: "4",
      sub: "2 Annual Leave · 2 Study Leave",
      accent: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-100 dark:bg-amber-500/20",
      trend: "Under review",
    },
    {
      icon: UserCheck,
      label: "Right-to-Work Verified",
      value: "100%",
      sub: "Passport & Visa checks up-to-date",
      accent: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-100 dark:bg-emerald-500/20",
      trend: "Compliant",
    },
    {
      icon: ShieldCheck,
      label: "Open Job Positions",
      value: "8",
      sub: "Engineering, Product & Sales",
      accent: "text-indigo-600 dark:text-indigo-400",
      bg: "bg-indigo-100 dark:bg-indigo-500/20",
      trend: "Hiring active",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="HR KPI summary">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col gap-3 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${kpi.bg}`}>
              <kpi.icon className={`h-4.5 w-4.5 ${kpi.accent}`} aria-hidden="true" />
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-3 w-3" />
              {kpi.trend}
            </span>
          </div>
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
