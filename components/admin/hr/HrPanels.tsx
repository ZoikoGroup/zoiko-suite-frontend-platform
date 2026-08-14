import { cookies } from "next/headers";
import { CloudOff, Users, Calendar, Building, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listEmployees, listLeaveRequests, listDepartments, type Employee, type LeaveRequest, type Department } from "@/lib/api/hr";

export async function EmployeeMasterPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return <PanelEmptyState icon={ShieldAlert} tone="warning" label="No active session" hint="Sign in to view employees." />;

  const identity = { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId };
  const res = await listEmployees(identity);
  if (!res.ok && res.error.kind === "unreachable") return <PanelEmptyState icon={CloudOff} tone="warning" label="employee-master-svc unavailable" hint={res.error.message} />;

  const employees: Employee[] = res.ok && Array.isArray(res.data) ? res.data : [];

  return (
    <div className="space-y-4">
      {employees.length === 0 ? (
        <PanelEmptyState icon={Users} label="No employee records found" hint="Employees created in employee-master-svc will appear here." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                {["Name", "Email", "Type", "Status", "Hire Date"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {employees.map((e) => (
                <tr key={e.employee_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{e.first_name} {e.last_name}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{e.email}</td>
                  <td className="px-4 py-3 text-xs font-medium">{e.employment_type}</td>
                  <td className="px-4 py-3 text-xs text-emerald-600 font-semibold">{e.status}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{e.hire_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export async function LeaveAndOrgPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return <PanelEmptyState icon={ShieldAlert} tone="warning" label="No active session" hint="Sign in to view leave & org structure." />;

  const identity = { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId };
  const [leaveRes, deptRes] = await Promise.all([listLeaveRequests(identity), listDepartments(identity)]);

  if (!leaveRes.ok && leaveRes.error.kind === "unreachable") return <PanelEmptyState icon={CloudOff} tone="warning" label="leave-absence-svc unavailable" hint={leaveRes.error.message} />;

  const leaveRequests: LeaveRequest[] = leaveRes.ok && Array.isArray(leaveRes.data) ? leaveRes.data : [];
  const departments: Department[] = deptRes.ok && Array.isArray(deptRes.data) ? deptRes.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Leave Requests ({leaveRequests.length})
        </h3>
        {leaveRequests.length === 0 ? (
          <PanelEmptyState icon={Calendar} label="No leave requests pending" hint="Leave requests submitted in leave-absence-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Dates", "Days", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {leaveRequests.map((l) => (
                  <tr key={l.request_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 text-xs">{l.start_date} → {l.end_date}</td>
                    <td className="px-4 py-3 text-xs font-semibold">{l.days_requested} days</td>
                    <td className="px-4 py-3 text-xs text-indigo-600 font-medium">{l.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Departments ({departments.length})
        </h3>
        {departments.length === 0 ? (
          <PanelEmptyState icon={Building} label="No departments registered" hint="Departments created in org-structure-svc will appear here." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Code", "Department Name"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {departments.map((d) => (
                  <tr key={d.department_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{d.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{d.name}</td>
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
