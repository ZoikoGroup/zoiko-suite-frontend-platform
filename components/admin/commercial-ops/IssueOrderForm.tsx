"use client";

import { useActionState } from "react";
import { CheckCircle2, Info, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { issueOrder } from "@/app/admin/commercial-ops/actions";
import { IDLE_ORDER_STATE, CURRENCIES, type OrderActionState } from "@/app/admin/commercial-ops/state";

const FEEDBACK = {
  created: {
    icon: CheckCircle2,
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  replayed: {
    icon: Info,
    className:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
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

/** Only these three states render a banner; "amended"/"closed" belong to the
 *  row actions, not to this form. */
function feedbackFor(state: OrderActionState) {
  if (state.status === "created" || state.status === "replayed" || state.status === "error") {
    return FEEDBACK[state.status];
  }
  return null;
}

export function IssueOrderForm() {
  const [state, action, pending] = useActionState<OrderActionState, FormData>(
    issueOrder,
    IDLE_ORDER_STATE,
  );

  const feedback = feedbackFor(state);

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="total_amount" className={LABEL}>
            Order total
          </label>
          <input
            id="total_amount"
            name="total_amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="1500.00"
            className={FIELD}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="currency_code" className={LABEL}>
            Currency
          </label>
          <select id="currency_code" name="currency_code" defaultValue="GBP" className={FIELD}>
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="purchase_request_id" className={LABEL}>
            Purchase request ID{" "}
            <span className="font-normal text-slate-400">(optional, UUID)</span>
          </label>
          <input
            id="purchase_request_id"
            name="purchase_request_id"
            placeholder="Verified as APPROVED before issue"
            className={FIELD}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="vendor_profile_id" className={LABEL}>
            Vendor profile ID{" "}
            <span className="font-normal text-slate-400">(optional, UUID)</span>
          </label>
          <input
            id="vendor_profile_id"
            name="vendor_profile_id"
            placeholder="Leave blank for unlinked spend"
            className={FIELD}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Issuing…" : "Issue purchase order"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Authorization is checked against authorization-svc before the order is written
        </p>
      </div>

      {feedback && (
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm animate-fade-up",
            feedback.className,
          )}
          role="status"
          aria-live="polite"
        >
          <feedback.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{state.message}</span>
        </div>
      )}
    </form>
  );
}
