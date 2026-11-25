import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui";
import { PageHeader, CopyableId } from "@/components/admin/shared";
import { RegisterCard } from "@/components/admin/my-work/RegisterCard";
import { severityTone } from "@/components/admin/my-work/tones";
import { currentSession } from "@/lib/authz-inbox";
import { listEscalatedExceptions, type EscalatedException } from "@/lib/api/compliance";
import { listObligations, isTerminal, type Obligation } from "@/lib/api/obligations";
import { formatDate, formatDateTime } from "@/lib/format";
import { humanizeCode } from "@/lib/humanize";

export const metadata: Metadata = {
  title: "Assigned Actions | Zoiko Suite",
};

export default async function AssignedActionsPage() {
  const current = await currentSession();
  if (!current) redirect("/login");
  const { identity } = current;
  const me = identity.principalId;

  const [cases, obligations] = await Promise.all([
    listEscalatedExceptions(identity),
    listObligations({ identity, legalEntityId: identity.legalEntityId, limit: 500 }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assigned Actions"
        description="Follow-up actions that name you, read live with your own session."
      />

      <RegisterCard<EscalatedException>
        title="Exception cases assigned to you"
        description="Compliance exception cases whose assignee is you and which are not yet resolved."
        service="exception-escalation-svc"
        read={
          cases.ok
            ? {
                ok: true,
                data: cases.data.filter(
                  (c) => c.assigned_to_user === me && c.case_status !== "RESOLVED" && c.case_status !== "CLOSED",
                ),
              }
            : cases
        }
        rowKey={(c) => c.exception_case_id}
        emptyLabel="No exception case is assigned to you"
        emptyHint="Cases assigned to a role rather than a named person are listed under Exceptions."
        link={{ href: "/admin/my-work/exceptions", label: "All exceptions" }}
        columns={[
          { header: "Case", cell: (c) => <CopyableId value={c.exception_case_id} /> },
          { header: "Type", cell: (c) => humanizeCode(c.exception_type) },
          { header: "Severity", cell: (c) => <Badge tone={severityTone(c.severity_level)}>{humanizeCode(c.severity_level)}</Badge> },
          { header: "Status", cell: (c) => humanizeCode(c.case_status) },
          { header: "About", cell: (c) => `${humanizeCode(c.linked_object_type)} ${c.linked_object_id}` },
          { header: "Raised", cell: (c) => formatDateTime(c.created_at) },
        ]}
      />

      <RegisterCard<Obligation>
        title="Open obligations you recorded"
        description="Obligations on your legal entity that you created and that are not closed, soonest due first. The obligations service records who created an obligation, not who owns it."
        service="obligations-svc"
        read={
          obligations.ok
            ? {
                ok: true,
                data: obligations.data.filter(
                  (o) => o.created_by_principal_id === me && !isTerminal(o.obligation_status),
                ),
              }
            : obligations
        }
        rowKey={(o) => o.obligation_id}
        emptyLabel="No open obligation recorded by you"
        link={{ href: "/admin/obligations", label: "Open obligations" }}
        columns={[
          { header: "Obligation", cell: (o) => o.obligation_code || <CopyableId value={o.obligation_id} /> },
          { header: "Type", cell: (o) => humanizeCode(o.obligation_type) },
          {
            header: "Status",
            cell: (o) => (
              <Badge tone={o.obligation_status === "OVERDUE" ? "danger" : "warning"}>{humanizeCode(o.obligation_status)}</Badge>
            ),
          },
          { header: "Severity", cell: (o) => humanizeCode(o.severity_level) },
          { header: "Function", cell: (o) => humanizeCode(o.responsible_function) },
          { header: "Due", cell: (o) => formatDate(o.due_date) },
        ]}
      />
    </div>
  );
}
