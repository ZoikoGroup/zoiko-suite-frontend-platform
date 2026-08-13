"use client";

import { useActionState } from "react";
import { CheckCircle2, Info, AlertCircle, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  submitPurchaseRequest,
  submitRequestApproval,
  submitRequestRejection,
} from "@/app/admin/commercial-ops/actions";
import {
  IDLE_REQUEST_STATE,
  CURRENCIES,
  type RequestActionState,
} from "@/app/admin/commercial-ops/state";

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
  // A replay wrote nothing and an already-decided request was not re-decided.
  // Both are neutral: rendering either green would claim a change that did not
  // happen, and red would call a correct refusal a failure.
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
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm animate-fade-up",
        feedback.className,
      )}
      role="status"
      aria-live="polite"
    >
      <feedback.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="break-words">{state.message}</span>
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
          <label htmlFor="description" className={LABEL}>
            What is being requested
          </label>
          <input
            id="description"
            name="description"
            required
            placeholder="Dell Latitude refresh, 12 units"
            className={FIELD}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="amount" className={LABEL}>
            Amount
          </label>
          <input
            id="amount"
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
          <label htmlFor="request_currency_code" className={LABEL}>
            Currency
          </label>
          <select
            id="request_currency_code"
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
 * branches of the same single transition out of PENDING, and both are terminal:
 * whichever button is pressed, the other is no longer possible.
 *
 * The reason field is only sent by Reject; the service refuses an unexplained
 * rejection with a 400, so it is marked required on that path in the action.
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

  // Only one of the two can have run most recently; showing both banners at once
  // would leave a stale outcome on screen next to the current one.
  const latest = rejectState.status !== "idle" ? rejectState : approveState;

  return (
    <form className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="decide_request_id" className={LABEL}>
            Purchase request ID <span className="font-normal text-slate-400">(UUID)</span>
          </label>
          <input
            id="decide_request_id"
            name="request_id"
            required
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="reason" className={LABEL}>
            Reason <span className="font-normal text-slate-400">(required to reject)</span>
          </label>
          <input
            id="reason"
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
        {/* No `danger` Button variant exists in this design system, and adding
            one for a single call site would be a wider change than this needs —
            so the destructive intent is carried by rose classes on `secondary`,
            the same way UserMenu styles sign-out. */}
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
