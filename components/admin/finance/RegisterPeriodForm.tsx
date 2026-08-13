"use client";

import { useActionState } from "react";
import { CopyableId, ResultBanner, type BannerTone } from "@/components/admin/shared";
import { FIELD, LABEL } from "@/components/admin/shared/form";
import { Button } from "@/components/ui";
import { registerFiscalPeriod } from "@/app/admin/finance/actions";
import { IDLE_CLOSE_STATE, type CloseActionState } from "@/app/admin/finance/state";

const TONE: Record<CloseActionState["status"], BannerTone> = {
  idle: "neutral",
  registered: "success",
  // A replay wrote nothing. Green would claim a period that was not created.
  replayed: "neutral",
  closed: "success",
  ready: "success",
  // A correct refusal with a remedy, not a malfunction.
  blocked: "warning",
  unevidenced: "error",
  error: "error",
};

/**
 * Register a fiscal period.
 *
 * The period lands OPEN and seals nothing. Legal entity and tenant come from
 * the session rather than the form — this service scopes every read and write
 * to them, and they are not the operator's to choose.
 *
 * The period NAME is the field worth care over, and the hint says so: it is a
 * free string, and general-ledger-svc matches a journal's fiscal_period against
 * it exactly. A period registered as "2026-7" will never match journals filed
 * under "2026-07", so its readiness check would find nothing outstanding and it
 * would seal clean over an empty set.
 */
export function RegisterPeriodForm() {
  const [state, action, pending] = useActionState<CloseActionState, FormData>(
    registerFiscalPeriod,
    IDLE_CLOSE_STATE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="period_name" className={LABEL}>
            Period name
          </label>
          <input
            id="period_name"
            name="period_name"
            required
            placeholder="2026-07"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Must match exactly what journals carry as their fiscal period — there is no
            normalisation, so &ldquo;2026-7&rdquo; and &ldquo;2026-07&rdquo; are two different
            periods and only one of them will ever be found.
          </p>
        </div>

        <div>
          <label htmlFor="period_start" className={LABEL}>
            Starts
          </label>
          <input
            id="period_start"
            name="period_start"
            type="date"
            required
            className={FIELD}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="period_end" className={LABEL}>
            Ends
          </label>
          <input
            id="period_end"
            name="period_end"
            type="date"
            required
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Inclusive. These bounds are what decide which payables and receivables belong to the
            period, so a close is only ever blocked by items due inside them.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Registering…" : "Register period"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Lands OPEN. Registering a period is what makes it closeable — the ledger already accepts
          postings to any period nobody has sealed.
        </p>
      </div>

      <ResultBanner tone={TONE[state.status]} message={state.message}>
        {state.periodId && (
          <div className="flex items-center gap-2 text-xs">
            <span className="shrink-0 opacity-70">Fiscal period ID</span>
            <CopyableId value={state.periodId} className="text-[11px]" />
          </div>
        )}
      </ResultBanner>
    </form>
  );
}
