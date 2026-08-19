import { cookies } from "next/headers";
import { ShieldCheck, Percent, Landmark, CalendarClock, TrendingUp, CloudOff } from "lucide-react";
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

  // The hardcoded fallback that used to sit here is gone. It substituted a set of
  // plausible tax figures — £326,000 VAT payable, $50,000 corporate balance due —
  // whenever the aggregate could not be produced, in the same tiles and the same
  // style as real ones, so an operator could not tell a computed figure from an
  // invented one. Tax numbers are the last place that should be guessed at.
  //
  // getTaxSummaryStats now also reports which of the seven sources it could not
  // read; each of those contributes zero to the totals below, so an unread source
  // makes every figure an understatement rather than a fact.
  const res = await getTaxSummaryStats(identity);

  if (!res.ok) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Tax headline figures are unavailable — {res.error.message}. No numbers are shown rather
          than substituted ones.
        </span>
      </div>
    );
  }

  const stats: TaxSummaryStats = res.data;

  const kpis: KpiCardProps[] = [
    {
      icon: Percent,
      label: "Active Tax Rules",
      value: String(stats.activeRules),
      sub: `${stats.totalDeterminations} determination${stats.totalDeterminations !== 1 ? "s" : ""} evaluated`,
      accentClass: "text-emerald-600 dark:text-emerald-400",
      iconBgClass: "bg-emerald-100 dark:bg-emerald-500/20",
      trend: "neutral",
      trendLabel: stats.activeRules > 0 ? "All active" : "No active rules",
    },
    {
      icon: ShieldCheck,
      label: "Net VAT / GST Payable",
      value: fmtCurrency(stats.netVatPayableGBP, "GBP"),
      sub: `Across all GBP VAT returns · ${stats.finalizedDraftCount} draft${stats.finalizedDraftCount !== 1 ? "s" : ""} finalized`,
      accentClass: "text-blue-600 dark:text-blue-400",
      iconBgClass: "bg-blue-100 dark:bg-blue-500/20",
      trend: "neutral",
      trendLabel: stats.netVatPayableGBP > 0 ? "Payable" : "Nil",
    },
    {
      icon: Landmark,
      label: "Corporate Tax Balance Due",
      value: fmtCurrency(stats.corporateBalanceDueUSD, "USD"),
      sub: `USD · Fiscal 2025 Form 1120 · WHT remitted ${fmtCurrency(stats.withheldTotalEUR, "EUR")} EUR`,
      accentClass: "text-amber-600 dark:text-amber-400",
      iconBgClass: "bg-amber-100 dark:bg-amber-500/20",
      trend: "neutral",
      trendLabel: stats.corporateBalanceDueUSD > 0 ? "Due" : "Settled",
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
    <div className="space-y-3">
      {/* A source that could not be read contributes zero to every figure above,
          which is indistinguishable from it genuinely being empty. Saying which
          ones failed is what makes an understated total readable as understated. */}
      {stats.sourcesUnavailable.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50/60 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold">
              {stats.sourcesUnavailable.length} of 7 sources could not be read
            </strong>{" "}
            ({stats.sourcesUnavailable.join(", ")}), so each contributes nothing to the figures
            below. Treat them as understated, not as current.
          </span>
        </p>
      )}
      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Tax governance KPI summary"
      >
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>
    </div>
  );
}
