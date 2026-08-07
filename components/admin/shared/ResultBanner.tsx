"use client";

import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { BANNER_ERROR, BANNER_NEUTRAL, BANNER_SUCCESS, BANNER_WARNING } from "./form";

export type BannerTone = "success" | "neutral" | "warning" | "error";

const TONES: Record<BannerTone, { className: string; icon: typeof Info }> = {
  success: { className: BANNER_SUCCESS, icon: CheckCircle2 },
  neutral: { className: BANNER_NEUTRAL, icon: Info },
  warning: { className: BANNER_WARNING, icon: TriangleAlert },
  error: { className: BANNER_ERROR, icon: AlertCircle },
};

/**
 * Outcome banner for a form submission.
 *
 * Four tones rather than two. Several services in this suite answer 200 for
 * something that is not a success in the way a reader expects — a replayed
 * idempotent write that changed nothing, a MISSING evidence verdict, a policy
 * that could not be evaluated. Those need to read as neither green nor red, and
 * collapsing them into either would misreport what happened.
 *
 * Renders nothing when there is no message, so an unsubmitted form leaves no
 * empty container.
 */
export function ResultBanner({
  tone,
  message,
  children,
  className,
}: {
  tone: BannerTone;
  message?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  if (!message && !children) return null;
  const { className: toneClass, icon: Icon } = TONES[tone];

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm animate-fade-up",
        toneClass,
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2">
        {message && <p>{message}</p>}
        {children}
      </div>
    </div>
  );
}
