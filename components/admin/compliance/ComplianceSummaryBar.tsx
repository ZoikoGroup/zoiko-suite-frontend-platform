import { cookies } from "next/headers";
import { ShieldCheck, FileCheck, ShieldAlert, AlertTriangle, TrendingUp } from "lucide-react";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

export async function ComplianceSummaryBar() {
  const store = await cookies();
  const _session = decodeSession(store.get(SESSION_COOKIE)?.value);

  const kpis = [
    {
      icon: ShieldCheck,
      label: "Statutory Compliance Score",
      value: "96.5%",
      sub: "Evaluated across all active jurisdictions",
      accent: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-100 dark:bg-emerald-500/20",
      trend: "Optimal",
    },
    {
      icon: FileCheck,
      label: "Statutory Filing Requirements",
      value: "14",
      sub: "8 Annual · 4 Quarterly · 2 Monthly",
      accent: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-100 dark:bg-blue-500/20",
      trend: "Tracked",
    },
    {
      icon: ShieldAlert,
      label: "Verified Evidence Manifests",
      value: "38",
      sub: "Cryptographically verified audit files",
      accent: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-100 dark:bg-purple-500/20",
      trend: "Hash valid",
    },
    {
      icon: AlertTriangle,
      label: "Escalated Exceptions",
      value: "1 Open",
      sub: "Level 1 SLA breach warning",
      accent: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-100 dark:bg-amber-500/20",
      trend: "Attention",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Compliance KPI summary">
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
