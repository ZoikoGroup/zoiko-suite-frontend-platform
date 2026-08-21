"use client";

import { useState, useEffect } from "react";
import { ArrowRight, BookOpen, FileCheck, ShieldAlert, CalendarClock, Send, AlertTriangle, X } from "lucide-react";

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

function useLiveStepCounts(): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    async function fetchCounts() {
      const endpoints: [string, string][] = [
        ["filing-tracker/requirements", "obligation"],
        ["compliance-status", "req"],
        ["compliance-status", "manifest"],
        ["filing-tracker/requirements", "deadline"],
        ["filing-tracker/requirements", "filing"],
        ["exception-escalation/exceptions", "audit"],
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

export function ComplianceProcessTimeline() {
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const liveCounts = useLiveStepCounts();

  const STEPS: Step[] = [
    {
      id: "obligation",
      icon: BookOpen,
      title: "Obligation Cataloged",
      service: "obligations-svc",
      port: ":8088",
      count: liveCounts.obligation ?? 14,
      status: "complete",
      detail: "Statutory filing requirement registered in central compliance ledger.",
      examples: ["Companies House Annual Confirmation Statement"],
    },
    {
      id: "req",
      icon: FileCheck,
      title: "Evidence Standard Defined",
      service: "evidence-requirements-svc",
      port: ":8089",
      count: liveCounts.req ?? 38,
      status: "complete",
      detail: "Sufficiency rules and required documentation types established.",
      examples: ["Board Minutes + Certified Financial Audit"],
    },
    {
      id: "manifest",
      icon: ShieldAlert,
      title: "Manifest Verified",
      service: "evidence-manifest-svc",
      port: ":8087",
      count: liveCounts.manifest ?? 38,
      status: "complete",
      detail: "Evidentiary file pack assembled and SHA-256 hash verified.",
      examples: ["Manifest MAN-2026-0891 · Valid Hash"],
    },
    {
      id: "deadline",
      icon: CalendarClock,
      title: "Deadline Checked",
      service: "deadline-engine",
      port: ":8088",
      count: liveCounts.deadline ?? 14,
      status: "active",
      detail: "Statutory cutoff date monitored with countdown alerts.",
      examples: ["Due in 14 days · Sept 30 2026"],
    },
    {
      id: "filing",
      icon: Send,
      title: "Filing Submitted",
      service: "filing-tracker",
      port: ":8088",
      count: liveCounts.filing ?? 12,
      status: "active",
      detail: "Report submitted to statutory registry authority.",
      examples: ["Filing Status: ACCEPTED"],
    },
    {
      id: "audit",
      icon: AlertTriangle,
      title: "Exception Audited",
      service: "exception-escalation-svc",
      port: ":8088",
      count: liveCounts.audit ?? 1,
      status: "pending",
      detail: "Compliance breach or deadline exception evaluated and resolved.",
      examples: ["Level 1 Warning · Resolved"],
    },
  ];

  const openStep = STEPS.find((s) => s.id === activeStep);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Statutory Compliance Governance Flow
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Obligation ➔ Evidence Standard ➔ Manifest Verified ➔ Deadline Checked ➔ Filing ➔ Exception
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
                  <span className="flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-purple-200 bg-white dark:bg-slate-900 dark:ring-purple-500/30">
                    <step.icon className="h-4.5 w-4.5 text-purple-600 dark:text-purple-400" />
                  </span>
                  <span className="text-[11px] font-semibold leading-tight text-slate-700 dark:text-slate-300">
                    {step.title}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
                    {step.count} items
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{step.port}</span>
                </button>
                {!isLast && (
                  <div className="flex items-center self-center mt-2 mx-1">
                    <div className="h-0.5 w-6 bg-purple-400" />
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
                <openStep.icon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
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
