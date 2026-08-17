"use client";

import { useState } from "react";
import { Plus, Calendar, UserMinus, CheckCircle2, X, Server, Zap, Loader2 } from "lucide-react";

const SERVICES = [
  { name: "employee-master-svc",      port: "8109", color: "bg-emerald-500" },
  { name: "employment-contracts-svc", port: "8110", color: "bg-emerald-500" },
  { name: "leave-absence-svc",        port: "8111", color: "bg-emerald-500" },
  { name: "org-structure-svc",        port: "8131", color: "bg-emerald-500" },
  { name: "offboarding-severance-svc",port: "8132", color: "bg-emerald-500" },
  { name: "workforce-compliance-svc", port: "8133", color: "bg-emerald-500" },
];

function AddEmployeeModal({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function handleAdd() {
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
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-500/20">
              <Plus className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Onboard New Employee</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Employee Onboarded</p>
              <p className="text-xs text-slate-500">EMP-2026-0892 added to employee-master-svc (:8109).</p>
              <button onClick={onClose} className="mt-2 rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white">Done</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                <input type="text" defaultValue="Sarah Jenkins" className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Department</label>
                <select className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700">
                  <option>Engineering & Cloud Infrastructure</option>
                  <option>Legal & Compliance</option>
                  <option>Finance & Treasury</option>
                </select>
              </div>
              <button
                onClick={handleAdd}
                disabled={submitting}
                className="w-full rounded-lg bg-teal-600 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Complete Onboarding"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function HrActionHeader() {
  const [modal, setModal] = useState<string | null>(null);

  return (
    <>
      {modal === "add" && <AddEmployeeModal onClose={() => setModal(null)} />}

      <div className="rounded-xl border border-slate-200 bg-white/90 backdrop-blur-md shadow-sm dark:border-slate-800 dark:bg-slate-900/90 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              6 Microservices Active
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setModal("add")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 transition-colors shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Employee
            </button>
            <button
              onClick={() => setModal("add")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
            >
              <Calendar className="h-3.5 w-3.5 text-amber-500" />
              Submit Leave Request
            </button>
            <button
              onClick={() => setModal("add")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
            >
              <UserMinus className="h-3.5 w-3.5 text-rose-500" />
              Initiate Offboarding
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
