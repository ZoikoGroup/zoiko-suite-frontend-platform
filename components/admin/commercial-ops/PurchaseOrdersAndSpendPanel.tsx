import { cookies } from "next/headers";
import { CloudOff, ShoppingCart, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listPurchaseOrders, listSpendLimits, type PurchaseOrder, type SpendLimit } from "@/lib/api/commercial-ops";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",
  PENDING_APPROVAL: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  ISSUED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  RECEIVED: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
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

export async function PurchaseOrdersAndSpendPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return <PanelEmptyState icon={ShieldAlert} tone="warning" label="No active session" hint="Sign in to view purchase orders & spend controls." />;
  }

  const identity = { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId };

  const [poRes, spendRes] = await Promise.all([
    listPurchaseOrders(identity),
    listSpendLimits(identity),
  ]);

  if (!poRes.ok && poRes.error.kind === "unreachable") {
    return <PanelEmptyState icon={CloudOff} tone="warning" label="purchase-order-svc unavailable" hint={poRes.error.message} />;
  }

  const orders: PurchaseOrder[] = poRes.ok ? poRes.data : [];
  const spendLimits: SpendLimit[] = spendRes.ok ? spendRes.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Purchase Orders ({orders.length})
        </h3>
        {orders.length === 0 ? (
          <PanelEmptyState icon={ShoppingCart} label="No purchase orders issued" hint="Purchase orders created in purchase-order-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["PO #", "Vendor Name", "Total Amount", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {orders.map((po) => (
                  <tr key={po.po_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{po.po_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{po.vendor_name}</td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-900 dark:text-slate-100">{formatCurrency(po.total_amount, po.currency)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_COLORS[po.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {po.status}
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
          Departmental Spend Controls & Budget Caps ({spendLimits.length})
        </h3>
        {spendLimits.length === 0 ? (
          <PanelEmptyState icon={ShoppingCart} label="No spend limits configured" hint="Spend limits created in spend-controls-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Department", "Budget Cap", "Spent to Date", "Remaining Budget", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {spendLimits.map((sl) => (
                  <tr key={sl.limit_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{sl.department_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{formatCurrency(sl.budget_cap, sl.currency)}</td>
                    <td className="px-4 py-3 text-xs font-medium text-amber-600 dark:text-amber-400">{formatCurrency(sl.spent_to_date, sl.currency)}</td>
                    <td className="px-4 py-3 text-xs font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(sl.remaining_budget, sl.currency)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                        {sl.status}
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
