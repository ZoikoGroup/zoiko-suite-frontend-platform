"use client";

import React, { useState, type ReactNode } from "react";
import { PrivacyPanels } from "@/components/admin/privacy/PrivacyPanels";
import { PrivacyTransferWorkbench } from "@/components/admin/privacy/PrivacyTransferWorkbench";
import { PurposeRegistryWorkbench } from "@/components/admin/privacy/PurposeRegistryWorkbench";
import { PrivacyDecisionWorkbench } from "@/components/admin/privacy/PrivacyDecisionWorkbench";
import { PrivacyRightsWorkbench } from "@/components/admin/privacy/PrivacyRightsWorkbench";
import { ShieldCheck, GlobeLock, BookOpen, Scale, FileText } from "lucide-react";

// ropaRegister is passed down from the Server Component page (app/admin/
// privacy/page.tsx) rather than imported here: ROPARegisterPanel reads
// cookies() via next/headers, which only Server Components may do, and this
// container is a Client Component (it holds the tab-switch state).
export function PrivacyViewContainer({ ropaRegister }: { ropaRegister: ReactNode }) {
  const [view, setView] = useState<"decisions" | "rights" | "purposes" | "consent" | "transfers">("rights");

  return (
    <div className="space-y-6">
      {/* ── Governance Domain Switcher ── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <button
          onClick={() => setView("rights")}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-xs font-bold transition-all ${
            view === "rights"
              ? "bg-indigo-600 text-white shadow"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span>PRV-04: Rights & Complaints (:8154)</span>
        </button>

        <button
          onClick={() => setView("decisions")}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-xs font-bold transition-all ${
            view === "decisions"
              ? "bg-indigo-600 text-white shadow"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <Scale className="h-4 w-4 shrink-0" />
          <span>PRV-03: Decision Gate (:8153)</span>
        </button>

        <button
          onClick={() => setView("purposes")}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-xs font-bold transition-all ${
            view === "purposes"
              ? "bg-indigo-600 text-white shadow"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <BookOpen className="h-4 w-4 shrink-0" />
          <span>PRV-01: Purpose & ROPA (:8151)</span>
        </button>

        <button
          onClick={() => setView("consent")}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-xs font-bold transition-all ${
            view === "consent"
              ? "bg-indigo-600 text-white shadow"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>PRV-02: Notice & Consent (:8152)</span>
        </button>

        <button
          onClick={() => setView("transfers")}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-xs font-bold transition-all ${
            view === "transfers"
              ? "bg-indigo-600 text-white shadow"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <GlobeLock className="h-4 w-4 shrink-0" />
          <span>PRV-05: Cross-Border Transfers (:8155)</span>
        </button>
      </div>

      {view === "rights" && <PrivacyRightsWorkbench />}
      {view === "decisions" && <PrivacyDecisionWorkbench />}
      {view === "transfers" && <PrivacyTransferWorkbench />}
      {view === "consent" && <PrivacyPanels />}
      {view === "purposes" && (
        <div className="space-y-6">
          <PurposeRegistryWorkbench />
          <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
            <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">ROPA register</h3>
            {ropaRegister}
          </div>
        </div>
      )}
    </div>
  );
}

