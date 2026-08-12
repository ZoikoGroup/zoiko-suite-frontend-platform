"use client";

import { useActionState } from "react";
import { Ban, Gauge, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { CopyableId, ResultBanner, type BannerTone } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { formatMoney } from "@/lib/format";
import { setSpendPolicy, submitSpendCheckAction } from "@/app/admin/commercial-ops/actions";
import {
  CURRENCIES,
  IDLE_SPEND_CHECK_STATE,
  IDLE_SPEND_POLICY_STATE,
  SPEND_CATEGORIES,
  type SpendCheckActionState,
  type SpendPolicyActionState,
} from "@/app/admin/commercial-ops/state";
import { SPEND_PERIODS } from "@/lib/api/spend-controls";

const POLICY_TONE: Record<SpendPolicyActionState["status"], BannerTone> = {
  idle: "neutral",
  created: "success",
  // A new limit replaced an old one — worth reading as a change to be noticed,
  // not a routine creation.
  superseded: "warning",
  error: "error",
};

/**
 * The four readings of a spend check, and why none of them collapse.
 *
 * `unevaluated` is the important one: the service answers 200 ALLOWED with basis
 * `no_policy_configured` when the category has no limit. That is not an approval —
 * nothing was checked — so it renders neutral. Green here would report an
 * ungoverned spend as a governed one that agreed, which is the same defect class
 * as rendering evidence's NO_REQUIREMENTS_DEFINED as a pass.
 *
 * `refused` is amber rather than red: a BLOCKED decision is the control doing its
 * job. Red is reserved for the service failing to answer at all.
 */
const CHECK_TONE: Record<SpendCheckActionState["status"], BannerTone> = {
  idle: "neutral",
  permitted: "success",
  unevaluated: "neutral",
  refused: "warning",
  replayed: "neutral",
  error: "error",
};

const PERIOD_LABEL: Record<string, string> = {
  PER_TRANSACTION: "Per transaction",
  MONTHLY: "Per calendar month",
  ANNUAL: "Per calendar year",
};

/** Set a limit for a category. */
export function SpendPolicyForm() {
  const [state, action, pending] = useActionState<SpendPolicyActionState, FormData>(
    setSpendPolicy,
    IDLE_SPEND_POLICY_STATE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="category" className={LABEL}>
            Category
          </label>
          <input
            id="category"
            name="category"
            required
            list="spend-categories"
            placeholder="PROCUREMENT"
            className={FIELD}
            autoComplete="off"
          />
          {/* A list rather than a select: the service accepts any string and there
              is no category registry anywhere in the platform, so constraining the
              field here would be inventing a vocabulary the backend does not have. */}
          <datalist id="spend-categories">
            {SPEND_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div>
          <label htmlFor="period" className={LABEL}>
            Enforcement window
          </label>
          <select id="period" name="period" defaultValue="MONTHLY" className={FIELD}>
            {SPEND_PERIODS.map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABEL[p]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="threshold_amount" className={LABEL}>
            Limit <span className={OPTIONAL}>(greater than zero)</span>
          </label>
          <input
            id="threshold_amount"
            name="threshold_amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="25000.00"
            className={FIELD}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="policy_currency_code" className={LABEL}>
            Currency
          </label>
          <select
            id="policy_currency_code"
            name="policy_currency_code"
            defaultValue="GBP"
            className={FIELD}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Checks must be submitted in this currency. There is no FX rate anywhere in this
            platform, so a spend in another one is refused rather than converted.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Setting…" : "Set limit"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Applies to this legal entity. There is no edit or deactivate route — a second limit for
          the same category supersedes the first, and the old one stays on record.
        </p>
      </div>

      <ResultBanner tone={POLICY_TONE[state.status]} message={state.message}>
        {state.policyId && (
          <div className="flex items-center gap-2 text-xs">
            <span className="shrink-0 opacity-70">Policy ID</span>
            <CopyableId value={state.policyId} className="text-[11px]" />
          </div>
        )}
      </ResultBanner>
    </form>
  );
}

/**
 * The figures a decision was made against.
 *
 * Shown for every outcome, including a refusal — a control that says no without
 * showing what it compared is not auditable, and the operator's next question is
 * always "against what?".
 */
function DecisionFigures({ detail }: { detail: NonNullable<SpendCheckActionState["detail"]> }) {
  const currency = detail.currencyCode ?? "GBP";
  const hasThreshold = typeof detail.thresholdAmount === "number" && detail.thresholdAmount > 0;
  const ratio = hasThreshold
    ? Math.min(detail.projectedTotal / (detail.thresholdAmount as number), 1)
    : 0;
  const over = hasThreshold && detail.projectedTotal > (detail.thresholdAmount as number);

  return (
    <div className="space-y-2">
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <div>
          <dt className="inline opacity-70">Already committed: </dt>
          <dd className="inline font-medium tabular-nums">
            {formatMoney(detail.priorConsumption, currency)}
          </dd>
        </div>
        <div>
          <dt className="inline opacity-70">This spend would take it to: </dt>
          <dd className="inline font-medium tabular-nums">
            {formatMoney(detail.projectedTotal, currency)}
          </dd>
        </div>
        {hasThreshold && (
          <div>
            <dt className="inline opacity-70">Limit: </dt>
            <dd className="inline font-medium tabular-nums">
              {formatMoney(detail.thresholdAmount as number, currency)}
            </dd>
          </div>
        )}
      </dl>

      {hasThreshold && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700"
          role="img"
          aria-label={`${Math.round(ratio * 100)} percent of the limit`}
        >
          <div
            className={over ? "h-full rounded-full bg-rose-500" : "h-full rounded-full bg-emerald-500"}
            style={{ width: `${Math.max(ratio * 100, 2)}%` }}
          />
        </div>
      )}

      {detail.consumptionId && (
        <div className="flex items-center gap-2 text-xs">
          <span className="shrink-0 opacity-70">Record</span>
          <CopyableId value={detail.consumptionId} className="text-[11px]" />
        </div>
      )}
    </div>
  );
}

/** Ask whether a spend is permitted, before committing it. */
export function SpendCheckForm() {
  const [state, action, pending] = useActionState<SpendCheckActionState, FormData>(
    submitSpendCheckAction,
    IDLE_SPEND_CHECK_STATE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="check_category" className={LABEL}>
            Category
          </label>
          <input
            id="check_category"
            name="check_category"
            required
            list="spend-categories"
            placeholder="PROCUREMENT"
            className={FIELD}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="check_amount" className={LABEL}>
            Proposed amount
          </label>
          <input
            id="check_amount"
            name="check_amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="4800.00"
            className={FIELD}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="check_currency_code" className={LABEL}>
            Currency
          </label>
          <select
            id="check_currency_code"
            name="check_currency_code"
            defaultValue="GBP"
            className={FIELD}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="source_reference" className={LABEL}>
            Source reference <span className={OPTIONAL}>(optional)</span>
          </label>
          <input
            id="source_reference"
            name="source_reference"
            placeholder="PO-000031"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            What the spend is for — the only thing tying a recorded consumption back to an order.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {!pending && <Gauge className="h-3.5 w-3.5" aria-hidden="true" />}
          {pending ? "Checking…" : "Check this spend"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          A permitted check is recorded immediately and consumes budget. A refusal consumes none.
        </p>
      </div>

      <ResultBanner tone={CHECK_TONE[state.status]} message={state.message}>
        <>
          {/* The two readings that are easy to misread get an explicit line saying
              what they are, because their tone alone cannot carry it. */}
          {state.status === "unevaluated" && (
            <p className="flex items-start gap-1.5 text-xs opacity-80">
              <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Not checked, not approved — there is no limit for this category to check against.
            </p>
          )}
          {state.status === "refused" && (
            <p className="flex items-start gap-1.5 text-xs opacity-80">
              <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              The control worked. This is a refusal, not a failure.
            </p>
          )}
          {state.detail && <DecisionFigures detail={state.detail} />}
        </>
      </ResultBanner>
    </form>
  );
}
