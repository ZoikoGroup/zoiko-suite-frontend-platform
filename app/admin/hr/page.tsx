import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { PageHeader, CopyableId } from "@/components/admin/shared";
import { EmploymentContractsPanel } from "@/components/admin/hr";
import { RegisterCard } from "@/components/admin/my-work/RegisterCard";
import { severityTone } from "@/components/admin/my-work/tones";
import { currentSession } from "@/lib/authz-inbox";
import {
  listEmployees,
  listLeaveRequests,
  listDepartments,
  listReviewCycles,
  listWorkforceAlerts,
  type Employee,
  type LeaveRequest,
  type Department,
  type ReviewCycle,
  type ComplianceAlert,
} from "@/lib/api/hr";
import { formatDate, formatDateTime } from "@/lib/format";
import { humanizeCode } from "@/lib/humanize";

export const metadata: Metadata = { title: "HR & Workforce | Zoiko Suite" };

export default async function HrPage() {
  const current = await currentSession();
  if (!current) redirect("/login");
  const { identity } = current;

  const [employees, leave, departments, cycles, alerts] = await Promise.all([
    listEmployees(identity),
    listLeaveRequests(identity),
    listDepartments(identity),
    listReviewCycles(identity),
    listWorkforceAlerts(identity),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR & Workforce"
        description="Employee master, leave, organisation structure, performance and workforce compliance, read live from each owning service with your session."
      />

      <RegisterCard<Employee>
        title="Employees"
        description="The employee master for your legal entity."
        service="employee-master-svc"
        read={employees}
        rowKey={(e) => e.employee_id}
        emptyLabel="No employee is recorded for this legal entity"
        columns={[
          { header: "Name", cell: (e) => `${e.first_name} ${e.last_name}` },
          { header: "Email", cell: (e) => e.email },
          { header: "Job title", cell: (e) => e.job_title || "—" },
          { header: "Type", cell: (e) => humanizeCode(e.employment_type || e.worker_type || "") || "—" },
          { header: "Status", cell: (e) => <Badge tone={e.status === "ACTIVE" ? "success" : "neutral"}>{humanizeCode(e.status)}</Badge> },
          { header: "Hired", cell: (e) => formatDate(e.hire_date) },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <RegisterCard<LeaveRequest>
          title="Leave requests"
          description="Leave and absence requests."
          service="leave-absence-svc"
          read={leave}
          rowKey={(r) => r.request_id}
          emptyLabel="No leave request"
          columns={[
            { header: "Employee", cell: (r) => <CopyableId value={r.employee_id} /> },
            { header: "From", cell: (r) => formatDate(r.start_date) },
            { header: "To", cell: (r) => formatDate(r.end_date) },
            { header: "Status", cell: (r) => humanizeCode(r.status) },
          ]}
        />

        <RegisterCard<Department>
          title="Departments"
          description="The organisation structure."
          service="org-structure-svc"
          read={departments}
          rowKey={(d) => d.department_id}
          emptyLabel="No department is recorded"
          columns={[
            { header: "Code", cell: (d) => d.code },
            { header: "Name", cell: (d) => d.name },
            { header: "Manager", cell: (d) => (d.manager_id ? <CopyableId value={d.manager_id} /> : "—") },
          ]}
        />

        <RegisterCard<ReviewCycle>
          title="Review cycles"
          description="Performance review cycles."
          service="performance-review-svc"
          read={cycles}
          rowKey={(c) => c.cycle_id}
          emptyLabel="No review cycle"
          columns={[
            { header: "Name", cell: (c) => c.name },
            { header: "From", cell: (c) => formatDate(c.start_date) },
            { header: "To", cell: (c) => formatDate(c.end_date) },
            { header: "Status", cell: (c) => humanizeCode(c.status) },
          ]}
        />

        <RegisterCard<ComplianceAlert>
          title="Workforce compliance alerts"
          description="Alerts raised by workforce compliance checks."
          service="workforce-compliance-svc"
          read={alerts}
          rowKey={(a) => a.alert_id}
          emptyLabel="No workforce compliance alert"
          columns={[
            { header: "Type", cell: (a) => humanizeCode(a.alert_type) },
            { header: "Severity", cell: (a) => <Badge tone={severityTone(a.severity)}>{humanizeCode(a.severity)}</Badge> },
            { header: "Status", cell: (a) => humanizeCode(a.status) },
            { header: "Raised", cell: (a) => formatDateTime(a.created_at) },
          ]}
        />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Employment contracts</CardTitle>
            <CardDescription>Issue, amend, terminate and look up employment contracts in employment-contracts-svc.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <EmploymentContractsPanel />
        </CardContent>
      </Card>
    </div>
  );
}
