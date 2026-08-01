import { cookies } from "next/headers";
import { CloudOff, FileCode, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listClauses, listTemplates, type Clause, type ContractTemplate } from "@/lib/api/legal";

export async function ClausesAndTemplatesPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return <PanelEmptyState icon={ShieldAlert} tone="warning" label="No active session" hint="Sign in to view clauses & templates." />;
  }

  const identity = { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId };

  const [clausesRes, templatesRes] = await Promise.all([
    listClauses(identity),
    listTemplates(identity),
  ]);

  if (!clausesRes.ok && clausesRes.error.kind === "unreachable") {
    return <PanelEmptyState icon={CloudOff} tone="warning" label="clause-template-svc unavailable" hint={clausesRes.error.message} />;
  }

  const clauses: Clause[] = clausesRes.ok ? clausesRes.data : [];
  const templates: ContractTemplate[] = templatesRes.ok ? templatesRes.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Standard Legal Clauses ({clauses.length})
        </h3>
        {clauses.length === 0 ? (
          <PanelEmptyState icon={FileCode} label="No clauses defined" hint="Clauses created in clause-template-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Title", "Category", "Standard", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {clauses.map((c) => (
                  <tr key={c.clause_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{c.title}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{c.category}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-indigo-600">{c.is_standard ? "Yes" : "Custom"}</td>
                    <td className="px-4 py-3 text-xs font-medium text-emerald-600">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Contract Templates ({templates.length})
        </h3>
        {templates.length === 0 ? (
          <PanelEmptyState icon={FileCode} label="No templates created" hint="Templates in clause-template-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Template Name", "Type", "Version", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {templates.map((t) => (
                  <tr key={t.template_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{t.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{t.contract_type}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">v{t.version}</td>
                    <td className="px-4 py-3 text-xs font-medium text-emerald-600">{t.status}</td>
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
