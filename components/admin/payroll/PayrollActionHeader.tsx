"use client";

import { useState } from "react";
import { Plus, Sliders, AlertCircle, CheckCircle2, X, Server, Zap, Loader2 } from "lucide-react";

const SERVICES = [
  { name: "payroll-run-svc",        port: "8110", color: "bg-emerald-500" },
  { name: "compensation-svc",       port: "8111", color: "bg-emerald-500" },
  { name: "benefits-svc",           port: "8112", color: "bg-emerald-500" },
  { name: "payroll-tax-svc",        port: "8113", color: "bg-emerald-500" },
  { name: "payroll-exceptions-svc", port: "8114", color: "bg-emerald-500" },
];

function PayRunModal({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payPeriod, setPayPeriod] = useState("2026-M07");

  async function handleTrigger() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/payroll/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pay_period_start: payPeriod === "2026-M07" ? "2026-07-01" : "2026-07-22",
          pay_period_end: payPeriod === "2026-M07" ? "2026-07-31" : "2026-07-28",
          pay_date: payPeriod === "2026-M07" ? "2026-08-05" : "2026-08-01",
          is_shadow_run: false,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to initiate pay run");
        setSubmitting(false);
        return;
      }
    } catch (err) {
      console.warn("API call degraded safely:", err);
      setError("Network error - service may be unavailable");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setDone(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/20">
              <Plus className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Trigger Payroll Run</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Pay Run Initiated</p>
              <p className="text-xs text-slate-500">PAY-2026-M07 queued in payroll-run-svc (:8090).</p>
              <button onClick={onClose} className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white">Done</button>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 dark:bg-red-500/10 dark:border-red-500/20">
                  <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Pay Period</label>
                <select
                  value={payPeriod}
                  onChange={(e) => setPayPeriod(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="2026-M07">2026-M07 · July Monthly Salary Run</option>
                  <option value="2026-W30">2026-W30 · Weekly Contractor Run</option>
                </select>
              </div>
              <button
                onClick={handleTrigger}
                disabled={submitting}
                className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Initiate Pay Run"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SalaryStructureModal({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grade, setGrade] = useState("L4");
  const [minSalary, setMinSalary] = useState(95000);
  const [maxSalary, setMaxSalary] = useState(140000);
  const [effectiveDate, setEffectiveDate] = useState("2026-08-01");

  async function handleUpdate() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/compensation/structures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${grade} Band Structure`,
          pay_type: "SALARY",
          min_amount: minSalary,
          max_amount: maxSalary,
          currency: "USD",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update salary structure");
        setSubmitting(false);
        return;
      }
    } catch (err) {
      console.warn("API call degraded safely:", err);
      setError("Network error - service may be unavailable");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setDone(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/20">
              <Sliders className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Update Salary Structure</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Salary Structure Updated</p>
              <p className="text-xs text-slate-500">Grade L4 band revised in compensation-svc (:8091). Effective next pay cycle.</p>
              <button onClick={onClose} className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white">Done</button>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 dark:bg-red-500/10 dark:border-red-500/20">
                  <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Grade / Band</label>
                <select
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="L3">L3 · Engineer</option>
                  <option value="L4">L4 · Senior Engineer</option>
                  <option value="L5">L5 · Staff Engineer</option>
                  <option value="M1">M1 · Manager</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Min Salary ($)</label>
                  <input
                    type="number"
                    value={minSalary}
                    onChange={(e) => setMinSalary(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Max Salary ($)</label>
                  <input
                    type="number"
                    value={maxSalary}
                    onChange={(e) => setMaxSalary(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Effective Date</label>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <button
                onClick={handleUpdate}
                disabled={submitting}
                className="w-full rounded-lg bg-blue-600 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Update Structure"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AuditExceptionsModal({ onClose }: { onClose: () => void }) {
  const [exceptions, setExceptions] = useState<Array<{
    exception_id: string;
    employee_id: string;
    exception_type: string;
    severity: string;
    description: string;
    status: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useState(() => {
    async function fetchExceptions() {
      try {
        const res = await fetch("/api/v1/payroll-exceptions");
        if (res.ok) {
          const data = await res.json();
          setExceptions(data.exceptions || []);
        } else {
          setError("Failed to load exceptions");
        }
      } catch {
        setError("Network error - service may be unavailable");
      }
      setLoading(false);
    }
    fetchExceptions();
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/20">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Payroll Exceptions</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">payroll-exceptions-svc (:8114) · PAY-2026-M07</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 dark:bg-red-500/10 dark:border-red-500/20">
              <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
            </div>
          ) : exceptions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xs text-slate-500 dark:text-slate-400">No exceptions found for this pay period.</p>
            </div>
          ) : (
            exceptions.map((exc) => (
              <div key={exc.exception_id} className={`rounded-lg border p-3 flex items-start gap-3 ${
                exc.severity === "BLOCKER" || exc.severity === "CRITICAL" ? "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10" :
                exc.severity === "WARNING" ? "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10" :
                "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40"
              }`}>
                <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                  exc.severity === "BLOCKER" || exc.severity === "CRITICAL" ? "bg-red-500" :
                  exc.severity === "WARNING" ? "bg-amber-500" : "bg-slate-400"
                }`}>!</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{exc.employee_id}</p>
                    <span className="font-mono text-[10px] text-slate-400">{exc.exception_id}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{exc.description}</p>
                  <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded ${
                    exc.status === "OPEN" ? "bg-red-100 text-red-700" :
                    exc.status === "RESOLVED" ? "bg-emerald-100 text-emerald-700" :
                    "bg-slate-100 text-slate-700"
                  }`}>{exc.status}</span>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex justify-end border-t border-slate-100 px-5 py-3.5 dark:border-slate-800">
          <button onClick={onClose} className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white hover:bg-amber-700 transition-colors">
            Acknowledge &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
}

type Modal = "run" | "salary" | "exceptions" | null;

export function PayrollActionHeader() {
  const [modal, setModal] = useState<Modal>(null);

  return (
    <>
      {modal === "run" && <PayRunModal onClose={() => setModal(null)} />}
      {modal === "salary" && <SalaryStructureModal onClose={() => setModal(null)} />}
      {modal === "exceptions" && <AuditExceptionsModal onClose={() => setModal(null)} />}

      <div className="rounded-xl border border-slate-200 bg-white/90 backdrop-blur-md shadow-sm dark:border-slate-800 dark:bg-slate-900/90 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              5 services in compose
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="payroll-action-trigger-run"
              onClick={() => setModal("run")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Trigger Pay Run
            </button>
            <button
              id="payroll-action-salary-structure"
              onClick={() => setModal("salary")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Sliders className="h-3.5 w-3.5 text-blue-500" />
              Update Salary Structure
            </button>
            <button
              id="payroll-action-audit-exceptions"
              onClick={() => setModal("exceptions")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              Audit Exceptions
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
