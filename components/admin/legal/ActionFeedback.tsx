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
 */
export function ActionFeedback({
  state,
  className,
}: {
  state: FeedbackState;
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
      <span>{state.message}</span>
    </div>
  );
}
