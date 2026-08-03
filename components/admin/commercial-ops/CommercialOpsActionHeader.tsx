"use client";

import { useState } from "react";
import { Plus, ShoppingCart, ShieldCheck, CheckCircle2 } from "lucide-react";

export function CommercialOpsActionHeader() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function triggerAction(actionName: string) {
    setToastMessage(`Action triggered: ${actionName} successfully registered.`);
    setTimeout(() => setToastMessage(null), 4000);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            6 Services Active
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Ports: 8109, 8110, 8117, 8134, 8135, 8136
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => triggerAction("New Purchase Order (PO-2026-0414)")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Issue Purchase Order
          </button>
          <button
            onClick={() => triggerAction("Vendor Due Diligence Review")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
            Vendor Check
          </button>
          <button
            onClick={() => triggerAction("Spend Limit Update")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <ShoppingCart className="h-3.5 w-3.5 text-amber-500" />
            Adjust Budget
          </button>
        </div>
      </div>

      {toastMessage && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3.5 text-xs font-medium text-emerald-900 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-emerald-700 hover:underline">Dismiss</button>
        </div>
      )}
    </div>
  );
}
