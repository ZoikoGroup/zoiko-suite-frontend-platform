"use client";

import { useActionState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui";
import { JsonBlock } from "./JsonBlock";
import { ResultBanner } from "./ResultBanner";
import { FIELD, LABEL } from "./form";
import { IDLE_LOOKUP, type LookupState } from "./lookup";

const TONE = {
  found: "success",
  missing: "warning",
  error: "error",
  idle: "neutral",
} as const;

/**
 * "Paste an ID, read one record."
 *
 * The found record is rendered as JSON rather than as a formatted card. These
 * lookups exist for diagnosis — an operator checking whether a write landed, or
 * following an id out of a log — and a curated view would hide exactly the field
 * they came to check.
 */
export function LookupById({
  action,
  inputName,
  label,
  placeholder,
  hint,
  buttonLabel = "Look up",
}: {
  action: (previous: LookupState, formData: FormData) => Promise<LookupState>;
  inputName: string;
  label: string;
  placeholder?: string;
  hint?: string;
  buttonLabel?: string;
}) {
  const [state, submit, pending] = useActionState<LookupState, FormData>(action, IDLE_LOOKUP);

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
        {state.status === "found" && <JsonBlock value={state.record} />}
      </ResultBanner>
    </form>
  );
}
