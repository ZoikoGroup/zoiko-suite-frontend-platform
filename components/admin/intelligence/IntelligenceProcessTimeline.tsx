"use client";

import { useState } from "react";
import { AlertTriangle, TrendingUp, ShieldCheck, GitMerge, BarChart2, Lightbulb, ArrowLeftRight, X } from "lucide-react";

type Step = {
  id: string;
  icon: React.ElementType;
  title: string;
  service: string;
  detail: string;
};

const STEPS: Step[] = [
  {
    id: "anomaly",
    icon: AlertTriangle,
    title: "Anomaly Detection",
    service: "anomaly-detection-svc",
    detail:
      "Monitors transaction streams, journal entries, and compliance events for statistical anomalies. Flags threshold breaches and pattern deviations for human review — never auto-remediates.",
  },
  {
    id: "forecast",
    icon: TrendingUp,
    title: "Forecasting",
    service: "forecasting-svc",
    detail:
      "Projects a domain series (financial, payroll, cash flow, workforce, tax liability) from historical data. Each forecast records its algorithm, horizon and confidence level, and moves through review, approval and publication. Forecasts advise; they don't mutate.",
  },
  {
    id: "risk",
    icon: ShieldCheck,
    title: "Compliance Risk Scoring",
    service: "compliance-risk-scoring-svc",
    detail:
      "Evaluates each legal entity's composite risk posture from evidence, exception, and filing signals. Scores are point-in-time evaluations against versioned thresholds; high tiers require human review.",
  },
  {
    id: "recon",
    icon: GitMerge,
    title: "Reconciliation Intelligence",
    service: "reconciliation-intelligence-svc",
    detail:
      "Matches records between source systems (general ledger ↔ bank feed, payroll ↔ HR). Unmatched items are exceptions, not errors — the human decides how to resolve them.",
  },
  {
    id: "report",
    icon: BarChart2,
    title: "Reporting Orchestration",
    service: "reporting-orchestration-svc",
    detail:
      "Holds report definitions (type, output format, data sources) through draft, validation and activation. Report runs are recorded but not yet implemented: no report data is produced.",
  },
  {
    id: "decision",
    icon: Lightbulb,
    title: "Decision Support",
    service: "decision-support-svc",
    detail:
      "Surfaces AI-assisted recommendations for compliance actions, exception resolution, and approval decisions. Recommendations are advisory — every action still requires a human approval step.",
  },
  {
    id: "migration",
    icon: ArrowLeftRight,
    title: "Migration Integrity",
    service: "migration-integrity-svc",
    detail:
      "Validates migration batches against required fields and control totals, quarantines invalid records, and scores integrity against a threshold. A job with blockers or a score below threshold cannot be signed off.",
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
                {active.service}
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
