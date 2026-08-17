import { cookies } from "next/headers";
import { CalendarClock, CalendarCheck, CloudOff } from "lucide-react";
import { Badge } from "@/components/ui";
import { PanelEmptyState } from "@/components/admin/shared";
import { listUpcomingObligations } from "@/lib/api/obligations";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

function urgencyTone(days: number): "danger" | "warning" | "neutral" {
  if (days <= 5) return "danger";
  if (days <= 10) return "warning";
  return "neutral";
}

/** Live statutory obligations from obligations-svc (:8088). */
export async function ObligationsPanel() {
  // obligations-svc answers 401 without a tenant and a principal, so this
  // panel carries the session like every other live read on the dashboard.
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  const result = await listUpcomingObligations(5, {
    principalId: session?.principalId,
    tenantId: session?.tenantId,
    legalEntityId: session?.legalEntityId,
  });

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Obligations unavailable"
        hint={result.error.message}
      />
    );
  }

  const obligations = result.data;

  if (obligations.length === 0) {
    return (
      <PanelEmptyState
        icon={CalendarCheck}
        label="No open obligations"
        hint="Statutory and filing deadlines appear here once the Compliance Plane registers them."
      />
    );
  }

  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {obligations.map((obligation) => (
        <li
          key={obligation.id}
          className="flex items-center gap-3 py-3 transition-colors duration-150 first:pt-0 last:pb-0 hover:bg-slate-50 dark:hover:bg-slate-800/60"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 dark:bg-navy-500/10">
            <CalendarClock className="h-4.5 w-4.5 text-navy-700 dark:text-navy-300" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{obligation.title}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{obligation.entity}</p>
          </div>
          {obligation.overdue ? (
            <Badge tone="danger">{Math.abs(obligation.dueInDays)}d overdue</Badge>
          ) : (
            <Badge tone={urgencyTone(obligation.dueInDays)}>{obligation.dueInDays}d left</Badge>
          )}
        </li>
      ))}
    </ul>
  );
}
