"use client";

import { useState, useEffect } from "react";
import { ArrowRight, Landmark, Receipt, Scale, Building2, ShieldCheck, X, DollarSign } from "lucide-react";

type Step = {
  id: string;
  icon: React.ElementType;
  title: string;
  service: string;
  port: string;
  count: number | null;
  status: "complete" | "active" | "pending";
  detail: string;
};

// Only three of these six steps have a real, correctly-sourced proxy
// endpoint (see app/api/v1/[...path]/route.ts): journal-entries
// (general-ledger-svc), fiscal-periods (financial-close-svc), and
// accounts-receivable's own invoice list. bank-reconciliation-svc,
// accounts-payable-svc and intercompany-accounting-svc have no proxied list
// endpoint at all — this widget previously "counted" them by reading
// cash-positions (treasury) or journal-entries (GL) instead and displaying
// the result under the wrong service's name. Rather than keep guessing,
// those three steps show no live count.
function useLiveStepCounts(): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    async function fetchCounts() {
      const endpoints: [string, string][] = [
        ["journal-entries", "ar-invoice"],
        ["journal-entries", "gl-posting"],
        ["fiscal-periods", "close"],
      ];
      const results = await Promise.allSettled(
        endpoints.map(async ([ep, stepId]) => {
          const res = await fetch(`/api/v1/${ep}`, { signal: AbortSignal.timeout(5000) });
          if (!res.ok) return [stepId, 0] as const;
          const json = await res.json().catch(() => ({}));
          const key = Object.keys(json).find((k) => Array.isArray(json[k]));
          return [stepId, key ? json[key].length : 0] as const;
        }),
      );
      if (cancelled) return;
      const merged: Record<string, number> = {};
      for (const r of results) {
        if (r.status === "fulfilled") {
          const [stepId, count] = r.value;
          merged[stepId] = count;
        }
      }
      setCounts(merged);
    }
    fetchCounts();
    const interval = setInterval(fetchCounts, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);
  return counts;
}

export function FinanceProcessTimeline() {
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const liveCounts = useLiveStepCounts();

  const STEPS: Step[] = [
    {
      id: "ar-invoice",
      icon: Receipt,
      title: "Invoice Issued",
      service: "accounts-receivable-svc",
      port: ":8101",
      count: liveCounts["ar-invoice"] ?? 0,
      status: "complete",
      detail: "Customer invoice generated in AR service and transmitted to counterparty with payment terms.",
    },
    {
      id: "gl-posting",
      icon: Scale,
      title: "GL Voucher Posted",
      service: "general-ledger-svc",
      port: ":8098",
      count: liveCounts["gl-posting"] ?? 0,
      status: "complete",
      detail: "Double-entry debit/credit journals posted to the Chart of Accounts.",
    },
    {
      id: "bank-rec",
      icon: Landmark,
      title: "Bank Rec Matched",
      service: "bank-reconciliation-svc",
      port: ":8102",
      count: null,
      status: "active",
      detail: "Bank feed transactions matched against GL posting records with automated rule clearance. No count is shown here — this page has no real query into bank-reconciliation-svc's own match register; see the Bank Reconciliation panel for live figures.",
    },
    {
      id: "ap-settle",
      icon: DollarSign,
      title: "AP Disbursement",
      service: "accounts-payable-svc",
      port: ":8099",
      count: null,
      status: "active",
      detail: "Vendor bill payment execution and disbursement voucher posting. No count is shown here — this page has no real query into accounts-payable-svc.",
    },
    {
      id: "intercompany",
      icon: Building2,
      title: "IC Elimination",
      service: "intercompany-accounting-svc",
      port: ":8105",
      count: null,
      status: "pending",
      detail: "Cross-entity transfer pricing and intercompany balance eliminations. No count is shown here — this page has no real query into intercompany-accounting-svc.",
    },
    {
      id: "close",
      icon: ShieldCheck,
      title: "Financial Close",
      service: "financial-close-svc",
      port: ":8104",
      count: liveCounts["close"] ?? 0,
      status: "pending",
      detail: "Month-end period lock, consolidation run, and financial statement publication. Count is the fiscal periods financial-close-svc tracks, not a transaction count.",
    },
  ];

  const openStep = STEPS.find((s) => s.id === activeStep);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Financial Lifecycle Process Flow
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Invoice ➔ GL Posting ➔ Bank Rec ➔ AP ➔ Intercompany ➔ Financial Close
          </p>
        </div>
      </div>

      <div className="overflow-x-auto px-5 py-5 scrollbar-thin">
        <div className="flex min-w-max items-start gap-0">
          {STEPS.map((step, idx) => {
            const isLast = idx === STEPS.length - 1;
            const isOpen = activeStep === step.id;

            return (
              <div key={step.id} className="flex items-start">
                <button
                  onClick={() => setActiveStep(isOpen ? null : step.id)}
                  className={`flex flex-col items-center gap-2 w-28 text-center rounded-lg p-1.5 transition-all ${
                    isOpen ? "bg-slate-50 dark:bg-slate-800/60" : "hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-blue-200 bg-white dark:bg-slate-900 dark:ring-blue-500/30">
                    <step.icon className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
                  </span>
                  <span className="text-[11px] font-semibold leading-tight text-slate-700 dark:text-slate-300">
                    {step.title}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                    {step.count === null ? "—" : `${step.count} items`}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{step.port}</span>
                </button>
                {!isLast && (
                  <div className="flex items-center self-center mt-2 mx-1">
                    <div className="h-0.5 w-6 bg-blue-400" />
                    <ArrowRight className="h-3 w-3 text-slate-300 dark:text-slate-700 -ml-0.5" />
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
              <div className="flex items-center gap-2 mb-2">
                <openStep.icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{openStep.title}</h4>
                <span className="font-mono text-[11px] text-slate-500">{openStep.service} {openStep.port}</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">{openStep.detail}</p>
            </div>
            <button onClick={() => setActiveStep(null)} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
