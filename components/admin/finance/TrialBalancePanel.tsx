"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { LookupById, ResultBanner } from "@/components/admin/shared";
import { FIELD, LABEL, CELL, HEAD } from "@/components/admin/shared/form";
import { compileTrialBalanceAction, lookupTrialBalance } from "@/app/admin/finance/actions";
import { IDLE_TRIAL_BALANCE_STATE, type TrialBalanceActionState } from "@/app/admin/finance/state";
import { formatAmount, type TrialBalanceSnapshot } from "@/lib/api/general-ledger";

const TONE = { compiled: "success", error: "error", idle: "neutral" } as const;

function renderSnapshot(snap: TrialBalanceSnapshot) {
  const totalDebit = snap.lines.filter((l) => l.net_balance > 0).reduce((s, l) => s + l.net_balance, 0);
  const totalCredit = snap.lines.filter((l) => l.net_balance < 0).reduce((s, l) => s + Math.abs(l.net_balance), 0);

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs text-slate-500">
        {snap.fiscal_period} · watermark {snap.ledger_watermark} · compiled {new Date(snap.compiled_at).toLocaleString()}
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[24rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className={HEAD}>Account</th>
              <th className={HEAD}>Net balance</th>
            </tr>
          </thead>
          <tbody>
            {snap.lines.map((l) => (
              <tr key={l.account_code} className="border-t border-slate-100 dark:border-slate-800">
                <td className={`${CELL} font-mono text-xs`}>{l.account_code}</td>
                <td className={CELL}>{formatAmount(l.net_balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        Debit-balance accounts total {formatAmount(totalDebit)}; credit-balance accounts total {formatAmount(totalCredit)}.
      </p>
    </div>
  );
}

/**
 * ACC-15's real, durable trial balance — compile a new snapshot for a legal
 * entity and fiscal period, or look up one already compiled. A snapshot is
 * permanent once written and pinned to an explicit ledger watermark; nothing
 * here recomputes one client-side.
 */
export function TrialBalancePanel() {
  const [state, action, pending] = useActionState<TrialBalanceActionState, FormData>(
    compileTrialBalanceAction,
    IDLE_TRIAL_BALANCE_STATE,
  );

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="tb_legal_entity_id">Legal entity ID</label>
            <input className={FIELD} id="tb_legal_entity_id" name="legal_entity_id" placeholder="UUID" required />
          </div>
          <div>
            <label className={LABEL} htmlFor="tb_fiscal_period">Fiscal period</label>
            <input className={FIELD} id="tb_fiscal_period" name="fiscal_period" placeholder="2026-07" required />
          </div>
        </div>
        <Button type="submit" disabled={pending}>{pending ? "Compiling…" : "Compile trial balance"}</Button>
        <ResultBanner tone={TONE[state.status]} message={state.status === "idle" ? undefined : state.message} />
      </form>

      <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
        <LookupById
          action={lookupTrialBalance}
          inputName="lookup_trial_balance_id"
          label="Look up a compiled trial balance"
          placeholder="Must be a UUID"
          renderRecord={renderSnapshot}
        />
      </div>
    </div>
  );
}
