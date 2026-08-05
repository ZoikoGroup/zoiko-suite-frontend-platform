"use client";

import { useState } from "react";
import { ArrowRight, Zap, Key, ShieldCheck, Database, Lock, Search, X } from "lucide-react";

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
    id: "action",
    icon: Zap,
    title: "Domain Action",
    service: "domain-microservices",
    port: "8080-8147",
    count: 1248500,
    status: "complete",
    detail: "User or system action occurs in any of the 50 domain microservices.",
    examples: ["PO Issued", "Tax Return Filed", "Payslip Generated"],
  },
  {
    id: "identity",
    icon: Key,
    title: "Identity Enriched",
    service: "tenant-entity-registry-svc",
    port: ":8081",
    count: 1248500,
    status: "complete",
    detail: "X-Tenant-Id, X-Principal-Id, and X-Correlation-ID attached.",
    examples: ["Tenant 11111111-1111-1111 · Correlation e8912"],
  },
  {
    id: "governance",
    icon: ShieldCheck,
    title: "Governance Evaluated",
    service: "governance-decision-log-svc",
    port: ":8083",
    count: 42100,
    status: "complete",
    detail: "Action evaluated against security policies & logged to decision log.",
    examples: ["Outcome: AUTHORIZED · Basis: Rule UK-VAT-STD"],
  },
  {
    id: "ingestion",
    icon: Database,
    title: "Event Ingested",
    service: "audit-event-store-svc",
    port: ":8084",
    count: 1248500,
    status: "active",
    detail: "Event payload written to append-only event store repository.",
    examples: ["Event ID evt-2026-99182 · Status: INGESTED"],
  },
  {
    id: "hashchain",
    icon: Lock,
    title: "SHA-256 Hash Chained",
    service: "cryptographic-hashchain-svc",
    port: ":8084",
    count: 1248500,
    status: "active",
    detail: "SHA-256 hash calculated incorporating previous event hash.",
    examples: ["PrevHash: a8f9c... ➔ CurrHash: e3b0c..."],
  },
  {
    id: "audited",
    icon: Search,
    title: "Tamper Verified",
    service: "event-provenance-auditor",
    port: ":8084",
    count: 1248500,
    status: "pending",
    detail: "Continuous provenance auditor verifies zero hash gaps across all events.",
    examples: ["Verification Status: TAMPER_FREE"],
  },
];

export function AuditEventsProcessTimeline() {
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const openStep = STEPS.find((s) => s.id === activeStep);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Cryptographic Audit Ingestion & Hash-Chain Pipeline
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Action ➔ Identity ➔ Governance ➔ Ingestion ➔ SHA-256 Hash Chain ➔ Tamper Verified
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
                  <span className="flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-slate-200 bg-white dark:bg-slate-900 dark:ring-slate-700">
                    <step.icon className="h-4.5 w-4.5 text-slate-700 dark:text-slate-300" />
                  </span>
                  <span className="text-[11px] font-semibold leading-tight text-slate-700 dark:text-slate-300">
                    {step.title}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {step.count.toLocaleString()}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{step.port}</span>
                </button>
                {!isLast && (
                  <div className="flex items-center self-center mt-2 mx-1">
                    <div className="h-0.5 w-6 bg-slate-400" />
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
                <openStep.icon className="h-4 w-4 text-slate-700 dark:text-slate-300" />
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
