import { cookies } from "next/headers";
import { CloudOff, Landmark, ShieldAlert, ShieldCheck } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listCorporateTaxReturns,
  listWithholdingObligations,
  type CorporateTaxReturn,
  type WithholdingTaxObligation,
} from "@/lib/api/tax";

const STATUS_COLORS: Record<string, string> = {
  DRAFT:              "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",
  SUBMITTED:          "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  ASSESSED:           "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  SETTLED:            "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  DISPUTED:           "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  CALCULATED:         "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  PENDING_REMITTANCE: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  REMITTED:           "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  CANCELLED:          "bg-slate-100 text-slate-500 dark:bg-slate-500/20 dark:text-slate-400",
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

/**
 * Horizontal waterfall: each pill shows a labeled amount,
 * and an arrow separates the stages.
 */
function TaxWaterfall({ ret }: { ret: CorporateTaxReturn }) {
  const stages: { label: string; value: string; accent: string }[] = [
    {
      label: "Gross Revenue",
      value: formatCurrency(ret.gross_revenue, ret.currency),
      accent: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    },
    {
      label: "– Deductions",
      value: formatCurrency(ret.allowable_deductions, ret.currency),
      accent: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
    },
    {
      label: "= Taxable Income",
      value: formatCurrency(ret.taxable_income, ret.currency),
      accent: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
    },
    {
      label: `× ${ret.tax_rate_percent}% Rate`,
      value: formatCurrency(ret.gross_tax_liability, ret.currency),
      accent: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
    },
    {
      label: "– Credits",
      value: formatCurrency(ret.tax_credits, ret.currency),
      accent: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    },
    {
      label: "Net Tax Payable",
      value: formatCurrency(ret.net_tax_payable, ret.currency),
      accent: "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 font-semibold",
    },
    {
      label: "Balance Due",
      value: formatCurrency(ret.balance_due, ret.currency),
      accent: `border-2 border-amber-400 font-bold ${
        ret.balance_due > 0
          ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
      }`,
    },
  ];

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {stages.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <div className={`rounded-md px-2.5 py-1.5 text-[11px] leading-none ${s.accent}`}>
            <span className="block text-[9px] opacity-70 mb-0.5">{s.label}</span>
            <span>{s.value}</span>
          </div>
          {i < stages.length - 1 && (
            <span className="text-slate-300 dark:text-slate-600 text-xs">›</span>
          )}
        </div>
      ))}
    </div>
  );
}

export async function CorporateAndWithholdingTaxPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in to view corporate and withholding tax."
      />
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const [corpRes, whtRes] = await Promise.all([
    listCorporateTaxReturns(identity),
    listWithholdingObligations(identity),
  ]);

  if (!corpRes.ok && corpRes.error.kind === "unreachable") {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="corporate-tax-svc unavailable"
        hint={corpRes.error.message}
      />
    );
  }

  const corpReturns: CorporateTaxReturn[] = corpRes.ok ? corpRes.data : [];
  const whtObligations: WithholdingTaxObligation[] = whtRes.ok ? whtRes.data : [];

  return (
    <div className="space-y-6">
      {/* ── Corporate Tax Returns ── */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Corporate Income Tax Returns ({corpReturns.length})
        </h3>
        {corpReturns.length === 0 ? (
          <PanelEmptyState
            icon={Landmark}
            label="No corporate tax returns"
            hint="Returns created in corporate-tax-svc will appear here."
          />
        ) : (
          <div className="space-y-4">
            {corpReturns.map((c) => (
              <div
                key={c.return_id}
                className="rounded-lg border border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/30 p-4 space-y-3"
              >
                {/* Return header */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                        Fiscal {c.fiscal_year}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {c.tax_registration_number}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {c.accounting_period_start} → {c.accounting_period_end}
                      {c.submitted_by && (
                        <span className="ml-2 text-slate-400">
                          · Submitted by {c.submitted_by}
                        </span>
                      )}
                    </p>
                    {c.notes && (
                      <p className="mt-1 text-[11px] italic text-slate-400 dark:text-slate-500">
                        {c.notes}
                      </p>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium shrink-0 ${
                      STATUS_COLORS[c.status] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {c.status}
                  </span>
                </div>

                {/* Waterfall */}
                <TaxWaterfall ret={c} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Withholding Tax Obligations ── */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Withholding Tax Obligations ({whtObligations.length})
        </h3>
        {whtObligations.length === 0 ? (
          <PanelEmptyState
            icon={Landmark}
            label="No withholding tax obligations"
            hint="Obligations created in withholding-tax-svc will appear here."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {[
                    "Payment Ref",
                    "Type",
                    "Gross Amount",
                    "Rate (%)",
                    "Withheld Amount",
                    "Treaty",
                    "Status",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {whtObligations.map((w) => (
                  <tr
                    key={w.obligation_id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700 dark:text-slate-300">
                      {w.payment_reference}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {w.payment_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">
                      {formatCurrency(w.gross_payment_amount, w.currency)}
                    </td>
                    <td className="px-4 py-3 text-xs">{w.withholding_rate_percent}%</td>
                    <td className="px-4 py-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(w.withheld_amount, w.currency)}
                    </td>
                    <td className="px-4 py-3">
                      {w.tax_treaty_exemption ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-navy-100 px-2 py-0.5 text-[10px] font-semibold text-navy-700 dark:bg-navy-500/20 dark:text-navy-300"
                          title={w.exemption_certificate_ref}
                        >
                          <ShieldCheck className="h-3 w-3 text-navy-600 dark:text-navy-400" />
                          Treaty
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                            STATUS_COLORS[w.status] ?? "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {w.status}
                        </span>
                        {w.remittance_reference && (
                          <p className="mt-0.5 text-[10px] font-mono text-slate-400 dark:text-slate-500 truncate max-w-[130px]">
                            {w.remittance_reference}
                          </p>
                        )}
                      </div>
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
