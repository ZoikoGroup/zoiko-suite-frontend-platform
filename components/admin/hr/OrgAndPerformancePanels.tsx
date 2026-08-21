import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui";
import { listDepartments, listReviewCycles, listWorkforceAlerts } from "@/lib/api/hr";
import { Network, Award, ShieldAlert, Users, FolderTree } from "lucide-react";

export async function OrgAndPerformancePanels() {
  const [deptRes, cycleRes, alertRes] = await Promise.all([
    listDepartments(),
    listReviewCycles(),
    listWorkforceAlerts(),
  ]);

  const departments = deptRes.ok ? deptRes.data : [];
  const cycles = cycleRes.ok ? cycleRes.data : [];
  const alerts = alertRes.ok ? alertRes.data : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Org Structure / Departments */}
        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <FolderTree className="h-4 w-4 text-teal-500" />
                Department Hierarchy & Structure
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Live organization registry from org-structure-svc (:8116)
              </CardDescription>
            </div>
            <span className="rounded-md bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
              {departments.length} Units
            </span>
          </CardHeader>
          <CardContent>
            {departments.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500 dark:border-slate-800">
                <Network className="mb-2 h-6 w-6 text-slate-400" />
                No department structures found for active tenant
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {departments.map((d) => (
                  <div
                    key={d.department_id}
                    className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/40"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{d.name}</span>
                        <span className="font-mono text-[10px] text-slate-500">{d.code}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        Manager ID: <span className="font-mono">{d.manager_id ? d.manager_id.slice(0, 8) : "None assigned"}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance Review Cycles */}
        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <Award className="h-4 w-4 text-purple-500" />
                Performance Review Cycles
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Evaluation schedules from performance-review-svc (:8139)
              </CardDescription>
            </div>
            <span className="rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 dark:bg-purple-950/50 dark:text-purple-300">
              {cycles.length} Cycles
            </span>
          </CardHeader>
          <CardContent>
            {cycles.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500 dark:border-slate-800">
                <Award className="mb-2 h-6 w-6 text-slate-400" />
                No active performance review cycles scheduled
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                {cycles.map((c) => (
                  <div key={c.cycle_id} className="flex items-center justify-between py-2.5 text-xs">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{c.name}</div>
                      <div className="text-slate-500 text-[11px]">
                        {c.start_date?.slice(0, 10)} to {c.end_date?.slice(0, 10)}
                      </div>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                        c.status === "ACTIVE"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Workforce Compliance Alerts */}
      <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              Workforce Compliance Alerts
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Regulatory and policy threshold breaches from workforce-compliance-svc (:8118)
            </CardDescription>
          </div>
          <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
            {alerts.length} Flagged
          </span>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-800">
              All employee compliance requirements and working limits satisfied
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
              {alerts.map((a) => (
                <div key={a.alert_id} className="flex items-center justify-between py-2.5 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {a.alert_type.replace(/_/g, " ")} • Employee {a.employee_id?.slice(0, 8)}
                    </div>
                    <div className="text-slate-500 text-[11px]">{a.description}</div>
                  </div>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      a.severity === "CRITICAL" || a.severity === "HIGH"
                        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    }`}
                  >
                    {a.severity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
