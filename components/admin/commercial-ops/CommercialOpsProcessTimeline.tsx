"use client";

import { useState } from "react";
import { ArrowRight, FilePlus, Scale, ShieldAlert, ShoppingCart, Receipt, X } from "lucide-react";

/**
 * The procurement sequence, as an explanatory diagram of how the domain fits
 * together. It deliberately shows no figures.
 *
 * It used to show a per-step item count and a worked example on every step, all
 * hardcoded and none real: "24 items", "128 items", "PR-2026-091 · $450,000 Cloud
 * Nodes", "Eng Budget Cap $2.5M · Passed", "Acme Cloud Inc. · Passed Score 98%".
 * Every port was also wrong — :8114, :8113, :8117, :8115, :8112, :8116, not one of
 * which is the port of the service it was printed beside — and one step named
 * `procurement-workflow-svc`, which has no directory under services/ and no compose
 * entry. The vendor step claimed "Sanctions, AML screening, and liability insurance
 * verification", none of which exists anywhere on this platform.
 *
 * The counts and examples are gone rather than corrected, because the live figures
 * already have a home: the KPI strip above reads them from the four wired services,
 * and the registers below list the records themselves. A diagram's job here is to
 * explain the order of the controls, and it can do that honestly without numbers.
 *
 * `wired` distinguishes a step the console can actually drive from one that only
 * exists as a stage in the sequence — a step drawn identically to its neighbours
 * implies a capability that isn't there.
 */
type Step = {
  id: string;
  icon: React.ElementType;
  title: string;
  service: string;
  port: string;
  /** True when this step is live and writable from this page. */
  wired: boolean;
  detail: string;
};

const STEPS: Step[] = [
  {
    id: "req",
    icon: FilePlus,
    title: "Purchase Requisition",
    service: "purchase-request-svc",
    port: ":8100",
    wired: true,
    detail:
      "The requisition an order originates from. Lands PENDING and authorises nothing — purchase-order-svc refuses to issue against anything not APPROVED.",
  },
  {
    id: "diligence",
    icon: ShieldAlert,
    title: "Counterparty Screening",
    service: "vendor-due-diligence-svc",
    port: ":8135",
    wired: true,
    detail:
      "Screens the counterparty before commitment. The only screening implemented is an exact, case-insensitive match against a hardcoded list of two names — there is no sanctions, AML, or UBO feed on this platform — so a no-match is a recorded absence of a finding and NOT a clearance. The outcome and its evidence are written in one transaction.",
  },
  {
    id: "budget",
    icon: Scale,
    title: "Spend Control Check",
    service: "spend-controls-svc",
    port: ":8131",
    wired: true,
    detail:
      "Checks a proposed spend against the limit for that category and entity, per transaction or cumulatively over a calendar month or year. Enforcement is atomic, so simultaneous checks cannot each see the same remaining budget. A cross-currency spend is refused rather than converted.",
  },
  {
    id: "po-issue",
    icon: ShoppingCart,
    title: "PO Issued",
    service: "purchase-order-svc",
    port: ":8129",
    wired: true,
    detail:
      "The binding commitment, issued only against an APPROVED requisition owned by the same tenant and legal entity. Amending restates the total and appends an immutable amendment record; closing is terminal.",
  },
  {
    id: "invoice-match",
    icon: Receipt,
    title: "3-Way Match & Pay",
    service: "invoice-approval-svc",
    port: ":8107",
    wired: false,
    detail:
      "Matches order, receipt, and invoice before payment is released. The service exists and is in compose, but it is not yet wired to this console — nothing on this page reads or writes it.",
  },
];

export function CommercialOpsProcessTimeline() {
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const openStep = STEPS.find((s) => s.id === activeStep);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Procurement &amp; Commercial Execution Flow
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            The order the controls run in. Screening the counterparty and checking the limit both
            come <em>before</em> the commitment. Select a step for what it does — no figures here,
            they are in the summary and registers above.
          </p>
        </div>
      </div>

      <div className="scrollbar-thin overflow-x-auto px-5 py-5">
        <div className="flex min-w-max items-start gap-0">
          {STEPS.map((step, idx) => {
            const isLast = idx === STEPS.length - 1;
            const isOpen = activeStep === step.id;

            return (
              <div key={step.id} className="flex items-start">
                <button
                  onClick={() => setActiveStep(isOpen ? null : step.id)}
                  aria-expanded={isOpen}
                  className={`flex w-32 flex-col items-center gap-2 rounded-lg p-1.5 text-center transition-all ${
                    isOpen
                      ? "bg-slate-50 dark:bg-slate-800/60"
                      : "hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-full bg-white ring-2 dark:bg-slate-900 ${
                      step.wired
                        ? "ring-amber-200 dark:ring-amber-500/30"
                        : "ring-slate-200 dark:ring-slate-700"
                    }`}
                  >
                    <step.icon
                      className={`h-4.5 w-4.5 ${
                        step.wired
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-slate-400 dark:text-slate-500"
                      }`}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="text-[11px] font-semibold leading-tight text-slate-700 dark:text-slate-300">
                    {step.title}
                  </span>
                  {/* Says whether the console can drive this step, rather than an
                      invented item count. */}
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      step.wired
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    {step.wired ? "live here" : "not wired"}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                    {step.port}
                  </span>
                </button>
                {!isLast && (
                  <div className="mx-1 mt-2 flex items-center self-center">
                    <div className="h-0.5 w-6 bg-amber-400" />
                    <ArrowRight
                      className="-ml-0.5 h-3 w-3 text-slate-300 dark:text-slate-700"
                      aria-hidden="true"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {openStep && (
        <div className="mx-5 mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <openStep.icon
                  className="h-4 w-4 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {openStep.title}
                </h4>
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {openStep.service} {openStep.port}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {openStep.detail}
              </p>
            </div>
            <button
              onClick={() => setActiveStep(null)}
              aria-label="Close step detail"
              className="rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
