import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui";
import { listJournalEntries, listCashPositions, listBankReconciliations } from "@/lib/api/finance";
import { formatMoney } from "@/lib/format";
import { BookOpen, Wallet, CheckCircle2, AlertTriangle, ArrowUpRight } from "lucide-react";

export async function GeneralLedgerAndTreasuryPanel() {
  const [glRes, treasuryRes, reconRes] = await Promise.all([
    listJournalEntries(),
    listCashPositions(),
    listBankReconciliations(),
  ]);

  const journals = glRes.ok ? glRes.data : [];
  const cashPositions = treasuryRes.ok ? treasuryRes.data : [];
  const recons = reconRes.ok ? reconRes.data : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* General Ledger Journal Entries */}
        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <BookOpen className="h-4 w-4 text-indigo-500" />
                General Ledger Entries
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Real-time posting from general-ledger-svc (:8098)
              </CardDescription>
            </div>
            <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
              {journals.length} Entries
            </span>
          </CardHeader>
          <CardContent>
            {journals.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500 dark:border-slate-800">
                <BookOpen className="mb-2 h-6 w-6 text-slate-400" />
                No posted journal entries found for active tenant
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                {journals.map((j) => (
                  <div key={j.entry_id} className="flex items-center justify-between py-2.5 text-xs">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {j.account_name || j.account_code}
                      </div>
                      <div className="text-slate-500 text-[11px]">{j.reference || j.entry_id} • {j.posting_date?.slice(0, 10)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                        {formatMoney(j.debit || j.credit || 0, j.currency || "USD")}
                      </div>
                      <span className="inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        {j.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Treasury & Liquidity */}
        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <Wallet className="h-4 w-4 text-emerald-500" />
                Treasury & Cash Positions
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Multi-currency accounts from treasury-svc (:8103)
              </CardDescription>
            </div>
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              {cashPositions.length} Accounts
            </span>
          </CardHeader>
          <CardContent>
            {cashPositions.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500 dark:border-slate-800">
                <Wallet className="mb-2 h-6 w-6 text-slate-400" />
                No treasury cash positions found
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                {cashPositions.map((c, i) => (
                  <div key={c.account_id || i} className="flex items-center justify-between py-2.5 text-xs">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {c.bank_name || `Account ${c.account_id?.slice(0, 8)}`}
                      </div>
                      <div className="text-slate-500 text-[11px]">
                        Available in {c.currency}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                        {formatMoney(c.available_balance ?? c.balance ?? 0, c.currency || "USD")}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {c.status || "ACTIVE"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bank Reconciliation Status */}
      <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
              Bank Reconciliation Summary
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Automated 2-way statement matching from bank-reconciliation-svc (:8102)
            </CardDescription>
          </div>
          <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
            {recons.length} Runs
          </span>
        </CardHeader>
        <CardContent>
          {recons.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-800">
              No recent bank reconciliation periods logged
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {recons.map((r) => (
                <div
                  key={r.recon_id}
                  className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      Period: {r.period}
                    </span>
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {r.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-slate-600 dark:text-slate-400">
                    <span>Matched Lines:</span>
                    <span className="font-mono font-medium text-emerald-600">{r.matched_count}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                    <span>Unmatched:</span>
                    <span className="font-mono font-medium text-amber-600">{r.unmatched_count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
