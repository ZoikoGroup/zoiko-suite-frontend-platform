"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { FIELD, LABEL } from "@/components/admin/shared/form";
import { commandAction, reviewSessionAction } from "@/app/admin/authorization/actions";
import { IDLE, REASONS, type AuthzResult, type ReasonSet } from "@/app/admin/authorization/state";
import { cn } from "@/lib/utils";

const RESULT_TEXT: Record<AuthzResult["status"], string> = {
  idle: "",
  done: "text-emerald-700 dark:text-emerald-400",
  pending: "text-slate-600 dark:text-slate-300",
  refused: "text-amber-700 dark:text-amber-400",
  error: "text-rose-700 dark:text-rose-400",
  signin: "text-slate-500 dark:text-slate400",
  step_up: "text-slate-500 dark:text-slate400",
};

/**
 * A row action that needs a reason before it runs.
 *
 * authorization-svc refuses every revoke, retire, reactivate, approve and
 * reject without a reason (§16, enforce mode) and records the one given — so
 * the reason is asked for here, at the point of the click, rather than
 * discovered from a 400. The row's version travels with it for the commands
 * that check it, so a stale page is refused instead of overwriting.
 */
export function CommandButton({
  command,
  id,
  label,
  reasons,
  version,
  tone = "secondary",
  withEndDate = false,
}: {
  command: string;
  id: string;
  label: string;
  reasons: ReasonSet;
  version?: number;
  tone?: "primary" | "secondary" | "danger";
  withEndDate?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(commandAction, IDLE);

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
          tone === "danger"
            ? "border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
            : tone === "primary"
              ? "border-navy-300 bg-navy-900 text-white hover:bg-navy-800 dark:border-navy-500 dark:bg-navy-600"
              : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800",
        )}
      >
        {label}
      </button>

      {open && (
        <form
          action={submit}
          className="absolute right-0 z-20 mt-1 w-72 space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <input type="hidden" name="command" value={command} />
          <input type="hidden" name="id" value={id} />
          {version !== undefined && <input type="hidden" name="expected_version" value={version} />}
          <div>
            <label className={LABEL} htmlFor={`${command}-${id}-reason`}>
              Reason
            </label>
            <select id={`${command}-${id}-reason`} name="reason_code" required defaultValue="" className={FIELD}>
              <option value="" disabled>
                Choose…
              </option>
              {REASONS[reasons].map(([code, text]) => (
                <option key={code} value={code}>
                  {text}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor={`${command}-${id}-note`}>
              Note <span className="font-normal text-slate-400">(recorded with the change)</span>
            </label>
            <input id={`${command}-${id}-note`} name="reason_note" className={FIELD} autoComplete="off" />
          </div>
          {withEndDate && (
            <div>
              <label className={LABEL} htmlFor={`${command}-${id}-end`}>
                End on <span className="font-normal text-slate-400">(blank = now)</span>
              </label>
              <input id={`${command}-${id}-end`} name="effective_to" type="datetime-local" className={FIELD} />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" loading={pending}>
              {pending ? "Applying…" : `Confirm ${label.toLowerCase()}`}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          {state.status !== "idle" && <p className={cn("text-xs", RESULT_TEXT[state.status])}>{state.message}</p>}
        </form>
      )}
    </div>
  );
}

/** Attest or flag an ended JIT / break-glass session. */
export function ReviewButton({ kind, id }: { kind: "privileged" | "break_glass"; id: string }) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(reviewSessionAction, IDLE);
  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10"
      >
        Review
      </button>
      {open && (
        <form
          action={submit}
          className="absolute right-0 z-20 mt-1 w-72 space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <fieldset className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
            <legend className={LABEL}>Outcome</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="outcome" value="ATTESTED" defaultChecked /> Attest — nothing wrong found
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="outcome" value="FLAGGED" /> Flag — raises a security alert
            </label>
          </fieldset>
          <div>
            <label className={LABEL} htmlFor={`review-${id}-notes`}>
              Notes <span className="font-normal text-slate-400">(required to flag)</span>
            </label>
            <textarea id={`review-${id}-notes`} name="notes" rows={2} className={FIELD} />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" loading={pending}>
              {pending ? "Recording…" : "Submit review"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          {state.status !== "idle" && <p className={cn("text-xs", RESULT_TEXT[state.status])}>{state.message}</p>}
        </form>
      )}
    </div>
  );
}
