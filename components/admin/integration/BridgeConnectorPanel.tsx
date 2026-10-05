"use client";

import { useState, useEffect } from "react";
import { Network, RefreshCw, CheckCircle2, AlertCircle, ArrowUpRight } from "lucide-react";

type BridgeConn = {
  connection_id: string;
  system_name: string;
  protocol: string;
  auth_type: string;
  status: "ACTIVE" | "DEGRADED" | "INACTIVE";
  last_ping_at: string;
};

export function BridgeConnectorPanel() {
  const [connections, setConnections] = useState<BridgeConn[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConnections = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/integration/connections");
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
    fetchConnections();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>Protocol Adaptors & API Gateways</span>
          <span className="font-mono text-[11px] text-slate-400">(:8170)</span>
        </div>
        <button
          type="button"
          onClick={fetchConnections}
          className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Reload
        </button>
      </div>

      {loading && connections.length === 0 ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : connections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
          <Network className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-xs text-slate-500">No active bridge connections registered.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {connections.map((c) => (
            <div key={c.connection_id} className="p-3.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-cyan-100 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-300">
                    <Network className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {c.system_name}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {c.protocol}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Auth: {c.auth_type}
                      </span>
                    </div>
                    <p className="font-mono text-[11px] text-slate-400">
                      ID: {c.connection_id} • Last Ping: {new Date(c.last_ping_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                <div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      c.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    }`}
                  >
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    {c.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
