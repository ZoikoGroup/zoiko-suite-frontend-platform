import { cookies } from "next/headers";
import { Landmark, Wallet, Scale, CalendarCheck } from "lucide-react";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { IllustrativeNotice } from "@/components/admin/shared";
import { getFinanceSummaryStats, type FinanceSummaryStats } from "@/lib/api/finance";

// fmtCurrency lived here and formatted the treasury figure as compact USD. It is
// gone with its only caller: no service in this suite holds an FX rate, so
// stamping a currency symbol on a cross-currency sum asserted a conversion that
// never happened. Both money tiles now render a plain number and say which
// currencies went into it.

export async function FinanceSummaryBar() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  const identity = session
    ? { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId }
    : undefined;

  // Four of the five routes behind these figures are now the ones the services
  // actually serve — see the table above the call sites in lib/api/finance.ts.
  // The fifth (treasury) is still unverified, and a figure that cannot be read
  // now arrives as null and renders as "not available" rather than as a zero
  // indistinguishable from a clean register.
  const res = await getFinanceSummaryStats(identity);
  const stats: FinanceSummaryStats | null = res.ok ? res.data : null;

  if (!stats) {
    return (
      <IllustrativeNotice services="The Finance headline figures could not be produced at all." />
    );
  }

  // UNAVAILABLE, not zero. A figure that could not be read renders as an em dash
  // with the reason underneath. Every one of these used to fall back to 0, so a
  // dead service and an empty register looked the same — and for a
  // pending-reconciliation count or a receivables balance, 0 reads as "nothing to
  // do" rather than "not known".
  const UNAVAILABLE = "—";

  const kpis = [
    {
      icon: Landmark,
      label: "Total Accounts Receivable",
      // Not labelled USD. The figure sums every unpaid invoice whatever its
      // currency, and no service in this suite holds an FX rate, so calling it a
      // dollar total was an invented conversion. The receivables register below
      // shows the honest per-currency breakdown.
      value:
        stats.arBalanceMixedCurrency === null
          ? UNAVAILABLE
          : stats.arBalanceMixedCurrency.toLocaleString("en-US", { maximumFractionDigits: 0 }),
      sub:
        stats.arBalanceMixedCurrency === null
          ? "accounts-receivable-svc could not be read"
          : "Unpaid invoices, mixed currencies — not FX-converted",
      accent: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-100 dark:bg-blue-500/20",
    },
    {
      icon: Wallet,
      label: "Treasury Cash Available",
      value:
        stats.cashAvailableMixedCurrency === null
          ? UNAVAILABLE
          : stats.cashAvailableMixedCurrency.toLocaleString("en-US", { maximumFractionDigits: 0 }),
      // "Liquid cash position · JPMorgan & Barclays" was here. No bank name
      // appears anywhere in this platform's data — it was decoration on a figure
      // that came from a 404. treasury-svc's route is still unverified, so this
      // tile is expected to read as unavailable.
      sub:
        stats.cashAvailableMixedCurrency === null
          ? "treasury-svc could not be read"
          : "Mixed currencies — not FX-converted",
      accent: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-100 dark:bg-emerald-500/20",
    },
    {
      icon: Scale,
      label: "GL Journal Volume",
      value:
        stats.journalCount === null ? UNAVAILABLE : stats.journalCount.toLocaleString("en-US"),
      // "N active COA accounts" was here, always 0: it counted chart-of-accounts
      // entries, and this platform has no chart-of-accounts service to count.
      // What this number is instead is stated exactly, page bound included.
      sub:
        stats.journalCount === null
          ? "general-ledger-svc could not be read"
          : "Journal headers in the most recent page (200 max)",
      accent: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-100 dark:bg-purple-500/20",
    },
    {
      icon: CalendarCheck,
      label: "Financial Close Period",
      value: stats.closePeriodStatus ?? UNAVAILABLE,
      sub:
        stats.unreconciledBankCount === null
          ? "bank-reconciliation-svc could not be read"
          : `${stats.unreconciledBankCount} statement lines unmatched or in exception`,
      accent: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-100 dark:bg-amber-500/20",
    },
  ];

  return (
    <div className="space-y-3">
      {/* The notice used to claim "lib/api/finance.ts calls no backend at all",
          which was stale twice over — it calls five, and four of them now resolve.
          What is left worth saying is which figure is not real yet. */}
      {stats.cashAvailableMixedCurrency === null ? (
        <IllustrativeNotice services="Treasury cash is not available: treasury-svc's route is unverified and the service has never run in this environment. Every other figure here is read from a live service." />
      ) : null}
      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Finance KPI summary"
      >
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col gap-3 hover:shadow-md transition-shadow"
          >
            {/* No trend badge. "+12% MoM", "Optimal", "Balanced" and "On schedule"
                were hardcoded strings decorating hardcoded numbers — there is no
                historical series behind any of this to compare against. */}
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
    </div>
  );
}
