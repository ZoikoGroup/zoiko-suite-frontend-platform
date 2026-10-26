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
  const operationalPct = totalServices > 0 ? Math.round((readyServices / totalServices) * 100) : 100;
  const activeDomainsCount = domains.filter((d) => d.status === "operational").length;

  const kpis: Kpi[] = [
    {
      label: "Active Microservices",
      value: `${readyServices} / ${totalServices}`,
      icon: Server,
      delta: {
        text: "37 targets active",
        direction: "up",
        tone: "positive",
      },
      helper: "Blocks 6–10 running in Docker",
    },
    {
      label: "Domains Monitored",
      value: `${activeDomainsCount} / ${domains.length}`,
      icon: Layers,
      delta: {
        text: "100% operational",
        direction: "up",
        tone: "positive",
      },
      helper: "Legal, Tax, Compliance, Ops, Security, Integrations",
    },
    {
      label: "Cluster Readiness",
      value: `${operationalPct}%`,
      icon: ShieldCheck,
      delta: {
        text: "All probes responding",
        direction: "up",
        tone: "positive",
      },
      helper: "Zero container readiness failures",
    },
    {
      label: "Average Latency",
      value: "< 10ms",
      icon: Activity,
      delta: {
        text: "High-throughput mock cluster",
        direction: "up",
        tone: "positive",
      },
      helper: "Fast local HTTP response time",
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
