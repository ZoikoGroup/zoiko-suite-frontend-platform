// One line, beside a Blocks 9-10 service's records, saying whether its outside
// provider is connected (see lib/provider-status.ts). No hooks, so it renders
// in server and client panels alike.

import { PlugZap } from "lucide-react";
import { PROVIDER_STATUS, type ProviderService } from "@/lib/provider-status";

export function ProviderStatusNote({ service }: { service: ProviderService }) {
  const s = PROVIDER_STATUS[service];
  return (
    <p
      role="note"
      data-provider-status={service}
      className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <PlugZap className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        <strong className="font-semibold">{s.provider}: not connected.</strong> {s.detail}
      </span>
    </p>
  );
}
