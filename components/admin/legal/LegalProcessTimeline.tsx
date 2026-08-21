"use client";

import { useState, useEffect } from "react";
import { ArrowRight, FileCode, Edit3, ShieldCheck, UserCheck, CheckSquare, Vote, X } from "lucide-react";

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
        ["clauses", "template"],
        ["contracts", "negotiation"],
        ["meetings", "approval"],
        ["counterparties", "counterparty"],
        ["obligations", "obligation"],
        ["resolutions", "resolution"],
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

export function LegalProcessTimeline() {
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const liveCounts = useLiveStepCounts();

  const STEPS: Step[] = [
    {
      id: "template",
      icon: FileCode,
      title: "Template Drafted",
      service: "clause-template-svc",
      port: ":8119",
      count: liveCounts.template ?? 142,
      status: "complete",
      detail: "Master agreement template selected from legal clause library.",
      examples: ["MSA-CLOUD-V4 · Cloud Infrastructure MSA"],
    },
    {
      id: "negotiation",
      icon: Edit3,
      title: "Clause Redline",
      service: "contract-lifecycle-svc",
      port: ":8118",
      count: liveCounts.negotiation ?? 28,
      status: "complete",
      detail: "Custom term adjustments, liability caps, and counterparty redlines.",
      examples: ["cnt-2026-001 · $2.5M Global Infrastructure"],
    },
    {
      id: "approval",
      icon: ShieldCheck,
      title: "Legal Approval",
      service: "legal-approvals-svc",
      port: ":8123",
      count: liveCounts.approval ?? 15,
      status: "active",
      detail: "General Counsel and Finance approval sign-off.",
      examples: ["Approval Appr-8812 · Granted by GC"],
    },
    {
      id: "counterparty",
      icon: UserCheck,
      title: "Counterparty Screen",
      service: "counterparty-management-svc",
      port: ":8124",
      count: liveCounts.counterparty ?? 64,
      status: "active",
      detail: "UBO verification, corporate registry check, and sanction screening.",
      examples: ["Acme Cloud Inc. · Verified UBO"],
    },
    {
      id: "obligation",
      icon: CheckSquare,
      title: "Obligation Tracked",
      service: "obligation-tracking-svc",
      port: ":8120",
      count: liveCounts.obligation ?? 18,
      status: "pending",
      detail: "Contractual obligations registered into deadline tracking engine.",
      examples: ["GDPR Data Privacy Audit · Annual"],
    },
    {
      id: "resolution",
      icon: Vote,
      title: "Board Resolution",
      service: "board-resolutions-svc",
      port: ":8121",
      count: liveCounts.resolution ?? 12,
      status: "pending",
      detail: "Formal board approval and corporate action filing.",
      examples: ["BR-2026-08 · Unanimous Consent"],
    },
  ];

  const openStep = STEPS.find((s) => s.id === activeStep);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Legal Lifecycle & Contract Governance Flow
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Template ➔ Redline ➔ Legal Approval ➔ Counterparty ➔ Obligation ➔ Board Resolution
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
                  <span className="flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-indigo-200 bg-white dark:bg-slate-900 dark:ring-indigo-500/30">
                    <step.icon className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" />
                  </span>
                  <span className="text-[11px] font-semibold leading-tight text-slate-700 dark:text-slate-300">
                    {step.title}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                    {step.count} items
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{step.port}</span>
                </button>
                {!isLast && (
                  <div className="flex items-center self-center mt-2 mx-1">
                    <div className="h-0.5 w-6 bg-indigo-400" />
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
                <openStep.icon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
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
