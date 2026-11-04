import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow duration-200 hover:shadow-[0_6px_20px_-8px_rgba(16,24,40,0.12)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none dark:hover:shadow-none dark:hover:ring-1 dark:hover:ring-slate-700",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  // Some headers put a bare CardTitle beside its CardDescription in this row;
  // from md up the title keeps one line and the description takes the rest.
  return (
    <div
      className={cn("flex items-start justify-between gap-4 p-6 pb-0 md:[&>h3]:shrink-0", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-base font-semibold tracking-tight text-navy-950 dark:text-slate-100", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6", className)} {...props} />;
}
