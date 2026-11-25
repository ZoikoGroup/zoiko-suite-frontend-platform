"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL } from "@/components/admin/shared/form";
import { ArchiveSummary } from "./ArchiveSummary";
import { createArchiveAction } from "@/app/admin/audit-events/actions";
import { IDLE_CREATE_ARCHIVE, type CreateArchiveState } from "@/app/admin/audit-events/state";

const TONE = {
  sealed: "success",
  replayed: "neutral",
  error: "error",
  idle: "neutral",
} as const;

export function ArchiveCreateForm() {
  const [state, action, pending] = useActionState<CreateArchiveState, FormData>(
    createArchiveAction,
    IDLE_CREATE_ARCHIVE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="from_sequence" className={LABEL}>
            From sequence
          </label>
          <input
            id="from_sequence"
            name="from_sequence"
            type="number"
            required
            placeholder="1"
            className={FIELD}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="to_sequence" className={LABEL}>
            To sequence
          </label>
          <input
            id="to_sequence"
            name="to_sequence"
            type="number"
            required
            placeholder="1000"
            className={FIELD}
            autoComplete="off"
          />
          <p className={HINT}>
            The chain is re-verified across this range before sealing — a break anywhere inside it
            blocks the archive rather than sealing a claim that would not reproduce.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Sealing…" : "Seal archive"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Permanent once sealed — an archive is never edited or deleted after creation.
        </p>
      </div>

      <ResultBanner tone={TONE[state.status]} message={state.message}>
        {state.archive && (
          <div className="rounded-lg bg-white/70 p-3 ring-1 ring-inset ring-black/5 dark:bg-slate-900/40 dark:ring-white/5">
            <ArchiveSummary archive={state.archive} />
          </div>
        )}
      </ResultBanner>
    </form>
  );
}
