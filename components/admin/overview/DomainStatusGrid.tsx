import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, Badge } from "@/components/ui";
import { DOMAINS } from "@/lib/constants";
import type { DomainStatus } from "@/lib/constants";

const STATUS_CONFIG: Record<DomainStatus, { label: string; tone: "success" | "warning" | "danger" }> = {
  operational: { label: "Operational", tone: "success" },
  attention: { label: "Needs attention", tone: "warning" },
  "action-required": { label: "Action required", tone: "danger" },
};

export function DomainStatusGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {DOMAINS.map((domain, i) => {
        const status = STATUS_CONFIG[domain.status];
        return (
          <Link
            key={domain.key}
            href={domain.href}
            className="group animate-fade-up"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <Card className="flex h-full flex-col gap-3 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-navy-300 dark:hover:border-navy-500">
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 transition-colors duration-200 group-hover:bg-navy-900 dark:bg-navy-500/10 dark:group-hover:bg-navy-700">
                  <domain.icon className="h-4.5 w-4.5 text-navy-700 transition-colors duration-200 group-hover:text-gold-300 dark:text-navy-300" />
                </span>
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{domain.label}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {domain.purpose}
                </p>
              </div>
              <div className="mt-auto flex items-center gap-1 text-xs font-medium text-navy-700 opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:text-navy-300">
                View domain
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
