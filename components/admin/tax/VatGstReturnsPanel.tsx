import { cookies } from "next/headers";
import { CloudOff, Receipt, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listVATReturns, type VATReturn } from "@/lib/api/tax";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",
  FILED: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
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

export async function VatGstReturnsPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return <PanelEmptyState icon={ShieldAlert} tone="warning" label="No active session" hint="Sign in to view VAT/GST returns." />;
  }

  const identity = { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId };

  const result = await listVATReturns(identity);

  if (!result.ok && result.error.kind === "unreachable") {
    return <PanelEmptyState icon={CloudOff} tone="warning" label="vat-gst-svc unavailable" hint={result.error.message} />;
  }

  const vatReturns: VATReturn[] = result.ok ? result.data : [];

  return (
    <div className="space-y-4">
      {vatReturns.length === 0 ? (
        <PanelEmptyState icon={Receipt} label="No VAT/GST returns found" hint="Returns created in vat-gst-svc will appear here." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                {["Period", "Tax Reg #", "Output Tax", "Input Tax", "Net Payable", "Status"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {vatReturns.map((v) => (
                <tr key={v.return_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{v.tax_period}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{v.tax_registration_number}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{formatCurrency(v.output_tax_amount, v.currency)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{formatCurrency(v.input_tax_amount, v.currency)}</td>
                  <td className="px-4 py-3 text-xs font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(v.net_tax_payable, v.currency)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_COLORS[v.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {v.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
