"use client";

import { useActionState } from "react";
import { Ban, Gauge } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import {
  CopyableId,
  PanelEmptyState,
  ResultBanner,
  type BannerTone,
} from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDateTime, formatMoney } from "@/lib/format";
import { withdrawSpendPolicy } from "@/app/admin/commercial-ops/actions";
import {
  IDLE_SPEND_POLICY_STATE,
  type SpendPolicyActionState,
} from "@/app/admin/commercial-ops/state";
import type { PolicyUsage } from "@/lib/api/spend-controls";

const PERIOD_LABEL: Record<string, string> = {
  PER_TRANSACTION: "per transaction",
  MONTHLY: "this month",
  ANNUAL: "this year",
};

const TONE: Record<SpendPolicyActionState["status"], BannerTone> = {
  idle: "neutral",
  created: "success",
  superseded: "warning",
  error: "error",
};

/**
 * How full a budget is.
 *
 * Amber from 75%, rose once exhausted — the point at which the next check will be
 * refused, which is worth seeing before it happens rather than after.
 *
 * The committed figure comes from the service's aggregate, computed over the same
 * window enforcement uses. It was previously summed in the browser over all
 * history with no window at all, so a MONTHLY limit's meter could read as
 * exhausted while the current month was empty and the next check would pass.
 */
function BudgetMeter({ usage }: { usage: PolicyUsage }) {
  const { policy, consumed, ratio } = usage;

  // PER_TRANSACTION has no running budget: each spend is judged alone, so a
  // cumulative bar would imply an allowance that fills up.
  if (policy.period === "PER_TRANSACTION") {
    return (
      <div className="min-w-40">
        <p className="text-xs text-slate-500 dark:text-slate-400">Each transaction judged alone</p>
        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
          {formatMoney(consumed, policy.currency_code)} recorded in total
        </p>
      </div>
    );
  }

  const exhausted = consumed >= policy.threshold_amount;
  const fill = exhausted
    ? "bg-rose-500 dark:bg-rose-400"
    : ratio >= 0.75
      ? "bg-amber-500 dark:bg-amber-400"
      : "bg-emerald-500 dark:bg-emerald-400";

  return (
    <div className="min-w-40">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium tabular-nums text-slate-700 dark:text-slate-300">
          {formatMoney(consumed, policy.currency_code)}
        </span>
        <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
          of {formatMoney(policy.threshold_amount, policy.currency_code)}
        </span>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700"
        role="img"
        aria-label={`${Math.round(ratio * 100)} percent of the limit committed ${PERIOD_LABEL[policy.period]}`}
      >
        <div
          className={cn("h-full rounded-full", fill)}
          style={{ width: `${Math.max(ratio * 100, 2)}%` }}
        />
      </div>
      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
        {exhausted
          ? "exhausted — further spend is refused"
          : `${Math.round(ratio * 100)}% committed ${PERIOD_LABEL[policy.period]}`}
      </p>
    </div>
  );
}

/**
 * The limits in force, each with the option to withdraw it.
 *
 * The withdrawal banner is deliberately a sibling of the table, not a child of a
 * row. Withdrawing a limit removes it from this register — that is the point — so a
 * confirmation rendered inside the row disappears at the same moment the row does,
 * and the operator never reads the consequence that matters: checks against the
 * category are no longer evaluated, which reads as ALLOWED and is not approval.
 *
 * The button says "Withdraw", not "Delete". Nothing is removed; the row and every
 * consumption recorded against it are kept.
 */
export function SpendPolicyTable({
  usage,
  narrowed,
}: {
  usage: PolicyUsage[];
  narrowed: boolean;
}) {
  const [state, action, pending] = useActionState<SpendPolicyActionState, FormData>(
    withdrawSpendPolicy,
    IDLE_SPEND_POLICY_STATE,
  );

  // The empty state lives here rather than in the server panel above so that this
  // component — and the banner below — stays mounted when the last limit is
  // withdrawn. With the decision made server-side, withdrawing the only row in
  // view replaced the whole table with an empty state, unmounting the banner that
  // was explaining what had just happened.
  if (usage.length === 0) {
    return (
      <div className="space-y-4">
        <PanelEmptyState
          icon={Gauge}
          label={narrowed ? "No limits match these filters" : "No spend limits configured"}
          hint={
            narrowed
              ? "Both filters are applied by the service and compose with AND — clear one to widen the register."
              : "Set one above. Until a category has a limit, a spend check against it returns ALLOWED without checking anything — which is not the same as approval."
          }
        />
        <ResultBanner tone={TONE[state.status]} message={state.message} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-3xl border-collapse text-left">
          <thead className="border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th scope="col" className={HEAD}>
                Category
              </th>
              <th scope="col" className={HEAD}>
                Window
              </th>
              <th scope="col" className={HEAD}>
                Committed
              </th>
              <th scope="col" className={HEAD}>
                Refused
              </th>
              <th scope="col" className={HEAD}>
                Set
              </th>
              <th scope="col" className={`${HEAD} text-right`}>
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {usage.map((u) => (
              <tr
                key={u.policy.spend_policy_id}
                className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <td className={cn(CELL, "font-medium text-slate-900 dark:text-slate-100")}>
                  <span className="break-words">{u.policy.category}</span>
                  <p className="mt-0.5 text-[11px] font-normal text-slate-400 dark:text-slate-500">
                    {u.policy.currency_code}
                  </p>
                </td>
                <td className={CELL}>
                  <Badge tone={u.policy.period === "PER_TRANSACTION" ? "info" : "neutral"}>
                    {u.policy.period}
                  </Badge>
                </td>
                <td className={CELL}>
                  <BudgetMeter usage={u} />
                </td>
                <td className={cn(CELL, "tabular-nums text-slate-500 dark:text-slate-400")}>
                  {u.refusedCount === 0 ? (
                    <span className="text-[11px] italic text-slate-400 dark:text-slate-500">
                      none
                    </span>
                  ) : (
                    u.refusedCount
                  )}
                </td>
                <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
                  {formatDateTime(u.policy.created_at)}
                  <CopyableId value={u.policy.spend_policy_id} className="mt-0.5" />
                </td>
                <td className={cn(CELL, "text-right")}>
                  <form action={action} className="inline-flex">
                    <input
                      type="hidden"
                      name="spend_policy_id"
                      value={u.policy.spend_policy_id}
                    />
                    <input type="hidden" name="withdraw_category" value={u.policy.category} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="secondary"
                      loading={pending}
                      aria-label={`Withdraw the ${u.policy.category} limit`}
                      className="shrink-0 border-amber-300 text-amber-700 hover:border-amber-400 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-300 dark:hover:border-amber-400 dark:hover:bg-amber-500/10"
                    >
                      {!pending && <Ban className="h-3.5 w-3.5" aria-hidden="true" />}
                      Withdraw
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ResultBanner tone={TONE[state.status]} message={state.message} />
    </div>
  );
}
