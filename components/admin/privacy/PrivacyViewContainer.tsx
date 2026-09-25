"use client";

import React, { useState } from "react";
import { PrivacyPanels } from "@/components/admin/privacy/PrivacyPanels";
import { PrivacyTransferWorkbench } from "@/components/admin/privacy/PrivacyTransferWorkbench";
import { ShieldCheck, GlobeLock } from "lucide-react";

export function PrivacyViewContainer() {
  const [view, setView] = useState<"transfers" | "consent">("transfers");

  return (
    <div className="space-y-6">
      {/* ── Governance Domain Switcher ── */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <button
          onClick={() => setView("transfers")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 px-4 text-xs font-bold transition-all ${
            view === "transfers"
              ? "bg-indigo-600 text-white shadow"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <GlobeLock className="h-4 w-4" />
          PRV-05: Cross-Border Transfers & Processor Governance (:8155)
        </button>

        <button
          onClick={() => setView("consent")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 px-4 text-xs font-bold transition-all ${
            view === "consent"
              ? "bg-indigo-600 text-white shadow"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          PRV-02: Privacy Notice & Consent Governance (:8152)
        </button>
      </div>

      {view === "transfers" ? <PrivacyTransferWorkbench /> : <PrivacyPanels />}
    </div>
  );
}
