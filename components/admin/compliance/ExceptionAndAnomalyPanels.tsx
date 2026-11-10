import React from "react";
import { cookies } from "next/headers";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession, toIdentity } from "@/lib/auth";
import { listEscalatedExceptions } from "@/lib/api/compliance";
import { listAnomalies, listRecommendations } from "@/lib/api/intelligence";
import { loadJurisdictionOptions } from "@/components/admin/tax/jurisdiction-options";
import { CreateExceptionForm } from "./CreateExceptionForm";
import { AlertOctagon, Activity, Sparkles, ShieldCheck, ShieldAlert, CloudOff } from "lucide-react";

// Exceptions, anomalies and decision-support recommendations for the session's
// entity. These reads used to send no identity (every one answered 401, shown
// as "0 Open"), read anomalies and recommendations in shapes the services do
// not return, and showed an empty recommendation list as "All statutory audit
// readiness controls verified". Anomalies and recommendations now come from
// the same clients as /admin/intelligence.

function Failed({ svc, message }: { svc: string; message: string }) {
  return <PanelEmptyState icon={CloudOff} tone="warning" label={`${svc} could not be read`} hint={message} />;
}

export async function ExceptionAndAnomalyPanels() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return <PanelEmptyState icon={ShieldAlert} tone="warning" label="No active session" hint="Sign in to view exceptions and signals." />;
  }
  const identity = toIdentity(session);

  const [excRes, anomRes, decRes, jurisdictions] = await Promise.all([
    listEscalatedExceptions(identity),
    listAnomalies(identity),
    listRecommendations(identity),
    loadJurisdictionOptions(),
  ]);

  const open = excRes.ok
    ? excRes.data.filter((e) => e.case_status !== "RESOLVED" && e.case_status !== "CLOSED").length
    : null;

  return (
    <div className="space-y-6">
      <CreateExceptionForm jurisdictions={jurisdictions} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Exception Escalation Queue */}
        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <AlertOctagon className="h-4 w-4 text-red-500" />
                Compliance Exceptions
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">From exception-escalation-svc</CardDescription>
            </div>
            {open !== null && (
              <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
                {open} Open
              </span>
            )}
          </CardHeader>
          <CardContent>
            {!excRes.ok ? (
              <Failed svc="exception-escalation-svc" message={excRes.error.message} />
            ) : excRes.data.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500 dark:border-slate-800">
                <ShieldCheck className="mb-2 h-6 w-6 text-slate-400" />
                No compliance exceptions recorded
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {excRes.data.map((e) => (
                  <div key={e.exception_case_id} className="flex items-center justify-between py-2.5 text-xs">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{e.exception_type}</div>
                      <div className="text-slate-500 text-[11px]">
                        {e.linked_object_type} {e.linked_object_id} • {e.case_status}
                      </div>
                      {e.description && (
                        <div className="text-slate-600 dark:text-slate-400 text-[11px]">{e.description}</div>
                      )}
                      <div className="font-mono text-[10px] text-slate-400">{e.exception_case_id}</div>
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
                Anomalies
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">From anomaly-detection-svc</CardDescription>
            </div>
            {anomRes.ok && (
              <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                {anomRes.data.length} Recorded
              </span>
            )}
          </CardHeader>
          <CardContent>
            {!anomRes.ok ? (
              <Failed svc="anomaly-detection-svc" message={anomRes.error.message} />
            ) : anomRes.data.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500 dark:border-slate-800">
                <Activity className="mb-2 h-6 w-6 text-slate-400" />
                No anomalies recorded
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {anomRes.data.map((a) => (
                  <div key={a.anomaly_id} className="py-2.5 text-xs">
                    <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-slate-100">
                      <span>{a.domain_name}</span>
                      <span className="font-mono text-[10px] text-amber-600">
                        {a.severity} · score {a.anomaly_score}
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
              Decision Support Recommendations
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              From decision-support-svc. A recommendation is advisory until a person accepts it.
            </CardDescription>
          </div>
          {decRes.ok && (
            <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
              {decRes.data.length} Items
            </span>
          )}
        </CardHeader>
        <CardContent>
          {!decRes.ok ? (
            <Failed svc="decision-support-svc" message={decRes.error.message} />
          ) : decRes.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-800">
              No recommendations recorded
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {decRes.data.map((d) => (
                <div
                  key={d.recommendation_id}
                  className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/40"
                >
                  <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-slate-100">
                    <span>{d.subject_type} {d.subject_reference}</span>
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                      {d.status}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600 dark:text-slate-400 text-[11px]">
                    {d.recommended_action} — {d.rationale}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
