"use client";

// Issue an mTLS certificate through mtls-management-svc.
//
// The service returns the private key once and keeps no copy; a replay of the
// same request is refused (409 idempotency_secret_not_replayable) rather than
// answered again. So the key is shown here exactly once, with a warning to
// copy it now, and it lives only in this component's state: it is never
// written to storage, logged, or put in a URL, and closing the dialog drops it.

import { useState, useTransition } from "react";
import { KeyRound, Loader2, X, Copy, AlertTriangle } from "lucide-react";
import { FIELD, LABEL, HINT, BANNER_ERROR, BANNER_WARNING } from "@/components/admin/shared/form";
import { issueMtlsCertificateAction, type IssueCertificateResult } from "@/app/admin/security/actions";

const EMPTY = { service_name: "", common_name: "", rotation_days: "", auto_rotate: false };

export function MtlsIssueDialog({ onIssued }: { onIssued?: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [result, setResult] = useState<IssueCertificateResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  // Closing drops the key, the certificate and what was typed.
  const close = () => {
    setResult(null);
    setForm(EMPTY);
    setCopied(false);
    setOpen(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setCopied(false);
    startTransition(async () => {
      const res = await issueMtlsCertificateAction(form);
      setResult(res);
      if (res.ok) onIssued?.();
    });
  };

  const copyKey = async (pem: string) => {
    try {
      await navigator.clipboard.writeText(pem);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      >
        <KeyRound className="h-3 w-3" />
        Issue certificate
      </button>
    );
  }

  const issued = result?.ok ? result : null;

  return (
    <div role="dialog" aria-label="Issue mTLS certificate" className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Issue mTLS certificate</p>
        <button type="button" onClick={close} className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          <X className="h-3 w-3" />
          Close
        </button>
      </div>

      {issued ? (
        <div className="space-y-2" role="status">
          <p className="text-xs text-slate-700 dark:text-slate-300">
            <span className="mr-1 font-mono font-semibold">HTTP {issued.httpStatus}</span>
            mtls-management-svc issued certificate <span className="font-mono" data-field="Certificate ID">{issued.certificate.id}</span> ({issued.certificate.status}) for{" "}
            {issued.certificate.common_name}, valid to {new Date(issued.certificate.valid_to).toLocaleDateString()}.
          </p>
          <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${BANNER_WARNING}`}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Copy the private key now. It is shown once: mtls-management-svc keeps no copy, the console does not store it, and it is gone when
              you close this dialog.
            </span>
          </div>
          <label htmlFor="mtls-private-key" className={LABEL}>Private key (shown once)</label>
          <textarea id="mtls-private-key" readOnly rows={6} value={issued.privateKeyPem} className={`${FIELD} font-mono text-[10px]`} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => copyKey(issued.privateKeyPem)}
              className="inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900"
            >
              <Copy className="h-3 w-3" />
              Copy private key
            </button>
            {copied && <span className="text-[11px] text-emerald-600">Copied to the clipboard.</span>}
          </div>
          <details className="text-[11px] text-slate-500">
            <summary className="cursor-pointer">Certificate and CA certificate (public)</summary>
            <textarea readOnly rows={4} value={issued.certificatePem} aria-label="Certificate PEM" className={`${FIELD} mt-1 font-mono text-[10px]`} />
            <textarea readOnly rows={4} value={issued.caCertificatePem} aria-label="CA certificate PEM" className={`${FIELD} mt-1 font-mono text-[10px]`} />
          </details>
        </div>
      ) : (
        <form onSubmit={submit} aria-label="Issue mTLS certificate" noValidate className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="mtls-service-name" className={LABEL}>Service name</label>
              <input id="mtls-service-name" value={form.service_name} onChange={(e) => setForm({ ...form, service_name: e.target.value })} aria-required className={FIELD} autoComplete="off" />
            </div>
            <div>
              <label htmlFor="mtls-common-name" className={LABEL}>Common name</label>
              <input id="mtls-common-name" value={form.common_name} onChange={(e) => setForm({ ...form, common_name: e.target.value })} aria-required className={FIELD} autoComplete="off" />
            </div>
            <div>
              <label htmlFor="mtls-rotation-days" className={LABEL}>Rotation days</label>
              <input id="mtls-rotation-days" type="number" min={1} value={form.rotation_days} onChange={(e) => setForm({ ...form, rotation_days: e.target.value })} aria-required className={FIELD} />
              <p className={HINT}>How often the certificate should be rotated.</p>
            </div>
            <label htmlFor="mtls-auto-rotate" className="flex items-center gap-2 self-center text-xs text-slate-700 dark:text-slate-300">
              <input id="mtls-auto-rotate" type="checkbox" checked={form.auto_rotate} onChange={(e) => setForm({ ...form, auto_rotate: e.target.checked })} className="h-3.5 w-3.5" />
              Auto-rotate
            </label>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
          >
            {pending && <Loader2 className="h-3 w-3 animate-spin" />}
            {pending ? "Issuing…" : "Issue"}
          </button>
          {result && !result.ok && (
            <div role="alert" className={`rounded-lg border px-3 py-2 text-xs ${BANNER_ERROR}`}>
              {result.httpStatus ? <span className="mr-1 font-mono font-semibold">HTTP {result.httpStatus}</span> : null}
              {result.message}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
