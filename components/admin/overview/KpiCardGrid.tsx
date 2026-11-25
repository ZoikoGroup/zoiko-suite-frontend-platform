import {
  Server,
  Layers,
  ShieldCheck,
  Activity,
  ArrowUpRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { StatCard, type StatTone } from "@/components/ui";
import { getDomainHealth } from "@/lib/api/health";

const TONES: StatTone[] = ["navy", "violet", "emerald", "gold"];

type Kpi = {
  label: string;
  value: string;
  icon: LucideIcon;
  delta?: {
    text: string;
    direction: "up" | "down" | "flat";
    tone: "positive" | "negative" | "neutral";
  };
  helper: string;
};

export async function KpiCardGrid() {
  const health = await getDomainHealth();
  const domains = Object.values(health);

  const totalServices = domains.reduce((acc, d) => acc + d.total, 0);
  const readyServices = domains.reduce((acc, d) => acc + d.ready, 0);
  const operationalPct = totalServices > 0 ? Math.round((readyServices / totalServices) * 100) : null;
  const activeDomainsCount = domains.filter((d) => d.status === "operational").length;
  const domainPct = domains.length > 0 ? Math.round((activeDomainsCount / domains.length) * 100) : null;

  // Every figure below comes from the /readyz probes above. Wording and tone follow
  // the result: nothing here claims health the probes did not report.
  const notReady = totalServices - readyServices;
  const allReady = totalServices > 0 && notReady === 0;
  const degradedDomains = domains.length - activeDomainsCount;

  const kpis: Kpi[] = [
    {
      label: "Active Microservices",
      value: `${readyServices} / ${totalServices}`,
      icon: Server,
      delta: {
        text: totalServices === 0 ? "No targets configured" : allReady ? "All targets ready" : `${notReady} not ready`,
        direction: allReady ? "up" : "down",
        tone: allReady ? "positive" : "negative",
      },
      helper: "Answered /readyz on this load",
    },
    {
      label: "Domains Operational",
      value: `${activeDomainsCount} / ${domains.length}`,
      icon: Layers,
      delta: {
        text: domainPct === null ? "Unknown" : `${domainPct}% operational`,
        direction: degradedDomains === 0 ? "up" : "down",
        tone: degradedDomains === 0 ? "positive" : "negative",
      },
      helper: degradedDomains === 0 ? "Every domain has all services ready" : `${degradedDomains} domain(s) with a service down`,
    },
    {
      label: "Cluster Readiness",
      value: operationalPct === null ? "—" : `${operationalPct}%`,
      icon: ShieldCheck,
      delta: {
        text: allReady ? "All probes responding" : `${notReady} probe(s) failing`,
        direction: allReady ? "up" : "down",
        tone: allReady ? "positive" : "negative",
      },
      helper: "Share of services answering /readyz with 2xx",
    },
    {
      label: "Services Not Ready",
      value: `${notReady}`,
      icon: Activity,
      delta: {
        text: notReady === 0 ? "None" : "Not ready, or no answer within 1.5s",
        direction: notReady === 0 ? "flat" : "down",
        tone: notReady === 0 ? "positive" : "negative",
      },
      helper: "See Domain Health for which ones",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi, i) => (
        <StatCard
          key={kpi.label}
          label={kpi.label}
          value={kpi.value}
          icon={kpi.icon}
          tone={TONES[i % TONES.length]}
          className="animate-fade-up"
          style={{ animationDelay: `${i * 50}ms` }}
          helper={
            <>
              {kpi.delta && (
                <span className="flex min-w-0 items-center gap-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate" title={kpi.delta.text}>
                    {kpi.delta.text}
                  </span>
                </span>
              )}
              <span className="mt-0.5 block truncate" title={kpi.helper}>
                {kpi.helper}
              </span>
            </>
          }
        />
      ))}
    </div>
  );
}
