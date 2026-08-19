"use client";

import { useState, useEffect } from "react";
import { ArrowRight, DollarSign, Gift, Percent, ShieldCheck, FileText, Send, X } from "lucide-react";

type Step = {
  id: string;
  icon: React.ElementType;
  title: string;
  service: string;
  port: string;
  count: number;
  status: "complete" | "active" | "pending";
  detail: string;
  examples: string[];
};

const STEP_META: Omit<Step, "count">[] = [
  {
    id: "comp",
    icon: DollarSign,
    title: "Compensation Load",
    service: "compensation-svc",
    port: ":8091",
    status: "complete",
    detail: "Base salary rates, hourly timesheets, and bonus structures loaded.",
    examples: ["240 Employee Records Loaded"],
  },
  {
    id: "benefits",
    icon: Gift,
    title: "Benefits Deduction",
    service: "benefits-svc & deductions-svc",
    port: ":8092 / :8097",
    status: "complete",
    detail: "Health insurance, pension pre-tax contributions, and garnishments computed.",
    examples: ["Pension Dr $24,000 · Health Dr $18,500"],
  },
  {
    id: "tax",
    icon: Percent,
    title: "Payroll Tax Calculated",
    service: "payroll-tax-svc & employer-contributions-svc",
    port: ":8093 / :8096",
    status: "complete",
    detail: "PAYE, Federal/State income tax, and National Insurance calculated.",
    examples: ["PAYE Tax $142,500 · Employer NI $68,200"],
  },
  {
    id: "exception",
    icon: ShieldCheck,
    title: "Exception Audit",
    service: "payroll-exceptions-svc",
    port: ":8094",
    status: "active",
    detail: "Automated anomaly checks (negative pay, massive overtime variance) run.",
    examples: ["0 Exceptions Flagged"],
  },
  {
    id: "payslip",
    icon: FileText,
    title: "Payslip Generated",
    service: "payslip-svc",
    port: ":8095",
    status: "active",
    detail: "Encrypted digital payslips generated and stored in employee portal.",
    examples: ["240 PDF Payslips Issued"],
  },
  {
    id: "disbursement",
    icon: Send,
    title: "Bank Disbursement",
    service: "payroll-run-svc",
    port: ":8090",
    status: "pending",
    detail: "Direct deposit ABA/BACS clearing file transmitted for treasury disbursement.",
    examples: ["BACS Batch PAY-2026-07 · $485,000"],
  },
];

function useLiveStepCounts(): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    async function fetchCounts() {
      const endpoints: [string, string][] = [
        ["compensation/structures", "comp"],
        ["benefits/plans", "benefits"],
        ["payroll-tax/profiles", "tax"],
        ["payroll-exceptions", "exception"],
        ["payroll-runs", "payslip"],
        ["payroll-runs", "disbursement"],
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

export function PayrollProcessTimeline() {
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const liveCounts = useLiveStepCounts();
  const STEPS: Step[] = STEP_META.map((meta) => ({ ...meta, count: liveCounts[meta.id] ?? 0 }));
  const openStep = STEPS.find((s) => s.id === activeStep);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Payroll Orchestration Process Flow
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Compensation ➔ Benefits ➔ Payroll Tax ➔ Exception Audit ➔ Payslips ➔ Bank Disbursement
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
                  <span className="flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-emerald-200 bg-white dark:bg-slate-900 dark:ring-emerald-500/30">
                    <step.icon className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                  </span>
                  <span className="text-[11px] font-semibold leading-tight text-slate-700 dark:text-slate-300">
                    {step.title}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                    {step.count} items
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{step.port}</span>
                </button>
                {!isLast && (
                  <div className="flex items-center self-center mt-2 mx-1">
                    <div className="h-0.5 w-6 bg-emerald-400" />
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
                <openStep.icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{openStep.title}</h4>
                <span className="font-mono text-[11px] text-slate-500">{openStep.service} {openStep.port}</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">{openStep.detail}</p>
              <div className="flex flex-wrap gap-1.5">
                {openStep.examples.map((ex) => (
                  <span key={ex} className="rounded-md bg-white border border-slate-200 px-2.5 py-1 text-[11px] font-mono text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400">
                    {ex}
                  </span>
                ))}
              </div>
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
