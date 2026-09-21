"use client";

import { useState, useEffect } from "react";
import { FileSignature, RefreshCw, CheckCircle2, Clock, Ban } from "lucide-react";

type Signatory = {
  name: string;
  email: string;
  role: string;
  status: "PENDING" | "SIGNED" | "DECLINED";
};

type Envelope = {
  envelope_id: string;
  document_id: string;
  provider: string;
  signatories: Signatory[];
  status: "DRAFT" | "SENT" | "DELIVERED" | "COMPLETED" | "DECLINED" | "VOIDED";
  sent_at: string;
  completed_at: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  SENT: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  DELIVERED: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  DRAFT: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  DECLINED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  VOIDED: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

export function EsignaturePanel() {
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEnvelopes = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/integration/envelopes");
      if (res.ok) {
        const data = await res.json();
        setEnvelopes(data.envelopes ?? []);
      }
    } catch {
      // fallback
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
          <span>Digital Signature Envelopes & Routing</span>
          <span className="font-mono text-[11px] text-slate-400">(:8174)</span>
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

      {loading && envelopes.length === 0 ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : envelopes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
          <FileSignature className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-xs text-slate-500">No active eSignature envelopes.</p>
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
                          STATUS_COLORS[env.status] || STATUS_COLORS.DRAFT
                        }`}
                      >
                        {env.status}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                      <span>Signers:</span>
                      {env.signatories?.map((s, idx) => (
                        <span key={idx} className="font-medium text-slate-700 dark:text-slate-300">
                          {s.name} ({s.status}){idx < env.signatories.length - 1 ? "," : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-400">
                  <div>Sent: {new Date(env.sent_at).toLocaleDateString()}</div>
                  <div className="text-[10px] font-mono">Doc: {env.document_id}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
