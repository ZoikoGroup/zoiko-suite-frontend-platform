"use client";

import { useState, useEffect } from "react";
import { Users2, RefreshCw, CheckCircle2, ArrowRightLeft } from "lucide-react";
import { fetchPanelList } from "@/lib/panel-fetch";
import { HrisIntegrationCreateForm } from "./IntegrationCreateForms";
import type { HrisIntegration } from "@/lib/api/integration";

export function HrisConnectorPanel() {
  const [connections, setConnections] = useState<HrisIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const fetchHris = async () => {
    setLoading(true);
    setError(null);
    try {
      setConnections(await fetchPanelList<HrisIntegration>("/api/v1/integration/hris", "connections", "hris-connector-svc"));
    } catch (e) {
      setConnections([]);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHris();
  }, []);

  // A real POST /v1/hris/sync. With no HRIS provider adapter configured the
  // service refuses with 503, and that refusal is what is shown.
  const handleSync = async (integrationId: string) => {
    setSyncing(integrationId);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/v1/integration/hris/${encodeURIComponent(integrationId)}/sync`, { method: "POST" });
      const body = await res.json().catch(() => null);
      setSyncResult(
        res.ok
          ? "Sync accepted by hris-connector-svc."
          : `Sync refused by hris-connector-svc: ${body?.error ?? `HTTP ${res.status}`}`,
      );
      await fetchHris();
    } catch {
      setSyncResult("The sync request could not be sent to hris-connector-svc.");
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>HRIS integrations (no live HRIS adapter configured)</span>
          <span className="font-mono text-[11px] text-slate-400">hris-connector-svc</span>
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

      <HrisIntegrationCreateForm onCreated={fetchHris} />

      {loading && connections.length === 0 ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : error ? (
        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">{error}</p>
      ) : connections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
          <Users2 className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-xs text-slate-500">No HRIS connectors configured.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {syncResult && (
            <p className="px-3.5 py-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10">{syncResult}</p>
          )}
          {connections.map((h) => (
            <div key={h.integration_id} className="p-3.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
                    <Users2 className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {h.provider_name}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono">
                      {h.api_endpoint} • created {new Date(h.created_at).toLocaleDateString()}
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
                    disabled={syncing === h.integration_id}
                    onClick={() => handleSync(h.integration_id)}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <ArrowRightLeft className={`h-3 w-3 ${syncing === h.integration_id ? "animate-spin text-indigo-600" : ""}`} />
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
