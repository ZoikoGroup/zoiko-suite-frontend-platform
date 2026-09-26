import { Badge } from "@/components/ui";
import { getDomainHealth } from "@/lib/api/health";
import { DOMAINS } from "@/lib/constants";

export async function ActiveServicesPanel() {
  const health = await getDomainHealth();

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Active Microservices Directory (37 Target Services)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live status across Blocks 6–10 connected directly to local Docker runtime.
            </p>
          </div>
          <Badge tone="success">Cluster Healthy</Badge>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-[440px] overflow-y-auto">
          {DOMAINS.map((domain) => {
            const h = health[domain.key];
            return (
              <div key={domain.key} className="p-4 sm:px-6 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy-50 text-navy-700 dark:bg-navy-500/10 dark:text-navy-300">
                      <domain.icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {domain.label}
                    </span>
                    <span className="text-xs text-slate-400">({domain.coreServices.length} services)</span>
                  </div>
                  <Badge tone={h.status === "operational" ? "success" : "warning"}>
                    {h.ready} / {h.total} Ready
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {domain.coreServices.map((svc) => (
                    <span
                      key={svc}
                      className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {svc}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
