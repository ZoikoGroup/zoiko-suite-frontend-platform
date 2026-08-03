import { cookies } from "next/headers";
import { CloudOff, Briefcase, Building2, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listCorporateActions, listCounterparties, type CorporateAction, type Counterparty } from "@/lib/api/legal";

export async function CorporateActionsAndCounterpartiesPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return <PanelEmptyState icon={ShieldAlert} tone="warning" label="No active session" hint="Sign in to view corporate actions & counterparties." />;
  }

  const identity = { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId };

  const [actionsRes, counterpartyRes] = await Promise.all([
    listCorporateActions(identity),
    listCounterparties(identity),
  ]);

  if (!actionsRes.ok && actionsRes.error.kind === "unreachable") {
    return <PanelEmptyState icon={CloudOff} tone="warning" label="corporate-actions-svc unavailable" hint={actionsRes.error.message} />;
  }

  const actions: CorporateAction[] = actionsRes.ok ? actionsRes.data : [];
  const counterparties: Counterparty[] = counterpartyRes.ok ? counterpartyRes.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Corporate Actions ({actions.length})
        </h3>
        {actions.length === 0 ? (
          <PanelEmptyState icon={Briefcase} label="No corporate actions recorded" hint="Corporate actions in corporate-actions-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Action Title", "Type", "Effective Date", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {actions.map((a) => (
                  <tr key={a.action_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{a.title}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{a.action_type}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">{a.effective_date}</td>
                    <td className="px-4 py-3 text-xs font-medium text-indigo-600">{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Managed Counterparties ({counterparties.length})
        </h3>
        {counterparties.length === 0 ? (
          <PanelEmptyState icon={Building2} label="No counterparties registered" hint="Counterparties in counterparty-management-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Name", "Type", "Country", "Risk Rating", "Compliance"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {counterparties.map((cp) => (
                  <tr key={cp.counterparty_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{cp.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{cp.counterparty_type}</td>
                    <td className="px-4 py-3 text-xs">{cp.country}</td>
                    <td className="px-4 py-3 text-xs font-bold text-amber-600">{cp.risk_rating}</td>
                    <td className="px-4 py-3 text-xs font-medium text-emerald-600">{cp.compliance_status}</td>
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
