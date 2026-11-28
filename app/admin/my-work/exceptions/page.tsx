import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui";
import { PageHeader, CopyableId } from "@/components/admin/shared";
import { RegisterCard } from "@/components/admin/my-work/RegisterCard";
import { severityTone } from "@/components/admin/my-work/tones";
import { currentSession } from "@/lib/authz-inbox";
import { listEscalatedExceptions, type EscalatedException } from "@/lib/api/compliance";
import { listSoDExceptions, type SoDException } from "@/lib/api/authorization";
import { listPayrollExceptions, type PayrollException } from "@/lib/api/payroll";
import type { ApiResult } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { humanizeCode } from "@/lib/humanize";

export const metadata: Metadata = {
  title: "Exceptions | Zoiko Suite",
};

const OPEN_CASE_STATUSES = ["OPEN", "INVESTIGATING", "ESCALATED"] as const;
const ACTIVE_SOD_STATUSES = ["REQUESTED", "APPROVED"] as const;

/**
 * One register, read once per active status. Asking a service for the newest
 * page across ALL statuses and filtering here hides an old open case behind
 * newer closed ones — the register would claim there is no open work when
 * there is.
 */
function mergeReads<T extends { created_at: string }>(reads: ApiResult<T[]>[]): ApiResult<T[]> {
  const failed = reads.find((r) => !r.ok);
  if (failed) return failed;
  return {
    ok: true,
    data: reads
      .flatMap((r) => (r.ok ? r.data : []))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}

export default async function ExceptionsPage() {
  const current = await currentSession();
  if (!current) redirect("/login");
  const { identity } = current;

  const [caseReads, sodReads, payroll] = await Promise.all([
    Promise.all(
      OPEN_CASE_STATUSES.map((status) => listEscalatedExceptions(identity, { status, limit: 200 })),
    ),
    Promise.all(ACTIVE_SOD_STATUSES.map((status) => listSoDExceptions(identity, { status }))),
    listPayrollExceptions(identity),
  ]);

  const cases = mergeReads(caseReads);
  const sod = mergeReads(sodReads);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exceptions"
        description="Open governance exceptions across compliance, access and payroll, read live from each owning service with your own session."
      />

      <RegisterCard<EscalatedException>
        title="Compliance exception cases"
        description="Cases that are open, under investigation or escalated."
        service="exception-escalation-svc"
        read={cases}
        rowKey={(c) => c.exception_case_id}
        emptyLabel="No open compliance exception"
        link={{ href: "/admin/compliance", label: "Open compliance" }}
        columns={[
          { header: "Case", cell: (c) => <CopyableId value={c.exception_case_id} /> },
          { header: "Type", cell: (c) => humanizeCode(c.exception_type) },
          { header: "Severity", cell: (c) => <Badge tone={severityTone(c.severity_level)}>{humanizeCode(c.severity_level)}</Badge> },
          { header: "Status", cell: (c) => humanizeCode(c.case_status) },
          { header: "Raised by", cell: (c) => <CopyableId value={c.created_by_principal_id} /> },
          { header: "Raised", cell: (c) => formatDateTime(c.created_at) },
        ]}
      />

      <RegisterCard<SoDException>
        title="Duty-conflict exceptions"
        description="Segregation-of-duties exceptions requested or in force."
        service="authorization-svc"
        read={sod}
        rowKey={(e) => e.sod_exception_id}
        emptyLabel="No duty-conflict exception is requested or in force"
        link={{ href: "/admin/authorization", label: "Open authorization" }}
        columns={[
          { header: "Exception", cell: (e) => <CopyableId value={e.sod_exception_id} /> },
          { header: "Principal", cell: (e) => <CopyableId value={e.principal_id} /> },
          { header: "Status", cell: (e) => <Badge tone={e.status === "REQUESTED" ? "warning" : "info"}>{humanizeCode(e.status)}</Badge> },
          { header: "Reason", cell: (e) => e.reason },
          { header: "Expires", cell: (e) => formatDateTime(e.expires_at) },
        ]}
      />

      <RegisterCard<PayrollException>
        title="Payroll exceptions"
        description="Anomalies raised against payroll runs."
        service="payroll-exceptions-svc"
        read={payroll.ok ? { ok: true, data: payroll.data ?? [] } : payroll}
        rowKey={(e) => e.exception_id}
        emptyLabel="No payroll exception"
        link={{ href: "/admin/payroll", label: "Open payroll" }}
        columns={[
          { header: "Exception", cell: (e) => <CopyableId value={e.exception_id} /> },
          { header: "Type", cell: (e) => humanizeCode(e.exception_type) },
          { header: "Severity", cell: (e) => <Badge tone={severityTone(e.severity)}>{humanizeCode(e.severity)}</Badge> },
          { header: "Status", cell: (e) => humanizeCode(e.status) },
          { header: "Description", cell: (e) => e.description },
          { header: "Raised", cell: (e) => formatDateTime(e.created_at) },
        ]}
      />
    </div>
  );
}
