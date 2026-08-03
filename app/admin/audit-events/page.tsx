import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { AuditEventActionHeader, AuditEventLedgerPanel } from "@/components/admin/audit-events";
import { getAuditEvents } from "@/lib/api/audit-events";
import { checkServiceHealth, SERVICE_ENDPOINTS } from "@/lib/api-client";

export const metadata: Metadata = {
  title: "Audit Event Store",
  description: "Cryptographic, append-only event store powering auditability and hash-chain verification.",
};

function LedgerSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}

async function AuditEventLedgerContent() {
  const [eventsResult, isServiceAlive] = await Promise.all([
    getAuditEvents(),
    checkServiceHealth(SERVICE_ENDPOINTS.auditEventStore),
  ]);

  return (
    <div className="space-y-6">
      <AuditEventActionHeader
        serviceStatus={isServiceAlive ? "operational" : "attention"}
        activeServices={isServiceAlive ? "1 / 1 Live Backend" : "Offline (Mock Dataset)"}
      />
      <AuditEventLedgerPanel
        events={eventsResult.data}
        summary={eventsResult.summary}
        isMock={eventsResult.isMock}
      />
    </div>
  );
}

export default function AuditEventsPage() {
  return (
    <Suspense fallback={<LedgerSkeleton />}>
      <AuditEventLedgerContent />
    </Suspense>
  );
}
