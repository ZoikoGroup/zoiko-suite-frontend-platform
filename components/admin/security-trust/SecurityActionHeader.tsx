"use client";

import { Shield, Key, RefreshCw, PlusCircle, FileCheck } from "lucide-react";

export function SecurityActionHeader() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Security & Zero-Trust Posture
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cryptographic identity, mutual TLS enforcement, SIEM streaming, and KMS key operations
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Stream
        </button>

        <button
          type="button"
          onClick={() => alert("Issue Certificate dialog: connect to mtls-management-svc")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          Issue mTLS Cert
        </button>

        <button
          type="button"
          onClick={() => alert("Rotate KMS Key triggered")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          <Key className="h-3.5 w-3.5" />
          Rotate Active Key
        </button>
      </div>
    </div>
  );
}
