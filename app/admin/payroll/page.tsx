import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui";
import { PageHeader, CopyableId } from "@/components/admin/shared";
import { RegisterCard } from "@/components/admin/my-work/RegisterCard";
import { severityTone } from "@/components/admin/my-work/tones";
import { currentSession } from "@/lib/authz-inbox";
import {
  listPayrollRuns,
  listCompensationStructures,
  listBenefitPlans,
  listPayrollTaxProfiles,
  listPayrollExceptions,
  type PayrollRun,
  type CompensationStructure,
  type BenefitPlan,
  type TaxProfile,
  type PayrollException,
} from "@/lib/api/payroll";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { humanizeCode } from "@/lib/humanize";

export const metadata: Metadata = { title: "Payroll | Zoiko Suite" };

export default async function PayrollPage() {
  const current = await currentSession();
  if (!current) redirect("/login");
  const { identity } = current;

  const [runs, structures, plans, taxProfiles, exceptions] = await Promise.all([
    listPayrollRuns(identity),
    listCompensationStructures(identity),
    listBenefitPlans(identity),
    listPayrollTaxProfiles(identity),
    listPayrollExceptions(identity),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        description="Payroll runs, compensation, benefits, payroll tax and exceptions, read live from each owning service with your session."
      />

      <RegisterCard<PayrollRun>
        title="Payroll runs"
        description="Pay periods and their gross-to-net totals."
        service="payroll-run-svc"
        read={runs}
        rowKey={(r) => r.payroll_run_id}
        emptyLabel="No payroll run is recorded"
        columns={[
          { header: "Period", cell: (r) => r.pay_period_code },
          { header: "Dates", cell: (r) => `${formatDate(r.period_start_date)} – ${formatDate(r.period_end_date)}` },
          { header: "Status", cell: (r) => humanizeCode(r.status) },
          { header: "Employees", cell: (r) => r.total_employee_count },
          { header: "Gross", cell: (r) => r.total_gross_pay.toLocaleString("en-GB"), className: "text-right" },
          { header: "Net", cell: (r) => r.total_net_pay.toLocaleString("en-GB"), className: "text-right" },
          { header: "Payment date", cell: (r) => formatDate(r.payment_date) },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <RegisterCard<CompensationStructure>
          title="Compensation structures"
          description="Pay structures and base pay."
          service="compensation-svc"
          read={structures}
          rowKey={(s) => s.structure_id}
          emptyLabel="No compensation structure"
          columns={[
            { header: "Title", cell: (s) => s.title },
            { header: "Wage type", cell: (s) => humanizeCode(s.wage_type) },
            { header: "Base pay", cell: (s) => formatMoney(s.base_pay, s.currency) },
            { header: "Frequency", cell: (s) => humanizeCode(s.pay_frequency) },
          ]}
        />

        <RegisterCard<BenefitPlan>
          title="Benefit plans"
          description="Benefit schemes and employer contributions."
          service="benefits-svc"
          read={plans}
          rowKey={(p) => p.plan_id}
          emptyLabel="No benefit plan"
          columns={[
            { header: "Plan", cell: (p) => p.name },
            { header: "Type", cell: (p) => humanizeCode(p.benefit_type) },
            { header: "Provider", cell: (p) => p.provider_name },
            { header: "Employer %", cell: (p) => `${p.employer_contribution_percent}%` },
            { header: "Status", cell: (p) => humanizeCode(p.status) },
          ]}
        />

        <RegisterCard<TaxProfile>
          title="Payroll tax profiles"
          description="Withholding profiles per jurisdiction."
          service="payroll-tax-svc"
          read={taxProfiles}
          rowKey={(t) => t.profile_id}
          emptyLabel="No payroll tax profile"
          columns={[
            { header: "Tax identifier", cell: (t) => t.tax_identifier },
            { header: "Filing status", cell: (t) => humanizeCode(t.filing_status) },
            { header: "Allowances", cell: (t) => t.withholding_allowances },
            { header: "Status", cell: (t) => humanizeCode(t.status) },
          ]}
        />

        <RegisterCard<PayrollException>
          title="Payroll exceptions"
          description="Anomalies raised against payroll runs."
          service="payroll-exceptions-svc"
          read={exceptions}
          rowKey={(e) => e.exception_id}
          emptyLabel="No payroll exception"
          columns={[
            { header: "Run", cell: (e) => <CopyableId value={e.payroll_run_id} /> },
            { header: "Type", cell: (e) => humanizeCode(e.exception_type) },
            { header: "Severity", cell: (e) => <Badge tone={severityTone(e.severity)}>{humanizeCode(e.severity)}</Badge> },
            { header: "Status", cell: (e) => humanizeCode(e.status) },
            { header: "Raised", cell: (e) => formatDateTime(e.created_at) },
          ]}
        />
      </div>
    </div>
  );
}
