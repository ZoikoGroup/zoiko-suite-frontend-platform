"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { FIELD, LABEL } from "@/components/admin/shared/form";
import { setAccountMappingAction } from "@/app/admin/finance/actions";
import { IDLE_MAPPING_STATE, type MappingActionState } from "@/app/admin/finance/state";

const TONE = { set: "success", error: "error", idle: "neutral" } as const;

export function SetAccountMappingForm() {
  const [state, action, pending] = useActionState<MappingActionState, FormData>(setAccountMappingAction, IDLE_MAPPING_STATE);

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="mapping_key">Mapping key</label>
          <input className={FIELD} id="mapping_key" name="mapping_key" placeholder="ap.default_payable" required />
          <p className="mt-1 text-xs text-slate-400">
            Its meaning belongs to whichever domain declares it — this service never interprets it.
          </p>
        </div>
        <div>
          <label className={LABEL} htmlFor="mapping_account_code">Account code</label>
          <input className={FIELD} id="mapping_account_code" name="account_code" placeholder="2000-AP" required />
          <p className="mt-1 text-xs text-slate-400">
            Must name an existing ACTIVE account in the Chart of Accounts.
          </p>
        </div>
      </div>

      <Button type="submit" disabled={pending}>{pending ? "Setting…" : "Set mapping"}</Button>

      <ResultBanner tone={TONE[state.status]} message={state.status === "idle" ? undefined : state.message} />
    </form>
  );
}
