import { Building2, AlertTriangle, Clock, ShieldCheck, ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui";
import { KPIS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const ICONS: LucideIcon[] = [Building2, AlertTriangle, Clock, ShieldCheck];

const TONE_STYLES = {
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-rose-600 dark:text-rose-400",
  neutral: "text-slate-500 dark:text-slate-400",
} as const;

export function KpiCardGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {KPIS.map((kpi, i) => {
        const Icon = ICONS[i];
        const DeltaIcon = kpi.direction === "up" ? ArrowUpRight : kpi.direction === "down" ? ArrowDownRight : Minus;
        return (
          <Card
            key={kpi.label}
            className="animate-fade-up p-5 hover:-translate-y-0.5"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {kpi.label}
              </p>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 dark:bg-navy-500/10">
                <Icon className="h-4.5 w-4.5 text-navy-700 dark:text-navy-300" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {kpi.value}
            </p>
            <div className={cn("mt-2 flex items-center gap-1 text-xs font-medium", TONE_STYLES[kpi.tone])}>
              <DeltaIcon className="h-3.5 w-3.5" />
              <span>{kpi.delta}</span>
              <span className="font-normal text-slate-400 dark:text-slate-500">{kpi.helper}</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
