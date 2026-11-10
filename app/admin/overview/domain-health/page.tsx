import type { Metadata } from "next";
import Link from "next/link";
import { Activity, CheckCircle2, ServerCrash, Server } from "lucide-react";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, StatCard } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import { DOMAINS, type DomainStatus } from "@/lib/constants";
import { DOMAIN_SERVICES, getDomainHealth } from "@/lib/api/health";

export const metadata: Metadata = {
  title: "Domain Health | Zoiko Suite",
};

// Probed on every request: a cached readiness page would report a service as up
// after it went down.
export const dynamic = "force-dynamic";

const STATUS: Record<DomainStatus, { label: string; tone: "success" | "warning" | "danger" }> = {
  operational: { label: "Operational", tone: "success" },
  attention: { label: "Needs attention", tone: "warning" },
  "action-required": { label: "Action required", tone: "danger" },
};

export default async function DomainHealthPage() {
  const health = await getDomainHealth();
  const checkedAt = new Date();

  const domains = DOMAINS.map((d) => ({ domain: d, health: health[d.key], services: DOMAIN_SERVICES[d.key] ?? [] }));
  const total = domains.reduce((n, d) => n + d.health.total, 0);
  const ready = domains.reduce((n, d) => n + d.health.ready, 0);
  const notReady = total - ready;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Domain Health"
        description="Readiness of every domain's services, probed live on /readyz each time this page loads."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Services ready" value={`${ready} / ${total}`} icon={Server} tone="emerald" helper="Answered /readyz with 2xx" />
        <StatCard label="Services not ready" value={notReady} icon={ServerCrash} tone={notReady > 0 ? "rose" : "navy"} helper="Not ready, or did not answer within 1.5s" />
        <StatCard
          label="Domains fully operational"
          value={`${domains.filter((d) => d.health.status === "operational").length} / ${domains.length}`}
          icon={Activity}
          tone="violet"
          helper={`Checked ${checkedAt.toISOString().replace("T", " ").slice(0, 19)} UTC`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {domains.map(({ domain, health: h, services }) => {
          const status = STATUS[h.status];
          const down = new Set(h.down);
          return (
            <Card key={domain.key}>
              <CardHeader>
                <div>
                  <CardTitle>
                    <Link href={domain.href} className="hover:underline">
                      {domain.label}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {h.ready} of {h.total} services ready
                  </CardDescription>
                </div>
                <Badge tone={status.tone} dot>
                  {status.label}
                </Badge>
              </CardHeader>
              <CardContent>
                {services.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No service is mapped to this domain yet.</p>
                ) : (
                  <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {services.map((s) => {
                      const isDown = down.has(s.name);
                      return (
                        <li
                          key={s.name}
                          className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-800"
                        >
                          <span className="truncate font-mono text-slate-700 dark:text-slate-300">{s.name}</span>
                          {isDown ? (
                            <span className="inline-flex shrink-0 items-center gap-1 text-rose-600 dark:text-rose-400">
                              <ServerCrash className="h-3.5 w-3.5" aria-hidden="true" />
                              Not ready
                            </span>
                          ) : (
                            <span className="inline-flex shrink-0 items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Ready
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
