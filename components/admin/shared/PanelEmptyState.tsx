import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "warning";

const TONES: Record<Tone, { wrap: string; icon: string }> = {
  neutral: {
    wrap: "bg-navy-50 dark:bg-navy-500/10",
    icon: "text-navy-700 dark:text-navy-300",
  },
  warning: {
    wrap: "bg-amber-50 dark:bg-amber-500/10",
    icon: "text-amber-600 dark:text-amber-400",
  },
};

type PanelEmptyStateProps = {
  icon: LucideIcon;
  label: string;
  hint?: string;
  tone?: Tone;
  className?: string;
};

/**
 * Placeholder for a dashboard panel with nothing to render — either the service
 * returned no rows, or it could not be reached. Panels never collapse to blank
 * space; an empty container always shows an icon and a label saying why.
 */
export function PanelEmptyState({
  icon: Icon,
  label,
  hint,
  tone = "neutral",
  className,
}: PanelEmptyStateProps) {
  const styles = TONES[tone];

  return (
    <div
      // Marks the degraded/empty state so it can be detected without reading
      // prose. Every panel here falls back to this component when its service
      // is unreachable, and that fallback renders perfectly — so "the page
      // loaded" proves nothing on its own. Searching the page text for
      // "unavailable" is the obvious alternative and it is wrong: several pages
      // EXPLAIN unreachability in their own static copy, and a verification
      // sweep matched that copy and reported a working page as broken.
      data-empty-state={tone}
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-4 py-10 text-center",
        className,
      )}
    >
      <span
        className={cn("flex h-11 w-11 items-center justify-center rounded-xl", styles.wrap)}
      >
        <Icon className={cn("h-5 w-5", styles.icon)} aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
        {hint && (
          <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        )}
      </div>
    </div>
  );
}
