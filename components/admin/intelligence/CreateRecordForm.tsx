"use client";

// One create form for the Blocks 8-10 services.
//
// The Server Action does the work: it takes the identity from the session,
// checks the required fields, sends the request and returns either the record
// the service wrote (its id and status) or the service's refusal verbatim with
// its HTTP status. This component only renders that answer. It never shows a
// record the service did not return, and it fills in no value the reader did
// not enter.

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { FIELD, LABEL, HINT, OPTIONAL, BANNER_SUCCESS, BANNER_ERROR } from "@/components/admin/shared/form";
import { IDLE, type CreateState, type FieldSpec } from "./create-state";

type Props = {
  /** Accessible name of the form, and the label of the button that opens it. */
  title: string;
  /** One line under the title: what the service records, and what it does not do. */
  description?: string;
  fields: FieldSpec[];
  action: (previous: CreateState, formData: FormData) => Promise<CreateState>;
  submitLabel: string;
  /** Re-run the panel's read after the service accepted the write. */
  onCreated?: () => void;
  /** Start open (for a form that is the panel's only content). */
  defaultOpen?: boolean;
};

export function CreateRecordForm({ title, description, fields, action, submitLabel, onCreated, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [state, formAction, pending] = useActionState(action, IDLE);
  const lastSeq = useRef(0);

  useEffect(() => {
    if (state.seq === lastSeq.current) return;
    lastSeq.current = state.seq;
    if (state.status === "created") onCreated?.();
  }, [state, onCreated]);

  const values = state.status === "error" ? state.values : {};
  // Unique per instance: the same form can appear once per row.
  const slug = useId();

  return (
    <div className="space-y-2" data-create-form={title}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        {open ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        {title}
      </button>

      {open && (
        <form
          key={state.seq}
          action={formAction}
          aria-label={title}
          noValidate
          className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40"
        >
          {description && <p className="text-[11px] text-slate-500 dark:text-slate-400">{description}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map((f) => {
              const id = `${slug}-${f.name}`;
              const initial = values[f.name] ?? f.initial ?? "";
              if (f.kind === "hidden") return <input key={f.name} type="hidden" name={f.name} value={f.initial ?? ""} />;
              if (f.kind === "checkbox") {
                return (
                  <label key={f.name} htmlFor={id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 sm:col-span-2">
                    <input id={id} name={f.name} type="checkbox" defaultChecked={initial === "on"} className="h-3.5 w-3.5" />
                    {f.label}
                    {f.hint && <span className="text-slate-400">— {f.hint}</span>}
                  </label>
                );
              }
              const wide = f.kind === "textarea";
              return (
                <div key={f.name} className={wide ? "sm:col-span-2" : undefined}>
                  <label htmlFor={id} className={LABEL}>
                    {f.label} {!f.required && <span className={OPTIONAL}>(optional)</span>}
                  </label>
                  {f.kind === "select" ? (
                    <select id={id} name={f.name} defaultValue={initial} aria-required={f.required} className={FIELD}>
                      <option value="">Select…</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : f.kind === "textarea" ? (
                    <textarea id={id} name={f.name} rows={3} defaultValue={initial} placeholder={f.placeholder} aria-required={f.required} className={FIELD} />
                  ) : (
                    <input
                      id={id}
                      name={f.name}
                      type={f.kind}
                      step={f.step}
                      // A secret is never echoed back into the form.
                      defaultValue={f.kind === "password" ? undefined : initial}
                      placeholder={f.placeholder}
                      aria-required={f.required}
                      autoComplete={f.kind === "password" ? "new-password" : "off"}
                      className={FIELD}
                    />
                  )}
                  {f.hint && <p className={HINT}>{f.hint}</p>}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
            >
              {pending && <Loader2 className="h-3 w-3 animate-spin" />}
              {pending ? "Sending…" : submitLabel}
            </button>
          </div>
        </form>
      )}

      <CreateResult state={state} />
    </div>
  );
}

/** The service's answer: the record it wrote, or its refusal as it gave it. */
export function CreateResult({ state }: { state: CreateState }) {
  if (state.status === "idle") return null;
  if (state.status === "error") {
    return (
      <div role="alert" className={`rounded-lg border px-3 py-2 text-xs ${BANNER_ERROR}`}>
        {state.httpStatus ? <span className="mr-1 font-mono font-semibold">HTTP {state.httpStatus}</span> : null}
        <span className="break-words">{state.message}</span>
      </div>
    );
  }
  return (
    <div role="status" className={`space-y-1 rounded-lg border px-3 py-2 text-xs ${BANNER_SUCCESS}`}>
      <p>
        <span className="mr-1 font-mono font-semibold">HTTP {state.httpStatus}</span>
        {state.message}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {state.fields.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-[11px] opacity-80">{label}</dt>
            <dd className="break-all font-mono text-[11px]" data-field={label}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
