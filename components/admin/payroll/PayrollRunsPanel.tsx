import { cookies } from "next/headers";
import { CloudOff, Wallet, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listPayrollRuns, type PayrollRun } from "@/lib/api/payroll";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",
  CALCULATING: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  CALCULATED: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  APPROVED: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  FINALIZED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
};

export async function PayrollRunsPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return <PanelEmptyState icon={ShieldAlert} tone="warning" label="No active session" hint="Sign in to view payroll runs." />;
  }

  const identity = { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId };
  const res = await listPayrollRuns(identity);

  if (!res.ok && res.error.kind === "unreachable") {
    return <PanelEmptyState icon={CloudOff} tone="warning" label="payroll-run-svc unavailable" hint={res.error.message} />;
  }

  const runs: PayrollRun[] = res.ok && Array.isArray(res.data) ? res.data : [];

  return (
    <div className="space-y-4">
      {runs.length === 0 ? (
        <PanelEmptyState icon={Wallet} label="No payroll runs executed" hint="Payroll runs created in payroll-run-svc will appear here." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                {["Pay Period", "Dates", "Employees", "Gross Pay", "Net Pay", "Status"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {runs.map((r) => (
                <tr key={r.payroll_run_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{r.pay_period_code}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{r.period_start_date} → {r.period_end_date}</td>
                  <td className="px-4 py-3 text-xs font-medium">{r.total_employee_count}</td>
                  <td className="px-4 py-3 text-xs">${r.total_gross_pay.toLocaleString("en-US")}</td>
                  <td className="px-4 py-3 text-xs font-bold text-emerald-600 dark:text-emerald-400">${r.total_net_pay.toLocaleString("en-US")}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_COLORS[r.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {r.status}
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
