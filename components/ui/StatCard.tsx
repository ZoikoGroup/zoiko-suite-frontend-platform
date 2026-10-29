import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./Card";

export type StatTone = "navy" | "gold" | "rose" | "violet" | "emerald";

const TILE: Record<StatTone, string> = {
  navy: "bg-navy-50 text-navy-500 dark:bg-navy-500/15 dark:text-navy-300",
  gold: "bg-gold-50 text-gold-600 dark:bg-gold-500/15 dark:text-gold-300",
  rose: "bg-rose-50 text-rose-500 dark:bg-rose-500/15 dark:text-rose-300",
  violet: "bg-violet-50 text-violet-500 dark:bg-violet-500/15 dark:text-violet-300",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
};

type StatCardProps = {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: StatTone;
  /** The line under the number — what it covers or how it is changing. */
  helper?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/** A headline number: tinted icon tile, label, value, one line of context. */
export function StatCard({ label, value, icon: Icon, tone = "navy", helper, className, style }: StatCardProps) {
  return (
    <Card className={cn("flex items-start gap-4 p-5", className)} style={style}>
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", TILE[tone])}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-navy-950 dark:text-slate-100">{label}</p>
        <p className="mt-1.5 text-[28px] font-bold leading-none tracking-tight text-navy-950 tabular-nums dark:text-white">
          {value}
        </p>
        {helper && <div className="mt-2.5 text-[13px] text-slate-500 dark:text-slate-400">{helper}</div>}
      </div>
    </Card>
  );
}
