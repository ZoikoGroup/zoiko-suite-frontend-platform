import { Landmark, Scale, CalendarCheck, Plus } from "lucide-react";

/**
 * A pointer to the Finance domain's real actions.
 *
 * WHAT THIS REPLACED. This component was 298 lines of fabrication, and every
 * part of it asserted something untrue:
 *
 *   - "Post Journal Entry" POSTed a hardcoded body to /api/v1/journal-entries,
 *     a console route that writes nothing and echoes back 201 "created". It then
 *     ignored the response entirely and showed "Journal Voucher Posted — Entry
 *     jv-2026-003 posted to General Ledger (:8100)": an invented journal id, for
 *     a journal that was never written, naming a port general-ledger-svc does
 *     not use.
 *   - "Bank Rec Match" made NO network call at all — a 1.5s setTimeout — then
 *     reported "4 transactions matched, 2 items flagged for manual review"
 *     against bank-reconciliation-svc (:8103, also the wrong port).
 *   - "Initiate Financial Close" was the same setTimeout pattern, reporting
 *     "Close sequence started, all sub-ledgers locked". Closing a period is the
 *     single most consequential act in this domain; nothing happened.
 *   - A "8 Microservices Active" pill, a green dot per port, and "All nominal",
 *     none of which were read from anything — including treasury-svc,
 *     intercompany-accounting-svc and consolidation-svc, which have never run in
 *     this environment.
 *
 * All three operations already exist FOR REAL further down this same page, wired
 * through app/admin/finance/actions.ts to general-ledger-svc,
 * bank-reconciliation-svc and financial-close-svc, with the fields those
 * services actually require and their real errors surfaced. So this is not a
 * feature being removed — it is a duplicate that reported success without doing
 * the work, standing in front of the version that does it.
 *
 * Deliberately no service-status strip: the honest version of that needs a real
 * readiness read per service (lib/api/health.ts), and an invented one is what
 * was here.
 */
export function FinanceActionHeader() {
  const actions = [
    {
      icon: Plus,
      label: "Record a journal",
      href: "#record-journal",
      hint: "general-ledger-svc · balanced lines, then validate and post",
    },
    {
      icon: Scale,
      label: "Ingest a statement line",
      href: "#ingest-statement-line",
      hint: "bank-reconciliation-svc · match against a posted journal",
    },
    {
      icon: CalendarCheck,
      label: "Register a fiscal period",
      href: "#register-fiscal-period",
      hint: "financial-close-svc · readiness check, then lock",
    },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white/90 backdrop-blur-md shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <Landmark className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
          Finance actions
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action) => (
            <a
              key={action.href}
              href={action.href}
              title={action.hint}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <action.icon className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              {action.label}
            </a>
          ))}
        </div>
        <p className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">
          Every action here writes to a real service and reports what it answered.
        </p>
      </div>
    </div>
  );
}
