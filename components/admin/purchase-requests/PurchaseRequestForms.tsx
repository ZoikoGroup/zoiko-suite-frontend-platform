"use client";

// Forms wired to the purchase-requests domain's own actions.ts.
//
// These are deliberately separate from the same-named forms in commercial-ops/
// — the commercial-ops page uses these forms as part of the full procurement
// workflow (request → order → spend check), so they import from
// commercial-ops/actions. This domain page owns its own write surface and
// these forms import from here.

import Link from "next/link";
import { useActionState } from "react";
import { CheckCircle2, Info, AlertCircle, ThumbsUp, ThumbsDown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  submitPurchaseRequest,
  submitRequestApproval,
  submitRequestRejection,
} from "@/app/admin/purchase-requests/actions";
import {
  IDLE_REQUEST_STATE,
  CURRENCIES,
  type RequestActionState,
} from "@/app/admin/purchase-requests/state";

const FEEDBACK = {
  created: {
    icon: CheckCircle2,
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  approved: {
    icon: ThumbsUp,
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  rejected: {
    icon: ThumbsDown,
    className:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  },
  replayed: {
    icon: Info,
    className:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
  },
  "already-decided": {
    icon: Info,
    className:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  },
  error: {
    icon: AlertCircle,
    className:
      "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  },
} as const;

const FIELD =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "outline-none transition-colors placeholder:text-slate-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 " +
  "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

const LABEL = "mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400";

function Feedback({ state }: { state: RequestActionState }) {
  if (state.status === "idle") return null;
  const feedback = FEEDBACK[state.status];
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border px-3.5 py-3 text-sm animate-fade-up",
        feedback.className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2.5">
        <feedback.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="break-words flex-1 font-medium">{state.message}</span>
      </div>
      {state.requestId && (
        <div className="mt-1 flex flex-wrap items-center gap-3 pt-2 border-t border-black/5 dark:border-white/10 text-xs">
          <Link
            href={`/admin/commercial-ops`}
            className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:opacity-80"
          >
            Issue Purchase Order in Commercial Ops <ArrowRight className="h-3 w-3" />
          </Link>
          <span className="opacity-40">•</span>
          <span className="font-mono text-[11px] opacity-75">
            ID: {state.requestId}
          </span>
        </div>
      )}
    </div>
  );
}

/** Step 1 — raise a requisition. It lands PENDING and authorises nothing. */
export function RaiseRequestForm() {
  const [state, action, pending] = useActionState<RequestActionState, FormData>(
    submitPurchaseRequest,
    IDLE_REQUEST_STATE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor="pr-description" className={LABEL}>
            What is being requested
          </label>
          <input
            id="pr-description"
            name="description"
            required
            placeholder="Dell Latitude refresh, 12 units"
            className={FIELD}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="pr-amount" className={LABEL}>
            Amount
          </label>
          <input
            id="pr-amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="4800.00"
            className={FIELD}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="pr-currency-code" className={LABEL}>
            Currency
          </label>
          <select
            id="pr-currency-code"
            name="currency_code"
            defaultValue="GBP"
            className={FIELD}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Raising…" : "Raise request"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Step 1 of 2. Lands PENDING — no order can be issued against it until it is approved.
        </p>
      </div>

      <Feedback state={state} />
    </form>
  );
}

/**
 * Step 2 — decide. Approve and reject share one form because they are two
 * branches of the same single transition out of PENDING, and both are terminal.
 */
export function DecideRequestForm() {
  const [approveState, approveAction, approvePending] = useActionState<
    RequestActionState,
    FormData
  >(submitRequestApproval, IDLE_REQUEST_STATE);
  const [rejectState, rejectAction, rejectPending] = useActionState<RequestActionState, FormData>(
    submitRequestRejection,
    IDLE_REQUEST_STATE,
  );

  const latest = rejectState.status !== "idle" ? rejectState : approveState;

  return (
    <form className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pr-decide-request-id" className={LABEL}>
            Purchase request ID <span className="font-normal text-slate-400">(UUID)</span>
          </label>
          <input
            id="pr-decide-request-id"
            name="request_id"
            required
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="pr-reason" className={LABEL}>
            Reason <span className="font-normal text-slate-400">(required to reject)</span>
          </label>
          <input
            id="pr-reason"
            name="reason"
            placeholder="Outside the approved capex envelope"
            className={FIELD}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" formAction={approveAction} loading={approvePending} size="sm">
          {approvePending ? "Approving…" : "Approve"}
        </Button>
        <Button
          type="submit"
          formAction={rejectAction}
          loading={rejectPending}
          size="sm"
          variant="secondary"
          className="border-rose-300 text-rose-700 hover:border-rose-400 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:border-rose-400 dark:hover:bg-rose-500/10"
        >
          {rejectPending ? "Rejecting…" : "Reject"}
        </Button>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Both decisions are terminal. A second decision is refused, not applied.
        </p>
      </div>

      <Feedback state={latest} />
    </form>
  );
}
