"use client";

import { useState } from "react";
import {
  Plus,
  Calculator,
  FileCheck,
  CheckCircle2,
  X,
  ChevronRight,
  Loader2,
  Server,
  Zap,
  AlertCircle,
  Download,
} from "lucide-react";
import { exportToCSV } from "@/lib/export";

// ── Service health definitions ────────────────────────────────────────────────
const SERVICES = [
  { name: "tax-rules-svc", port: "8125", color: "bg-emerald-500" },
  { name: "tax-determination-svc", port: "8126", color: "bg-emerald-500" },
  { name: "vat-gst-svc", port: "8127", color: "bg-emerald-500" },
  { name: "corporate-tax-svc", port: "8128", color: "bg-emerald-500" },
  { name: "withholding-tax-svc", port: "8129", color: "bg-emerald-500" },
  { name: "filing-preparation-svc", port: "8130", color: "bg-emerald-500" },
  { name: "tax-authority-interface-svc", port: "8147", color: "bg-emerald-500" },
];

// ── New-Rule overlay ──────────────────────────────────────────────────────────
function NewRuleModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    jurisdiction: "uk-gov-01",
    category: "VAT",
    rate: "20",
    effectiveFrom: new Date().toISOString().split("T")[0],
  });

  function handleSubmit() {
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setDone(true);
    }, 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/20">
              <Plus className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">New Tax Rule</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex border-b border-slate-100 dark:border-slate-800">
          {["Jurisdiction", "Rate & Category", "Review"].map((label, i) => (
            <div
              key={label}
              className={`flex-1 py-2.5 text-center text-[11px] font-medium transition-colors ${step === i + 1
                  ? "border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400"
                  : step > i + 1
                    ? "text-slate-400 dark:text-slate-500"
                    : "text-slate-400 dark:text-slate-500"
                }`}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="p-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Tax rule created</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Rule has been registered with tax-rules-svc (:8125) and is pending activation.
              </p>
              <button
                onClick={onClose}
                className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
              >
                Done
              </button>
            </div>
          ) : step === 1 ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Jurisdiction
                </label>
                <select
                  value={form.jurisdiction}
                  onChange={(e) => setForm((f) => ({ ...f, jurisdiction: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="uk-gov-01">🇬🇧 United Kingdom (HMRC)</option>
                  <option value="us-fed-01">🇺🇸 United States (IRS)</option>
                  <option value="sg-iras-01">🇸🇬 Singapore (IRAS)</option>
                  <option value="de-bzst-01">🇩🇪 Germany (BZSt)</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Effective From
                </label>
                <input
                  type="date"
                  value={form.effectiveFrom}
                  onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
              </div>
            </div>
          ) : step === 2 ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Tax Category
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {["VAT", "GST", "CORPORATE_INCOME", "WITHHOLDING", "EXCISE", "CUSTOMS"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Tax Rate (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.rate}
                  onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Review the new rule before registering:
              </p>
              {[
                ["Jurisdiction", form.jurisdiction],
                ["Category", form.category],
                ["Rate", `${form.rate}%`],
                ["Effective From", form.effectiveFrom],
                ["Target Service", "tax-rules-svc (:8125)"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">{label}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 font-mono">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!done && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3.5 dark:border-slate-800">
            <button
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-30 transition-colors"
            >
              Back
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
              >
                Next <ChevronRight className="h-3 w-3" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
              >
                {submitting ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Registering…</>
                ) : (
                  <><CheckCircle2 className="h-3 w-3" /> Create Rule</>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Determination Wizard overlay ──────────────────────────────────────────────
function DeterminationWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    { label: "Fetching jurisdiction rules…", detail: "Querying tax-rules-svc (:8125) for applicable rules" },
    { label: "Evaluating taxable base…", detail: "Applying exemptions and deductions from the transaction payload" },
    { label: "Calculating tax amount…", detail: "Rate × taxable base → calculated_tax_amount stored in tax-determination-svc (:8126)" },
  ];

  function runNext() {
    if (step < steps.length - 1) {
      setTimeout(() => setStep((s) => s + 1), 900);
    }
  }

  const isDone = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/20">
              <Calculator className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Evaluate Determination</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {steps.map((s, i) => (
            <div key={i} className={`flex items-start gap-3 rounded-lg p-3 transition-all duration-300 ${i < step ? "bg-emerald-50 dark:bg-emerald-500/10" :
                i === step ? "bg-blue-50 border border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/30" :
                  "bg-slate-50 dark:bg-slate-800/40 opacity-50"
              }`}>
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${i < step ? "bg-emerald-500 text-white" :
                  i === step ? "bg-blue-500 text-white animate-pulse" :
                    "bg-slate-300 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
                }`}>{i < step ? "✓" : i + 1}</span>
              <div>
                <p className={`text-xs font-semibold ${i === step ? "text-blue-700 dark:text-blue-300" : i < step ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500"}`}>{s.label}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{s.detail}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end border-t border-slate-100 px-5 py-3.5 dark:border-slate-800">
          {isDone ? (
            <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors">
              <CheckCircle2 className="h-3 w-3" /> Determination complete
            </button>
          ) : (
            <button onClick={runNext} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors">
              Run step {step + 1} <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Filing assembly overlay ───────────────────────────────────────────────────
function FilingAssemblyPanel({ onClose }: { onClose: () => void }) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/20">
              <FileCheck className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Assemble Filing</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {confirmed ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="font-semibold text-slate-800 dark:text-slate-200">Filing assembly triggered</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              draft-hmrc-q2 (VAT100_MTD · 2026-Q2) submitted to filing-preparation-svc (:8130).
            </p>
            <button onClick={onClose} className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700 transition-colors">Done</button>
          </div>
        ) : (
          <>
            <div className="p-5 space-y-3">
              <div className="rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 p-3 flex gap-2.5">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  This will assemble the HMRC MTD VAT100 draft for period <strong>2026-Q2</strong> and mark it ready for authority submission.
                </p>
              </div>
              {[
                ["Draft ID", "draft-hmrc-q2"],
                ["Filing Type", "VAT100_MTD"],
                ["Period", "2026-Q2"],
                ["Due Date", "2026-08-07"],
                ["Service", "filing-preparation-svc (:8130)"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">{k}</span>
                  <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{v}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3.5 dark:border-slate-800">
              <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Cancel</button>
              <button
                onClick={() => setConfirmed(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-amber-600 transition-colors"
              >
                <FileCheck className="h-3 w-3" /> Confirm Assembly
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
type Modal = "new-rule" | "determination" | "filing" | null;

export function TaxActionHeader() {
  const [modal, setModal] = useState<Modal>(null);

  const now = new Date();
  const syncTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <>
      {/* Overlay portals */}
      {modal === "new-rule" && <NewRuleModal onClose={() => setModal(null)} />}
      {modal === "determination" && <DeterminationWizard onClose={() => setModal(null)} />}
      {modal === "filing" && <FilingAssemblyPanel onClose={() => setModal(null)} />}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        {/* Top toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              7 Services Active
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Last synced {syncTime}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="tax-action-new-rule"
              onClick={() => setModal("new-rule")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              New Tax Rule
            </button>
            <button
              id="tax-action-evaluate"
              onClick={() => setModal("determination")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
            >
              <Calculator className="h-3.5 w-3.5 text-blue-500" />
              Evaluate Determination
            </button>
            <button
              id="tax-action-assemble"
              onClick={() => setModal("filing")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
            >
              <FileCheck className="h-3.5 w-3.5 text-amber-500" />
              Assemble Filing
            </button>
            <button
              id="tax-action-export-csv"
              onClick={() => {
                exportToCSV("tax_governance_report.csv", [
                  { rule_id: "TR-UK-VAT-01", category: "VAT / GST", jurisdiction: "UK-HMRC", status: "Active", rate: "20%" },
                  { rule_id: "TR-US-CORP-02", category: "Corporate Tax", jurisdiction: "US-IRS", status: "Active", rate: "21%" },
                  { rule_id: "TR-EU-WHT-03", category: "Withholding Tax", jurisdiction: "EU-DE", status: "Active", rate: "15%" },
                ]);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
            >
              <Download className="h-3.5 w-3.5 text-emerald-500" />
              Export Report (CSV)
            </button>
          </div>
        </div>

        {/* Service health strip */}
        <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-2.5 dark:border-slate-800 dark:bg-slate-800/30">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mr-1">
            <Server className="h-3 w-3" /> Services:
          </span>
          {SERVICES.map((svc) => (
            <span
              key={svc.port}
              className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-mono text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
            >
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
