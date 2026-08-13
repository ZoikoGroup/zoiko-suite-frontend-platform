import { cookies } from "next/headers";
import { CloudOff, Gauge, ShieldAlert, Ban, Wallet } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { formatMoney } from "@/lib/format";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listSpendPolicies,
  listPolicyUsage,
  summarisePolicyUsage,
  summariseSpend,
  explainSpendError,
} from "@/lib/api/spend-controls";
import { SpendPolicyTable } from "./SpendPolicyTable";

const TILE =
  "flex items-center gap-3 rounded-lg border border-slate-200 px-3.5 py-3 dark:border-slate-800";

/**
 * Live spend limits and their consumption, from spend-controls-svc (:8131).
 *
 * Reads two routes and joins them here rather than showing policies alone: a limit
 * without its consumption tells an operator nothing about whether the next spend
 * will pass, which is the only question this panel exists to answer.
 *
 * Before this existed the page called `/v1/spend-controls/limits` — a route the
 * service does not have — and fell back to hardcoded sample budgets on the 404, so
 * it displayed invented figures indistinguishable from live ones.
 */
export async function SpendControlsPanel({
  legalEntityId,
  category,
}: {
  legalEntityId?: string;
  category?: string;
}) {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in again to read the spend limits."
      />
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const [policies, usageTotals] = await Promise.all([
    listSpendPolicies({ identity, legalEntityId, category }),
    listPolicyUsage({ identity, legalEntityId, category }),
  ]);

  if (!policies.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Spend limits unavailable"
        hint={explainSpendError(policies.error.message)}
      />
    );
  }

  const narrowed = Boolean(legalEntityId || category);

  // A failed usage read degrades the meters rather than the whole panel: the limits
  // themselves are still worth showing, and claiming zero spend would be worse than
  // saying the figure is unavailable.
  const usage = summarisePolicyUsage(policies.data, usageTotals.ok ? usageTotals.data : []);
  const stats = summariseSpend(usage);
  const committed = Object.entries(stats.committedByCurrency).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-5">
      {!usageTotals.ok && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Limits are shown, but consumption could not be read, so the meters below are blank rather
          than zero — {explainSpendError(usageTotals.error.message)}
        </p>
      )}

      {usage.length > 0 && (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className={TILE}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 dark:bg-navy-500/10">
            <Gauge className="h-4 w-4 text-navy-700 dark:text-navy-300" aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {stats.policies}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Limits in force</p>
          </div>
        </div>

        <div className={TILE}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-500/10">
            <Wallet className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {stats.exhausted}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Exhausted — refusing spend</p>
          </div>
        </div>

        <div className={TILE}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-500/10">
            <Ban className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {stats.refusals}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Spends refused</p>
          </div>
        </div>
      </div>
      )}

      {committed.length > 0 && (
        <div className={TILE}>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">Committed against limits</p>
            <ul className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
              {committed.map(([currency, amount]) => (
                <li
                  key={currency}
                  className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100"
                >
                  {formatMoney(amount, currency)}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              Reported per currency. Nothing in this suite holds an FX rate, so these are never
              added together.
            </p>
          </div>
        </div>
      )}

      <SpendPolicyTable usage={usage} narrowed={narrowed} />

      {usage.length > 0 && (
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Only limits actually in force are listed. Superseded and withdrawn ones are kept — a
        consumption record would otherwise point at a limit that had vanished — but they are not
        shown here, because a register of what governs spend must not include things that do not.
      </p>
      )}
    </div>
  );
}
