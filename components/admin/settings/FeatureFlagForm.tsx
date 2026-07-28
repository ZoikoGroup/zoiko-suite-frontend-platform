"use client";

import { useActionState } from "react";
import { CheckCircle2, Info, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { submitFlag } from "@/app/admin/settings/actions";
import { IDLE_STATE, type FlagActionState } from "@/app/admin/settings/state";

const FEEDBACK = {
  created: {
    icon: CheckCircle2,
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  unchanged: {
    icon: Info,
    className:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
  },
  error: {
    icon: AlertCircle,
    className:
      "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  },
} as const;

const FIELD =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "outline-none transition-colors placeholder:text-slate-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 " +
  "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

const LABEL = "mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400";

export function FeatureFlagForm() {
  const [state, action, pending] = useActionState<FlagActionState, FormData>(
    submitFlag,
    IDLE_STATE,
  );

  const feedback = state.status !== "idle" ? FEEDBACK[state.status] : null;

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="key" className={LABEL}>
            Flag key
          </label>
          <input
            id="key"
            name="key"
            required
            placeholder="payroll.parallel-run"
            className={FIELD}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="environment" className={LABEL}>
            Environment
          </label>
          <select id="environment" name="environment" defaultValue="production" className={FIELD}>
            <option value="production">production</option>
            <option value="staging">staging</option>
            <option value="development">development</option>
          </select>
        </div>

        <div>
          <label htmlFor="rollout_percentage" className={LABEL}>
            Rollout&nbsp;% <span className="font-normal text-slate-400">(optional, 0–100)</span>
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
        </div>

        <div className="flex items-end">
          <label className="flex cursor-pointer items-center gap-2.5 pb-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked
              className="h-4 w-4 rounded border-slate-300 text-navy-700 dark:border-slate-600"
            />
            Enabled
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Recording…" : "Record transition"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Writes to configuration-feature-flag-svc on :8086
        </p>
      </div>

      {feedback && (
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm animate-fade-up",
            feedback.className,
          )}
          role="status"
          aria-live="polite"
        >
          <feedback.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{state.message}</span>
        </div>
      )}
    </form>
  );
}
