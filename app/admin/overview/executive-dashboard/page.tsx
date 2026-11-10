import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { FileClock, GitPullRequest, History, TriangleAlert } from "lucide-react";
import { Skeleton, StatCard, type StatTone } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import { KpiCardGrid, DomainStatusGrid } from "@/components/admin/overview";
import { describeReadError } from "@/components/admin/my-work/RegisterCard";
import { currentSession } from "@/lib/authz-inbox";
import { getAuditEvents } from "@/lib/api/audit-events";
import { listEscalatedExceptions } from "@/lib/api/compliance";
import { listObligations, isTerminal } from "@/lib/api/obligations";
import { listPendingApprovals } from "@/lib/api/workflow";
import type { ApiError } from "@/lib/api/client";

export const metadata: Metadata = {
  title: "Executive Dashboard | Zoiko Suite",
};

type Figure = { label: string; icon: LucideIcon; tone: StatTone; value: ReactNode; helper: ReactNode };

function unavailable(label: string, icon: LucideIcon, service: string, error: ApiError): Figure {
  const why = describeReadError(service, error);
  return { label, icon, tone: "gold", value: "—", helper: why.label };
}

/**
 * Governance figures, each read from the service that owns it with the
 * session's identity. A figure that could not be read shows a dash and says
 * why; it is never a zero, which would claim there is nothing to act on.
 */
async function GovernanceFigures() {
  const current = await currentSession();
  if (!current) redirect("/login");
  const { identity } = current;

  const [audit, cases, obligations, workflows] = await Promise.all([
    getAuditEvents(identity),
    listEscalatedExceptions(identity),
    listObligations({ identity, legalEntityId: identity.legalEntityId, limit: 500 }),
    listPendingApprovals(identity, { limit: 100 }),
  ]);

  const figures: Figure[] = [];

  figures.push(
    audit.ok
      ? {
          label: "Audit events recorded",
          icon: History,
          tone: audit.summary.hashChainVerified ? "emerald" : "rose",
          value: audit.summary.totalEvents,
          helper: audit.summary.hashChainVerified
            ? `Hash chain valid over the latest ${audit.summary.returnedEvents}`
            : `Hash chain NOT valid over the latest ${audit.summary.returnedEvents}`,
        }
      : { label: "Audit events recorded", icon: History, tone: "gold", value: "—", helper: `audit-event-store-svc: ${audit.error}` },
  );

  if (cases.ok) {
    const open = cases.data.filter((c) => c.case_status !== "RESOLVED" && c.case_status !== "CLOSED");
    const severe = open.filter((c) => c.severity_level === "HIGH" || c.severity_level === "CRITICAL").length;
    figures.push({
      label: "Open exception cases",
      icon: TriangleAlert,
      tone: severe > 0 ? "rose" : "navy",
      value: open.length,
      helper: `${severe} high or critical`,
    });
  } else {
    figures.push(unavailable("Open exception cases", TriangleAlert, "exception-escalation-svc", cases.error));
  }

  if (obligations.ok) {
    const open = obligations.data.filter((o) => !isTerminal(o.obligation_status));
    const overdue = open.filter((o) => o.obligation_status === "OVERDUE").length;
    figures.push({
      label: "Open obligations",
      icon: FileClock,
      tone: overdue > 0 ? "rose" : "violet",
      value: open.length,
      helper: `${overdue} overdue, on your legal entity`,
    });
  } else {
    figures.push(unavailable("Open obligations", FileClock, "obligations-svc", obligations.error));
  }

  figures.push(
    workflows.ok
      ? {
          label: "Approvals pending",
          icon: GitPullRequest,
          tone: "navy",
          value: (workflows.data ?? []).length,
          helper: "Workflow instances pending or escalated",
        }
      : unavailable("Approvals pending", GitPullRequest, "workflow-svc", workflows.error),
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {figures.map((f) => (
        <StatCard key={f.label} label={f.label} value={f.value} icon={f.icon} tone={f.tone} helper={f.helper} />
      ))}
    </div>
  );
}

function RowSkeleton({ count, height }: { count: number; height: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={`${height} rounded-xl`} />
      ))}
    </div>
  );
}

export default function ExecutiveDashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Executive Dashboard"
        description="Governance status across domains, read live from the owning services with your session."
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight text-navy-950 dark:text-slate-100">Governance</h2>
        <Suspense fallback={<RowSkeleton count={4} height="h-32" />}>
          <GovernanceFigures />
        </Suspense>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight text-navy-950 dark:text-slate-100">Platform</h2>
        <Suspense fallback={<RowSkeleton count={4} height="h-32" />}>
          <KpiCardGrid />
        </Suspense>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight text-navy-950 dark:text-slate-100">Domains</h2>
        <Suspense fallback={<RowSkeleton count={8} height="h-36" />}>
          <DomainStatusGrid />
        </Suspense>
      </section>
    </div>
  );
}
