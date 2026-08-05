"use client";

import { useState } from "react";
import { Plus, ShieldAlert, Sliders, CheckCircle2, X, Server, Zap, Loader2 } from "lucide-react";

const SERVICES = [
  { name: "procurement-workflow-svc",  port: "8112", color: "bg-emerald-500" },
  { name: "spend-controls-svc",       port: "8113", color: "bg-emerald-500" },
  { name: "purchase-request-svc",     port: "8114", color: "bg-emerald-500" },
  { name: "purchase-order-svc",       port: "8115", color: "bg-emerald-500" },
  { name: "invoice-approval-svc",     port: "8116", color: "bg-emerald-500" },
  { name: "vendor-due-diligence-svc", port: "8117", color: "bg-emerald-500" },
];

function IssuePoModal({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function handleIssue() {
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
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/20">
              <Plus className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Issue Purchase Order</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Purchase Order Issued</p>
              <p className="text-xs text-slate-500">PO-2026-0414 registered in purchase-order-svc (:8115).</p>
              <button onClick={onClose} className="mt-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white">Done</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Vendor Name</label>
                <input type="text" defaultValue="Acme Cloud Infrastructure Inc." className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">PO Amount ($)</label>
                <input type="number" defaultValue="450000" className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700" />
              </div>
              <button
                onClick={handleIssue}
                disabled={submitting}
                className="w-full rounded-lg bg-amber-600 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Issue Purchase Order"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CommercialOpsActionHeader() {
  const [modal, setModal] = useState<string | null>(null);

  return (
    <>
      {modal === "issue" && <IssuePoModal onClose={() => setModal(null)} />}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              6 Microservices Active
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setModal("issue")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Issue Purchase Order
            </button>
            <button
              onClick={() => setModal("issue")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <ShieldAlert className="h-3.5 w-3.5 text-blue-500" />
              Vendor Check
            </button>
            <button
              onClick={() => setModal("issue")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Sliders className="h-3.5 w-3.5 text-purple-500" />
              Adjust Budget
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
