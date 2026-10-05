"use client";

import { useState, useEffect } from "react";
import { Bot, RefreshCw, ShieldCheck, AlertTriangle, CheckCircle, XCircle, Cpu, Globe, BarChart3 } from "lucide-react";

type GuardrailStatus = "PASSED" | "FLAGGED" | "BLOCKED";
type RiskTier = "TIER_1_CRITICAL" | "TIER_2_HIGH" | "TIER_3_MEDIUM" | "TIER_4_LOW";
type AutonomyLevel = "AUTONOMOUS" | "PROPOSE_ONLY" | "FORBIDDEN";

type AIRun = {
  run_id: string;
  model_provider: string;
  model_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_estimate_usd: number;
  guardrail_status: GuardrailStatus;
  purpose: string;
  created_at?: string;
};

type RiskClassification = {
  action_type: string;
  risk_tier: RiskTier;
  requires_human_in_the_loop: boolean;
  approval_quorum: number;
  description: string;
};

const GUARDRAIL_COLORS: Record<GuardrailStatus, string> = {
  PASSED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  FLAGGED: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  BLOCKED: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

const GUARDRAIL_ICONS: Record<GuardrailStatus, React.ElementType> = {
  PASSED: CheckCircle,
  FLAGGED: AlertTriangle,
  BLOCKED: XCircle,
};

const TIER_COLORS: Record<RiskTier, string> = {
  TIER_1_CRITICAL: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  TIER_2_HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  TIER_3_MEDIUM: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  TIER_4_LOW: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};

const TIER_LABELS: Record<RiskTier, string> = {
  TIER_1_CRITICAL: "Tier 1 — Critical",
  TIER_2_HIGH: "Tier 2 — High",
  TIER_3_MEDIUM: "Tier 3 — Medium",
  TIER_4_LOW: "Tier 4 — Low",
};

const AUTONOMY_COLORS: Record<AutonomyLevel, string> = {
  AUTONOMOUS: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  PROPOSE_ONLY: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  FORBIDDEN: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

function fmt(n: number) {
  return n.toLocaleString();
}

function fmtCost(n: number) {
  return `$${n.toFixed(4)}`;
}

function timeAgo(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

// ─── Mock Data (used when backend is offline) ────────────────────────────────
const MOCK_RUNS: AIRun[] = [
  {
    run_id: "run-ai-001",
    model_provider: "anthropic",
    model_name: "claude-3-7-sonnet",
    prompt_tokens: 1450,
    completion_tokens: 320,
    cost_estimate_usd: 0.0118,
    guardrail_status: "PASSED",
    purpose: "Contract compliance review — MSA renewal",
    created_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
  },
  {
    run_id: "run-ai-002",
    model_provider: "openai",
    model_name: "gpt-4o",
    prompt_tokens: 3200,
    completion_tokens: 890,
    cost_estimate_usd: 0.0512,
    guardrail_status: "FLAGGED",
    purpose: "Vendor risk scoring — PII extraction attempt detected",
    created_at: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
  },
  {
    run_id: "run-ai-003",
    model_provider: "google",
    model_name: "gemini-2-flash",
    prompt_tokens: 6100,
    completion_tokens: 1200,
    cost_estimate_usd: 0.0084,
    guardrail_status: "PASSED",
    purpose: "Tax document summarisation — Q3 filing",
    created_at: new Date(Date.now() - 95 * 60 * 1000).toISOString(),
  },
  {
    run_id: "run-ai-004",
    model_provider: "anthropic",
    model_name: "claude-3-5-haiku",
    prompt_tokens: 800,
    completion_tokens: 100,
    cost_estimate_usd: 0.0009,
    guardrail_status: "BLOCKED",
    purpose: "Payroll bulk mutation — blocked by Tier 1 guardrail",
    created_at: new Date(Date.now() - 142 * 60 * 1000).toISOString(),
  },
];

const MOCK_RISK: RiskClassification[] = [
  {
    action_type: "PAYROLL_MUTATION",
    risk_tier: "TIER_1_CRITICAL",
    requires_human_in_the_loop: true,
    approval_quorum: 3,
    description: "Bulk payroll mutation — requires dual control",
  },
  {
    action_type: "CONTRACT_ACTIVATE",
    risk_tier: "TIER_2_HIGH",
    requires_human_in_the_loop: true,
    approval_quorum: 2,
    description: "Contract activation after PENDING_APPROVAL",
  },
  {
    action_type: "TAX_FILING_SUBMIT",
    risk_tier: "TIER_2_HIGH",
    requires_human_in_the_loop: true,
    approval_quorum: 2,
    description: "Regulatory tax filing submission",
  },
  {
    action_type: "VENDOR_ONBOARD",
    risk_tier: "TIER_3_MEDIUM",
    requires_human_in_the_loop: false,
    approval_quorum: 1,
    description: "Vendor onboarding and KYC check",
  },
  {
    action_type: "REPORT_EXPORT",
    risk_tier: "TIER_4_LOW",
    requires_human_in_the_loop: false,
    approval_quorum: 1,
    description: "Financial report export — propose only",
  },
];

export function AIGovernancePanel() {
  const [runs, setRuns] = useState<AIRun[]>([]);
  const [risk, setRisk] = useState<RiskClassification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [runsRes, riskRes] = await Promise.allSettled([
        fetch("/api/v1/ai-governance/runs").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/v1/ai-governance/risk-classifications").then((r) => (r.ok ? r.json() : null)),
      ]);
      setRuns(
        runsRes.status === "fulfilled" && runsRes.value?.runs
          ? runsRes.value.runs
          : MOCK_RUNS,
      );
      setRisk(
        riskRes.status === "fulfilled" && riskRes.value?.classifications
          ? riskRes.value.classifications
          : MOCK_RISK,
      );
    } catch {
      setRuns(MOCK_RUNS);
      setRisk(MOCK_RISK);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const passed = runs.filter((r) => r.guardrail_status === "PASSED").length;
  const flagged = runs.filter((r) => r.guardrail_status === "FLAGGED").length;
  const blocked = runs.filter((r) => r.guardrail_status === "BLOCKED").length;
  const totalCost = runs.reduce((acc, r) => acc + r.cost_estimate_usd, 0);

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>AI Runs &amp; Guardrail Outcomes</span>
        <button
          type="button"
          onClick={fetchData}
          className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Reload
        </button>
      </div>

      {/* KPI chips */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Passed", value: passed, cls: "text-emerald-600 dark:text-emerald-400", Icon: CheckCircle },
          { label: "Flagged", value: flagged, cls: "text-amber-600 dark:text-amber-400", Icon: AlertTriangle },
          { label: "Blocked", value: blocked, cls: "text-rose-600 dark:text-rose-400", Icon: XCircle },
          { label: "Cost", value: fmtCost(totalCost), cls: "text-slate-600 dark:text-slate-300", Icon: BarChart3 },
        ].map(({ label, value, cls, Icon }) => (
          <div
            key={label}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-2 text-center"
          >
            <Icon className={`mx-auto mb-1 h-4 w-4 ${cls}`} />
            <div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div>
            <div className="text-[10px] text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Recent AI Runs */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Recent AI Runs
        </h4>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <RefreshCw className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-2">
            {runs.slice(0, 4).map((run) => {
              const Icon = GUARDRAIL_ICONS[run.guardrail_status];
              return (
                <div
                  key={run.run_id}
                  className="flex items-start gap-3 rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-2.5"
                >
                  <div className="mt-0.5 shrink-0">
                    <Cpu className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                        {run.model_provider}/{run.model_name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${GUARDRAIL_COLORS[run.guardrail_status]}`}
                      >
                        <Icon className="h-3 w-3" />
                        {run.guardrail_status}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {run.purpose}
                    </p>
                    <div className="mt-1 flex gap-3 text-[10px] text-slate-400">
                      <span>{fmt(run.prompt_tokens + run.completion_tokens)} tok</span>
                      <span>{fmtCost(run.cost_estimate_usd)}</span>
                      <span>{timeAgo(run.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Action Risk Classifications */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Action Risk Registry
        </h4>
        <div className="space-y-1.5">
          {risk.map((r) => (
            <div
              key={r.action_type}
              className="flex items-center gap-3 rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-3 py-2"
            >
              <ShieldCheck className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                    {r.action_type}
                  </span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TIER_COLORS[r.risk_tier]}`}>
                    {TIER_LABELS[r.risk_tier]}
                  </span>
                  {r.requires_human_in_the_loop && (
                    <span className="rounded-full bg-violet-100 dark:bg-violet-950 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
                      Human-in-loop
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">{r.description}</p>
              </div>
              <span className="shrink-0 text-[10px] text-slate-400">Q:{r.approval_quorum}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
        <Globe className="inline h-3 w-3 mr-1" />
        ai-governance-svc :8146 — TIER 1 blocks are enforced at the console gate; lower tiers propose-only.
      </p>
    </div>
  );
}
