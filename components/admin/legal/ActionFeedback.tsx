"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BANNER_ERROR, BANNER_SUCCESS } from "./field-styles";
import type { BoardActionState, ContractActionState } from "@/app/admin/legal/state";

type FeedbackState = ContractActionState | BoardActionState;

/**
 * Result banner for a lifecycle action.
 *
 * Renders nothing while idle, so a form that has not been submitted leaves no
 * empty container behind. `aria-live` is on the wrapper rather than the message
 * so a screen reader announces the outcome when the action resolves.
 *
 * Accepts either action state — the contract console and the board write path
 * both report status + message, and a divergence between them would read as a
 * rendering bug rather than a choice.
 *
 * `children` carries the record the write produced, read back in plain English
 * underneath the message. A one-line confirmation says the write happened; it
 * does not let the reader check that what was stored is what they meant, and
 * that is the part they cannot get anywhere else on the page.
 */
export function ActionFeedback({
  state,
  children,
  className,
}: {
  state: FeedbackState;
  children?: React.ReactNode;
  className?: string;
}) {
  if (state.status === "idle") return null;

  const isError = state.status === "error";

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm animate-fade-up",
        isError ? BANNER_ERROR : BANNER_SUCCESS,
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {isError ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1 space-y-2.5">
        <p className="leading-relaxed">{state.message}</p>
        {/* The record sits on its own ground rather than tinted by the banner:
            it is a neutral read of what was stored, not part of the verdict. */}
        {!isError && children && (
          <div className="rounded-lg bg-white/70 p-3 ring-1 ring-inset ring-black/5 dark:bg-slate-900/40 dark:ring-white/5">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
