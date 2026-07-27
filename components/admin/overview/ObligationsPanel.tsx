import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui";
import { UPCOMING_OBLIGATIONS } from "@/lib/mock-data";

function urgencyTone(days: number): "danger" | "warning" | "neutral" {
  if (days <= 5) return "danger";
  if (days <= 10) return "warning";
  return "neutral";
}

export function ObligationsPanel() {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {UPCOMING_OBLIGATIONS.map((obligation) => (
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
          <Badge tone={urgencyTone(obligation.dueInDays)}>
            {obligation.dueInDays}d left
          </Badge>
        </li>
      ))}
    </ul>
  );
}
