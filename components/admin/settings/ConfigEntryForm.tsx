"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { ENVIRONMENTS } from "@/lib/api/configuration";
import { submitConfigEntry } from "@/app/admin/settings/actions";
import { IDLE_CONFIG_STATE, type ConfigActionState } from "@/app/admin/settings/state";

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
            Key
          </label>
          <input
            id="config_key"
            name="key"
            required
            placeholder="payroll.cutoff_hour"
            className={FIELD}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="config_environment" className={LABEL}>
            Environment
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
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="config_scope" className={LABEL}>
            Scope
          </label>
          <select id="config_scope" name="scope" defaultValue="tenant" className={FIELD}>
            <option value="tenant">This tenant</option>
            <option value="global">Environment-wide default</option>
          </select>
        </div>
        <div className="sm:col-span-3">
          <label htmlFor="config_value" className={LABEL}>
            Value <span className={OPTIONAL}>(JSON — a bare string needs quotes)</span>
          </label>
          <textarea
            id="config_value"
            name="value"
            rows={2}
            required
            placeholder={'{ "hour": 17, "timezone": "Europe/London" }'}
            className={`${FIELD} font-mono text-xs`}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Recording…" : "Record value"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Append-only — the previous version is end-dated, never overwritten
        </p>
      </div>

      <ResultBanner tone={TONE[state.status]} message={state.message} />
    </form>
  );
}
