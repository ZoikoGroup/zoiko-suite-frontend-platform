"use client";

import { useState, useEffect, useCallback } from "react";
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
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { exportToCSV } from "@/lib/export";
import type { TaxHealthResponse } from "@/app/api/backend/tax-health/route";

// ── New-Rule overlay ───────────────────────────────────────────────────────────
function NewRuleModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ rule_id: string; rule_code: string } | null>(null);
  const [form, setForm] = useState({
    jurisdiction: "uk-gov-01",
    category: "VAT",
    rate: "20",
    effectiveFrom: new Date().toISOString().split("T")[0],
  });

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const ruleCode = `${form.jurisdiction}-${form.category}-${form.effectiveFrom.replace(/-/g, "")}`;
      const res = await fetch("/api/v1/tax-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jurisdiction_id: form.jurisdiction,
          rule_code: ruleCode,
          name: `${form.category} Rule — ${form.jurisdiction} (${form.rate}%)`,
          category: form.category,
          tax_rate_percentage: parseFloat(form.rate) || 20,
          effective_from: form.effectiveFrom,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? `tax-rules-svc rejected the write (${res.status})`);
      }
      setCreated({ rule_id: json.rule_id, rule_code: json.rule_code });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tax rule");
    }
    setSubmitting(false);
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
                  : "text-slate-400 dark:text-slate-500"
                }`}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="p-5">
          {created ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Tax rule created</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Rule <span className="font-mono text-slate-700 dark:text-slate-300">{created.rule_code}</span>{" "}
                (ID {created.rule_id}) registered with tax-rules-svc (:8125) and is pending activation.
              </p>
              <button
                onClick={onClose}
                className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
              >
                Done
              </button>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <AlertCircle className="h-10 w-10 text-red-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Could not create rule</p>
              <p className="max-w-xs text-xs text-slate-500 dark:text-slate-400">{error}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setError(null)}
                  className="mt-1 rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                >
                  Try again
                </button>
                <button
                  onClick={onClose}
                  className="mt-1 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
                >
                  Close
                </button>
              </div>
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
        {!created && !error && (
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

// ── Determination Wizard overlay ───────────────────────────────────────────────
type DeterminationResult = {
  determination_id: string;
  rule_id?: string;
  taxable_amount: number;
  tax_rate_percentage: number;
  calculated_tax_amount: number;
  status: string;
};

function DeterminationWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeterminationResult | null>(null);
  const steps = [
    { label: "Fetching jurisdiction rules…", detail: "Querying tax-rules-svc (:8125) for the active rule" },
    { label: "Evaluating taxable base…", detail: "Applying exemptions and deductions from the transaction payload" },
    { label: "Calculating tax amount…", detail: "Rate × taxable base → calculated_tax_amount stored in tax-determination-svc (:8126)" },
  ];

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/tax-determinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: `demo-${Date.now()}`,
          source_module: "ADMIN_CONSOLE",
          legal_entity_id: "22222222-2222-2222-2222-222222222222",
          jurisdiction_id: "us-fed-01",
          tax_category: "CORPORATE_INCOME",
          gross_amount: 100000,
          currency: "USD",
          effective_from: new Date().toISOString().split("T")[0],
          evaluated_by: "admin-console",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? `tax-determination-svc rejected the write (${res.status})`);
      }
      // Animate the remaining pipeline steps, then reveal the result.
      setStep(1);
      setTimeout(() => setStep(2), 700);
      setTimeout(() => setResult(json), 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setRunning(false);
    }
  }

  const isDone = result !== null;

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
            <div key={i} className={`flex items-start gap-3 rounded-lg p-3 transition-all duration-300 ${result || i < step ? "bg-emerald-50 dark:bg-emerald-500/10" :
                i === step && running ? "bg-blue-50 border border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/30" :
                  i === step ? "bg-slate-50 border border-slate-200 dark:bg-slate-800/40" :
                    "bg-slate-50 dark:bg-slate-800/40 opacity-50"
              }`}>
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${result || i < step ? "bg-emerald-500 text-white" :
                  i === step && running ? "bg-blue-500 text-white animate-pulse" :
                    "bg-slate-300 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
                }`}>{result || i < step ? "✓" : i + 1}</span>
              <div>
                <p className={`text-xs font-semibold ${result || i < step ? "text-emerald-700 dark:text-emerald-400" : i === step ? "text-blue-700 dark:text-blue-300" : "text-slate-500"}`}>{s.label}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{s.detail}</p>
              </div>
            </div>
          ))}

          {result && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Determination</span>
                <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{result.determination_id}</span>
              </div>
              <div className="flex justify-between text-xs mt-1.5">
                <span className="text-slate-500 dark:text-slate-400">Rule applied</span>
                <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{result.rule_id ?? "fallback"}</span>
              </div>
              <div className="flex justify-between text-xs mt-1.5">
                <span className="text-slate-500 dark:text-slate-400">Taxable base</span>
                <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                  {result.taxable_amount.toLocaleString("en-US")} USD
                </span>
              </div>
              <div className="flex justify-between text-xs mt-1.5">
                <span className="text-slate-500 dark:text-slate-400">Rate</span>
                <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{result.tax_rate_percentage}%</span>
              </div>
              <div className="flex justify-between text-xs mt-1.5 pt-1.5 border-t border-emerald-100 dark:border-emerald-500/20">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Calculated tax</span>
                <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                  {result.calculated_tax_amount.toLocaleString("en-US")} USD
                </span>
              </div>
              <p className="mt-2 text-[10px] font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                {result.status}
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/20 dark:bg-red-500/10">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>
        <div className="flex justify-end border-t border-slate-100 px-5 py-3.5 dark:border-slate-800">
          {isDone ? (
            <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors">
              <CheckCircle2 className="h-3 w-3" /> Determination complete
            </button>
          ) : (
            <button onClick={run} disabled={running} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors">
              {running ? <><Loader2 className="h-3 w-3 animate-spin" /> Evaluating…</> : <>Run Evaluation <ChevronRight className="h-3 w-3" /></>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Filing assembly overlay ────────────────────────────────────────────────────
type FilingResult = {
  draft_id: string;
  validation_status: string;
  filing_type: string;
  period_key: string;
};

function FilingAssemblyPanel({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<FilingResult | null>(null);

  async function assemble() {
    setSubmitting(true);
    setError(null);
    try {
      // 1. Create the draft in filing-preparation-svc
      const createRes = await fetch("/api/v1/filing-preparation/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legal_entity_id: "22222222-2222-2222-2222-222222222222",
          jurisdiction_id: "uk-gov-01",
          filing_type: "VAT100_MTD",
          period_key: "2026-Q2",
          due_date: "2026-08-07",
          payload_data: JSON.stringify({ box1: 370000, box5: 186000 }),
          evidence_manifest_ref: "ev-manifest-2026-q2",
          notes: "Assembled from the Tax Governance console.",
        }),
      });
      const draft = await createRes.json().catch(() => null);
      if (!createRes.ok) {
        throw new Error(draft?.error ?? `filing-preparation-svc rejected the write (${createRes.status})`);
      }

      // 2. Mark it ready for authority submission
      const finalizeRes = await fetch(`/api/v1/filing-preparation/drafts/${draft.draft_id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Ready for authority submission." }),
      });
      const finalized = await finalizeRes.json().catch(() => null);
      if (!finalizeRes.ok) {
        throw new Error(finalized?.error ?? `finalize rejected (${finalizeRes.status})`);
      }

      setResult({
        draft_id: finalized.draft_id ?? draft.draft_id,
        validation_status: finalized.validation_status ?? "FINALIZED",
        filing_type: finalized.filing_type ?? "VAT100_MTD",
        period_key: finalized.period_key ?? "2026-Q2",
      });
      setConfirmed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Filing assembly failed");
      setConfirmed(false);
    }
    setSubmitting(false);
  }

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
        {confirmed && result ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="font-semibold text-slate-800 dark:text-slate-200">Filing assembly complete</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {result.filing_type} · {result.period_key} (draft {result.draft_id}) finalized and ready for
              authority submission in filing-preparation-svc (:8130).
            </p>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
              {result.validation_status}
            </span>
            <button onClick={onClose} className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700 transition-colors">Done</button>
          </div>
        ) : (
          <>
            <div className="p-5 space-y-3">
              <div className="rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 p-3 flex gap-2.5">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  This will create and finalize the HMRC MTD VAT100 draft for period <strong>2026-Q2</strong> in filing-preparation-svc, marking it ready for authority submission.
                </p>
              </div>
              {[
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

              {error && (
                <div className="flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/20 dark:bg-red-500/10">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3.5 dark:border-slate-800">
              <button onClick={onClose} disabled={submitting} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-40 transition-colors">Cancel</button>
              <button
                onClick={assemble}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-60 transition-colors"
              >
                {submitting ? <><Loader2 className="h-3 w-3 animate-spin" /> Assembling…</> : <><FileCheck className="h-3 w-3" /> Confirm Assembly</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Service Health Strip (live) ────────────────────────────────────────────────
function ServiceHealthStrip() {
  const [health, setHealth] = useState<TaxHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/backend/tax-health", {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data: TaxHealthResponse = await res.json();
        setHealth(data);
      }
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial probe deferred so no state is set synchronously within the effect
    const first = setTimeout(fetchHealth, 0);
    // Re-probe every 30 seconds
    const interval = setInterval(fetchHealth, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [fetchHealth]);

  const checkedAt = health?.checkedAt
    ? new Date(health.checkedAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : null;

  return (
    <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-2.5 dark:border-slate-800 dark:bg-slate-800/30">
      <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mr-1">
        <Server className="h-3 w-3" /> Services:
      </span>

      {loading && !health ? (
        // Skeleton while probing
        Array.from({ length: 7 }).map((_, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-mono text-slate-400 dark:bg-slate-900 dark:border-slate-700 animate-pulse"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
            :{8124 + i + 1}
          </span>
        ))
      ) : health ? (
        health.services.map((svc) => (
          <span
            key={svc.port}
            title={`${svc.name} — ${svc.status}`}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-mono transition-colors ${
              svc.status === "up"
                ? "bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                : "bg-red-50 border-red-200 text-red-600 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                svc.status === "up" ? "bg-emerald-500" : "bg-red-500"
              }`}
            />
            :{svc.port}
          </span>
        ))
      ) : (
        <span className="inline-flex items-center gap-1 text-[11px] text-red-500 dark:text-red-400">
          <WifiOff className="h-3 w-3" /> Health probe failed
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {health && (
          <span
            className={`inline-flex items-center gap-1 text-[11px] ${
              health.allUp
                ? "text-emerald-600 dark:text-emerald-400"
                : health.upCount > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-red-500 dark:text-red-400"
            }`}
          >
            {health.allUp ? (
              <><Zap className="h-3 w-3" /> All nominal</>
            ) : health.upCount > 0 ? (
              <><AlertCircle className="h-3 w-3" /> {health.upCount}/{health.total} up</>
            ) : (
              <><WifiOff className="h-3 w-3" /> All services down</>
            )}
          </span>
        )}
        <button
          onClick={fetchHealth}
          disabled={loading}
          title="Re-probe service health"
          className="rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-40 transition-colors"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </button>
        {checkedAt && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
            {checkedAt}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
type Modal = "new-rule" | "determination" | "filing" | null;

export function TaxActionHeader() {
  const [modal, setModal] = useState<Modal>(null);

  return (
    <>
      {/* Overlay portals */}
      {modal === "new-rule" && <NewRuleModal onClose={() => setModal(null)} />}
      {modal === "determination" && <DeterminationWizard onClose={() => setModal(null)} />}
      {modal === "filing" && <FilingAssemblyPanel onClose={() => setModal(null)} />}

      <div className="rounded-xl border border-slate-200 bg-white/90 backdrop-blur-md shadow-sm dark:border-slate-800 dark:bg-slate-900/90 overflow-hidden">
        {/* Top toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Tax Domain — 7 Services
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
              onClick={async () => {
                try {
                  const res = await fetch("/api/v1/tax-rules");
                  const json = await res.json().catch(() => ({ tax_rules: [] }));
                  const rules: Array<{ rule_id: string; category: string; jurisdiction_id: string; status: string; tax_rate_percentage: number; effective_from: string }> = json.tax_rules ?? [];
                  const JUR_MAP: Record<string, string> = {
                    "uk-gov-01": "UK (HMRC)", "us-fed-01": "US (IRS)",
                    "sg-iras-01": "SG (IRAS)", "de-bzst-01": "DE (BZSt)",
                  };
                  const AUTH_MAP: Record<string, string> = {
                    "uk-gov-01": "HMRC", "us-fed-01": "IRS",
                    "sg-iras-01": "IRAS", "de-bzst-01": "BZSt",
                  };
                  const rows = rules.map((r) => ({
                    rule_id: r.rule_id,
                    category: r.category,
                    jurisdiction: JUR_MAP[r.jurisdiction_id] ?? r.jurisdiction_id,
                    authority: AUTH_MAP[r.jurisdiction_id] ?? r.jurisdiction_id,
                    status: r.status,
                    rate: `${r.tax_rate_percentage}%`,
                    effective: r.effective_from?.split("T")[0] ?? "",
                  }));
                  exportToCSV("tax_governance_report.csv", rows.length > 0 ? rows : [
                    { rule_id: "(no rules found)", category: "", jurisdiction: "", authority: "", status: "", rate: "", effective: "" },
                  ]);
                } catch {
                  exportToCSV("tax_governance_report.csv", [
                    { rule_id: "(export failed — service unreachable)", category: "", jurisdiction: "", authority: "", status: "", rate: "", effective: "" },
                  ]);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
            >
              <Download className="h-3.5 w-3.5 text-emerald-500" />
              Export Report (CSV)
            </button>
          </div>
        </div>

        {/* Live service health strip */}
        <ServiceHealthStrip />
      </div>
    </>
  );
}
