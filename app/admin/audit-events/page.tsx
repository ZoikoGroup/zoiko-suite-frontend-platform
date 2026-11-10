import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CloudOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { PageHeader, PanelEmptyState } from "@/components/admin/shared";
import { AuditEventLedgerPanel } from "@/components/admin/audit-events";
import { currentSession } from "@/lib/authz-inbox";
import { getAuditEvents } from "@/lib/api/audit-events";

export const metadata: Metadata = { title: "Audit Events | Zoiko Suite" };

export default async function AuditEventsPage() {
  const current = await currentSession();
  if (!current) redirect("/login");

  // Read with the session's own identity: audit-event-store-svc checks
  // AUDIT_EVENT_READ and scopes the log to the caller's tenant.
  const audit = await getAuditEvents(current.identity);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Events"
        description="The append-only audit event store. Each event carries the hash of the one before it, and the service reports whether the chain is intact over the page it returns."
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Event ledger</CardTitle>
            <CardDescription>Latest events from audit-event-store-svc for your tenant.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {audit.ok ? (
            <AuditEventLedgerPanel events={audit.data} summary={audit.summary} />
          ) : (
            <PanelEmptyState icon={CloudOff} tone="warning" label="audit-event-store-svc could not be read" hint={audit.error} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
