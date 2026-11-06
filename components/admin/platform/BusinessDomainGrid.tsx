import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, Badge } from "@/components/ui";
import { BUSINESS_DOMAINS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * One card per business domain in the platform brief. A domain links only to
 * pages that exist; one with no page is shown as "Not yet available" and is not
 * clickable, so it cannot be mistaken for a working destination.
 */
export function BusinessDomainGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {BUSINESS_DOMAINS.map((domain, i) => {
        const available = domain.destinations.length > 0;
        return (
          <Card
            key={domain.key}
            className={cn(
              "flex h-full flex-col gap-3 p-4 animate-fade-up",
              !available && "bg-slate-50 dark:bg-slate-900/60",
            )}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 dark:bg-navy-500/10">
                <domain.icon className="h-4.5 w-4.5 text-navy-700 dark:text-navy-300" />
              </span>
              {available ? (
                <Badge tone="info">§{domain.section}</Badge>
              ) : (
                <Badge tone="neutral">Not yet available</Badge>
              )}
            </div>

            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{domain.label}</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {domain.description}
              </p>
              {domain.gap && (
                <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{domain.gap}</p>
              )}
            </div>

            {available && (
              <ul className="mt-auto space-y-1 border-t border-slate-100 pt-3 dark:border-slate-800">
                {domain.destinations.map((dest) => (
                  <li key={dest.href}>
                    <Link
                      href={dest.href}
                      className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-navy-700 transition-colors duration-200 hover:bg-navy-50 dark:text-navy-300 dark:hover:bg-navy-500/10"
                    >
                      {dest.label}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
