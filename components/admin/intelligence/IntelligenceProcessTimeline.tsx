"use client";

import { useState } from "react";
import { AlertTriangle, TrendingUp, ShieldCheck, GitMerge, BarChart2, Lightbulb, ArrowLeftRight, X } from "lucide-react";

type Step = {
  id: string;
  icon: React.ElementType;
  title: string;
  service: string;
  port: string;
  detail: string;
};

const STEPS: Step[] = [
  {
    id: "anomaly",
    icon: AlertTriangle,
    title: "Anomaly Detection",
    service: "anomaly-detection-svc",
    port: ":8160",
    detail:
      "Monitors transaction streams, journal entries, and compliance events for statistical anomalies. Flags threshold breaches and pattern deviations for human review — never auto-remediates.",
  },
  {
    id: "forecast",
    icon: TrendingUp,
    title: "Forecasting",
    service: "forecasting-svc",
    port: ":8161",
    detail:
      "Runs domain-scoped predictive models (financial, compliance, tax liability). Each forecast has a model type, period, and accuracy score. Forecasts are read-only outputs — they advise, they don't mutate.",
  },
  {
    id: "risk",
    icon: ShieldCheck,
    title: "Compliance Risk Scoring",
    service: "compliance-risk-scoring-svc",
    port: ":8162",
    detail:
      "Evaluates each legal entity's composite risk posture from evidence, exception, and filing signals. Scores are point-in-time snapshots with a validity window — not live dashboards.",
  },
  {
    id: "recon",
    icon: GitMerge,
    title: "Reconciliation Intelligence",
    service: "reconciliation-intelligence-svc",
    port: ":8163",
    detail:
      "Matches records between source systems (general ledger ↔ bank feed, payroll ↔ HR). Unmatched items are exceptions, not errors — the human decides how to resolve them.",
  },
  {
    id: "report",
    icon: BarChart2,
    title: "Reporting Orchestration",
    service: "reporting-orchestration-svc",
    port: ":8164",
    detail:
      "Queues and distributes multi-format reports (PDF, JSON, XBRL) to internal and regulatory destinations. Reports are generated from frozen snapshots, not live data.",
  },
  {
    id: "decision",
    icon: Lightbulb,
    title: "Decision Support",
    service: "decision-support-svc",
    port: ":8165",
    detail:
      "Surfaces AI-assisted recommendations for compliance actions, exception resolution, and approval decisions. Recommendations are advisory — every action still requires a human approval step.",
  },
  {
    id: "migration",
    icon: ArrowLeftRight,
    title: "Migration Integrity",
    service: "migration-integrity-svc",
    port: ":8166",
    detail:
      "Validates data migrations between legacy and target services by comparing record counts, checksums, and field mappings. A migration job completes only when validated_count equals record_count.",
  },
];

export function IntelligenceProcessTimeline() {
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const active = STEPS.find((s) => s.id === activeStep);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 dark:border-slate-800 px-5 py-3">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
          Intelligence Pipeline — click a step for detail
        </p>
      </div>
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          {STEPS.map((step, i) => (
            <div key={step.id} className="flex items-center gap-2">
              <button
                id={`intel-step-${step.id}`}
                onClick={() => setActiveStep(activeStep === step.id ? null : step.id)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm ${
                  activeStep === step.id
                    ? "border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-500/60 dark:bg-violet-500/10 dark:text-violet-300"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                }`}
                aria-pressed={activeStep === step.id}
              >
                <step.icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{step.title}</span>
                <code className="text-[10px] font-mono opacity-60">{step.port}</code>
              </button>
              {i < STEPS.length - 1 && (
                <div className="h-px w-4 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>

        {active && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-violet-100 bg-violet-50 p-4 dark:border-violet-500/20 dark:bg-violet-500/10">
            <active.icon className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">{active.title}</p>
              <p className="mt-1 text-xs text-violet-700 dark:text-violet-300 leading-relaxed">{active.detail}</p>
              <code className="mt-1 block text-[10px] text-violet-500 dark:text-violet-400">
                {active.service} {active.port}
              </code>
            </div>
            <button
              onClick={() => setActiveStep(null)}
              className="text-violet-400 hover:text-violet-600 dark:text-violet-500 dark:hover:text-violet-300"
              aria-label="Dismiss detail"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
