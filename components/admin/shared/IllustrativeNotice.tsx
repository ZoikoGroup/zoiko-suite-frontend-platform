import { FlaskConical } from "lucide-react";

/**
 * Marks a panel whose figures are illustrative rather than read from a service.
 *
 * This exists because several KPI strips in this console render hardcoded values in
 * exactly the same style as live ones — same typography, same tiles, and formerly
 * the same confident green trend badges ("+12% MoM", "Optimal", "On schedule")
 * beside them. Nothing on the page distinguished the two, so a reader had no way to
 * know that "Total Accounts Receivable $1.25M" or "Treasury Cash Available $7.85M"
 * was not this tenant's position.
 *
 * Labelling is the honest interim, not the fix. The fix is to read the service, as
 * the Commercial Ops strip now does; where a domain has no wired service yet there
 * is nothing to read, and until then the page must at least not assert. Delete this
 * notice from a panel at the moment that panel becomes live.
 */
export function IllustrativeNotice({ services }: { services?: string }) {
  return (
    <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50/60 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
      <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        <strong className="font-semibold">Illustrative figures — not live data.</strong> These
        numbers are hardcoded to show the shape of the domain; none of them was read from a service,
        and they do not describe this tenant.
        {services ? ` ${services}` : ""}
      </span>
    </p>
  );
}
