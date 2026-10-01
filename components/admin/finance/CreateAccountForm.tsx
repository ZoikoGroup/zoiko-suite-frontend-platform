"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { createAccountAction } from "@/app/admin/finance/actions";
import { IDLE_ACCOUNT_STATE, type AccountActionState } from "@/app/admin/finance/state";
import { ACCOUNT_TYPES } from "@/lib/api/general-ledger";

const TONE = { created: "success", duplicate: "warning", deactivated: "success", error: "error", idle: "neutral" } as const;

export function CreateAccountForm() {
  const [state, action, pending] = useActionState<AccountActionState, FormData>(createAccountAction, IDLE_ACCOUNT_STATE);

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="account_code">Account code</label>
          <input className={FIELD} id="account_code" name="account_code" placeholder="1100-AR" required />
        </div>
        <div>
          <label className={LABEL} htmlFor="account_name">Account name</label>
          <input className={FIELD} id="account_name" name="account_name" placeholder="Accounts Receivable" required />
        </div>
        <div>
          <label className={LABEL} htmlFor="account_type">Account type</label>
          <select className={FIELD} id="account_type" name="account_type" defaultValue="ASSET" required>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" name="is_control_account" className="h-4 w-4 rounded border-slate-300" />
            Control account
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" name="direct_posting_restricted" className="h-4 w-4 rounded border-slate-300" />
            Restrict direct posting <span className={OPTIONAL}>(needs an explicit override to post to)</span>
          </label>
        </div>
      </div>

      <Button type="submit" disabled={pending}>{pending ? "Registering…" : "Register account"}</Button>

      <ResultBanner tone={TONE[state.status]} message={state.status === "idle" ? undefined : state.message} />
    </form>
  );
}
