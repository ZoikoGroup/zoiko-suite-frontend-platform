"use client";

import { useState, useEffect } from "react";
import { Shield, Key, AlertOctagon, Bot, ShieldCheck } from "lucide-react";

type Kpi = {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub: string;
  tone: "neutral" | "positive" | "warning" | "critical";
};

export function SecuritySummaryBar() {
  const [kpis, setKpis] = useState<Kpi[]>([
    {
      icon: Shield,
      label: "mTLS Certificates",
      value: "—",
      sub: "Active x509 trusted roots",
      tone: "neutral",
    },
    {
      icon: AlertOctagon,
      label: "SIEM Security Events",
      value: "—",
      sub: "Ingested in last 24h",
      tone: "neutral",
    },
    {
      icon: ShieldCheck,
      label: "CARTA Assessments",
      value: "—",
      sub: "Zero-trust continuous auth",
      tone: "positive",
    },
    {
      icon: Key,
      label: "Active KMS Keys",
      value: "—",
      sub: "Zero pending rotations",
      tone: "positive",
    },
    {
      icon: Bot,
      label: "AI Governance",
      value: "—",
      sub: "Guardrails & safety policies",
      tone: "positive",
    },
  ]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Each figure is read from its owning service. A failed read shows "—" and says
    // so: it never falls back to an invented count.
    async function read(url: string, key: string): Promise<unknown[] | null> {
      try {
        const r = await fetch(url);
        if (!r.ok) return null;
        const data = await r.json();
        return Array.isArray(data?.[key]) ? data[key] : null;
      } catch {
        return null;
      }
    }

    async function load() {
      const [certs, siem, carta, keys, aiRisk] = await Promise.all([
        read("/api/v1/security/certificates", "certificates"),
        read("/api/v1/security/events", "events"),
        read("/api/v1/security/assessments", "assessments"),
        read("/api/v1/security/keys", "keys"),
        read("/api/v1/ai-governance/risk-classifications", "classifications"),
      ]);
      if (cancelled) return;

      const unread = (service: string) => `${service} could not be read`;
      const status = (rows: unknown[], s: string) => rows.filter((x) => (x as { status?: string }).status === s).length;
      const criticalSiem = siem
        ? siem.filter((e) => ["CRITICAL", "HIGH"].includes((e as { severity?: string }).severity ?? "")).length
        : 0;

      setKpis([
        {
          icon: Shield,
          label: "mTLS Certificates",
          value: certs ? `${status(certs, "ACTIVE")} Active` : "—",
          sub: certs ? `${certs.length} managed by mtls-management-svc` : unread("mtls-management-svc"),
          tone: certs ? "neutral" : "warning",
        },
        {
          icon: AlertOctagon,
          label: "SIEM Security Events",
          value: siem ? `${siem.length} Events` : "—",
          sub: !siem ? unread("siem-integration-svc") : criticalSiem > 0 ? `${criticalSiem} high/critical` : "No high or critical event",
          tone: !siem ? "warning" : criticalSiem > 0 ? "critical" : "neutral",
        },
        {
          icon: ShieldCheck,
          label: "CARTA Assessments",
          value: carta ? `${carta.length}` : "—",
          sub: carta ? `${carta.filter((a) => (a as { decision?: string }).decision === "ALLOW").length} allowed` : unread("carta-svc"),
          tone: carta ? "neutral" : "warning",
        },
        {
          icon: Key,
          label: "Active KMS Keys",
          value: keys ? `${status(keys, "ACTIVE")} Active` : "—",
          sub: keys ? `${keys.length} managed by key-management-svc` : unread("key-management-svc"),
          tone: keys ? "neutral" : "warning",
        },
        {
          icon: Bot,
          label: "AI Risk Classifications",
          value: aiRisk ? `${aiRisk.length}` : "—",
          sub: aiRisk ? "Action types classified" : unread("ai-governance-svc"),
          tone: aiRisk ? "neutral" : "warning",
        },
      ]);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        const toneBorder =
          kpi.tone === "critical"
            ? "border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20"
            : kpi.tone === "warning"
            ? "border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20"
            : kpi.tone === "positive"
            ? "border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20"
            : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900";

        const iconColor =
          kpi.tone === "critical"
            ? "text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40"
            : kpi.tone === "warning"
            ? "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40"
            : kpi.tone === "positive"
            ? "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40"
            : "text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800";

        return (
          <div
            key={kpi.label}
            className={`flex items-center gap-3.5 rounded-xl border p-3.5 shadow-sm transition ${toneBorder}`}
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconColor}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">{kpi.label}</p>
              <p className="mt-0.5 text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {loading ? "..." : kpi.value}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500 truncate">{kpi.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
