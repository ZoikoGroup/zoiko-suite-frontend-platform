"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui";
import { JsonBlock } from "./JsonBlock";
import { ResultBanner } from "./ResultBanner";
import { FIELD, LABEL } from "./form";
import { type LookupState } from "./lookup";

const TONE = {
  found: "success",
  missing: "warning",
  error: "error",
  idle: "neutral",
} as const;

/**
 * "Paste an ID, read one record."
 *
 * Pass `renderRecord` to show the record as something a person can read. Without
 * it the record falls back to JSON, which is what every one of these lookups
 * used to do unconditionally — defensible for a developer checking whether a
 * write landed, useless to the operators who actually run these pages, who
 * cannot be expected to read a wire format to find out whether a payment was
 * approved. New call sites should pass it; the fallback exists so the pages not
 * yet converted keep working rather than rendering nothing.
 */
export function LookupById<T = unknown>({
  action,
  inputName,
  label,
  placeholder,
  hint,
  buttonLabel = "Look up",
  renderRecord,
}: {
  action: (previous: LookupState<T>, formData: FormData) => Promise<LookupState<T>>;
  inputName: string;
  label: string;
  placeholder?: string;
  hint?: string;
  buttonLabel?: string;
  renderRecord?: (record: T) => ReactNode;
}) {
  const [state, submit, pending] = useActionState<LookupState<T>, FormData>(action, {
    status: "idle",
    message: "",
  });

  return (
    <form action={submit} className="space-y-3">
      <div>
        <label htmlFor={inputName} className={LABEL}>
          {label}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={inputName}
            name={inputName}
            required
            placeholder={placeholder}
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
          <Button type="submit" size="sm" loading={pending} className="shrink-0">
            {!pending && <Search className="h-3.5 w-3.5" aria-hidden="true" />}
            {pending ? "Reading…" : buttonLabel}
          </Button>
        </div>
        {hint && <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
      </div>

      <ResultBanner tone={TONE[state.status]} message={state.message}>
        {state.status === "found" &&
          state.record !== undefined &&
          (renderRecord ? renderRecord(state.record) : <JsonBlock value={state.record} />)}
      </ResultBanner>
    </form>
  );
}
