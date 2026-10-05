"use client";

import { useState, useEffect } from "react";
import { Users2, RefreshCw, CheckCircle2, ArrowRightLeft } from "lucide-react";

type HrisConn = {
  connection_id: string;
  hris_system: string;
  sync_scope: string;
  status: "ACTIVE" | "PAUSED" | "ERROR";
  last_sync_at: string;
  records_synced: number;
  sync_errors: number;
};

export function HrisConnectorPanel() {
  const [connections, setConnections] = useState<HrisConn[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  const fetchHris = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/integration/hris");
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections ?? []);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHris();
  }, []);

  const handleSync = async (connId: string) => {
    setSyncing(connId);
    try {
      await fetch(`/api/v1/integration/hris/${connId}/sync`, { method: "POST" });
      await fetchHris();
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
          <span>HRIS Directories & Identity Synchronization</span>
          <span className="font-mono text-[11px] text-slate-400">(:8172)</span>
        </div>
        <button
          type="button"
          onClick={fetchHris}
          className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading && connections.length === 0 ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : connections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
          <Users2 className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-xs text-slate-500">No HRIS connectors configured.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {connections.map((h) => (
            <div key={h.connection_id} className="p-3.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
                    <Users2 className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {h.hris_system}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        Scope: {h.sync_scope}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Synced: <span className="font-semibold">{h.records_synced}</span> employees • Errors: {h.sync_errors}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      h.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    }`}
                  >
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    {h.status}
                  </span>

                  <button
                    type="button"
                    disabled={syncing === h.connection_id}
                    onClick={() => handleSync(h.connection_id)}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <ArrowRightLeft className={`h-3 w-3 ${syncing === h.connection_id ? "animate-spin text-indigo-600" : ""}`} />
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
