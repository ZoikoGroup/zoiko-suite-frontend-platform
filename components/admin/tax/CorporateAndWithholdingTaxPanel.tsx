import { cookies } from "next/headers";
import { CloudOff, Landmark, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listCorporateTaxReturns, listWithholdingObligations, type CorporateTaxReturn, type WithholdingTaxObligation } from "@/lib/api/tax";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",
  SUBMITTED: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  ASSESSED: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  SETTLED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  DISPUTED: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  CALCULATED: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  PENDING_REMITTANCE: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  REMITTED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  CANCELLED: "bg-slate-100 text-slate-500 dark:bg-slate-500/20 dark:text-slate-400",
};

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-US")}`;
  }
}

export async function CorporateAndWithholdingTaxPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return <PanelEmptyState icon={ShieldAlert} tone="warning" label="No active session" hint="Sign in to view corporate and withholding tax." />;
  }

  const identity = { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId };

  const [corpRes, whtRes] = await Promise.all([
    listCorporateTaxReturns(identity),
    listWithholdingObligations(identity),
  ]);

  if (!corpRes.ok && corpRes.error.kind === "unreachable") {
    return <PanelEmptyState icon={CloudOff} tone="warning" label="corporate-tax-svc unavailable" hint={corpRes.error.message} />;
  }

  const corpReturns: CorporateTaxReturn[] = corpRes.ok ? corpRes.data : [];
  const whtObligations: WithholdingTaxObligation[] = whtRes.ok ? whtRes.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Corporate Income Tax Returns ({corpReturns.length})
        </h3>
        {corpReturns.length === 0 ? (
          <PanelEmptyState icon={Landmark} label="No corporate tax returns" hint="Returns created in corporate-tax-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Fiscal Year", "Tax Reg #", "Taxable Income", "Net Tax Payable", "Balance Due", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {corpReturns.map((c) => (
                  <tr key={c.return_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{c.fiscal_year}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{c.tax_registration_number}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{formatCurrency(c.taxable_income, c.currency)}</td>
                    <td className="px-4 py-3 text-xs font-medium">{formatCurrency(c.net_tax_payable, c.currency)}</td>
                    <td className="px-4 py-3 text-xs font-bold text-amber-600 dark:text-amber-400">{formatCurrency(c.balance_due, c.currency)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_COLORS[c.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Withholding Tax Obligations ({whtObligations.length})
        </h3>
        {whtObligations.length === 0 ? (
          <PanelEmptyState icon={Landmark} label="No withholding tax obligations" hint="Obligations created in withholding-tax-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Payment Ref", "Type", "Gross Amount", "Rate (%)", "Withheld Amount", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {whtObligations.map((w) => (
                  <tr key={w.obligation_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700 dark:text-slate-300">{w.payment_reference}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{w.payment_type}</td>
                    <td className="px-4 py-3 text-xs font-medium">{formatCurrency(w.gross_payment_amount, w.currency)}</td>
                    <td className="px-4 py-3 text-xs">{w.withholding_rate_percent}%</td>
                    <td className="px-4 py-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(w.withheld_amount, w.currency)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_COLORS[w.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {w.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
