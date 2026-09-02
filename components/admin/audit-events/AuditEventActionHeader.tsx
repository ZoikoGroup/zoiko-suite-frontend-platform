"use client";

import { useState, useTransition } from "react";
import { Plus, ShieldCheck, Lock, CheckCircle2, X, Server, Zap, Loader2, Download, AlertTriangle } from "lucide-react";
import { verifyChainAction, exportAuditLogAction } from "@/app/admin/audit-events/actions";
import { IDLE_VERIFY_STATE, IDLE_EXPORT_STATE, type VerifyChainState, type ExportState } from "@/app/admin/audit-events/state";

const SERVICES = [
  { name: "tenant-entity-registry-svc",    port: "8081", color: "bg-emerald-500" },
  { name: "governance-decision-log-svc",    port: "8083", color: "bg-emerald-500" },
  { name: "audit-event-store-svc",         port: "8084", color: "bg-emerald-500" },
  { name: "configuration-feature-flag-svc",port: "8086", color: "bg-emerald-500" },
];

function IngestEventModal({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventType, setEventType] = useState("TAX_RULE_EVALUATED");

  async function handleIngest() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/audit/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: eventType,
          source_module: "ADMIN_CONSOLE",
          payload: { action: "test_ingest", timestamp: new Date().toISOString() },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? `audit-event-store-svc rejected the write (${res.status})`);
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to ingest event");
    }
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
              <Plus className="h-3.5 w-3.5 text-slate-700 dark:text-slate-300" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Emit Test Audit Event</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Audit Event Ingested</p>
              <p className="text-xs text-slate-500">Event written to audit-event-store-svc and SHA-256 hash chained.</p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => {
                    onClose();
                    window.location.reload();
                  }}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-medium text-white transition-colors"
                >
                  Reload Audit Chain
                </button>
                <button onClick={onClose} className="rounded-lg bg-slate-800 dark:bg-slate-700 px-4 py-2 text-xs font-medium text-white">
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Event Type</label>
                <input
                  type="text"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                  {error}
                </div>
              )}
              <button
                onClick={handleIngest}
                disabled={submitting || !eventType.trim()}
                className="w-full rounded-lg bg-slate-900 dark:bg-slate-700 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ingest Event"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VerifyChainModal({
  onClose,
  state,
  onVerify,
  pending,
}: {
  onClose: () => void;
  state: VerifyChainState;
  onVerify: () => void;
  pending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10">
              <Lock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Cryptographic Chain Verification</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Re-computes and checks SHA-256 hash linkages across the entire audit log in <code>audit-event-store-svc</code>.
            Each event&apos;s hash must match the cryptographic signature computed from its predecessor.
          </p>

          {state.status === "verified" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              <span>{state.message}</span>
            </div>
          )}

          {state.status === "compromised" && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <span>{state.message}</span>
            </div>
          )}

          {state.status === "error" && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              {state.message}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={onVerify}
              disabled={pending}
              className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5 disabled:opacity-60 transition-colors"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
              {pending ? "Verifying SHA-256..." : "Run Chain Verification"}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type AuditEventActionHeaderProps = {
  serviceStatus?: "operational" | "attention" | "degraded";
  activeServices?: string;
};

export function AuditEventActionHeader({ serviceStatus = "operational", activeServices }: AuditEventActionHeaderProps = {}) {
  const [modal, setModal] = useState<string | null>(null);
  const [verifyState, setVerifyState] = useState<VerifyChainState>(IDLE_VERIFY_STATE);
  const [isVerifying, startVerifyTransition] = useTransition();
  const [exportState, setExportState] = useState<ExportState>(IDLE_EXPORT_STATE);
  const [isExporting, startExportTransition] = useTransition();

  function handleVerify() {
    startVerifyTransition(async () => {
      const res = await verifyChainAction(verifyState, new FormData());
      setVerifyState(res);
    });
  }

  function handleExport() {
    startExportTransition(async () => {
      const res = await exportAuditLogAction(exportState, new FormData());
      setExportState(res);
      if (res.status === "exported" && res.payload) {
        const blob = new Blob([res.payload], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename ?? "audit-log.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    });
  }

  const statusBadgeColor =
    serviceStatus === "degraded"
      ? "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300"
      : serviceStatus === "attention"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300";

  const statusDotColor =
    serviceStatus === "degraded"
      ? "bg-rose-500"
      : serviceStatus === "attention"
      ? "bg-amber-500"
      : "bg-emerald-500";

  return (
    <>
      {modal === "ingest" && <IngestEventModal onClose={() => setModal(null)} />}
      {modal === "verify" && (
        <VerifyChainModal
          onClose={() => setModal(null)}
          state={verifyState}
          onVerify={handleVerify}
          pending={isVerifying}
        />
      )}

      <div className="rounded-xl border border-slate-200 bg-white/90 backdrop-blur-md shadow-sm dark:border-slate-800 dark:bg-slate-900/90 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeColor}`}>
              <span className={`h-2 w-2 rounded-full ${statusDotColor} animate-pulse`} />
              {activeServices ?? "4 services in compose"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setModal("ingest")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Emit Test Event
            </button>
            <button
              onClick={() => {
                setModal("verify");
                handleVerify();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition-colors"
            >
              <Lock className="h-3.5 w-3.5 text-emerald-500" />
              Verify Hash Chain
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition-colors disabled:opacity-60"
            >
              {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 text-indigo-500" />}
              Export Audit Log
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-2.5 dark:border-slate-800 dark:bg-slate-800/30">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 mr-1">
            <Server className="h-3 w-3" /> Services:
          </span>
          {SERVICES.map((svc) => (
            <span key={svc.port} className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-mono text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400">
              <span className={`h-1.5 w-1.5 rounded-full ${svc.color}`} />
              :{svc.port}
            </span>
          ))}
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
            <Zap className="h-3 w-3" /> All nominal
          </span>
        </div>
      </div>
    </>
  );
}

