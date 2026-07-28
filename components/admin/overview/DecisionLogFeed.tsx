import { CheckCircle2, AlertCircle, XCircle, ScrollText, CloudOff } from "lucide-react";
import { listDecisions, type DecisionOutcome } from "@/lib/api/governance";
import { PanelEmptyState } from "@/components/admin/shared";
import { cn } from "@/lib/utils";

const OUTCOME_CONFIG: Record<
  DecisionOutcome,
  { icon: typeof CheckCircle2; className: string; label: string }
> = {
  authorized: {
    icon: CheckCircle2,
    className: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10",
    label: "Authorized",
  },
  escalated: {
    icon: AlertCircle,
    className: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10",
    label: "Escalated",
  },
  denied: {
    icon: XCircle,
    className: "text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/10",
    label: "Blocked",
  },
};

/** Live governance decisions from governance-decision-log-svc (:8083). */
export async function DecisionLogFeed() {
  const result = await listDecisions({ limit: 8 });

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Decision log unavailable"
        hint={result.error.message}
      />
    );
  }

  const entries = result.data;

  if (entries.length === 0) {
    return (
      <PanelEmptyState
        icon={ScrollText}
        label="No governance decisions recorded yet"
        hint="Decisions appear here as soon as the Governance Plane logs its first evidence entry."
      />
    );
  }

  return (
    <div className="flow-root">
      <ul className="-mb-6">
        {entries.map((entry, i) => {
          const outcome = OUTCOME_CONFIG[entry.outcome];
          const isLast = i === entries.length - 1;
          return (
            <li key={entry.id}>
              <div className="relative pb-6">
                {!isLast && (
                  <span
                    className="absolute left-4 top-8 -ml-px h-full w-px bg-slate-200 dark:bg-slate-800"
                    aria-hidden="true"
                  />
                )}
                <div className="relative flex items-start gap-3">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white dark:ring-slate-900",
                      outcome.className,
                    )}
                  >
                    <outcome.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{entry.actor}</span>{" "}
                      executed{" "}
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-navy-700 dark:bg-slate-800 dark:text-navy-300">
                        {entry.action}
                      </code>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{entry.entity}</p>
                    {entry.note && (
                      <p className="mt-1 text-xs italic text-slate-400 dark:text-slate-500">{entry.note}</p>
                    )}
                  </div>
                  <span className="whitespace-nowrap pt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    {entry.timeAgo}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
