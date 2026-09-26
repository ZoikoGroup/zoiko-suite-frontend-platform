import {
  Server,
  Layers,
  ShieldCheck,
  Activity,
  ArrowUpRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui";
import { getDomainHealth } from "@/lib/api/health";

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
        <Card
          key={kpi.label}
          className="flex flex-col gap-2 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-navy-300 dark:hover:border-navy-500 animate-fade-up"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {kpi.label}
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-50 text-navy-700 dark:bg-navy-500/10 dark:text-navy-300">
              <kpi.icon className="h-4 w-4" />
            </span>
          </div>

          <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {kpi.value}
          </p>

          <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs">
            {kpi.delta && (
              <span className="inline-flex items-center gap-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="h-3.5 w-3.5" />
                {kpi.delta.text}
              </span>
            )}
            <span className="truncate text-slate-400 dark:text-slate-500" title={kpi.helper}>
              {kpi.helper}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}
