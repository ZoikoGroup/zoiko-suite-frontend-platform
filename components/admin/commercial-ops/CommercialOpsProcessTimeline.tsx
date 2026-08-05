"use client";

import { useState } from "react";
import { ArrowRight, FilePlus, Scale, ShieldAlert, ShoppingCart, PackageCheck, Receipt, X } from "lucide-react";

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
    id: "req",
    icon: FilePlus,
    title: "Purchase Requisition",
    service: "purchase-request-svc",
    port: ":8114",
    count: 24,
    status: "complete",
    detail: "Internal purchase request created and routed for initial department sign-off.",
    examples: ["PR-2026-091 · $450,000 Cloud Nodes"],
  },
  {
    id: "budget",
    icon: Scale,
    title: "Spend Control Check",
    service: "spend-controls-svc",
    port: ":8113",
    count: 24,
    status: "complete",
    detail: "Automated budget check against department spending limit cap.",
    examples: ["Eng Budget Cap $2.5M · Passed"],
  },
  {
    id: "diligence",
    icon: ShieldAlert,
    title: "Vendor Diligence",
    service: "vendor-due-diligence-svc",
    port: ":8117",
    count: 128,
    status: "complete",
    detail: "Sanctions, AML screening, and liability insurance verification.",
    examples: ["Acme Cloud Inc. · Passed Score 98%"],
  },
  {
    id: "po-issue",
    icon: ShoppingCart,
    title: "PO Issued",
    service: "purchase-order-svc",
    port: ":8115",
    count: 14,
    status: "active",
    detail: "Legally binding Purchase Order generated and sent to vendor.",
    examples: ["PO-2026-0412 · $450,000 Issued"],
  },
  {
    id: "receipt",
    icon: PackageCheck,
    title: "Goods Receipt",
    service: "procurement-workflow-svc",
    port: ":8112",
    count: 12,
    status: "active",
    detail: "Fulfillment confirmation and service delivery receipt logged.",
    examples: ["GRN-2026-088 · 100% Delivered"],
  },
  {
    id: "invoice-match",
    icon: Receipt,
    title: "3-Way Match & Pay",
    service: "invoice-approval-svc",
    port: ":8116",
    count: 10,
    status: "pending",
    detail: "PO vs Receipt vs Invoice 3-way match approval for AP payment execution.",
    examples: ["INV-ACME-9912 · Approved for AP"],
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
            Procurement & Commercial Execution Flow
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Requisition ➔ Spend Control ➔ Vendor Screening ➔ PO Issue ➔ Goods Receipt ➔ 3-Way Match
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
                  <span className="flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-amber-200 bg-white dark:bg-slate-900 dark:ring-amber-500/30">
                    <step.icon className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
                  </span>
                  <span className="text-[11px] font-semibold leading-tight text-slate-700 dark:text-slate-300">
                    {step.title}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                    {step.count} items
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{step.port}</span>
                </button>
                {!isLast && (
                  <div className="flex items-center self-center mt-2 mx-1">
                    <div className="h-0.5 w-6 bg-amber-400" />
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
                <openStep.icon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
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
