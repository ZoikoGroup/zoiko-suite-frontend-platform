import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * What a figure means for the reader, not how big it is: navy for plain
 * context, green for "as it should be", amber for "needs someone soon", red
 * for "needs someone now", grey for "could not be read".
 */
export type KpiTone = "navy" | "green" | "amber" | "red" | "neutral";

const TILE: Record<KpiTone, string> = {
  navy: "bg-navy-50 text-navy-600 dark:bg-navy-500/15 dark:text-navy-300",
  green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  amber: "bg-gold-50 text-gold-600 dark:bg-gold-500/15 dark:text-gold-300",
  red: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  neutral: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const WORD: Record<KpiTone, string> = {
  navy: "text-navy-600 dark:text-navy-300",
  green: "text-emerald-600 dark:text-emerald-400",
  amber: "text-amber-600 dark:text-amber-400",
  red: "text-rose-600 dark:text-rose-400",
  neutral: "text-slate-500 dark:text-slate-400",
};

/**
 * One headline figure in the console's KPI row: tinted tile and label on one
 * line, the number under them, then a coloured status word and its context.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "navy",
  status,
  helper,
  href,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: KpiTone;
  /** The coloured word or two under the number ("Pending sign-off"). */
  status?: ReactNode;
  helper?: ReactNode;
  /** Where the figure's records are. */
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", TILE[tone])}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <p className="min-w-0 text-[13px] font-semibold leading-snug text-navy-950 dark:text-slate-100">{label}</p>
      </div>
      <p className="mt-4 text-[30px] font-bold leading-none tracking-tight text-navy-950 tabular-nums dark:text-white">{value}</p>
      {(status || helper) && (
        <p className="mt-3 text-[12px] leading-snug">
          {status && <span className={cn("font-semibold", WORD[tone])}>{status}</span>}
          {status && helper && " "}
          {helper && <span className="text-slate-500 dark:text-slate-400">{helper}</span>}
        </p>
      )}
    </>
  );
  if (!href) return <Card className="p-5">{body}</Card>;
  return (
    <Link href={href} scroll={false} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500">
      <Card className="h-full p-5 group-hover:border-navy-200 dark:group-hover:border-navy-500/40">{body}</Card>
    </Link>
  );
}

/** The row of five: one column on a phone, two on a tablet, five from xl. */
export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{children}</div>;
}
