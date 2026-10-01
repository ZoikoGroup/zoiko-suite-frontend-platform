"use client";

import { useActionState, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { deactivateAccountAction } from "@/app/admin/finance/actions";
import { IDLE_ACCOUNT_STATE } from "@/app/admin/finance/state";
import type { Account } from "@/lib/api/general-ledger";

const STATUS_TONE: Record<Account["status"], string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  INACTIVE: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

export function AccountsRegisterTable({ accounts }: { accounts: Account[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [state, action, pending] = useActionState(deactivateAccountAction, IDLE_ACCOUNT_STATE);

  const filtered = accounts.filter((a) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return a.account_code.toLowerCase().includes(term) || a.account_name.toLowerCase().includes(term);
  });

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by code or name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-navy-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>

      {state.status !== "idle" && (
        <ResultBanner tone={state.status === "error" ? "error" : "success"} message={state.message} />
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className={HEAD}>Code</th>
              <th className={HEAD}>Name</th>
              <th className={HEAD}>Type</th>
              <th className={HEAD}>Control?</th>
              <th className={HEAD}>Status</th>
              <th className={HEAD}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className={`${CELL} text-slate-400`} colSpan={6}>No account matches &ldquo;{searchTerm}&rdquo;.</td>
              </tr>
            ) : (
              filtered.map((a) => (
                <tr key={a.account_id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className={`${CELL} font-mono text-xs`}>{a.account_code}</td>
                  <td className={CELL}>{a.account_name}</td>
                  <td className={CELL}>{a.account_type}</td>
                  <td className={CELL}>
                    {a.is_control_account ? (a.direct_posting_restricted ? "Control, restricted" : "Control") : "—"}
                  </td>
                  <td className={CELL}>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[a.status]}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className={CELL}>
                    {a.status === "ACTIVE" && (
                      <form action={action}>
                        <input type="hidden" name="account_code" value={a.account_code} />
                        <Button type="submit" size="sm" variant="ghost" disabled={pending}>
                          Deactivate
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
