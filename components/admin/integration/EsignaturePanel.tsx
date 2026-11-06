"use client";

import { useState, useEffect } from "react";
import { FileSignature, RefreshCw } from "lucide-react";
import { fetchPanelList } from "@/lib/panel-fetch";
import { EnvelopeCreateForm, SignatureProfilesSection } from "./IntegrationCreateForms";
import type { EsignatureEnvelope } from "@/lib/api/integration";

const STATUS_COLORS: Record<string, string> = {
  SIGNED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  SENT: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  DELIVERED: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  PENDING: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  VOIDED: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

export function EsignaturePanel() {
  const [envelopes, setEnvelopes] = useState<EsignatureEnvelope[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEnvelopes = async () => {
    setLoading(true);
    setError(null);
    try {
      setEnvelopes(
        await fetchPanelList<EsignatureEnvelope>("/api/v1/integration/envelopes", "envelopes", "esignature-integration-svc"),
      );
    } catch (e) {
      setEnvelopes([]);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnvelopes();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>Signature envelopes (no DocuSign/Adobe adapter configured)</span>
          <span className="font-mono text-[11px] text-slate-400">esignature-integration-svc</span>
        </div>
        <button
          type="button"
          onClick={fetchEnvelopes}
          className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <SignatureProfilesSection />
      <EnvelopeCreateForm onCreated={fetchEnvelopes} />

      {loading && envelopes.length === 0 ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : error ? (
        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">{error}</p>
      ) : envelopes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
          <FileSignature className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-xs text-slate-500">
            No eSignature envelopes. Sending one is refused (503) until a provider adapter is configured.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {envelopes.map((env) => (
            <div key={env.envelope_id} className="p-3.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300">
                    <FileSignature className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {env.envelope_id}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        Provider: {env.provider}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          STATUS_COLORS[env.status] || STATUS_COLORS.PENDING
                        }`}
                      >
                        {env.status}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                      <span>{env.document_title} • Signer:</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {env.signer_name} ({env.signer_email})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-400">
                  <div>Created: {new Date(env.created_at).toLocaleDateString()}</div>
                  {env.external_ref && <div className="text-[10px] font-mono">Ref: {env.external_ref}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
