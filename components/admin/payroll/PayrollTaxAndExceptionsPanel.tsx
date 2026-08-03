import { cookies } from "next/headers";
import { CloudOff, AlertCircle, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listPayrollTaxProfiles, listPayrollExceptions, type TaxProfile, type PayrollException } from "@/lib/api/payroll";

const SEVERITY_COLORS: Record<string, string> = {
  INFO: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  WARNING: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  CRITICAL: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  BLOCKER: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
};

export async function PayrollTaxAndExceptionsPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return <PanelEmptyState icon={ShieldAlert} tone="warning" label="No active session" hint="Sign in to view payroll tax profiles and exceptions." />;
  }

  const identity = { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId };

  const [taxRes, excRes] = await Promise.all([
    listPayrollTaxProfiles(identity),
    listPayrollExceptions(identity),
  ]);

  if (!taxRes.ok && taxRes.error.kind === "unreachable") {
    return <PanelEmptyState icon={CloudOff} tone="warning" label="payroll-tax-svc unavailable" hint={taxRes.error.message} />;
  }

  const profiles: TaxProfile[] = taxRes.ok ? taxRes.data : [];
  const exceptions: PayrollException[] = excRes.ok ? excRes.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Payroll Tax Profiles ({profiles.length})
        </h3>
        {profiles.length === 0 ? (
          <PanelEmptyState icon={AlertCircle} label="No payroll tax profiles found" hint="Profiles configured in payroll-tax-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Tax ID", "Filing Status", "Allowances", "Additional Withholding"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {profiles.map((p) => (
                  <tr key={p.profile_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{p.tax_identifier}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{p.filing_status}</td>
                    <td className="px-4 py-3 text-xs font-medium">{p.withholding_allowances}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-300">{p.currency} {p.additional_withholding_amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Payroll Exceptions ({exceptions.length})
        </h3>
        {exceptions.length === 0 ? (
          <PanelEmptyState icon={AlertCircle} label="No payroll exceptions open" hint="Exceptions raised in payroll-exceptions-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Type", "Severity", "Description", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {exceptions.map((e) => (
                  <tr key={e.exception_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{e.exception_type}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${SEVERITY_COLORS[e.severity] ?? "bg-slate-100 text-slate-600"}`}>
                        {e.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 max-w-[240px] truncate">{e.description}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-600 dark:text-slate-400">{e.status}</td>
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
