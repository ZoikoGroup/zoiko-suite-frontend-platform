"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL, CELL, HEAD } from "@/components/admin/shared/form";
import {
  queryLedgerEntriesAction,
  queryAccountBalanceAction,
  type LedgerQueryResult,
  type BalanceQueryResult,
} from "@/app/admin/finance/actions";
import { formatAmount } from "@/lib/api/general-ledger";

const IDLE_ENTRIES: LedgerQueryResult = { ok: true, entries: [] };
const IDLE_BALANCE: BalanceQueryResult = { ok: false, message: "" };

/**
 * ACC-05's own authority — posted ledger entries and derived balances,
 * distinct from the journal register above: a journal is a proposal moving
 * through Tri-Phase Commit, an entry here exists only once, written the
 * instant that journal reaches FINALIZED, and is never updated or deleted
 * afterward.
 */
export function LedgerQueryPanel() {
  const [entriesResult, entriesAction, entriesPending] = useActionState<LedgerQueryResult, FormData>(
    queryLedgerEntriesAction,
    IDLE_ENTRIES,
  );
  const [balanceResult, balanceAction, balancePending] = useActionState<BalanceQueryResult, FormData>(
    queryAccountBalanceAction,
    IDLE_BALANCE,
  );

  return (
    <div className="space-y-8">
      <div>
        <h4 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Ledger entries</h4>
        <form action={entriesAction} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className={LABEL} htmlFor="le_legal_entity_id">Legal entity ID</label>
            <input className={FIELD} id="le_legal_entity_id" name="le_legal_entity_id" placeholder="UUID" required />
          </div>
          <div>
            <label className={LABEL} htmlFor="le_account_code">
              Account code <span className={OPTIONAL}>(optional)</span>
            </label>
            <input className={FIELD} id="le_account_code" name="le_account_code" placeholder="1100-AR" />
          </div>
          <div>
            <label className={LABEL} htmlFor="le_fiscal_period">
              Fiscal period <span className={OPTIONAL}>(optional)</span>
            </label>
            <input className={FIELD} id="le_fiscal_period" name="le_fiscal_period" placeholder="2026-07" />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={entriesPending} className="w-full">
              {entriesPending ? "Querying…" : "Query entries"}
            </Button>
          </div>
        </form>

        {!entriesResult.ok && <ResultBanner tone="error" message={entriesResult.message} />}
        {entriesResult.ok && entriesResult.entries.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[48rem] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={HEAD}>Journal</th>
                  <th className={HEAD}>Account</th>
                  <th className={HEAD}>Debit</th>
                  <th className={HEAD}>Credit</th>
                  <th className={HEAD}>Posting date</th>
                  <th className={HEAD}>Entry seq</th>
                </tr>
              </thead>
              <tbody>
                {entriesResult.entries.map((e) => (
                  <tr key={e.ledger_entry_id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className={`${CELL} font-mono text-xs`}>{e.journal_id}</td>
                    <td className={`${CELL} font-mono text-xs`}>{e.account_code}</td>
                    <td className={CELL}>{e.debit_amount > 0 ? formatAmount(e.debit_amount) : "—"}</td>
                    <td className={CELL}>{e.credit_amount > 0 ? formatAmount(e.credit_amount) : "—"}</td>
                    <td className={CELL}>{e.posting_date}</td>
                    <td className={CELL}>{e.entry_seq}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
        <h4 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Account balance</h4>
        <form action={balanceAction} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className={LABEL} htmlFor="bal_legal_entity_id">Legal entity ID</label>
            <input className={FIELD} id="bal_legal_entity_id" name="bal_legal_entity_id" placeholder="UUID" required />
          </div>
          <div>
            <label className={LABEL} htmlFor="bal_account_code">Account code</label>
            <input className={FIELD} id="bal_account_code" name="bal_account_code" placeholder="1100-AR" required />
          </div>
          <div>
            <label className={LABEL} htmlFor="bal_fiscal_period">
              Fiscal period <span className={OPTIONAL}>(optional)</span>
            </label>
            <input className={FIELD} id="bal_fiscal_period" name="bal_fiscal_period" placeholder="2026-07" />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={balancePending} className="w-full">
              {balancePending ? "Querying…" : "Query balance"}
            </Button>
          </div>
        </form>

        {!balanceResult.ok && "notFound" in balanceResult && (
          <ResultBanner tone="warning" message="No balance projection exists for that account/entity/period." />
        )}
        {!balanceResult.ok && "message" in balanceResult && balanceResult.message && (
          <ResultBanner tone="error" message={balanceResult.message} />
        )}
        {balanceResult.ok && (
          <div className="mt-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
            <p>
              <strong>{balanceResult.balance.account_code}</strong> — net balance{" "}
              {formatAmount(balanceResult.balance.net_balance)}
            </p>
            <p className="text-xs text-slate-500">
              Debits {formatAmount(balanceResult.balance.debit_total)}, credits{" "}
              {formatAmount(balanceResult.balance.credit_total)}, watermark entry seq{" "}
              {balanceResult.balance.watermark_entry_seq}, rebuilt{" "}
              {new Date(balanceResult.balance.rebuilt_at).toLocaleString()}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
