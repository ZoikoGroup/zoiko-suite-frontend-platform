"use client";

// Compliance writes from the domain header.
//
// Every field is the reader's; the legal entity and the author are the
// session's (the proxy sets them). This header used to send a hardcoded
// legal entity and jurisdiction, put the filing name in `notes`, omit the
// period and domain the services require, prefill the evaluation counts
// (100 / 95 / 3 / 2), offer an "Upload Evidence Manifest" button whose route
// does not exist (always 404), and show hardcoded ports — wrong ones — with
// always-green dots and a static all-clear.

import { useState } from "react";
import { Plus, ShieldCheck, CheckCircle2, X, Loader2 } from "lucide-react";

const FIELD = "w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700";
const LABEL = "block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1";

async function postJson(path: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return null;
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) return "Your session has expired — sign in again.";
    if (data.error === "missing_fields") return `Required: ${(data.fields ?? []).join(", ")}`;
    return data.error || `The service refused the request (HTTP ${res.status}).`;
  } catch {
    return "The console API could not be reached.";
  }
}

function Modal({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Done({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <CheckCircle2 className="h-10 w-10 text-emerald-500" />
      <p className="text-xs text-slate-600 dark:text-slate-300">{text}</p>
      <button onClick={onClose} className="mt-2 rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-white">Done</button>
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 dark:bg-red-500/10 dark:border-red-500/20">
      <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
    </div>
  );
}

function NewRequirementModal({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    jurisdiction_id: "",
    filing_authority: "",
    filing_type: "",
    period_key: "",
    due_date: "",
    notes: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const complete = form.jurisdiction_id && form.filing_authority && form.filing_type && form.period_key && form.due_date;

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    const err = await postJson("/api/v1/filing-tracker/requirements", form);
    setSubmitting(false);
    if (err) setError(err);
    else setDone(true);
  }

  return (
    <Modal
      title="New Filing Requirement"
      onClose={onClose}
      icon={
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-500/20">
          <Plus className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
        </span>
      }
    >
      {done ? (
        <Done text="Filing requirement recorded in filing-tracker-svc." onClose={onClose} />
      ) : (
        <div className="space-y-4">
          <ErrorLine error={error} />
          <div className="grid grid-cols-2 gap-3">
            {([
              ["jurisdiction_id", "Jurisdiction ID", "text"],
              ["filing_authority", "Filing authority", "text"],
              ["filing_type", "Filing type", "text"],
              ["period_key", "Period", "text"],
              ["due_date", "Due date", "date"],
            ] as const).map(([k, label, type]) => (
              <div key={k}>
                <label htmlFor={`req-${k}`} className={LABEL}>{label}</label>
                <input id={`req-${k}`} type={type} value={form[k]} onChange={set(k)} className={FIELD} />
              </div>
            ))}
          </div>
          <div>
            <label htmlFor="req-notes" className={LABEL}>Notes (optional)</label>
            <input id="req-notes" type="text" value={form.notes} onChange={set("notes")} className={FIELD} />
          </div>
          <button
            onClick={handleCreate}
            disabled={submitting || !complete}
            className="w-full rounded-lg bg-purple-600 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create Filing Requirement"}
          </button>
        </div>
      )}
    </Modal>
  );
}

function EvaluateComplianceModal({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    jurisdiction_id: "",
    domain_name: "",
    total_obligations: "",
    fulfilled_obligations: "",
    pending_obligations: "",
    overdue_obligations: "",
    open_exceptions: "",
    effective_from: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const complete = Object.values(form).every((v) => v.trim() !== "");

  async function handleEvaluate() {
    setSubmitting(true);
    setError(null);
    const n = (v: string) => Number(v);
    const err = await postJson("/api/v1/compliance-status/evaluate", {
      jurisdiction_id: form.jurisdiction_id,
      domain_name: form.domain_name,
      total_obligations: n(form.total_obligations),
      fulfilled_obligations: n(form.fulfilled_obligations),
      pending_obligations: n(form.pending_obligations),
      overdue_obligations: n(form.overdue_obligations),
      open_exceptions: n(form.open_exceptions),
      effective_from: form.effective_from,
    });
    setSubmitting(false);
    if (err) setError(err);
    else setDone(true);
  }

  const counts: [keyof typeof form, string][] = [
    ["total_obligations", "Total obligations"],
    ["fulfilled_obligations", "Fulfilled"],
    ["pending_obligations", "Pending"],
    ["overdue_obligations", "Overdue"],
    ["open_exceptions", "Open exceptions"],
  ];

  return (
    <Modal
      title="Evaluate Compliance"
      onClose={onClose}
      icon={
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/20">
          <ShieldCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
        </span>
      }
    >
      {done ? (
        <Done text="Evaluation recorded in compliance-status-svc." onClose={onClose} />
      ) : (
        <div className="space-y-4">
          <ErrorLine error={error} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="eval-jurisdiction" className={LABEL}>Jurisdiction ID</label>
              <input id="eval-jurisdiction" type="text" value={form.jurisdiction_id} onChange={set("jurisdiction_id")} className={FIELD} />
            </div>
            <div>
              <label htmlFor="eval-domain" className={LABEL}>Domain</label>
              <input id="eval-domain" type="text" value={form.domain_name} onChange={set("domain_name")} className={FIELD} />
            </div>
            {counts.map(([k, label]) => (
              <div key={k}>
                <label htmlFor={`eval-${k}`} className={LABEL}>{label}</label>
                <input id={`eval-${k}`} type="number" min={0} value={form[k]} onChange={set(k)} className={FIELD} />
              </div>
            ))}
            <div>
              <label htmlFor="eval-effective" className={LABEL}>Effective from</label>
              <input id="eval-effective" type="date" value={form.effective_from} onChange={set("effective_from")} className={FIELD} />
            </div>
          </div>
          <button
            onClick={handleEvaluate}
            disabled={submitting || !complete}
            className="w-full rounded-lg bg-blue-600 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run Compliance Evaluation"}
          </button>
        </div>
      )}
    </Modal>
  );
}

export function ComplianceActionHeader() {
  const [modal, setModal] = useState<"create" | "evaluate" | null>(null);

  return (
    <>
      {modal === "create" && <NewRequirementModal onClose={() => setModal(null)} />}
      {modal === "evaluate" && <EvaluateComplianceModal onClose={() => setModal(null)} />}

      <div className="rounded-xl border border-slate-200 bg-white/90 backdrop-blur-md shadow-sm dark:border-slate-800 dark:bg-slate-900/90 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Writes go to the Block 7 compliance services; each refusal is shown as the service gave it.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setModal("create")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              New Filing Requirement
            </button>
            <button
              onClick={() => setModal("evaluate")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
              Evaluate Compliance
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
