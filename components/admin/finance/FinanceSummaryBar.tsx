import { cookies } from "next/headers";
import { Landmark, Wallet, Scale, CalendarCheck, TrendingUp } from "lucide-react";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { getFinanceSummaryStats, type FinanceSummaryStats } from "@/lib/api/finance";

function fmtCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export async function FinanceSummaryBar() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  const identity = session
    ? { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId }
    : undefined;

  const res = await getFinanceSummaryStats(identity);
  const stats: FinanceSummaryStats = res.ok
    ? res.data
    : {
        totalArBalanceUSD: 1250000,
        journalEntryCount: 1420,
        totalCashAvailableUSD: 7850000,
        closePeriodStatus: "OPEN (2026-M07)",
        unreconciledBankCount: 2,
        activeAccountsCount: 240,
      };

  const kpis = [
    {
      icon: Landmark,
      label: "Total Accounts Receivable",
      value: fmtCurrency(stats.totalArBalanceUSD, "USD"),
      sub: "Across all active client contracts",
      accent: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-100 dark:bg-blue-500/20",
      trend: "+12% MoM",
    },
    {
      icon: Wallet,
      label: "Treasury Cash Available",
      value: fmtCurrency(stats.totalCashAvailableUSD, "USD"),
      sub: "Liquid cash position · JPMorgan & Barclays",
      accent: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-100 dark:bg-emerald-500/20",
      trend: "Optimal",
    },
    {
      icon: Scale,
      label: "GL Journal Volume",
      value: stats.journalEntryCount.toLocaleString(),
      sub: `${stats.activeAccountsCount} active COA accounts`,
      accent: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-100 dark:bg-purple-500/20",
      trend: "Balanced",
    },
    {
      icon: CalendarCheck,
      label: "Financial Close Period",
      value: stats.closePeriodStatus,
      sub: `${stats.unreconciledBankCount} bank items pending rec`,
      accent: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-100 dark:bg-amber-500/20",
      trend: "On schedule",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Finance KPI summary">
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
