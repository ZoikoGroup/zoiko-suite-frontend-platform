"use client";

import { useState, useEffect } from "react";
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  FileText,
  Receipt,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";

type Step = {
  id: string;
  icon: React.ElementType;
  title: string;
  service: string;
  port: string;
  count: number;
  status: "complete" | "active" | "pending" | "blocked";
  detail: string;
  examples: string[];
};

function useLiveStepCounts(): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    async function fetchCounts() {
      const endpoints: [string, string][] = [
        ["tax-rules", "rules"],
        ["tax-determinations", "determination"],
        ["vat-returns", "returns"],
        ["corporate-tax-returns", "returns"],
        ["withholding-tax", "settled"],
        ["filing-preparation/drafts", "filing"],
        ["tax-authority/interfaces", "authority"],
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

const STEP_META: Omit<Step, "count">[] = [
  {
    id: "rules",
    icon: ShieldCheck,
    title: "Tax Rule Applied",
    service: "tax-rules-svc",
    port: ":8125",
    status: "complete",
    detail:
      "Each determination references a governing tax rule that specifies the rate, category, jurisdiction, and effective date range. Rules are versioned — a determination always points to the exact rule version in effect at evaluation time.",
    examples: [
      "UK-VAT-STD-2026 · 20%",
      "US-CIT-FED-2026 · 21%",
      "SG-GST-2026 · 9%",
      "DE-WHT-DIV-2026 · 15%",
    ],
  },
  {
    id: "determination",
    icon: Calculator,
    title: "Tax Determination",
    service: "tax-determination-svc",
    port: ":8126",
    status: "complete",
    detail:
      "The determination engine matches the transaction against jurisdiction rules and computes the applicable tax type, rate, taxable base, and calculated tax amount. Results are stored as determination records.",
    examples: ["det-001 · UK VAT 20% · £20,000 calculated", "det-002 · US CIT 21% · $94,500 calculated"],
  },
  {
    id: "returns",
    icon: Receipt,
    title: "Return Assembled",
    service: "vat-gst-svc / corporate-tax-svc",
    port: ":8127 / :8128",
    status: "active",
    detail:
      "Periodic returns (VAT, GST, Corporate Income Tax) are assembled from the determination ledger. The engine aggregates output tax, input tax, deductions, and credits into a structured return for the relevant authority.",
    examples: [
      "vat-2026-q1 · GB-987654321 · £140K net",
      "vat-2026-q2 · GB-987654321 · £186K net",
      "cit-2025-us · EIN-12-3456789 · $650K net",
    ],
  },
  {
    id: "filing",
    icon: FileText,
    title: "Filing Prepared",
    service: "filing-preparation-svc",
    port: ":8130",
    status: "active",
    detail:
      "The filing preparation service validates all evidence manifests against the return data, assembles the authority-specific payload (JSON for HMRC MTD, XML for IRS MeF), and marks the draft FINALIZED or flags BLOCKED with reasons.",
    examples: ["draft-hmrc-q2 · VAT100_MTD · FINALIZED", "draft-irs-1120s · US_FORM_1120 · PREPARED"],
  },
  {
    id: "authority",
    icon: Send,
    title: "Filed with Authority",
    service: "tax-authority-interface-svc",
    port: ":8147",
    status: "pending",
    detail:
      "The tax authority interface service transmits the finalized payload to the relevant authority gateway (HMRC MTD API, IRS MeF, IRAS e-File) using the appropriate authentication and protocol. Status is updated to ACCEPTED or REJECTED based on the authority response.",
    examples: [
      "HMRC_MTD_VAT · OAuth2 · REST",
      "IRS_MEF_SYSTEM · mTLS + SAML2 · SOAP",
      "IRAS_EFILE_API · Corppass OIDC · REST",
    ],
  },
  {
    id: "settled",
    icon: CheckCircle2,
    title: "Tax Settled",
    service: "withholding-tax-svc / treasury",
    port: ":8129",
    status: "pending",
    detail:
      "Final settlement: withholding tax is remitted to the authority, corporate tax balance due is paid via treasury, and VAT returns move to ACCEPTED state. The obligation is closed in the compliance registry.",
    examples: ["wht-001 · REMITTED · DE-BZST · €75K remittance reference REMIT-BZST-99812"],
  },
];

const STATUS_CONFIG = {
  complete: {
    dot: "bg-emerald-500",
    ring: "ring-emerald-200 dark:ring-emerald-500/30",
    label: "text-emerald-700 dark:text-emerald-400",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
    connectorLine: "bg-emerald-400",
  },
  active: {
    dot: "bg-blue-500 animate-pulse",
    ring: "ring-blue-200 dark:ring-blue-500/30",
    label: "text-blue-700 dark:text-blue-400",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
    connectorLine: "bg-blue-400",
  },
  pending: {
    dot: "bg-amber-400",
    ring: "ring-amber-200 dark:ring-amber-500/30",
    label: "text-amber-700 dark:text-amber-400",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    connectorLine: "bg-slate-300 dark:bg-slate-700",
  },
  blocked: {
    dot: "bg-red-500",
    ring: "ring-red-200 dark:ring-red-500/30",
    label: "text-red-700 dark:text-red-400",
    badge: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
    connectorLine: "bg-red-400",
  },
};

export function TaxProcessTimeline() {
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const liveCounts = useLiveStepCounts();

  const PROCESS_STEPS: Step[] = STEP_META.map((meta) => ({
    ...meta,
    count: liveCounts[meta.id] ?? 0,
  }));

  const openStep = PROCESS_STEPS.find((s) => s.id === activeStep);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Tax Governance Process Flow
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            End-to-end lifecycle · click any step to inspect
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
          {(["complete", "active", "pending"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${STATUS_CONFIG[s].dot}`} />
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
          ))}
        </div>
      </div>

      {/* Timeline nodes */}
      <div className="overflow-x-auto px-5 py-5 scrollbar-thin">
        <div className="flex min-w-max items-start gap-0">
          {PROCESS_STEPS.map((step, idx) => {
            const cfg = STATUS_CONFIG[step.status];
            const isLast = idx === PROCESS_STEPS.length - 1;
            const isOpen = activeStep === step.id;

            return (
              <div key={step.id} className="flex items-start">
                {/* Step node */}
                <button
                  id={`tax-process-step-${step.id}`}
                  onClick={() => setActiveStep(isOpen ? null : step.id)}
                  className={`group flex flex-col items-center gap-2 w-28 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 rounded-lg p-1.5 transition-all duration-150 ${
                    isOpen ? "bg-slate-50 dark:bg-slate-800/60" : "hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  }`}
                  aria-expanded={isOpen}
                  aria-controls={`tax-step-detail-${step.id}`}
                >
                  {/* Icon circle */}
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-full ring-2 transition-all duration-200 ${cfg.ring} ${
                      isOpen ? "bg-slate-100 dark:bg-slate-800 scale-110" : "bg-white dark:bg-slate-900"
                    }`}
                  >
                    <step.icon
                      className={`h-4.5 w-4.5 ${cfg.label} transition-colors`}
                      aria-hidden="true"
                    />
                  </span>

                  {/* Status dot */}
                  <span className="relative flex h-2 w-2">
                    <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                  </span>

                  {/* Title */}
                  <span className={`text-[11px] font-semibold leading-tight ${cfg.label}`}>
                    {step.title}
                  </span>

                  {/* Count badge */}
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.badge}`}
                  >
                    {step.count} record{step.count !== 1 ? "s" : ""}
                  </span>

                  {/* Port */}
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                    {step.port}
                  </span>
                </button>

                {/* Connector arrow */}
                {!isLast && (
                  <div className="flex items-center self-center mt-2 mx-1">
                    <div className={`h-0.5 w-6 ${cfg.connectorLine}`} />
                    <ArrowRight className="h-3 w-3 text-slate-300 dark:text-slate-700 -ml-0.5" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Expandable detail panel */}
      {openStep && (
        <div
          id={`tax-step-detail-${openStep.id}`}
          className="mx-5 mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <openStep.icon
                  className={`h-4 w-4 shrink-0 ${STATUS_CONFIG[openStep.status].label}`}
                  aria-hidden="true"
                />
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {openStep.title}
                </h4>
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {openStep.service} {openStep.port}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
                {openStep.detail}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {openStep.examples.map((ex) => (
                  <span
                    key={ex}
                    className="inline-flex items-center rounded-md bg-white border border-slate-200 px-2.5 py-1 text-[11px] font-mono text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  >
                    {ex}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={() => setActiveStep(null)}
              className="shrink-0 rounded-md p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              aria-label="Close detail"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
