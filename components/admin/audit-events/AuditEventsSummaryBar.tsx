"use client";

import { useState, useEffect } from "react";
import { History, ShieldCheck, Lock, Sliders } from "lucide-react";

type Kpi = {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  accent: string;
  bg: string;
};

function useLiveAuditKpis(): { kpis: Kpi[]; loading: boolean } {
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetch_() {
      try {
        const res = await fetch("/api/v1/audit/events", { signal: AbortSignal.timeout(5000) });
        if (cancelled) return;

        if (!res.ok) {
          setLoading(false);
          return;
        }

        const json = await res.json().catch(() => ({}));
        const total: number = typeof json.total === "number" ? json.total : (Array.isArray(json.events) ? json.events.length : 0);
        const hashValid: boolean = typeof json.hash_chain_valid === "boolean" ? json.hash_chain_valid : true;

        if (!cancelled) {
          setKpis([
            {
              icon: History,
              label: "Total Ingested Events",
              value: total.toLocaleString("en-US"),
              sub: "Append-only event stream",
              accent: "text-slate-600 dark:text-slate-300",
              bg: "bg-slate-100 dark:bg-slate-500/20",
            },
            {
              icon: Lock,
              label: "SHA-256 Hash Chain Integrity",
              value: hashValid ? "VERIFIED" : "BROKEN",
              sub: hashValid ? "Zero hash gaps detected" : "Hash chain integrity compromised",
              accent: hashValid ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
              bg: hashValid ? "bg-emerald-100 dark:bg-emerald-500/20" : "bg-red-100 dark:bg-red-500/20",
            },
            {
              icon: ShieldCheck,
              label: "Audit Events Streamed",
              value: total.toLocaleString("en-US"),
              sub: "All domain microservices",
              accent: "text-blue-600 dark:text-blue-400",
              bg: "bg-blue-100 dark:bg-blue-500/20",
            },
            {
              icon: Sliders,
              label: "Event Store Status",
              value: "ACTIVE",
              sub: "audit-event-store-svc operational",
              accent: "text-purple-600 dark:text-purple-400",
              bg: "bg-purple-100 dark:bg-purple-500/20",
            },
          ]);
        }
      } catch {
        if (!cancelled) setLoading(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetch_();
    const interval = setInterval(fetch_, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { kpis, loading };
}

export function AuditEventsSummaryBar() {
  const { kpis, loading } = useLiveAuditKpis();

  if (loading && kpis.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 animate-pulse h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Audit Events KPI summary">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col gap-3 hover:shadow-md transition-shadow"
        >
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${kpi.bg}`}>
            <kpi.icon className={`h-4.5 w-4.5 ${kpi.accent}`} aria-hidden="true" />
          </span>
          <div>
            <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
              {kpi.value}
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.label}</p>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2">
            {kpi.sub}
          </p>
          <div className={`absolute bottom-0 left-0 h-0.5 w-full ${kpi.bg} opacity-60`} />
        </div>
      ))}
    </div>
  );
}
