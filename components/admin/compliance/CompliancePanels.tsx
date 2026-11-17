import { cookies } from "next/headers";
import { CloudOff, ShieldCheck, FileCheck, AlertTriangle, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listFilingRequirements,
  listComplianceEvaluations,
  listComplianceGaps,
  listEscalatedExceptions,
  type FilingRequirement,
  type ComplianceEvaluation,
  type ComplianceGap,
  type EscalatedException,
} from "@/lib/api/compliance";
import { RowActions } from "@/components/admin/shared/RowActions";
import { CreateRecordForm } from "@/components/admin/intelligence/CreateRecordForm";
import { opts, type FieldSpec } from "@/components/admin/intelligence/create-state";
import { loadJurisdictionOptions } from "@/components/admin/tax/jurisdiction-options";
import { createComplianceGapAction } from "@/app/admin/compliance/gap-actions";

export async function FilingTrackerPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return <PanelEmptyState icon={ShieldAlert} tone="warning" label="No active session" hint="Sign in to view filing requirements." />;

  const identity = { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId };
  const res = await listFilingRequirements(identity);
  if (!res.ok) return <PanelEmptyState icon={CloudOff} tone="warning" label="filing-tracker-svc unavailable" hint={res.error.message} />;

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
                {["Filing Type", "Authority", "Due Date", "Period", "Status"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {requirements.map((r) => (
                <tr key={r.filing_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{r.filing_type}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{r.filing_authority}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-300">{r.due_date?.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{r.period_key}</td>
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
  const [evalRes, excRes, gapRes, jurisdictions] = await Promise.all([
    listComplianceEvaluations(identity),
    listEscalatedExceptions(identity),
    listComplianceGaps(identity),
    loadJurisdictionOptions(),
  ]);

  if (!evalRes.ok) return <PanelEmptyState icon={CloudOff} tone="warning" label="compliance-status-svc unavailable" hint={evalRes.error.message} />;

  const evaluations: ComplianceEvaluation[] = evalRes.ok ? evalRes.data : [];
  const exceptions: EscalatedException[] = excRes.ok ? excRes.data : [];

  const gaps: ComplianceGap[] = gapRes.ok ? gapRes.data : [];
  const gapFields: FieldSpec[] = [
    {
      name: "jurisdiction_id",
      label: "Jurisdiction",
      kind: "select",
      required: true,
      options: jurisdictions.ok ? jurisdictions.items.map((j) => ({ value: j.id, label: `${j.code} — ${j.name}` })) : [],
      hint: jurisdictions.ok ? undefined : `The jurisdiction register could not be read: ${jurisdictions.error}`,
    },
    { name: "domain_name", label: "Compliance domain", kind: "text", required: true },
    { name: "gap_type", label: "Gap type", kind: "text", required: true },
    { name: "severity", label: "Severity", kind: "select", options: opts("LOW", "MEDIUM", "HIGH", "CRITICAL") },
    { name: "source_reference", label: "Source reference", kind: "text" },
    { name: "description", label: "Description", kind: "textarea" },
    { name: "remediation_plan", label: "Remediation plan", kind: "textarea" },
  ];

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
                  {["Domain", "Overall Status", "Health score", "Overdue / Open exceptions"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {evaluations.map((ev) => (
                  <tr key={ev.status_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-600">{ev.domain_name}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-emerald-600">{ev.overall_status}</td>
                    <td className="px-4 py-3 text-xs font-bold">{Math.round(ev.health_score)}%</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {ev.overdue_obligations} / {ev.open_exceptions}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Compliance Gaps ({gaps.length})
        </h3>
        <CreateRecordForm
          title="Record a compliance gap"
          description="compliance-status-svc opens the gap as OPEN for your legal entity."
          fields={gapFields}
          action={createComplianceGapAction}
          submitLabel="Record gap"
        />
        {!gapRes.ok ? (
          <PanelEmptyState icon={CloudOff} tone="warning" label="compliance-status-svc gaps could not be read" hint={gapRes.error.message} />
        ) : gaps.length === 0 ? (
          <PanelEmptyState icon={ShieldCheck} label="No compliance gaps recorded" hint="Gaps recorded in compliance-status-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Gap", "Domain", "Severity", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {gaps.map((g) => (
                  <tr key={g.gap_id}>
                    <td className="px-4 py-3 text-xs font-medium text-slate-800 dark:text-slate-200">
                      {g.gap_type}
                      <span className="block font-mono text-[10px] font-normal text-slate-400">{g.gap_id}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{g.domain_name}</td>
                    <td className="px-4 py-3 text-xs">{g.severity}</td>
                    <td className="px-4 py-3 text-xs font-medium">{g.status}</td>
                    <td className="px-4 py-3 min-w-[160px]">
                      <RowActions actions={["compliance-gap.resolve"]} recordId={g.gap_id} status={g.status} />
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
          Escalated Exceptions ({exceptions.length})
        </h3>
        {!excRes.ok ? (
          <PanelEmptyState icon={CloudOff} tone="warning" label="exception-escalation-svc could not be read" hint={excRes.error.message} />
        ) : exceptions.length === 0 ? (
          <PanelEmptyState icon={AlertTriangle} label="No escalated exceptions open" hint="Exceptions in exception-escalation-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Type", "Linked to", "Severity", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {exceptions.map((ex) => (
                  <tr key={ex.exception_case_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{ex.exception_type}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {ex.linked_object_type} <span className="font-mono">{ex.linked_object_id}</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-red-500">{ex.severity_level}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-600">{ex.case_status}</td>
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
