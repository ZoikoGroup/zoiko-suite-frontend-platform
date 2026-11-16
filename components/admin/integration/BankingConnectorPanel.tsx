"use client";

import { useState, useEffect } from "react";
import { Building2, RefreshCw, ArrowRightLeft, CheckCircle2 } from "lucide-react";
import { fetchPanelList } from "@/lib/panel-fetch";
import { BankConnectionCreateForm } from "./IntegrationCreateForms";
import type { BankConnection } from "@/lib/api/integration";

// banking-connector-svc has no sync operation and no real bank adapter yet:
// statements arrive through POST /v1/banking/statements/ingest, and /refresh
// only rotates a credential lease. The Sync control is kept, disabled, so the
// gap is visible rather than wired to the wrong operation.
const SYNC_UNAVAILABLE = "banking-connector-svc has no sync operation; no bank adapter is connected yet.";

export function BankingConnectorPanel() {
  const [banks, setBanks] = useState<BankConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBanks = async () => {
    setLoading(true);
    setError(null);
    try {
      setBanks(await fetchPanelList<BankConnection>("/api/v1/integration/banking", "connections", "banking-connector-svc"));
    } catch (e) {
      setBanks([]);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBanks();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>Bank connections (recorded; no live bank adapter)</span>
          <span className="font-mono text-[11px] text-slate-400">banking-connector-svc</span>
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

      <BankConnectionCreateForm onCreated={fetchBanks} />

      {loading && banks.length === 0 ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : error ? (
        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">{error}</p>
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
                        {b.currency}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {b.bic}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Account {b.account_number} • IBAN {b.iban} • health {b.health_status.toLowerCase()}
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
                    disabled
                    title={SYNC_UNAVAILABLE}
                    aria-label={`Sync unavailable: ${SYNC_UNAVAILABLE}`}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 opacity-50 cursor-not-allowed dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <ArrowRightLeft className="h-3 w-3" />
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
