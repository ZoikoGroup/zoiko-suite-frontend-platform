import { Layers, Sparkles } from "lucide-react";
import { Card, Badge } from "@/components/ui";
import { PageHeader } from "./PageHeader";
import { getSingleDomainHealth } from "@/lib/api/health";
import type { Domain } from "@/lib/constants";

const STATUS_CONFIG = {
  operational: { label: "Operational", tone: "success" as const },
  attention: { label: "Needs attention", tone: "warning" as const },
  "action-required": { label: "Action required", tone: "danger" as const },
};

/**
 * Domain detail page shell. The status badge is derived from live /readyz probes
 * of that domain's services — the same source the Overview grid uses — rather
 * than the hardcoded status in lib/constants.ts.
 */
export async function DomainPlaceholder({ domain }: { domain: Domain }) {
  const health = await getSingleDomainHealth(domain.key);
  const status = STATUS_CONFIG[health.status];

  return (
    <div>
      <PageHeader
        title={domain.label}
        description={domain.purpose}
        actions={
          <Badge
            tone={status.tone}
            title={health.down.length ? `Not ready: ${health.down.join(", ")}` : undefined}
          >
            {status.label} · {health.ready}/{health.total} ready
          </Badge>
        }
      />

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-dashed border-navy-200 bg-navy-50/60 px-4 py-3.5 animate-fade-up dark:border-navy-500/30 dark:bg-navy-500/10">
        <Sparkles className="mt-0.5 h-4.5 w-4.5 shrink-0 text-navy-700 dark:text-navy-300" />
        <p className="text-sm text-navy-800 dark:text-navy-200">
          This module&rsquo;s services are defined and routed through the Governance
          Control Plane. Live data wiring for {domain.label.toLowerCase()} is
          in progress — the services below will populate as they come online.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {domain.coreServices.map((service, i) => (
          <Card
            key={service}
            className="flex items-center gap-3 p-4 animate-fade-up"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 dark:bg-navy-500/10">
              <Layers className="h-4 w-4 text-navy-700 dark:text-navy-300" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{service}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Coming online</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
