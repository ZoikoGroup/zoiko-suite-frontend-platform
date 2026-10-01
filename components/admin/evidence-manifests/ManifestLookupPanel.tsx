"use client";

import { Fragment, useActionState, useState } from "react";
import { Search, ScrollText } from "lucide-react";
import { Button } from "@/components/ui";
import { CopyableId, ResultBanner } from "@/components/admin/shared";
import { FIELD, LABEL, CELL, HEAD } from "@/components/admin/shared/form";
import { fetchManifestRecordsAction, lookupManifestAction } from "@/app/admin/evidence-manifests/actions";
import { IDLE_LOOKUP, type LookupState, type RecordsState } from "@/app/admin/evidence-manifests/state";

const LOOKUP_TONE = {
  found: "success",
  not_found: "warning",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

const STATUS_TONE: Record<string, string> = {
  GENERATED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  PENDING: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
  FAILED: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

function when(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

/**
 * Look up one manifest by id, then optionally its records.
 *
 * There is no register/list panel on this page — evidence-manifest-svc has no
 * endpoint to list manifests, only generate/get-one/list-records-of-one. A
 * manifest just generated above is looked up here by pasting its id in, the
 * same as any other manifest a caller already has the id for.
 */
export function ManifestLookupPanel() {
  const [lookupState, lookupAction, lookupPending] = useActionState<LookupState, FormData>(
    lookupManifestAction,
    IDLE_LOOKUP,
  );
  const [recordsState, setRecordsState] = useState<RecordsState>({ status: "idle" });
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);

  const manifest = lookupState.status === "found" ? lookupState.manifest : null;

  async function loadRecords(manifestId: string) {
    setRecordsLoading(true);
    const result = await fetchManifestRecordsAction(manifestId);
    setRecordsState(result);
    setRecordsLoading(false);
  }

  return (
    <div className="space-y-4">
      <form action={lookupAction} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[20rem] flex-1">
          <label className={LABEL} htmlFor="manifest_id">
            Manifest ID
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className={`${FIELD} pl-9`}
              id="manifest_id"
              name="manifest_id"
              placeholder="Paste a manifest ID, e.g. from the panel above"
              required
            />
          </div>
        </div>
        <Button type="submit" disabled={lookupPending}>
          {lookupPending ? "Looking up…" : "Look up"}
        </Button>
      </form>

      <ResultBanner
        tone={LOOKUP_TONE[lookupState.status]}
        message={lookupState.status === "idle" || lookupState.status === "found" ? undefined : lookupState.message}
      />

      {manifest && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <CopyableId value={manifest.manifest_id} />
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[manifest.status]}`}
            >
              {manifest.status}
            </span>
            <span className="text-xs text-slate-500">{manifest.scenario_type}</span>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-slate-400">Legal entity</dt>
              <dd className="font-mono">{manifest.legal_entity_id}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Requested by</dt>
              <dd>{manifest.requested_by}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Requested at</dt>
              <dd>{when(manifest.requested_at)}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Generated at</dt>
              <dd>{when(manifest.generated_at)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-400">Checksum (SHA-256)</dt>
              <dd className="font-mono">{manifest.checksum_sha256 ?? "—"}</dd>
            </div>
            {manifest.failure_reason && (
              <div className="sm:col-span-2">
                <dt className="text-slate-400">Failure reason</dt>
                <dd className="text-rose-600 dark:text-rose-400">{manifest.failure_reason}</dd>
              </div>
            )}
          </dl>

          <Button
            size="sm"
            variant="secondary"
            disabled={recordsLoading}
            onClick={() => loadRecords(manifest.manifest_id)}
          >
            <ScrollText className="h-3.5 w-3.5" />
            {recordsLoading ? "Loading records…" : "View records"}
          </Button>

          {recordsState.status !== "idle" && (
            <RecordsPanel state={recordsState} openId={openRecordId} onToggle={setOpenRecordId} />
          )}
        </div>
      )}
    </div>
  );
}

function RecordsPanel({
  state,
  openId,
  onToggle,
}: {
  state: RecordsState;
  openId: string | null;
  onToggle: (id: string | null) => void;
}) {
  if (state.status === "idle") return null;
  if (state.status !== "loaded") {
    return (
      <ResultBanner tone={state.status === "refused" ? "warning" : "error"} message={state.message} />
    );
  }
  if (state.records.length === 0) {
    return <p className="text-sm text-slate-500">No records fixed into this manifest.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <thead>
          <tr>
            <th className={HEAD}>Source type</th>
            <th className={HEAD}>Source record ID</th>
            <th className={HEAD}>Fetched at</th>
            <th className={HEAD}>Snapshot</th>
          </tr>
        </thead>
        <tbody>
          {state.records.map((r) => (
            <Fragment key={r.manifest_record_id}>
              <tr className="border-t border-slate-100 dark:border-slate-800">
                <td className={CELL}>
                  <span className="text-xs">{r.source_type}</span>
                </td>
                <td className={CELL}>
                  <span className="font-mono text-xs">{r.source_record_id}</span>
                </td>
                <td className={CELL}>
                  <span className="text-xs">{when(r.fetched_at)}</span>
                </td>
                <td className={CELL}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onToggle(openId === r.manifest_record_id ? null : r.manifest_record_id)}
                  >
                    {openId === r.manifest_record_id ? "Hide" : "View"}
                  </Button>
                </td>
              </tr>
              {openId === r.manifest_record_id && (
                <tr>
                  <td colSpan={4} className="bg-slate-50 p-3 dark:bg-slate-900/50">
                    {"decoded" in r && r.decoded !== undefined ? (
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px]">
                        {JSON.stringify(r.decoded, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-xs text-slate-500">
                        This snapshot could not be decoded as JSON — raw base64 shown below.
                        <span className="mt-1 block max-h-32 overflow-auto break-all font-mono text-[10px]">
                          {r.record_snapshot}
                        </span>
                      </p>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
