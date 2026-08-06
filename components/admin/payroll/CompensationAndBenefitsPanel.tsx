import { cookies } from "next/headers";
import { CloudOff, Layers, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listCompensationStructures, listBenefitPlans, type CompensationStructure, type BenefitPlan } from "@/lib/api/payroll";

export async function CompensationAndBenefitsPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return <PanelEmptyState icon={ShieldAlert} tone="warning" label="No active session" hint="Sign in to view compensation structures and benefits." />;
  }

  const identity = { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId };

  const [compRes, benefitsRes] = await Promise.all([
    listCompensationStructures(identity),
    listBenefitPlans(identity),
  ]);

  if (!compRes.ok && compRes.error.kind === "unreachable") {
    return <PanelEmptyState icon={CloudOff} tone="warning" label="compensation-svc unavailable" hint={compRes.error.message} />;
  }

  const structures: CompensationStructure[] = compRes.ok ? compRes.data : [];
  const plans: BenefitPlan[] = benefitsRes.ok ? benefitsRes.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Compensation Structures ({structures.length})
        </h3>
        {structures.length === 0 ? (
          <PanelEmptyState icon={Layers} label="No compensation structures defined" hint="Structures created in compensation-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Title", "Wage Type", "Base Pay", "Frequency"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {structures.map((s) => (
                  <tr key={s.structure_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{s.title}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{s.wage_type}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{s.currency} {s.base_pay.toLocaleString("en-US")}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{s.pay_frequency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Benefits Plans ({plans.length})
        </h3>
        {plans.length === 0 ? (
          <PanelEmptyState icon={Layers} label="No benefit plans registered" hint="Plans created in benefits-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Plan Name", "Type", "Provider", "ER Contribution (%)"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {plans.map((p) => (
                  <tr key={p.plan_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{p.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{p.benefit_type}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{p.provider_name}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{p.employer_contribution_percent}%</td>
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
