"use client";

// The lifecycle buttons for one record in a Blocks 6-10 list.
//
// Each button is an action from lib/lifecycle/catalog.ts, shown only in the
// statuses the service accepts it from. An action with inputs opens a small
// form; an irreversible one needs a second click. The answer shown is the
// service's: its new status, or its refusal with the HTTP status. Nothing is
// changed on screen until the list is read again.

import { useEffect, useId, useState, useTransition } from "react";
import { actionAvailable } from "@/lib/lifecycle/availability";
import { Loader2 } from "lucide-react";
import { runLifecycleAction } from "@/app/admin/lifecycle-actions";
import { LIFECYCLE_ACTIONS } from "@/lib/lifecycle/catalog";
import type { LifecycleResult } from "@/lib/lifecycle/types";
import type { FieldOption } from "@/components/admin/intelligence/create-state";
import { FIELD, LABEL, HINT, OPTIONAL, BANNER_SUCCESS, BANNER_ERROR } from "./form";

type Props = {
  /** Catalog keys, in the order the buttons are drawn. */
  actions: readonly string[];
  recordId: string;
  /** The record's current status, as the service listed it. */
  status?: string | null;
  /** The record's version, for services that check it (If-Match / X-Expected-Version). */
  version?: string | number | null;
  /** A second id the route needs (e.g. a line item); chosen by the panel. */
  subId?: string;
  /** Re-read the list after the service accepted an action. */
  onDone?: () => void;
  /** Options for the catalog's dynamic fields, read by the page from a live list. */
  fieldOptions?: Record<string, FieldOption[]>;
  /** Why a dynamic field has no options (its register could not be read), shown on that field. */
  fieldErrors?: Record<string, string>;
};

const BTN =
  "inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-40";
const BTN_NORMAL = `${BTN} border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200`;
const BTN_DANGER = `${BTN} border-rose-200 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:bg-slate-800 dark:text-rose-300`;

// The backend releases this deployment serves, read once per page load.
let releasesPromise: Promise<string[]> | null = null;
function loadReleases(): Promise<string[]> {
  releasesPromise ??= fetch("/api/lifecycle/availability", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { releases: [] }))
    .then((b: { releases?: string[] }) => (Array.isArray(b.releases) ? b.releases : []))
    .catch(() => []);
  return releasesPromise;
}

export function RowActions({ actions, recordId, status, version, subId, onDone, fieldOptions, fieldErrors }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [result, setResult] = useState<LifecycleResult | null>(null);
  const [pending, startTransition] = useTransition();
  const slug = useId();
  const [releases, setReleases] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadReleases().then((r) => {
      if (live) setReleases(r);
    });
    return () => {
      live = false;
    };
  }, []);

  const available = actions.filter((key) => {
    const spec = LIFECYCLE_ACTIONS[key];
    if (!spec) return false;
    // An action the backend may not serve is hidden until the deployment says it does.
    if (spec.backendRelease && !actionAvailable(spec, releases ?? [])) return false;
    return !spec.from || (status ? spec.from.includes(status) : false);
  });
  if (available.length === 0 && !result) return null;

  const send = (key: string, values: Record<string, string>) => {
    setResult(null);
    startTransition(async () => {
      try {
        const res = await runLifecycleAction(key, recordId, values, version ?? undefined, subId);
        setResult(res);
        if (res.ok) {
          setOpen(null);
          onDone?.();
        }
      } catch {
        setResult({ ok: false, message: "The action could not be sent to the console server." });
      }
    });
  };

  const click = (key: string) => {
    const spec = LIFECYCLE_ACTIONS[key];
    if (spec.fields?.length) {
      setOpen((o) => (o === key ? null : key));
      return;
    }
    if (spec.confirm && armed !== key) {
      setArmed(key);
      return;
    }
    setArmed(null);
    send(key, {});
  };

  const openSpec = open ? LIFECYCLE_ACTIONS[open] : undefined;

  return (
    <div className="space-y-2" data-row-actions={recordId}>
      <div className="flex flex-wrap items-center gap-1.5">
        {available.map((key) => {
          const spec = LIFECYCLE_ACTIONS[key];
          return (
            <button
              key={key}
              type="button"
              disabled={pending}
              aria-expanded={spec.fields?.length ? open === key : undefined}
              onClick={() => click(key)}
              className={spec.danger ? BTN_DANGER : BTN_NORMAL}
            >
              {armed === key ? `Confirm ${spec.label.toLowerCase()}` : spec.label}
            </button>
          );
        })}
        {pending && <Loader2 className="h-3 w-3 animate-spin text-slate-400" aria-label="Sending" />}
      </div>

      {open && openSpec && (
        <form
          aria-label={openSpec.label}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const values: Record<string, string> = {};
            for (const f of openSpec.fields ?? []) {
              const raw = String(fd.get(f.name) ?? "");
              // The reader's local date and time, converted here where their timezone is known.
              values[f.name] = f.kind === "datetime-local" && raw && !Number.isNaN(new Date(raw).getTime()) ? new Date(raw).toISOString() : raw;
            }
            send(open, values);
          }}
          className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40"
        >
          {openSpec.note && <p className="text-[11px] text-slate-500 dark:text-slate-400">{openSpec.note}</p>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {openSpec.fields?.map((f) => {
              const id = `${slug}-${open}-${f.name}`;
              if (f.kind === "checkbox") {
                return (
                  <label key={f.name} htmlFor={id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 sm:col-span-2">
                    <input id={id} name={f.name} type="checkbox" className="h-3.5 w-3.5" />
                    {f.label}
                  </label>
                );
              }
              return (
                <div key={f.name} className={f.kind === "textarea" ? "sm:col-span-2" : undefined}>
                  <label htmlFor={id} className={LABEL}>
                    {f.label} {!f.required && <span className={OPTIONAL}>(optional)</span>}
                  </label>
                  {f.kind === "select" ? (
                    <select id={id} name={f.name} defaultValue="" aria-required={f.required} className={FIELD}>
                      <option value="">Select…</option>
                      {(fieldOptions?.[f.name] ?? f.options)?.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : f.kind === "textarea" ? (
                    <textarea id={id} name={f.name} rows={2} placeholder={f.placeholder} aria-required={f.required} className={FIELD} />
                  ) : (
                    <input id={id} name={f.name} type={f.kind} step={f.step} min={f.min} max={f.max} placeholder={f.placeholder} aria-required={f.required} autoComplete="off" className={FIELD} />
                  )}
                  {fieldErrors?.[f.name] ? (
                    <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{fieldErrors[f.name]}</p>
                  ) : (
                    fieldOptions && f.name in fieldOptions && fieldOptions[f.name].length === 0 && <p className={HINT}>Nothing to choose from yet.</p>
                  )}
                  {f.hint && <p className={HINT}>{f.hint}</p>}
                </div>
              );
            })}
          </div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
          >
            {pending && <Loader2 className="h-3 w-3 animate-spin" />}
            {openSpec.label}
          </button>
        </form>
      )}

      {result && (
        <div role={result.ok ? "status" : "alert"} className={`rounded-lg border px-3 py-1.5 text-xs ${result.ok ? BANNER_SUCCESS : BANNER_ERROR}`}>
          {result.httpStatus ? <span className="mr-1 font-mono font-semibold">HTTP {result.httpStatus}</span> : null}
          <span className="break-words">{result.message}</span>
        </div>
      )}
    </div>
  );
}
