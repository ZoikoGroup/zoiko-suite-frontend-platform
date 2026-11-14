"use client";

import { useState, useEffect } from "react";
import { Network, Building2, Users2, FileSignature, Radio } from "lucide-react";

type Kpi = {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub: string;
  tone: "neutral" | "positive" | "warning" | "critical";
};

export function IntegrationSummaryBar() {
  const [kpis, setKpis] = useState<Kpi[]>([
    {
      icon: Network,
      label: "Bridge Connections",
      value: "—",
      sub: "Active API gateways",
      tone: "neutral",
    },
    {
      icon: Building2,
      label: "Banking Feeds",
      value: "—",
      sub: "Open Banking / SWIFT",
      tone: "positive",
    },
    {
      icon: Users2,
      label: "HRIS Synced",
      value: "—",
      sub: "Workday / BambooHR",
      tone: "positive",
    },
    {
      icon: FileSignature,
      label: "eSign Envelopes",
      value: "—",
      sub: "In-flight contracts",
      tone: "neutral",
    },
  ]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Each figure is read from its owning service. A failed read shows "—" and
        // says which service could not be read; it never shows an example count.
        const read = async (url: string, key: string): Promise<{ status?: string }[] | null> => {
          const r = await fetch(url);
          if (!r.ok) return null;
          const j = await r.json().catch(() => null);
          return Array.isArray(j?.[key]) ? j[key] : null;
        };
        const [connections, banks, hris, envelopes] = await Promise.all([
          read("/api/v1/integration/connections", "connections").catch(() => null),
          read("/api/v1/integration/banking", "connections").catch(() => null),
          read("/api/v1/integration/hris", "connections").catch(() => null),
          read("/api/v1/integration/envelopes", "envelopes").catch(() => null),
        ]);

        if (cancelled) return;

        const unread = (svc: string) => `${svc} could not be read`;
        const count = (rows: { status?: string }[], ...states: string[]) => rows.filter((r) => states.includes(r.status ?? "")).length;

        setKpis([
          {
            icon: Network,
            label: "Bridge Connections",
            value: connections ? `${count(connections, "ACTIVE")} Active` : "—",
            sub: connections ? `${connections.length} registered` : unread("connectivity-api-bridge-svc"),
            tone: "neutral",
          },
          {
            icon: Building2,
            label: "Banking Feeds",
            value: banks ? `${count(banks, "CONNECTED")} Connected` : "—",
            sub: banks ? `${banks.length} registered` : unread("banking-connector-svc"),
            tone: "neutral",
          },
          {
            icon: Users2,
            label: "HRIS Connections",
            value: hris ? `${hris.length}` : "—",
            sub: hris ? "Registered HRIS connections" : unread("hris-connector-svc"),
            tone: "neutral",
          },
          {
            icon: FileSignature,
            label: "eSign Envelopes",
            value: envelopes ? `${envelopes.length}` : "—",
            sub: !envelopes
              ? unread("esignature-integration-svc")
              : count(envelopes, "SENT", "DELIVERED") > 0
              ? `${count(envelopes, "SENT", "DELIVERED")} awaiting signature`
              : "None awaiting signature",
            tone: "neutral",
          },
        ]);
      } catch {
        // preserve defaults
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
            : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900";

        const iconColor =
          kpi.tone === "positive"
            ? "text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/40"
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
