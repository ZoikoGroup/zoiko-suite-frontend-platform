import { Server, Zap } from "lucide-react";

/**
 * Service strip for the Commercial Ops domain: which services back this page, and
 * on which ports.
 *
 * This used to also carry three action buttons — "Issue Purchase Order", "Vendor
 * Check", and "Adjust Budget" — and all three opened the same mock modal, which
 * ran a 1.2s fake delay and then reported "Purchase Order Issued · PO-2026-0414
 * registered in purchase-order-svc (:8115)". Nothing was issued, no service was
 * called, PO-2026-0414 does not exist, and :8115 is leave-absence-svc.
 *
 * They are gone rather than reimplemented, because the real thing is already on
 * this page: issuing an order, screening a counterparty, and setting a spend limit
 * are three live, writable forms directly below. A button that mimes the action
 * next to the form that performs it is worse than no button — an operator who
 * clicks it comes away believing an order exists.
 *
 * The status line is also now honest about what it knows: it lists the services and
 * their ports, and does not claim they are up. The live readiness probe is
 * lib/api/health.ts, which drives the Overview grid; this strip makes no request at
 * all, so "All nominal" and a pulsing green "6 Microservices Active" were
 * decoration asserting a fact nothing had checked. There are five services here,
 * not six.
 */
const SERVICES = [
  { name: "purchase-request-svc", port: "8100" },
  // 8129, not 8112. compose gave 8112 to benefits-svc as well, so the two could
  // never both start; Traefik and .env.local both already routed here to 8129.
  { name: "purchase-order-svc", port: "8129" },
  { name: "invoice-approval-svc", port: "8107" },
  { name: "spend-controls-svc", port: "8131" },
  { name: "vendor-due-diligence-svc", port: "8135" },
];

export function CommercialOpsActionHeader() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white/90 backdrop-blur-md shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Services behind this domain
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Ports as published in the backend&apos;s docker-compose.yml. This strip makes no request,
            so it reports what each service <em>is</em>, not whether it is running — the live
            readiness probe drives the status grid on the Overview page.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Server className="h-3.5 w-3.5" aria-hidden="true" />
          {SERVICES.length} services
        </span>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-2.5 dark:border-slate-800 dark:bg-slate-800/30">
        {SERVICES.map((svc) => (
          <span
            key={svc.port}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-mono text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
          >
            {svc.name}
            <span className="text-slate-400 dark:text-slate-500">:{svc.port}</span>
          </span>
        ))}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
          <Zap className="h-3 w-3" aria-hidden="true" />
          four of five wired to this console
        </span>
      </div>
    </div>
  );
}
