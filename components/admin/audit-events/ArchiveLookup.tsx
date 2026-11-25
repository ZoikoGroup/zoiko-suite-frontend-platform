"use client";

import { useActionState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { FIELD, LABEL } from "@/components/admin/shared/form";
import { ArchiveSummary, ArchiveVerificationHistory } from "./ArchiveSummary";
import { lookupArchive, verifyArchiveAction } from "@/app/admin/audit-events/actions";
import { IDLE_ARCHIVE_LOOKUP, IDLE_VERIFY_ARCHIVE, type VerifyArchiveState } from "@/app/admin/audit-events/state";

const LOOKUP_TONE = { found: "success", missing: "warning", error: "error", idle: "neutral" } as const;
const VERIFY_TONE = {
  verified: "success",
  diverged: "error",
  error: "error",
  idle: "neutral",
} as const;

/**
 * "Paste an archive ID, read it, and re-verify it on the spot."
 *
 * One component rather than LookupById + a separate action, because the
 * verify button needs the id the lookup just found — these two actions are
 * read together everywhere an archive is read at all.
 */
export function ArchiveLookup() {
  const [lookupState, lookupSubmit, lookupPending] = useActionState(lookupArchive, IDLE_ARCHIVE_LOOKUP);
  const [verifyState, verifySubmit, verifyPending] = useActionState<VerifyArchiveState, FormData>(
    verifyArchiveAction,
    IDLE_VERIFY_ARCHIVE,
  );

  const archiveId = lookupState.record?.archive.archive_id;

  return (
    <div className="space-y-4">
      <form action={lookupSubmit} className="space-y-3">
        <div>
          <label htmlFor="archive_id" className={LABEL}>
            Archive ID
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="archive_id"
              name="archive_id"
              required
              placeholder="4f8c2a91-…"
              className={`${FIELD} font-mono text-xs`}
              autoComplete="off"
            />
            <Button type="submit" size="sm" loading={lookupPending} className="shrink-0">
              {!lookupPending && <Search className="h-3.5 w-3.5" aria-hidden="true" />}
              {lookupPending ? "Reading…" : "Look up"}
            </Button>
          </div>
        </div>

        <ResultBanner tone={LOOKUP_TONE[lookupState.status]} message={lookupState.message}>
          {lookupState.record && (
            <div className="space-y-4">
              <ArchiveSummary archive={lookupState.record.archive} />
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Verification history
                </p>
                <ArchiveVerificationHistory verifications={lookupState.record.verifications} />
              </div>
            </div>
          )}
        </ResultBanner>
      </form>

      {archiveId && (
        <form action={verifySubmit} className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <input type="hidden" name="archive_id" value={archiveId} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={verifyPending} size="sm" variant="secondary">
              {verifyPending ? "Re-verifying…" : "Re-verify this archive now"}
            </Button>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Appends a new, permanent verification row below — it does not replace any earlier one.
            </p>
          </div>
          <ResultBanner tone={VERIFY_TONE[verifyState.status]} message={verifyState.message} />
        </form>
      )}
    </div>
  );
}
