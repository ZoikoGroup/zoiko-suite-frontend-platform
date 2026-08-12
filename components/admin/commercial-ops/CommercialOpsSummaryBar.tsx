import { cookies } from "next/headers";
import { ShoppingCart, FileCheck, ShieldCheck, DollarSign, ShieldAlert, CloudOff } from "lucide-react";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { listPurchaseOrders } from "@/lib/api/purchase-orders";
import { listPurchaseRequests, summariseRequests } from "@/lib/api/purchase-requests";
import {
  listSpendPolicies,
  listPolicyUsage,
  summarisePolicyUsage,
  summariseSpend,
} from "@/lib/api/spend-controls";
import { listVendorChecks, summariseVendorChecks } from "@/lib/api/vendor-due-diligence";

/**
 * Live KPI summary for Commercial Ops, read from the four services this domain
 * actually has wired.
 *
 * EVERY FIGURE HERE WAS PREVIOUSLY HARDCODED, and one of them was a fabricated
 * compliance claim: the vendor tile read **"Vendor Due Diligence Pass — 98.4%, 128
 * active vendors screened (AML/UBO), Low risk"**. No part of that was real. There
 * is no AML or UBO screening anywhere in this platform — vendor-due-diligence-svc
 * matches a name against a hardcoded list of two — so the console was asserting a
 * beneficial-ownership and anti-money-laundering pass rate across 128 vendors that
 * had never been screened for either, and rendering it in the same style as live
 * data with a green "Low risk" trend beside it.
 *
 * A fabricated number is bad; a fabricated number about a control that does not
 * exist is the kind that gets relied on. The tile now reports what the service can
 * actually answer, in its own vocabulary: how many counterparties are flagged, how
 * many were screened without a match (which is NOT a pass), and how many checks
 * carry no outcome at all.
 *
 * The other three tiles are equally live now. Where a service cannot be read, the
 * tile says so rather than showing a plausible number — an unreadable figure and a
 * real zero are different facts, and the old code could not express the difference.
 */
export async function CommercialOpsSummaryBar() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
        No active session, so none of these figures can be read. Sign in again.
      </div>
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const [ordersRes, requestsRes, policiesRes, usageRes, checksRes] = await Promise.all([
    listPurchaseOrders({ identity }),
    listPurchaseRequests({ identity }),
    listSpendPolicies({ identity }),
    listPolicyUsage({ identity }),
    // One page's worth. This is a KPI strip, not a register — the full history is
    // in the screening register above, which pages properly.
    listVendorChecks({ identity, limit: 200 }),
  ]);

  // ── Orders ──────────────────────────────────────────────────────────────────
  const orders = ordersRes.ok ? ordersRes.data : null;
  // `po_status`, not `status` — purchase-order-svc names it that way on the wire.
  const issued = orders?.filter((o) => o.po_status === "ISSUED") ?? [];
  const committedByCurrency = issued.reduce<Record<string, number>>((acc, o) => {
    acc[o.currency_code] = (acc[o.currency_code] ?? 0) + o.total_amount;
    return acc;
  }, {});
  // Never summed across currencies — nothing in this suite holds an FX rate.
  const committed = Object.entries(committedByCurrency)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, amount]) => formatMoney(amount, code))
    .join(" · ");

  // ── Requests ────────────────────────────────────────────────────────────────
  const requestStats = requestsRes.ok ? summariseRequests(requestsRes.data) : null;
  const pendingValue = requestStats
    ? Object.entries(requestStats.pendingValueByCurrency)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, amount]) => formatMoney(amount, code))
        .join(" · ")
    : "";

  // ── Spend limits ────────────────────────────────────────────────────────────
  const spendStats =
    policiesRes.ok && usageRes.ok
      ? summariseSpend(summarisePolicyUsage(policiesRes.data, usageRes.data))
      : null;
  const spendCommitted = spendStats
    ? Object.entries(spendStats.committedByCurrency)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, amount]) => formatMoney(amount, code))
        .join(" · ")
    : "";

  // ── Vendor screening ────────────────────────────────────────────────────────
  const vendorStats = checksRes.ok ? summariseVendorChecks(checksRes.data) : null;

  const kpis = [
    {
      icon: ShoppingCart,
      label: "Purchase orders issued",
      ok: ordersRes.ok,
      value: orders ? String(issued.length) : "—",
      sub: orders
        ? committed
          ? `Committed: ${committed}`
          : "Nothing committed yet"
        : "purchase-order-svc could not be read",
      accent: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-100 dark:bg-amber-500/20",
      note: orders ? `${orders.length} total, including closed` : undefined,
    },
    {
      icon: FileCheck,
      label: "Requisitions awaiting a decision",
      ok: requestsRes.ok,
      value: requestStats ? String(requestStats.pending) : "—",
      sub: requestStats
        ? pendingValue
          ? `Value pending: ${pendingValue}`
          : "Nothing pending"
        : "purchase-request-svc could not be read",
      accent: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-100 dark:bg-blue-500/20",
      note: requestStats
        ? `${requestStats.approved} approved · ${requestStats.rejected} rejected`
        : undefined,
    },
    {
      // The tile that used to claim a 98.4% AML/UBO pass rate. It now counts
      // findings, and its caption states what the screening actually is.
      icon: ShieldCheck,
      label: "Counterparties flagged",
      ok: checksRes.ok,
      value: vendorStats ? String(vendorStats.flaggedCounterparties) : "—",
      sub: vendorStats
        ? `${vendorStats.screenedNoMatch} screened without a match — not a clearance`
        : "vendor-due-diligence-svc could not be read",
      accent: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-100 dark:bg-emerald-500/20",
      note: vendorStats
        ? vendorStats.withoutOutcome > 0
          ? `${vendorStats.withoutOutcome} check${vendorStats.withoutOutcome === 1 ? "" : "s"} with no outcome at all`
          : "Exact match against a two-name stub list only"
        : undefined,
    },
    {
      icon: DollarSign,
      label: "Spend limits in force",
      ok: policiesRes.ok && usageRes.ok,
      value: spendStats ? String(spendStats.policies) : "—",
      sub: spendStats
        ? spendCommitted
          ? `Committed against them: ${spendCommitted}`
          : "Nothing committed against them yet"
        : "spend-controls-svc could not be read",
      accent: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-100 dark:bg-purple-500/20",
      note: spendStats
        ? `${spendStats.exhausted} exhausted · ${spendStats.refusals} spend${spendStats.refusals === 1 ? "" : "s"} refused`
        : undefined,
    },
  ];

  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      aria-label="Commercial Ops KPI summary"
    >
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col gap-3 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${kpi.bg}`}>
              <kpi.icon className={`h-4.5 w-4.5 ${kpi.accent}`} aria-hidden="true" />
            </span>
            {/* No invented trend. There is no historical series behind any of these
                figures, so "+8% this month" was as fabricated as the numbers it
                decorated. An unreadable source is the only thing worth flagging. */}
            {!kpi.ok && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                <CloudOff className="h-3 w-3" aria-hidden="true" />
                unavailable
              </span>
            )}
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
              {kpi.value}
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              {kpi.label}
            </p>
          </div>
          <p className="border-t border-slate-100 pt-2 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
            {kpi.sub}
            {kpi.note && (
              <>
                <br />
                {kpi.note}
              </>
            )}
          </p>
          <div className={`absolute bottom-0 left-0 h-0.5 w-full ${kpi.bg} opacity-60`} />
        </div>
      ))}
    </div>
  );
}
