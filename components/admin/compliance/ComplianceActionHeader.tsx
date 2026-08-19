"use client";

import { useState } from "react";
import { Plus, ShieldCheck, FileCheck, CheckCircle2, X, Server, Zap, Loader2 } from "lucide-react";

const SERVICES = [
  { name: "filing-tracker-svc",       port: "8136", color: "bg-emerald-500" },
  { name: "compliance-status-svc",    port: "8137", color: "bg-emerald-500" },
  { name: "exception-escalation-svc", port: "8138", color: "bg-emerald-500" },
  { name: "evidence-manifest-svc",    port: "8095", color: "bg-emerald-500" },
  { name: "obligations-svc",          port: "8088", color: "bg-emerald-500" },
];

function NewRequirementModal({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filingName, setFilingName] = useState("");
  const [authority, setAuthority] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [filingType, setFilingType] = useState("VAT100_MTD");

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/filing-tracker/requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legal_entity_id: "22222222-2222-2222-2222-222222222222",
          jurisdiction_id: "uk-gov-01",
          filing_authority: authority,
          due_date: dueDate,
          filing_type: filingType,
          notes: filingName,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create filing requirement");
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
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-500/20">
              <Plus className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">New Statutory Filing</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Statutory Filing Created</p>
              <p className="text-xs text-slate-500">Filing requirement registered in filing-tracker-svc (:8131).</p>
              <button onClick={onClose} className="mt-2 rounded-lg bg-purple-600 px-4 py-2 text-xs font-medium text-white">Done</button>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 dark:bg-red-500/10 dark:border-red-500/20">
                  <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Filing Name</label>
                <input
                  type="text"
                  value={filingName}
                  onChange={(e) => setFilingName(e.target.value)}
                  placeholder="Annual Confirmation Statement — Companies House"
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Authority</label>
                <input
                  type="text"
                  value={authority}
                  onChange={(e) => setAuthority(e.target.value)}
                  placeholder="Companies House UK"
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Filing Type</label>
                  <select
                    value={filingType}
                    onChange={(e) => setFilingType(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                  >
                    <option value="VAT100_MTD">VAT100 MTD</option>
                    <option value="CORPORATION_TAX">Corporation Tax</option>
                    <option value="ANNUAL_RETURN">Annual Return</option>
                    <option value="PAYE">PAYE</option>
                  </select>
                </div>
              </div>
              <button
                onClick={handleCreate}
                disabled={submitting || !filingName || !authority || !dueDate}
                className="w-full rounded-lg bg-purple-600 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create Statutory Requirement"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EvaluateComplianceModal({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jurisdiction, setJurisdiction] = useState("uk-gov-01");
  const [totalObligations, setTotalObligations] = useState(100);
  const [fulfilled, setFulfilled] = useState(95);
  const [pending, setPending] = useState(3);
  const [overdue, setOverdue] = useState(2);

  async function handleEvaluate() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/compliance-status/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legal_entity_id: "22222222-2222-2222-2222-222222222222",
          jurisdiction_id: jurisdiction,
          total_obligations: totalObligations,
          fulfilled_obligations: fulfilled,
          pending_obligations: pending,
          overdue_obligations: overdue,
          open_exceptions: 0,
          effective_from: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to evaluate compliance");
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
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Evaluate Compliance</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Compliance Evaluated</p>
              <p className="text-xs text-slate-500">Evaluation recorded in compliance-status-svc (:8132).</p>
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
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Jurisdiction</label>
                <select
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="uk-gov-01">UK - Companies House</option>
                  <option value="us-fed-01">US - Federal</option>
                  <option value="sg-gov-01">Singapore - ACRA</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Total Obligations</label>
                  <input
                    type="number"
                    value={totalObligations}
                    onChange={(e) => setTotalObligations(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Fulfilled</label>
                  <input
                    type="number"
                    value={fulfilled}
                    onChange={(e) => setFulfilled(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Pending</label>
                  <input
                    type="number"
                    value={pending}
                    onChange={(e) => setPending(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Overdue</label>
                  <input
                    type="number"
                    value={overdue}
                    onChange={(e) => setOverdue(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
              </div>
              <button
                onClick={handleEvaluate}
                disabled={submitting}
                className="w-full rounded-lg bg-blue-600 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run Compliance Evaluation"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadEvidenceModal({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenarioType, setScenarioType] = useState("COMPLIANCE_REVIEW");
  const [requestedBy, setRequestedBy] = useState("");

  async function handleUpload() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/evidence-manifests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_type: scenarioType,
          requested_by: requestedBy || "admin@zoiko.com",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to generate evidence manifest");
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
              <FileCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Upload Evidence Manifest</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Evidence Manifest Generated</p>
              <p className="text-xs text-slate-500">Manifest created in evidence-manifest-svc (:8095).</p>
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
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Scenario Type</label>
                <select
                  value={scenarioType}
                  onChange={(e) => setScenarioType(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="COMPLIANCE_REVIEW">Compliance Review</option>
                  <option value="AUDIT">Audit</option>
                  <option value="REGULATOR">Regulator Request</option>
                  <option value="LEGAL_DISCOVERY">Legal Discovery</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Requested By</label>
                <input
                  type="text"
                  value={requestedBy}
                  onChange={(e) => setRequestedBy(e.target.value)}
                  placeholder="admin@zoiko.com"
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <button
                onClick={handleUpload}
                disabled={submitting}
                className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Generate Evidence Manifest"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ComplianceActionHeader() {
  const [modal, setModal] = useState<string | null>(null);

  return (
    <>
      {modal === "create" && <NewRequirementModal onClose={() => setModal(null)} />}
      {modal === "evaluate" && <EvaluateComplianceModal onClose={() => setModal(null)} />}
      {modal === "evidence" && <UploadEvidenceModal onClose={() => setModal(null)} />}

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
              onClick={() => setModal("create")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              New Statutory Filing
            </button>
            <button
              onClick={() => setModal("evaluate")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
              Evaluate Compliance
            </button>
            <button
              onClick={() => setModal("evidence")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <FileCheck className="h-3.5 w-3.5 text-emerald-500" />
              Upload Evidence Manifest
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
