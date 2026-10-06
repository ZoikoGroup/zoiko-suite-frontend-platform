"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, XCircle, ShieldCheck, Download, RefreshCw, FileText, AlertTriangle } from "lucide-react";
import { Button, Skeleton } from "@/components/ui";
import { CopyableId, ResultBanner } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { listManifestsAction, verifyManifestAction } from "@/app/admin/evidence-manifests/actions";
import { type CatalogState, type VerifyState } from "@/app/admin/evidence-manifests/state";
import { SCENARIO_TYPES, type EvidenceManifest, type ScenarioType } from "@/lib/api/evidence-manifest";

const STATUS_TONE: Record<string, string> = {
  GENERATED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700",
  PENDING: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300 border-slate-300 dark:border-slate-700",
  FAILED: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300 border-rose-300 dark:border-rose-700",
};

function formatDate(val?: string | null): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleString();
  } catch {
    return val;
  }
}

interface ManifestCatalogTableProps {
  legalEntityId: string;
  onSelectManifest?: (manifestId: string) => void;
}

export function ManifestCatalogTable({ legalEntityId, onSelectManifest }: ManifestCatalogTableProps) {
  const [catalogState, setCatalogState] = useState<CatalogState>({ status: "idle" });
  const [scenarioFilter, setScenarioFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [verifyState, setVerifyState] = useState<VerifyState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  const loadManifests = () => {
    startTransition(async () => {
      setCatalogState({ status: "loading" });
      const res = await listManifestsAction(legalEntityId);
      setCatalogState(res);
    });
  };

  useEffect(() => {
    loadManifests();
  }, [legalEntityId]);

  const handleVerify = (manifestId: string) => {
    startTransition(async () => {
      setVerifyState({ status: "verifying", manifestId });
      const res = await verifyManifestAction(manifestId);
      setVerifyState(res);
    });
  };

  const manifests = catalogState.status === "loaded" ? catalogState.manifests : [];
  const filteredManifests = manifests.filter((m) => {
    if (scenarioFilter !== "ALL" && m.scenario_type !== scenarioFilter) return false;
    if (statusFilter !== "ALL" && m.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Verification Notification Banner */}
      {verifyState.status === "verified" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm dark:border-emerald-800/40 dark:bg-emerald-950/20">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="space-y-1 text-sm text-emerald-900 dark:text-emerald-200">
              <p className="font-semibold">
                Cryptographic Integrity Verified (SHA-256 Valid)
              </p>
              <p className="text-xs text-emerald-800 dark:text-emerald-300">
                Manifest <span className="font-mono">{verifyState.manifestId}</span> with {verifyState.recordCount} evidence records passed cryptographic verification at {formatDate(verifyState.verifiedAt)}.
              </p>
              <div className="mt-2 text-xs font-mono bg-white/70 dark:bg-black/30 p-2 rounded border border-emerald-200 dark:border-emerald-800 break-all">
                Checksum: {verifyState.storedChecksum}
              </div>
            </div>
            <button
              onClick={() => setVerifyState({ status: "idle" })}
              className="ml-auto text-xs text-emerald-700 hover:underline dark:text-emerald-400"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {verifyState.status === "error" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 shadow-sm dark:border-rose-800/40 dark:bg-rose-950/20">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0" />
            <div className="space-y-1 text-sm text-rose-900 dark:text-rose-200">
              <p className="font-semibold">Verification Failed</p>
              <p className="text-xs text-rose-800 dark:text-rose-300">
                Manifest <span className="font-mono">{verifyState.manifestId}</span>: {verifyState.message}
              </p>
            </div>
            <button
              onClick={() => setVerifyState({ status: "idle" })}
              className="ml-auto text-xs text-rose-700 hover:underline dark:text-rose-400"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Controls & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={scenarioFilter}
            onChange={(e) => setScenarioFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="ALL">All Scenarios</option>
            {SCENARIO_TYPES.map((sc) => (
              <option key={sc} value={sc}>
                {sc}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="ALL">All Statuses</option>
            <option value="GENERATED">GENERATED</option>
            <option value="PENDING">PENDING</option>
            <option value="FAILED">FAILED</option>
          </select>

          <span className="text-xs text-slate-500 dark:text-slate-400">
            {filteredManifests.length} manifest{filteredManifests.length === 1 ? "" : "s"}
          </span>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={loadManifests}
          disabled={isPending}
          className="gap-1.5 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Table content */}
      {catalogState.status === "loading" && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      )}

      {catalogState.status === "error" && (
        <ResultBanner tone="error" message={catalogState.message} />
      )}

      {catalogState.status === "loaded" && filteredManifests.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
          <FileText className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            No evidence manifests found
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Generate a manifest using the form above to build an immutable audit snapshot.
          </p>
        </div>
      )}

      {catalogState.status === "loaded" && filteredManifests.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 dark:bg-slate-900/60 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th className={HEAD}>Manifest ID</th>
                <th className={HEAD}>Scenario</th>
                <th className={HEAD}>Status</th>
                <th className={HEAD}>SHA-256 Checksum / Failure</th>
                <th className={HEAD}>Requested At</th>
                <th className={`${HEAD} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredManifests.map((m) => {
                const isVerifying =
                  verifyState.status === "verifying" && verifyState.manifestId === m.manifest_id;
                return (
                  <tr key={m.manifest_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                    <td className={CELL}>
                      <div className="flex items-center gap-2">
                        <CopyableId value={m.manifest_id} />
                      </div>
                    </td>
                    <td className={CELL}>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {m.scenario_type}
                      </span>
                    </td>
                    <td className={CELL}>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          STATUS_TONE[m.status] ?? STATUS_TONE.PENDING
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className={CELL}>
                      {m.status === "GENERATED" && m.checksum_sha256 ? (
                        <div className="max-w-[14rem] truncate font-mono text-[11px] text-slate-600 dark:text-slate-400" title={m.checksum_sha256}>
                          {m.checksum_sha256.slice(0, 16)}…{m.checksum_sha256.slice(-8)}
                        </div>
                      ) : m.status === "FAILED" ? (
                        <span className="text-rose-600 dark:text-rose-400 font-sans text-xs">
                          {m.failure_reason || "Source service unavailable"}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className={CELL}>
                      <div className="text-slate-600 dark:text-slate-400">
                        {formatDate(m.requested_at)}
                      </div>
                    </td>
                    <td className={`${CELL} text-right`}>
                      <div className="flex items-center justify-end gap-1.5">
                        {m.status === "GENERATED" && (
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={isVerifying}
                              onClick={() => handleVerify(m.manifest_id)}
                              className="h-7 gap-1 px-2 text-[11px]"
                              title="Verify cryptographic SHA-256 integrity"
                            >
                              <ShieldCheck className={`h-3 w-3 ${isVerifying ? "animate-pulse text-indigo-500" : "text-emerald-600 dark:text-emerald-400"}`} />
                              {isVerifying ? "Verifying…" : "Verify"}
                            </Button>
                            <a
                              href={`http://localhost:8095/v1/evidence-manifests/${m.manifest_id}/download`}
                              download={`evidence-manifest-${m.manifest_id}.zip`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                              title="Download complete zip bundle"
                            >
                              <Download className="h-3 w-3 text-slate-500" />
                              Zip
                            </a>
                          </>
                        )}
                        {onSelectManifest && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onSelectManifest(m.manifest_id)}
                            className="h-7 px-2 text-[11px]"
                          >
                            Inspect
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
