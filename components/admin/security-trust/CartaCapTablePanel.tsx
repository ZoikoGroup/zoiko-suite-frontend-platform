"use client";

import { useState, useEffect } from "react";
import { Lock, RefreshCw, Award, UserCheck, DollarSign } from "lucide-react";

type EquityGrant = {
  grant_id: string;
  grantee_id: string;
  grant_type: "ISO" | "NSO" | "RSU";
  shares: number;
  strike_price: number;
  currency: string;
  vesting_schedule: string;
  status: "DRAFT" | "GRANTED" | "EXERCISED" | "CANCELLED";
  granted_at: string;
};

const GRANT_TYPE_COLORS: Record<string, string> = {
  ISO: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  NSO: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  RSU: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};

export function CartaCapTablePanel() {
  const [grants, setGrants] = useState<EquityGrant[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGrants = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/security/equity-grants");
      if (res.ok) {
        const data = await res.json();
        setGrants(data.equity_grants ?? []);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGrants();
  }, []);

  const totalShares = grants.reduce((acc, g) => acc + (g.shares || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>Carta Cap Table Ledger & Equity Grants</span>
          <span className="font-mono text-[11px] text-slate-400">(:8168)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            Total Allocated: <span className="font-semibold">{totalShares.toLocaleString()}</span> shares
          </span>
          <button
            type="button"
            onClick={fetchGrants}
            className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading && grants.length === 0 ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : grants.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
          <Lock className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-xs text-slate-500">No equity grants recorded in Carta ledger.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {grants.map((g) => (
            <div key={g.grant_id} className="p-3.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-300">
                    <Award className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {g.grantee_id}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          GRANT_TYPE_COLORS[g.grant_type] || GRANT_TYPE_COLORS.ISO
                        }`}
                      >
                        {g.grant_type}
                      </span>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {g.shares.toLocaleString()} shares
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Strike Price: ${g.strike_price.toFixed(2)} {g.currency} • Vesting: {g.vesting_schedule}
                    </p>
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-400">
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400">{g.status}</div>
                  <div className="text-[10px] font-mono">{g.grant_id}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
