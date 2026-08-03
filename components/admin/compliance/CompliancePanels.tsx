import { cookies } from "next/headers";
import { CloudOff, ShieldCheck, FileCheck, AlertTriangle, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listFilingRequirements, listComplianceEvaluations, listEscalatedExceptions, type FilingRequirement, type ComplianceEvaluation, type EscalatedException } from "@/lib/api/compliance";

export async function FilingTrackerPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return <PanelEmptyState icon={ShieldAlert} tone="warning" label="No active session" hint="Sign in to view filing requirements." />;

  const identity = { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId };
  const res = await listFilingRequirements(identity);
  if (!res.ok && res.error.kind === "unreachable") return <PanelEmptyState icon={CloudOff} tone="warning" label="filing-tracker-svc unavailable" hint={res.error.message} />;

  const requirements: FilingRequirement[] = res.ok ? res.data : [];

  return (
    <div className="space-y-4">
      {requirements.length === 0 ? (
        <PanelEmptyState icon={FileCheck} label="No statutory filing requirements tracked" hint="Filing requirements created in filing-tracker-svc will appear here." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                {["Filing Name", "Authority", "Due Date", "Frequency", "Status"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {requirements.map((r) => (
                <tr key={r.requirement_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{r.filing_name}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{r.authority_name}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-300">{r.due_date}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{r.frequency}</td>
                  <td className="px-4 py-3 text-xs font-bold text-emerald-600">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export async function StatusAndEscalationPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return <PanelEmptyState icon={ShieldAlert} tone="warning" label="No active session" hint="Sign in to view compliance status & escalations." />;

  const identity = { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId };
  const [evalRes, excRes] = await Promise.all([listComplianceEvaluations(identity), listEscalatedExceptions(identity)]);

  if (!evalRes.ok && evalRes.error.kind === "unreachable") return <PanelEmptyState icon={CloudOff} tone="warning" label="compliance-status-svc unavailable" hint={evalRes.error.message} />;

  const evaluations: ComplianceEvaluation[] = evalRes.ok ? evalRes.data : [];
  const exceptions: EscalatedException[] = excRes.ok ? excRes.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Compliance Status Evaluations ({evaluations.length})
        </h3>
        {evaluations.length === 0 ? (
          <PanelEmptyState icon={ShieldCheck} label="No status evaluations recorded" hint="Evaluations from compliance-status-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Evaluation ID", "Overall Status", "Score (%)"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {evaluations.map((ev) => (
                  <tr key={ev.evaluation_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{ev.evaluation_id}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-emerald-600">{ev.overall_status}</td>
                    <td className="px-4 py-3 text-xs font-bold">{ev.score_percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Escalated Exceptions ({exceptions.length})
        </h3>
        {exceptions.length === 0 ? (
          <PanelEmptyState icon={AlertTriangle} label="No escalated exceptions open" hint="Exceptions in exception-escalation-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Title", "Source", "Level", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {exceptions.map((ex) => (
                  <tr key={ex.exception_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{ex.title}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{ex.source_service}</td>
                    <td className="px-4 py-3 text-xs font-bold text-red-500">L{ex.escalation_level}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-600">{ex.status}</td>
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
