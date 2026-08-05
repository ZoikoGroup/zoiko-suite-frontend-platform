"use client";

import { useState } from "react";
import { ArrowRight, UserPlus, FileCheck, Users, Calendar, ShieldCheck, UserMinus, X } from "lucide-react";

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

const STEPS: Step[] = [
  {
    id: "org",
    icon: UserPlus,
    title: "Position Created",
    service: "org-structure-svc",
    port: ":8131",
    count: 8,
    status: "complete",
    detail: "Job position and cost center created in org structure tree.",
    examples: ["Senior Backend Engineer · Node-8812"],
  },
  {
    id: "contract",
    icon: FileCheck,
    title: "Contract Issued",
    service: "employment-contracts-svc",
    port: ":8110",
    count: 240,
    status: "complete",
    detail: "Employment agreement issued with salary grade and probation period.",
    examples: ["EMP-2026-0891 · Full Time Permanent"],
  },
  {
    id: "master",
    icon: Users,
    title: "Workforce Active",
    service: "employee-master-svc",
    port: ":8109",
    count: 240,
    status: "complete",
    detail: "Employee master profile active in department hierarchy.",
    examples: ["Engineering (120) · Product (40) · Sales (80)"],
  },
  {
    id: "leave",
    icon: Calendar,
    title: "Leave Managed",
    service: "leave-absence-svc",
    port: ":8111",
    count: 4,
    status: "active",
    detail: "Annual leave balances and absence requests tracked.",
    examples: ["Annual Leave · 4 Pending Requests"],
  },
  {
    id: "compliance",
    icon: ShieldCheck,
    title: "Compliance Audited",
    service: "workforce-compliance-svc",
    port: ":8133",
    count: 240,
    status: "active",
    detail: "Right-to-Work, visa expiry, and mandatory training compliance checked.",
    examples: ["100% Right-to-Work Verified"],
  },
  {
    id: "offboard",
    icon: UserMinus,
    title: "Offboarding Closed",
    service: "offboarding-severance-svc",
    port: ":8132",
    count: 2,
    status: "pending",
    detail: "Exit checklist, asset return, and severance pay calculation completed.",
    examples: ["Offboarding Case OFF-2026-04 · Completed"],
  },
];

export function HrProcessTimeline() {
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const openStep = STEPS.find((s) => s.id === activeStep);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Workforce Lifecycle Process Flow
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Position Created ➔ Contract Issued ➔ Workforce Active ➔ Leave Managed ➔ Compliance ➔ Offboarding
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
                  <span className="flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-teal-200 bg-white dark:bg-slate-900 dark:ring-teal-500/30">
                    <step.icon className="h-4.5 w-4.5 text-teal-600 dark:text-teal-400" />
                  </span>
                  <span className="text-[11px] font-semibold leading-tight text-slate-700 dark:text-slate-300">
                    {step.title}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">
                    {step.count} items
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{step.port}</span>
                </button>
                {!isLast && (
                  <div className="flex items-center self-center mt-2 mx-1">
                    <div className="h-0.5 w-6 bg-teal-400" />
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
                <openStep.icon className="h-4 w-4 text-teal-600 dark:text-teal-400" />
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
