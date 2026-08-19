"use client";

import { useState } from "react";
import { Plus, Edit3, Vote, CheckCircle2, X, Server, Zap, Loader2 } from "lucide-react";

const SERVICES = [
  { name: "contract-lifecycle-svc",     port: "8119", color: "bg-emerald-500" },
  { name: "clause-template-svc",        port: "8120", color: "bg-emerald-500" },
  { name: "obligation-tracking-svc",    port: "8121", color: "bg-emerald-500" },
  { name: "board-resolutions-svc",      port: "8122", color: "bg-emerald-500" },
  { name: "corporate-actions-svc",      port: "8123", color: "bg-emerald-500" },
  { name: "counterparty-management-svc", port: "8124", color: "bg-emerald-500" },
  { name: "obligations-svc",            port: "8088", color: "bg-emerald-500" },
];

function CreateContractModal({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("Enterprise Cloud MSA — Acme Corp");
  const [type, setType] = useState("MSA");

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          contract_type: type,
          status: "DRAFT",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create contract");
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
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-500/20">
              <Plus className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Create Contract Draft</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Contract Draft Created</p>
              <p className="text-xs text-slate-500">Contract registered in contract-lifecycle-svc (:8119).</p>
              <button onClick={onClose} className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white">Done</button>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 dark:bg-red-500/10 dark:border-red-500/20">
                  <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Contract Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Contract Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="MSA">MSA (Master Services Agreement)</option>
                  <option value="NDA">NDA (Non-Disclosure Agreement)</option>
                  <option value="SLA">SLA (Service Level Agreement)</option>
                </select>
              </div>
              <button
                onClick={handleCreate}
                disabled={submitting}
                className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create Contract Draft"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftClauseModal({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("CONFIDENTIALITY");
  const [body, setBody] = useState("");

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/clauses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          body,
          jurisdiction_id: "uk-gov-01",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create clause");
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
              <Edit3 className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Draft Clause</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Clause Drafted</p>
              <p className="text-xs text-slate-500">Clause registered in clause-template-svc (:8120).</p>
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
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Clause Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Confidentiality Clause"
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="CONFIDENTIALITY">Confidentiality</option>
                  <option value="INDEMNIFICATION">Indemnification</option>
                  <option value="TERMINATION">Termination</option>
                  <option value="LIABILITY">Liability</option>
                  <option value="GOVERNING_LAW">Governing Law</option>
                  <option value="PAYMENT_TERMS">Payment Terms</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Clause Body</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Enter the clause text..."
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={submitting || !title || !body}
                className="w-full rounded-lg bg-purple-600 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create Clause"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PassResolutionModal({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("GOVERNANCE");

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/resolutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          category,
          effective_from: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create resolution");
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
              <Vote className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Pass Resolution</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Resolution Created</p>
              <p className="text-xs text-slate-500">Resolution registered in board-resolutions-svc (:8122).</p>
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
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Resolution Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Board Resolution 2026-001"
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="GOVERNANCE">Governance</option>
                  <option value="FINANCIAL">Financial</option>
                  <option value="OPERATIONAL">Operational</option>
                  <option value="EXECUTIVE">Executive</option>
                  <option value="STATUTORY">Statutory</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Resolution Content</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Enter the resolution text..."
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={submitting || !title || !content}
                className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create Resolution"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function LegalActionHeader() {
  const [modal, setModal] = useState<string | null>(null);

  return (
    <>
      {modal === "create" && <CreateContractModal onClose={() => setModal(null)} />}
      {modal === "clause" && <DraftClauseModal onClose={() => setModal(null)} />}
      {modal === "resolution" && <PassResolutionModal onClose={() => setModal(null)} />}

      <div className="rounded-xl border border-slate-200 bg-white/90 backdrop-blur-md shadow-sm dark:border-slate-800 dark:bg-slate-900/90 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              7 services in compose
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setModal("create")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Contract
            </button>
            <button
              onClick={() => setModal("clause")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Edit3 className="h-3.5 w-3.5 text-purple-500" />
              Draft Clause
            </button>
            <button
              onClick={() => setModal("resolution")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Vote className="h-3.5 w-3.5 text-emerald-500" />
              Pass Resolution
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
