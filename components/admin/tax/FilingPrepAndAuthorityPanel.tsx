import { cookies } from "next/headers";
import { CloudOff, FileCheck, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listFilingDrafts, listTaxAuthorityInterfaces, type FilingDraft, type TaxAuthorityInterface } from "@/lib/api/tax";

const STATUS_COLORS: Record<string, string> = {
  UNVALIDATED: "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",
  PREPARED: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  BLOCKED: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  FINALIZED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  INACTIVE: "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",
};

export async function FilingPrepAndAuthorityPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return <PanelEmptyState icon={ShieldAlert} tone="warning" label="No active session" hint="Sign in to view filing drafts and authority interfaces." />;
  }

  const identity = { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId };

  const [draftsRes, authorityRes] = await Promise.all([
    listFilingDrafts(identity),
    listTaxAuthorityInterfaces(identity),
  ]);

  if (!draftsRes.ok && draftsRes.error.kind === "unreachable") {
    return <PanelEmptyState icon={CloudOff} tone="warning" label="filing-preparation-svc unavailable" hint={draftsRes.error.message} />;
  }

  const drafts: FilingDraft[] = draftsRes.ok ? draftsRes.data : [];
  const interfaces: TaxAuthorityInterface[] = authorityRes.ok ? authorityRes.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Filing Preparation Drafts ({drafts.length})
        </h3>
        {drafts.length === 0 ? (
          <PanelEmptyState icon={FileCheck} label="No filing drafts" hint="Filing drafts created in filing-preparation-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Filing Type", "Period", "Due Date", "Validation Status", "Block Reasons"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {drafts.map((d) => (
                  <tr key={d.draft_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{d.filing_type}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">{d.period_key}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{d.due_date}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_COLORS[d.validation_status] ?? "bg-slate-100 text-slate-600"}`}>
                        {d.validation_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-red-500 dark:text-red-400 max-w-[200px] truncate">{d.block_reasons || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Tax Authority Connections ({interfaces.length})
        </h3>
        {interfaces.length === 0 ? (
          <PanelEmptyState icon={FileCheck} label="No authority connections registered" hint="Configured interfaces in tax-authority-interface-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Authority Code", "Authority Name", "Protocol", "Endpoint", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {interfaces.map((i) => (
                  <tr key={i.interface_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700 dark:text-slate-300">{i.authority_code}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{i.authority_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{i.protocol}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400 max-w-[200px] truncate">{i.api_endpoint}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_COLORS[i.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {i.status}
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
