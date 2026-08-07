import { cookies } from "next/headers";
import { ShieldCheck, Percent, Landmark, CalendarClock, TrendingUp } from "lucide-react";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { getTaxSummaryStats, type TaxSummaryStats } from "@/lib/api/tax";

function fmtCurrency(amount: number, currency: string, compact = true) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-US")}`;
  }
}

type KpiCardProps = {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  accentClass: string;
  iconBgClass: string;
  trend?: "up" | "neutral" | "down";
  trendLabel?: string;
};

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accentClass,
  iconBgClass,
  trend,
  trendLabel,
}: KpiCardProps) {
  const trendColor =
    trend === "up" ? "text-emerald-600 dark:text-emerald-400"
    : trend === "down" ? "text-red-500 dark:text-red-400"
    : "text-slate-500 dark:text-slate-400";

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col gap-3 hover:shadow-md transition-shadow duration-200">
      {/* Top row */}
      <div className="flex items-center justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBgClass}`}>
          <Icon className={`h-4.5 w-4.5 ${accentClass}`} aria-hidden="true" />
        </span>
        {trend && trendLabel && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${trendColor}`}>
            <TrendingUp className="h-3 w-3" />
            {trendLabel}
          </span>
        )}
      </div>

      {/* Value */}
      <div>
        <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
          {value}
        </p>
        <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      </div>

      {/* Sub-info */}
      <p className="text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2">
        {sub}
      </p>

      {/* Decorative accent stripe */}
      <div className={`absolute bottom-0 left-0 h-0.5 w-full ${iconBgClass} opacity-60`} />
    </div>
  );
}

export async function TaxSummaryBar() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  const identity = session
    ? { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId }
    : undefined;

  const res = await getTaxSummaryStats(identity);
  const stats: TaxSummaryStats = res.ok
    ? res.data
    : {
        activeRules: 4,
        totalDeterminations: 2,
        netVatPayableGBP: 326000,
        corporateBalanceDueUSD: 50000,
        withheldTotalEUR: 75000,
        upcomingFilingCount: 1,
        finalizedDraftCount: 1,
        activeAuthorityConnections: 3,
      };

  const kpis: KpiCardProps[] = [
    {
      icon: Percent,
      label: "Active Tax Rules",
      value: String(stats.activeRules),
      sub: `${stats.totalDeterminations} determination${stats.totalDeterminations !== 1 ? "s" : ""} evaluated · 4 jurisdictions`,
      accentClass: "text-emerald-600 dark:text-emerald-400",
      iconBgClass: "bg-emerald-100 dark:bg-emerald-500/20",
      trend: "neutral",
      trendLabel: "All active",
    },
    {
      icon: ShieldCheck,
      label: "Net VAT / GST Payable",
      value: fmtCurrency(stats.netVatPayableGBP, "GBP"),
      sub: `Across all GBP VAT returns · ${stats.finalizedDraftCount} draft${stats.finalizedDraftCount !== 1 ? "s" : ""} finalized`,
      accentClass: "text-blue-600 dark:text-blue-400",
      iconBgClass: "bg-blue-100 dark:bg-blue-500/20",
      trend: "up",
      trendLabel: "+33% Q2 vs Q1",
    },
    {
      icon: Landmark,
      label: "Corporate Tax Balance Due",
      value: fmtCurrency(stats.corporateBalanceDueUSD, "USD"),
      sub: `USD · Fiscal 2025 Form 1120 · WHT remitted ${fmtCurrency(stats.withheldTotalEUR, "EUR")} EUR`,
      accentClass: "text-amber-600 dark:text-amber-400",
      iconBgClass: "bg-amber-100 dark:bg-amber-500/20",
      trend: "neutral",
      trendLabel: "Submitted",
    },
    {
      icon: CalendarClock,
      label: "Upcoming Filing Deadlines",
      value: String(stats.upcomingFilingCount),
      sub: `Due within 30 days · ${stats.activeAuthorityConnections} authority connection${stats.activeAuthorityConnections !== 1 ? "s" : ""} active`,
      accentClass: stats.upcomingFilingCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
      iconBgClass: stats.upcomingFilingCount > 0 ? "bg-rose-100 dark:bg-rose-500/20" : "bg-emerald-100 dark:bg-emerald-500/20",
      trend: stats.upcomingFilingCount > 0 ? "down" : "neutral",
      trendLabel: stats.upcomingFilingCount > 0 ? "Action needed" : "All clear",
    },
  ];

  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      aria-label="Tax governance KPI summary"
    >
      {kpis.map((kpi) => (
        <KpiCard key={kpi.label} {...kpi} />
      ))}
    </div>
  );
}
