"use client";

import { useState, useEffect } from "react";
import { Building2, RefreshCw, ArrowRightLeft, CheckCircle2, AlertCircle } from "lucide-react";

type BankConn = {
  connection_id: string;
  bank_name: string;
  institution_code: string;
  protocol: string;
  status: "CONNECTED" | "SYNCING" | "DISCONNECTED" | "ERROR";
  last_sync_at: string;
  sync_lag_seconds: number;
};

export function BankingConnectorPanel() {
  const [banks, setBanks] = useState<BankConn[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  const fetchBanks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/integration/banking");
      if (res.ok) {
        const data = await res.json();
        setBanks(data.connections ?? []);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBanks();
  }, []);

  const handleSync = async (connId: string) => {
    setSyncing(connId);
    try {
      await fetch(`/api/v1/integration/banking/${connId}/sync`, { method: "POST" });
      await fetchBanks();
    } catch {
      // fallback
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>Open Banking, SWIFT & Clearing Feeds</span>
          <span className="font-mono text-[11px] text-slate-400">(:8171)</span>
        </div>
        <button
          type="button"
          onClick={fetchBanks}
          className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading && banks.length === 0 ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : banks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
          <Building2 className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-xs text-slate-500">No banking connectors active.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {banks.map((b) => (
            <div key={b.connection_id} className="p-3.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {b.bank_name}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {b.protocol}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {b.institution_code}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Sync Lag: {b.sync_lag_seconds}s • Last Synced: {new Date(b.last_sync_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      b.status === "CONNECTED"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    }`}
                  >
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    {b.status}
                  </span>

                  <button
                    type="button"
                    disabled={syncing === b.connection_id}
                    onClick={() => handleSync(b.connection_id)}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <ArrowRightLeft className={`h-3 w-3 ${syncing === b.connection_id ? "animate-spin text-cyan-600" : ""}`} />
                    Sync
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
