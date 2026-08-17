"use client";

import { useState } from "react";
import { Plus, ShieldCheck, Lock, CheckCircle2, X, Server, Zap, Loader2 } from "lucide-react";

const SERVICES = [
  { name: "tenant-entity-registry-svc",    port: "8081", color: "bg-emerald-500" },
  { name: "governance-decision-log-svc",    port: "8083", color: "bg-emerald-500" },
  { name: "audit-event-store-svc",         port: "8084", color: "bg-emerald-500" },
  { name: "configuration-feature-flag-svc",port: "8086", color: "bg-emerald-500" },
];

function IngestEventModal({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function handleIngest() {
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setDone(true);
    }, 1200);
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
              <p className="text-xs text-slate-500">evt-2026-99183 logged & SHA-256 hash chained in audit-event-store-svc (:8084).</p>
              <button onClick={onClose} className="mt-2 rounded-lg bg-slate-800 dark:bg-slate-700 px-4 py-2 text-xs font-medium text-white">Done</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Event Type</label>
                <input type="text" defaultValue="TAX_RULE_EVALUATED" className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Actor Principal ID</label>
                <input type="text" defaultValue="33333333-3333-3333-3333-333333333333" className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700 font-mono" />
              </div>
              <button
                onClick={handleIngest}
                disabled={submitting}
                className="w-full rounded-lg bg-slate-900 dark:bg-slate-700 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5"
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

type AuditEventActionHeaderProps = {
  serviceStatus?: "operational" | "attention" | "degraded";
  activeServices?: string;
};

export function AuditEventActionHeader({ serviceStatus = "operational", activeServices }: AuditEventActionHeaderProps = {}) {
  const [modal, setModal] = useState<string | null>(null);

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

      <div className="rounded-xl border border-slate-200 bg-white/90 backdrop-blur-md shadow-sm dark:border-slate-800 dark:bg-slate-900/90 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeColor}`}>
              <span className={`h-2 w-2 rounded-full ${statusDotColor} animate-pulse`} />
              {activeServices ?? "4 Microservices Active"}
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
              onClick={() => setModal("ingest")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Lock className="h-3.5 w-3.5 text-emerald-500" />
              Verify Hash Chain
            </button>
            <button
              onClick={() => setModal("ingest")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
              Toggle Feature Flag
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
