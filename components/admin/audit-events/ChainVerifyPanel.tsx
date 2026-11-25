"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { formatDateTime } from "@/lib/format";
import { verifyChain } from "@/app/admin/audit-events/actions";
import { IDLE_CHAIN_VERIFY, type ChainVerifyState } from "@/app/admin/audit-events/state";

const TONE = {
  checked: "success",
  error: "error",
  idle: "neutral",
} as const;

/**
 * "Walk the whole chain, right now."
 *
 * A zero-field form — the action takes nothing from the reader, only their
 * identity — so this is a single button rather than the input+button shape
 * every other form on this page uses. `tone` is picked from the RESULT, not
 * from `state.status`: a successful call that reports a broken chain must
 * still read as an alarm, not a success banner.
 */
export function ChainVerifyPanel() {
  const [state, action, pending] = useActionState<ChainVerifyState, FormData>(
    verifyChain,
    IDLE_CHAIN_VERIFY,
  );

  const tone =
    state.status === "checked" ? (state.result?.verified ? "success" : "error") : TONE[state.status];

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {!pending && <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
          {pending ? "Walking the chain…" : "Verify the full chain now"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Checks every event this session can see, end to end — not just the page above.
        </p>
      </div>

      <ResultBanner tone={tone} message={state.message}>
        {state.result && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Checked at {formatDateTime(state.result.timestamp)}.
          </p>
        )}
      </ResultBanner>
    </form>
  );
}
