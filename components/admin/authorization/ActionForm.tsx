"use client";

import { useActionState, useEffect, useRef, useTransition, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { CopyableId, ResultBanner, type BannerTone } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { IDLE, type AuthzResult } from "@/app/admin/authorization/state";

const TONE: Record<AuthzResult["status"], BannerTone> = {
  idle: "neutral",
  done: "success",
  // Recorded but not in force yet — not a success to celebrate, not a fault.
  pending: "neutral",
  // The control answered no. Amber, so it is not mistaken for an outage.
  refused: "warning",
  error: "error",
  signin: "neutral",
  step_up: "neutral",
};

const ID_LABEL = /ID$/;

/** One result, as the standards ask: a sentence, then key/value, then a table. */
export function ResultView({ result }: { result: AuthzResult }) {
  return (
    <ResultBanner tone={TONE[result.status]} message={result.message || undefined}>
      {result.details && result.details.length > 0 && (
        <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
          {result.details.map((d) => (
            <div key={d.label} className="min-w-0">
              <dt className="font-medium opacity-80">{d.label}</dt>
              <dd className="break-words">{ID_LABEL.test(d.label) ? <CopyableId value={d.value} /> : d.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {result.table && (
        <div className="max-h-96 overflow-auto rounded-md border border-current/10 bg-white/60 dark:bg-slate-900/40">
          <table className="min-w-full text-left">
            <thead>
              <tr>
                {result.table.headers.map((h) => (
                  <th key={h} className={HEAD}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.table.rows.map((row, i) => (
                <tr key={i} className="border-t border-current/10">
                  {row.map((cell, j) => (
                    <td key={j} className={`${CELL} py-2 text-xs`}>
                      {result.table!.headers[j]?.endsWith("ID") ? <CopyableId value={cell} /> : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ResultBanner>
  );
}

/**
 * A form posting to one Server Action and showing its result underneath.
 * Fields are passed as children so every tab writes its fields with the same
 * primitives (ui.tsx) and gets the same submit row and result view.
 */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "Working…",
  children,
  note,
  variant = "primary",
  resetOnSuccess = false,
}: {
  action: (prev: AuthzResult, fd: FormData) => Promise<AuthzResult>;
  submitLabel: string;
  pendingLabel?: string;
  children: ReactNode;
  note?: string;
  variant?: "primary" | "secondary";
  /** Clear the fields after a successful create. Checks keep what was typed,
   *  so a question can be refined and asked again. */
  resetOnSuccess?: boolean;
}) {
  const [state, submit, pending] = useActionState(action, IDLE);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Submitted through a transition rather than <form action>, because a form
  // action resets every field when it finishes — which would wipe a check the
  // moment its answer arrived.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => submit(data));
  }

  useEffect(() => {
    if (resetOnSuccess && (state.status === "done" || state.status === "pending")) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant={variant} loading={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        {note && <p className="text-xs text-slate-500 dark:text-slate-400">{note}</p>}
      </div>
      {state.status !== "idle" && <ResultView result={state} />}
    </form>
  );
}
