"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { ENVIRONMENTS, describeEnvironment } from "@/lib/api/configuration";
import { submitFlag } from "@/app/admin/settings/actions";
import { IDLE_STATE, type FlagActionState } from "@/app/admin/settings/state";
import { FeatureFlagSummary } from "./FeatureFlagSummary";

const TONE = {
  created: "success",
  unchanged: "neutral",
  error: "error",
  idle: "neutral",
} as const;

export function FeatureFlagForm() {
  const [state, action, pending] = useActionState<FlagActionState, FormData>(
    submitFlag,
    IDLE_STATE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="key" className={LABEL}>
            Which feature
          </label>
          <input
            id="key"
            name="key"
            required
            placeholder="payroll.parallel-run"
            className={FIELD}
            autoComplete="off"
          />
          <p className={HINT}>
            The name services use to ask whether this feature is on. Use the exact name the
            feature already has — a new name creates a new feature rather than changing one.
          </p>
        </div>

        <div>
          <label htmlFor="environment" className={LABEL}>
            Where it applies
          </label>
          {/* Same four environments the config form offers and the lookups
              default into. This select used to list production/staging/
              development, none of which is a value the rest of the page uses —
              so a flag recorded here could not be found by a lookup, and the
              lookup's answer ("nothing set") was true and useless. */}
          <select id="environment" name="environment" defaultValue="local" className={FIELD}>
            {ENVIRONMENTS.map((env) => (
              <option key={env} value={env}>
                {env}
                {describeEnvironment(env) ? ` — ${describeEnvironment(env)}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="flag_scope" className={LABEL}>
            Who it applies to
          </label>
          <select id="flag_scope" name="scope" defaultValue="tenant" className={FIELD}>
            <option value="tenant">Just my organisation</option>
            <option value="global">Everyone in this environment</option>
          </select>
          <p className={HINT}>
            An organisation with its own setting uses that one rather than the environment-wide
            default.
          </p>
        </div>

        <div>
          <label htmlFor="rollout_percentage" className={LABEL}>
            Share of people who get it <span className={OPTIONAL}>(optional, 0–100)</span>
          </label>
          <input
            id="rollout_percentage"
            name="rollout_percentage"
            type="number"
            min={0}
            max={100}
            placeholder="100"
            className={FIELD}
          />
          <p className={HINT}>
            Leave blank to give it to everyone. A lower number releases it to that share of
            people and leaves the rest without it.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked
              className="h-4 w-4 rounded border-slate-300 text-navy-700 dark:border-slate-600"
            />
            Switch this feature on
          </label>
          <p className={HINT}>
            Unticked switches it off for everyone in the scope above, whatever share is set.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Saving…" : "Save this setting"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Every change is kept as history — the previous setting is never erased
        </p>
      </div>

      {/* What the service recorded, read back in plain English. The banner used
          to carry a sentence built from the form's own inputs, which said what
          was asked for rather than what was stored — and the two differ whenever
          the service defaults something the form left blank. */}
      <ResultBanner tone={TONE[state.status]} message={state.message}>
        {state.flag && (
          <div className="rounded-lg bg-white/70 p-3 ring-1 ring-inset ring-black/5 dark:bg-slate-900/40 dark:ring-white/5">
            <FeatureFlagSummary flag={state.flag} variant="compact" />
          </div>
        )}
      </ResultBanner>
    </form>
  );
}
