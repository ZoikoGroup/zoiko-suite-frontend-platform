"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, FileCheck, AlertTriangle } from "lucide-react";
import { fetchPanelListOrNull } from "@/lib/panel-fetch";

type Kpi = {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  accent: string;
  bg: string;
};

function useLiveComplianceKpis(): { kpis: Kpi[]; loading: boolean } {
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetch_() {
      try {
        // null = could not be read, shown as "Unavailable" rather than 0.
        const [requirements, evaluations, exceptions] = await Promise.all([
          fetchPanelListOrNull<{ status?: string }>("/api/v1/filing-tracker/requirements", "requirements"),
          fetchPanelListOrNull<{ status?: string }>("/api/v1/compliance-status", "evaluations"),
          fetchPanelListOrNull<{ case_status?: string }>("/api/v1/exception-escalation/exceptions", "exceptions"),
        ]);
        if (cancelled) return;
        const value = (rows: unknown[] | null) => (rows ? String(rows.length) : "Unavailable");
        // exception-escalation-svc's field is case_status; RESOLVED and CLOSED are not open.
        const open = exceptions?.filter((e) => e.case_status !== "RESOLVED" && e.case_status !== "CLOSED").length ?? null;

        setKpis([
          {
            icon: ShieldCheck,
            label: "Compliance Evaluations",
            value: value(evaluations),
            sub: evaluations ? "From compliance-status-svc" : "compliance-status-svc could not be read",
            accent: "text-emerald-600 dark:text-emerald-400",
            bg: "bg-emerald-100 dark:bg-emerald-500/20",
          },
          {
            icon: FileCheck,
            label: "Filing Requirements",
            value: value(requirements),
            sub: requirements ? "From filing-tracker-svc" : "filing-tracker-svc could not be read",
            accent: "text-blue-600 dark:text-blue-400",
            bg: "bg-blue-100 dark:bg-blue-500/20",
          },
          {
            icon: AlertTriangle,
            label: "Open Exceptions",
            value: open === null ? "Unavailable" : String(open),
            sub: exceptions ? `${exceptions.length} exceptions recorded` : "exception-escalation-svc could not be read",
            accent: open ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
            bg: open ? "bg-amber-100 dark:bg-amber-500/20" : "bg-emerald-100 dark:bg-emerald-500/20",
          },
        ]);
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

export function ComplianceSummaryBar() {
  const { kpis, loading } = useLiveComplianceKpis();

  if (loading && kpis.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 animate-pulse h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Compliance KPI summary">
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
