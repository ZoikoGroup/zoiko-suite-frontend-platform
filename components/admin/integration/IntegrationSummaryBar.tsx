"use client";

import { useState, useEffect } from "react";
import { Network, Building2, Users2, FileSignature } from "lucide-react";
import { fetchPanelListOrNull } from "@/lib/panel-fetch";

type Kpi = {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub: string;
  tone: "neutral" | "positive" | "warning" | "critical";
};

export function IntegrationSummaryBar() {
  const [kpis, setKpis] = useState<Kpi[]>([
    { icon: Network, label: "Bridge Endpoints", value: "—", sub: "connectivity-api-bridge-svc", tone: "neutral" },
    { icon: Building2, label: "Bank Connections", value: "—", sub: "banking-connector-svc", tone: "neutral" },
    { icon: Users2, label: "HRIS Integrations", value: "—", sub: "hris-connector-svc", tone: "neutral" },
    { icon: FileSignature, label: "eSign Envelopes", value: "—", sub: "esignature-integration-svc", tone: "neutral" },
  ]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        type Row = { status?: string };
        const [bridges, banks, hris, envelopes] = await Promise.all([
          fetchPanelListOrNull<Row>("/api/v1/integration/connections", "connections"),
          fetchPanelListOrNull<Row>("/api/v1/integration/banking", "connections"),
          fetchPanelListOrNull<Row>("/api/v1/integration/hris", "connections"),
          fetchPanelListOrNull<Row>("/api/v1/integration/envelopes", "envelopes"),
        ]);

        if (cancelled) return;

        // Counts are what each service recorded. None of these connectors has
        // a live provider adapter yet, so nothing here claims sync health.
        const tile = (rows: Row[] | null, svc: string, sub: (r: Row[]) => string): Pick<Kpi, "value" | "sub" | "tone"> =>
          rows
            ? { value: rows.length, sub: sub(rows), tone: "neutral" }
            : { value: "Unavailable", sub: `${svc} could not be read`, tone: "warning" };
        const count = (rows: Row[], status: string) => rows.filter((r) => r.status === status).length;

        setKpis([
          { icon: Network, label: "Bridge Endpoints", ...tile(bridges, "connectivity-api-bridge-svc", (r) => `${count(r, "ACTIVE")} active`) },
          { icon: Building2, label: "Bank Connections", ...tile(banks, "banking-connector-svc", () => "Recorded; no live bank adapter") },
          { icon: Users2, label: "HRIS Integrations", ...tile(hris, "hris-connector-svc", () => "No live HRIS adapter") },
          {
            icon: FileSignature,
            label: "eSign Envelopes",
            ...tile(envelopes, "esignature-integration-svc", (r) => `${count(r, "SENT") + count(r, "DELIVERED")} awaiting signature`),
          },
        ]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        const toneBorder =
          kpi.tone === "positive"
            ? "border-cyan-200 dark:border-cyan-900/50 bg-cyan-50/50 dark:bg-cyan-950/20"
            : kpi.tone === "warning"
            ? "border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20"
            : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900";

        const iconColor =
          kpi.tone === "positive"
            ? "text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/40"
            : kpi.tone === "warning"
            ? "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40"
            : "text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800";

        return (
          <div
            key={kpi.label}
            className={`flex items-center gap-4 rounded-xl border p-4 shadow-sm transition ${toneBorder}`}
          >
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${iconColor}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{kpi.label}</p>
              <p className="mt-0.5 text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {loading ? "..." : kpi.value}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500 truncate">{kpi.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
