import { cookies } from "next/headers";
import { CloudOff, Receipt, ShieldAlert, TrendingUp, TrendingDown } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listVATReturns, type VATReturn } from "@/lib/api/tax";

const STATUS_COLORS: Record<string, string> = {
  DRAFT:    "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",
  FILED:    "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  ACCEPTED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
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

function formatCompact(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

/**
 * Horizontal stacked bar showing output vs input tax visually.
 * output (darker) + input (lighter) — widths are proportional to their share of the total.
 */
function OutputInputBar({
  output,
  input,
  currency,
}: {
  output: number;
  input: number;
  currency: string;
}) {
  const total = output + input;
  if (total === 0) return null;
  const outputPct = (output / total) * 100;
  const inputPct = (input / total) * 100;

  return (
    <div className="space-y-1 min-w-[140px]">
      <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        <div
          className="bg-blue-500"
          style={{ width: `${outputPct}%` }}
          title={`Output: ${formatCurrency(output, currency)}`}
        />
        <div
          className="bg-blue-200 dark:bg-blue-800"
          style={{ width: `${inputPct}%` }}
          title={`Input: ${formatCurrency(input, currency)}`}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
          Out {formatCompact(output, currency)}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-200 dark:bg-blue-800" />
          In {formatCompact(input, currency)}
        </span>
      </div>
    </div>
  );
}

/** Compare net payable between consecutive returns — returns a trend indicator. */
function NetTrend({
  current,
  previous,
}: {
  current: number;
  previous: number | null;
}) {
  if (previous === null) {
    return <span className="text-[11px] text-slate-400 dark:text-slate-500">—</span>;
  }
  const diff = current - previous;
  const pct = previous !== 0 ? Math.abs((diff / previous) * 100).toFixed(0) : "∞";
  if (diff > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
        <TrendingUp className="h-3 w-3" /> +{pct}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
      <TrendingDown className="h-3 w-3" /> -{pct}%
    </span>
  );
}

export async function VatGstReturnsPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in to view VAT/GST returns."
      />
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const result = await listVATReturns(identity);

  if (!result.ok && result.error.kind === "unreachable") {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="vat-gst-svc unavailable"
        hint={result.error.message}
      />
    );
  }

  const vatReturns: VATReturn[] = result.ok ? result.data : [];

  // Sort chronologically for trend calculation
  const sorted = [...vatReturns].sort((a, b) => (a.tax_period ?? "").localeCompare(b.tax_period ?? ""));

  return (
    <div className="space-y-4">
      {vatReturns.length === 0 ? (
        <PanelEmptyState
          icon={Receipt}
          label="No VAT/GST returns found"
          hint="Returns created in vat-gst-svc will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                {[
                  "Period",
                  "Tax Reg #",
                  "Output vs Input",
                  "Net Payable",
                  "Period Trend",
                  "Filed By",
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
              {sorted.map((v, idx) => {
                const prev = idx > 0 ? sorted[idx - 1].net_tax_payable : null;
                return (
                  <tr
                    key={v.return_id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {v.tax_period}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {v.tax_registration_number}
                    </td>
                    <td className="px-4 py-3">
                      <OutputInputBar
                        output={v.output_tax_amount}
                        input={v.input_tax_amount}
                        currency={v.currency}
                      />
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      {formatCurrency(v.net_tax_payable, v.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <NetTrend current={v.net_tax_payable} previous={prev} />
                    </td>
                    <td className="px-4 py-3">
                      {v.filed_by ? (
                        <div>
                          <p className="text-xs text-slate-700 dark:text-slate-300 truncate max-w-[140px]">
                            {v.filed_by}
                          </p>
                          {v.filed_at && (
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono whitespace-nowrap">
                              {new Date(v.filed_at).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          STATUS_COLORS[v.status] ?? "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {v.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Summary footer */}
          {sorted.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 px-4 py-2.5">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {sorted.length} return{sorted.length !== 1 ? "s" : ""} · all figures in{" "}
                {sorted[0].currency}
              </span>
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                Total net payable:{" "}
                {formatCurrency(
                  sorted.reduce((acc, v) => acc + v.net_tax_payable, 0),
                  sorted[0].currency
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
