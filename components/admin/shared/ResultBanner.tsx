"use client";

import { Children } from "react";
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
  testId,
}: {
  tone: BannerTone;
  message?: string;
  children?: React.ReactNode;
  className?: string;
  /**
   * Stable hook for end-to-end tests.
   *
   * Every banner already carries role="status", which is right for screen
   * readers and useless for a spec on a page with seven forms — they are all
   * the same role and their text is written to be read by a person, so
   * matching on it would couple the suite to prose. Optional: only surfaces
   * that are actually driven by a spec pass one.
   */
  testId?: string;
}) {
  // Children.toArray, not a bare truthiness check on `children`.
  //
  // A caller writing two conditional children —
  //
  //     <ResultBanner ...>
  //       {state.lease && <JsonBlock value={state.lease} />}
  //       {state.tokenIssued && <p>…</p>}
  //     </ResultBanner>
  //
  // hands us an ARRAY of [undefined, false] when neither condition holds, and an
  // array is truthy. `!children` was therefore false and an empty bordered box
  // rendered under the form before anything had been submitted. With a single
  // conditional child the same code returned null correctly, which is why this
  // survived: it was invisible on six of the seven forms using it and only
  // showed on the one that happened to pass two.
  //
  // Children.toArray drops null, undefined and booleans, so this asks the
  // question that was always meant: is there anything to render?
  const renderable = Children.toArray(children).length > 0;
  if (!message && !renderable) return null;
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
      data-testid={testId}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2">
        {message && <p>{message}</p>}
        {children}
      </div>
    </div>
  );
}
