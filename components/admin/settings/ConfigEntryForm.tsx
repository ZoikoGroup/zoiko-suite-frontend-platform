"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL } from "@/components/admin/shared/form";
import { ENVIRONMENTS, describeEnvironment } from "@/lib/api/configuration";
import { submitConfigEntry } from "@/app/admin/settings/actions";
import { IDLE_CONFIG_STATE, type ConfigActionState } from "@/app/admin/settings/state";
import { ConfigEntrySummary } from "./ConfigEntrySummary";

const TONE = {
  created: "success",
  unchanged: "neutral",
  error: "error",
  idle: "neutral",
} as const;

export function ConfigEntryForm() {
  const [state, action, pending] = useActionState<ConfigActionState, FormData>(
    submitConfigEntry,
    IDLE_CONFIG_STATE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="config_key" className={LABEL}>
            Which setting
          </label>
          <input
            id="config_key"
            name="key"
            required
            placeholder="payroll.cutoff_hour"
            className={FIELD}
            autoComplete="off"
          />
          <p className={HINT}>The name services use to look this setting up.</p>
        </div>
        <div>
          <label htmlFor="config_environment" className={LABEL}>
            Where it applies
          </label>
          <select
            id="config_environment"
            name="environment"
            defaultValue="local"
            className={FIELD}
          >
            {ENVIRONMENTS.map((env) => (
              <option key={env} value={env}>
                {env}
                {describeEnvironment(env) ? ` — ${describeEnvironment(env)}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="config_scope" className={LABEL}>
            Who it applies to
          </label>
          <select id="config_scope" name="scope" defaultValue="tenant" className={FIELD}>
            <option value="tenant">Just my organisation</option>
            <option value="global">Everyone in this environment</option>
          </select>
        </div>
        <div className="sm:col-span-3">
          <label htmlFor="config_value" className={LABEL}>
            What it should be set to
          </label>
          <textarea
            id="config_value"
            name="value"
            rows={2}
            required
            placeholder="17"
            className={`${FIELD} font-mono text-xs`}
          />
          <p className={HINT}>
            A number, a word, or yes/no is enough — write it plainly and it is stored as that.
            Settings with several parts are written in the structured form the services read,
            e.g. <code>{'{ "hour": 17, "timezone": "Europe/London" }'}</code>. Whatever you
            enter, the saved setting is read back below in plain words so you can check it.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Saving…" : "Save this setting"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Every change is kept as history — the previous value is never erased
        </p>
      </div>

      {/* The recorded row, in plain English. The banner used to be the only
          feedback and said nothing about what was actually stored — which is
          the one thing a reader needs, since the value they typed is turned
          into structured data on the way in. */}
      <ResultBanner tone={TONE[state.status]} message={state.message}>
        {state.entry && (
          <div className="rounded-lg bg-white/70 p-3 ring-1 ring-inset ring-black/5 dark:bg-slate-900/40 dark:ring-white/5">
            <ConfigEntrySummary entry={state.entry} variant="compact" />
          </div>
        )}
      </ResultBanner>
    </form>
  );
}
