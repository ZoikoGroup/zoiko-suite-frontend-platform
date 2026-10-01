import React from "react";
import { cookies } from "next/headers";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listEscalatedExceptions,
  listAnomalies,
  getDecisionSupportChecklist,
} from "@/lib/api/compliance";
import { AlertOctagon, Activity, Sparkles, ShieldCheck } from "lucide-react";

export async function ExceptionAndAnomalyPanels() {
  // Without a resolved identity, listEscalatedExceptions() sends no
  // X-Tenant-Id — the backend's RLS then scopes the query to a "default"
  // tenant that never has rows, so this panel showed an empty queue
  // regardless of real data. See StatusAndEscalationPanel in
  // CompliancePanels.tsx for the same pattern.
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  const identity = session
    ? { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId }
    : undefined;

  const [excRes, anomRes, decRes] = await Promise.all([
    listEscalatedExceptions(identity),
    listAnomalies(identity),
    getDecisionSupportChecklist(identity),
  ]);

  const exceptions = excRes.ok ? excRes.data : [];
  const anomalies = anomRes.ok ? anomRes.data : [];
  const decisions = decRes.ok ? decRes.data : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Exception Escalation Queue */}
        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <AlertOctagon className="h-4 w-4 text-red-500" />
                Escalated Compliance Exceptions
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Active breach tickets from exception-escalation-svc (:8133)
              </CardDescription>
            </div>
            <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
              {exceptions.length} Open
            </span>
          </CardHeader>
          <CardContent>
            {exceptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500 dark:border-slate-800">
                <ShieldCheck className="mb-2 h-6 w-6 text-emerald-500" />
                No active compliance exception escalations
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {exceptions.map((e) => (
                  <div key={e.exception_case_id} className="flex items-center justify-between py-2.5 text-xs">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{e.exception_type}</div>
                      <div className="text-slate-500 text-[11px]">
                        {e.linked_object_type}: {e.linked_object_id} • {e.case_status}
                      </div>
                    </div>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        e.severity_level === "CRITICAL"
                          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      }`}
                    >
                      {e.severity_level}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Anomaly Detection Feed */}
        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <Activity className="h-4 w-4 text-amber-500" />
                Anomaly Detection Signals
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Real-time pattern outliers from anomaly-detection-svc (:8134)
              </CardDescription>
            </div>
            <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              {anomalies.length} Signals
            </span>
          </CardHeader>
          <CardContent>
            {anomalies.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500 dark:border-slate-800">
                <Activity className="mb-2 h-6 w-6 text-slate-400" />
                No behavioral or ledger anomalies detected
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {anomalies.map((a) => (
                  <div key={a.anomaly_id} className="py-2.5 text-xs">
                    <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-slate-100">
                      <span>{a.domain}</span>
                      <span className="font-mono text-[10px] text-amber-600">
                        {Math.round(a.confidence_score * 100)}% Confidence
                      </span>
                    </div>
                    <p className="mt-1 text-slate-600 dark:text-slate-400 text-[11px]">{a.description}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Decision Support Recommendations */}
      <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              Decision Support & Audit Readiness Checklist
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Automated audit posture recommendations from decision-support-svc (:8138)
            </CardDescription>
          </div>
          <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
            {decisions.length} Items
          </span>
        </CardHeader>
        <CardContent>
          {decisions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-800">
              All statutory audit readiness controls verified
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {decisions.map((d) => (
                <div
                  key={d.item_id}
                  className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/40"
                >
                  <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-slate-100">
                    <span>{d.category}</span>
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                      {d.impact_level} IMPACT
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600 dark:text-slate-400 text-[11px]">{d.recommendation}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
