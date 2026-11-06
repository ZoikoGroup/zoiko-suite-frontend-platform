"use client";

import { useState, useEffect } from "react";
import { Shield, RefreshCw, CheckCircle, AlertTriangle } from "lucide-react";
import { fetchPanelList } from "@/lib/panel-fetch";
import type { MtlsCertificate } from "@/lib/api/security-trust";
import { MtlsIssueDialog } from "./MtlsIssueDialog";

export function MtlsManagementPanel() {
  const [certs, setCerts] = useState<MtlsCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  const fetchCerts = async () => {
    setLoading(true);
    setError(null);
    try {
      setCerts(await fetchPanelList<MtlsCertificate>("/api/v1/security/certificates", "certificates", "mtls-management-svc"));
    } catch (e) {
      setCerts([]);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCerts();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>X.509 Service Certificates & SAN Bindings</span>
        <button
          type="button"
          onClick={fetchCerts}
          className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Reload
        </button>
      </div>

      <MtlsIssueDialog onIssued={fetchCerts} />

      {loading && certs.length === 0 ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : error ? (
        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">{error}</p>
      ) : certs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
          <Shield className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-xs text-slate-500">No active certificates found.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {certs.map((c) => {
            const isExpiring = new Date(c.valid_to).getTime() - currentTime < 30 * 86400000;
            return (
              <div key={c.id} className="p-3.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                      <Shield className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {c.common_name}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            c.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          }`}
                        >
                          <CheckCircle className="h-2.5 w-2.5" />
                          {c.status}
                        </span>
                        {isExpiring && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            Expiring Soon
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-400 truncate max-w-sm sm:max-w-md">
                        {c.service_name} · SHA-256: {c.fingerprint}
                      </p>
                    </div>
                  </div>

                  <div className="text-right text-[11px] text-slate-500 dark:text-slate-400">
                    <div>Expires: {new Date(c.valid_to).toLocaleDateString()}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{c.id}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
