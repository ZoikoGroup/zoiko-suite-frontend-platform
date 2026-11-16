"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import {
  Plus,
  Calculator,
  FileCheck,
  CheckCircle2,
  X,
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
import type { JurisdictionOptions } from "./jurisdiction-options";
import { NewTaxRuleForm, DeterminationForm } from "./TaxRuleForms";

// ── Modal shell ───────────────────────────────────────────────────────────────
function ModalShell({
  title,
  icon: Icon,
  tone,
  onClose,
  children,
}: {
  title: string;
  icon: React.ElementType;
  tone: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/**
 * Create a tax rule through createTaxRuleAction. The jurisdiction is picked
 * from jurisdiction-rules-svc's register by UUID; this used to offer four
 * hardcoded alias ids that no other service recognised, so a rule created
 * here was never found by a determination.
 */
function NewRuleModal({ onClose, jurisdictions }: { onClose: () => void; jurisdictions: JurisdictionOptions }) {
  return (
    <ModalShell title="New Tax Rule" icon={Plus} tone="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400" onClose={onClose}>
      <NewTaxRuleForm jurisdictions={jurisdictions} />
    </ModalShell>
  );
}

/**
 * Evaluate one supply in tax-determination-svc through
 * evaluateDeterminationAction. Every input is the reader's; the jurisdiction and
 * place of supply are register UUIDs, which the service validates. The rule,
 * rate and amounts shown are the service's response.
 */
function DeterminationWizard({ onClose, jurisdictions }: { onClose: () => void; jurisdictions: JurisdictionOptions }) {
  return (
    <ModalShell title="Evaluate Determination" icon={Calculator} tone="bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400" onClose={onClose}>
      <DeterminationForm jurisdictions={jurisdictions} />
    </ModalShell>
  );
}

// ── Filing assembly overlay ────────────────────────────────────────────────────
type FilingResult = {
  draft_id: string;
  validation_status: string;
  filing_type: string;
  period_key: string;
  block_reasons?: string;
};

/**
 * Create a filing draft, validate it, then finalize it.
 *
 * Every value is the reader's. This used to create a fixed HMRC VAT100 draft
 * for 2026-Q2 (hardcoded entity, figures and evidence reference) and finalize
 * it straight away; the service refuses to finalize an unvalidated draft, so
 * it always failed. Validation consults evidence-requirements-svc and may
 * leave the draft BLOCKED, which is reported rather than finalized.
 */
function FilingAssemblyPanel({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FilingResult | null>(null);
  const [form, setForm] = useState({
    jurisdiction_id: "",
    filing_type: "",
    period_key: "",
    due_date: "",
    payload_data: "",
    evidence_manifest_ref: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const complete = ["jurisdiction_id", "filing_type", "period_key", "due_date", "payload_data"].every(
    (k) => form[k as keyof typeof form].trim() !== "",
  );

  async function post(path: string, body: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        res.status === 401
          ? "Your session has expired — sign in again."
          : json?.error ?? `filing-preparation-svc refused the request (${res.status})`,
      );
    }
    return (json?.draft ?? json?.data ?? json ?? {}) as Record<string, unknown>;
  }

  async function assemble() {
    try {
      JSON.parse(form.payload_data);
    } catch {
      setError("Filing payload must be valid JSON.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const draft = await post("/api/v1/filing-preparation/drafts", {
        ...form,
        ...(form.evidence_manifest_ref ? {} : { evidence_manifest_ref: undefined }),
      });
      const draftId = String(draft.draft_id ?? "");
      if (!draftId) throw new Error("filing-preparation-svc returned no draft id.");
      const validated = await post(`/api/v1/filing-preparation/drafts/${encodeURIComponent(draftId)}/validate`, {});
      const finalRecord =
        validated.validation_status === "PREPARED"
          ? await post(`/api/v1/filing-preparation/drafts/${encodeURIComponent(draftId)}/finalize`, {})
          : validated;
      setResult({
        draft_id: draftId,
        validation_status: String(finalRecord.validation_status ?? ""),
        filing_type: form.filing_type,
        period_key: form.period_key,
        block_reasons: finalRecord.block_reasons ? String(finalRecord.block_reasons) : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Filing assembly failed");
    }
    setSubmitting(false);
  }

  const ready = result?.validation_status === "READY_FOR_SUBMISSION";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
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
        {result ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            {ready ? <CheckCircle2 className="h-10 w-10 text-emerald-500" /> : <AlertCircle className="h-10 w-10 text-amber-500" />}
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              {ready ? "Ready for submission" : "Draft created but not finalized"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {result.filing_type} · {result.period_key} (draft {result.draft_id}).{" "}
              {ready
                ? "Nothing has been sent to an authority."
                : result.block_reasons ?? "Validation did not pass, so it was not finalized."}
            </p>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {result.validation_status || "—"}
            </span>
            <button onClick={onClose} className="mt-2 rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-white hover:bg-slate-700 transition-colors">Done</button>
          </div>
        ) : (
          <>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {([
                  ["jurisdiction_id", "Jurisdiction ID", "text"],
                  ["filing_type", "Filing type", "text"],
                  ["period_key", "Period", "text"],
                  ["due_date", "Due date", "date"],
                ] as const).map(([k, label, type]) => (
                  <div key={k}>
                    <label htmlFor={`fil-${k}`} className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">{label}</label>
                    <input id={`fil-${k}`} type={type} value={form[k]} onChange={set(k)} className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                ))}
              </div>
              <div>
                <label htmlFor="fil-payload" className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">Filing payload (JSON)</label>
                <textarea id="fil-payload" rows={4} value={form.payload_data} onChange={set("payload_data")} className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700 font-mono" />
              </div>
              <div>
                <label htmlFor="fil-evidence" className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">Evidence manifest reference (optional)</label>
                <input id="fil-evidence" type="text" value={form.evidence_manifest_ref} onChange={set("evidence_manifest_ref")} className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700" />
              </div>
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
                disabled={submitting || !complete}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-60 transition-colors"
              >
                {submitting ? <><Loader2 className="h-3 w-3 animate-spin" /> Working…</> : <><FileCheck className="h-3 w-3" /> Create, validate, finalize</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Service Health Strip (live) ────────────────────────────────────────────────
const emptySubscribe = () => () => {};

function ServiceHealthStrip() {
  const [health, setHealth] = useState<TaxHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  // Tracks whether we are in a post-hydration client environment.
  // Until this is true we never render disabled=true so SSR matches client.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

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
    // Initial probe deferred
    const first = setTimeout(fetchHealth, 50);
    // Re-probe every 30 seconds
    const interval = setInterval(fetchHealth, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [fetchHealth]);

  // Only disable the button client-side (post-mount) to avoid SSR mismatch.
  const isDisabled = mounted && loading;

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
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-mono transition-colors ${svc.status === "up"
                ? "bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                : "bg-red-50 border-red-200 text-red-600 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400"
              }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${svc.status === "up" ? "bg-emerald-500" : "bg-red-500"
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
            className={`inline-flex items-center gap-1 text-[11px] ${health.allUp
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
          disabled={isDisabled}
          title="Re-probe service health"
          className="rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-40 transition-colors"
        >
          <RefreshCw className={`h-3 w-3 ${isDisabled ? "animate-spin" : ""}`} />
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

export function TaxActionHeader({ jurisdictions }: { jurisdictions: JurisdictionOptions }) {
  const [modal, setModal] = useState<Modal>(null);

  return (
    <>
      {/* Overlay portals */}
      {modal === "new-rule" && <NewRuleModal jurisdictions={jurisdictions} onClose={() => setModal(null)} />}
      {modal === "determination" && <DeterminationWizard jurisdictions={jurisdictions} onClose={() => setModal(null)} />}
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
                  const json = await res.json().catch(() => ({}));
                  // A failed read must not export as an empty or partial register.
                  if (!res.ok || !Array.isArray(json.tax_rules)) {
                    throw new Error(res.status === 401 ? "session expired" : json.error ?? `HTTP ${res.status}`);
                  }
                  const rules: Array<{ rule_id: string; category: string; jurisdiction_id: string; status: string; tax_rate_percentage: number; effective_from: string }> = json.tax_rules ?? [];
                  // Jurisdictions are named from jurisdiction-rules-svc's register,
                  // matched by id; a rule whose id it does not list shows the id.
                  const byId = new Map(jurisdictions.ok ? jurisdictions.items.map((j) => [j.id, `${j.code} — ${j.name}`]) : []);
                  const rows = rules.map((r) => ({
                    rule_id: r.rule_id,
                    category: r.category,
                    jurisdiction: byId.get(r.jurisdiction_id) ?? r.jurisdiction_id,
                    status: r.status,
                    rate: `${r.tax_rate_percentage}%`,
                    effective: r.effective_from?.split("T")[0] ?? "",
                  }));
                  exportToCSV("tax_governance_report.csv", rows.length > 0 ? rows : [
                    { rule_id: "(no rules found)", category: "", jurisdiction: "", status: "", rate: "", effective: "" },
                  ]);
                } catch (err) {
                  window.alert(`Export failed: tax-rules-svc could not be read (${err instanceof Error ? err.message : "unknown error"}).`);
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
