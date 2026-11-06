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
    { icon: Shield, label: "mTLS Certificates", value: "—", sub: "mtls-management-svc", tone: "neutral" },
    { icon: AlertOctagon, label: "SIEM Events", value: "—", sub: "siem-integration-svc", tone: "neutral" },
    { icon: ShieldCheck, label: "CARTA Assessments", value: "—", sub: "carta-svc", tone: "neutral" },
    { icon: Key, label: "Registered Keys", value: "—", sub: "key-management-svc", tone: "neutral" },
    { icon: Bot, label: "AI Governance", value: "—", sub: "ai-governance-svc", tone: "neutral" },
  ]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    /** The list under `key`, or null when the read failed. Never a stand-in count. */
    async function readList(path: string, key: string): Promise<Record<string, unknown>[] | null> {
      try {
        const r = await fetch(path, { signal: AbortSignal.timeout(10_000) });
        if (!r.ok) return null;
        const body = await r.json();
        return Array.isArray(body?.[key]) ? body[key] : null;
      } catch {
        return null;
      }
    }

    async function load() {
      try {
        const [certs, keys, siem, assessments, aiRunsBody] = await Promise.all([
          readList("/api/v1/security/certificates", "certificates"),
          readList("/api/v1/security/keys", "keys"),
          readList("/api/v1/security/events", "events"),
          readList("/api/v1/security/assessments", "assessments"),
          fetch("/api/v1/ai-governance/runs").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);

        if (cancelled) return;

        // Runs flagged `illustrative` are hardcoded examples, not this tenant's
        // AI activity, so they are not counted as runs.
        const aiRunsIllustrative = !aiRunsBody || aiRunsBody.illustrative === true;
        const aiRuns = !aiRunsIllustrative ? aiRunsBody.runs ?? [] : [];

        const unavailable = (svc: string): Pick<Kpi, "value" | "sub" | "tone"> => ({
          value: "Unavailable",
          sub: `${svc} could not be read`,
          tone: "warning",
        });
        const activeCerts = certs?.filter((c) => c.status === "ACTIVE").length;
        const enabledKeys = keys?.filter((k) => k.state === "ENABLED").length;
        const criticalSiem = siem?.filter((e) => e.severity === "CRITICAL" || e.severity === "HIGH").length ?? 0;
        const denied = assessments?.filter((a) => a.decision === "DENY" || a.decision === "ISOLATE").length ?? 0;

        setKpis([
          {
            icon: Shield,
            label: "mTLS Certificates",
            ...(certs
              ? { value: `${activeCerts} Active`, sub: `${certs.length} certificates in mtls-management-svc`, tone: "neutral" as const }
              : unavailable("mtls-management-svc")),
          },
          {
            icon: AlertOctagon,
            label: "SIEM Events",
            ...(siem
              ? {
                  value: `${siem.length} Events`,
                  sub: criticalSiem > 0 ? `${criticalSiem} high/critical` : "Recorded only; no external delivery",
                  tone: criticalSiem > 0 ? ("critical" as const) : ("neutral" as const),
                }
              : unavailable("siem-integration-svc")),
          },
          {
            icon: ShieldCheck,
            label: "CARTA Assessments",
            ...(assessments
              ? {
                  value: `${assessments.length} Assessed`,
                  sub: denied > 0 ? `${denied} denied or isolated` : "From carta-svc",
                  tone: denied > 0 ? ("warning" as const) : ("neutral" as const),
                }
              : unavailable("carta-svc")),
          },
          {
            icon: Key,
            label: "Registered Keys",
            ...(keys
              ? { value: `${enabledKeys} Enabled`, sub: "Key metadata only; no cryptography", tone: "neutral" as const }
              : unavailable("key-management-svc")),
          },
          {
            icon: Bot,
            label: "AI Governance",
            value: aiRunsIllustrative ? "Not available" : `${aiRuns.length} Runs`,
            sub: aiRunsIllustrative
              ? "No AI-run list in ai-governance-svc"
              : "From ai-governance-svc",
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
