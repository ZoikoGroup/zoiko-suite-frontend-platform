import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui";
import { Bot, ShieldAlert, Cpu, Sparkles, CheckCircle2, Lock } from "lucide-react";
import {
  getActionRiskClassification,
  getAIRun,
  verifyModelProvider,
} from "@/lib/api/ai-governance";

export const metadata: Metadata = { title: "AI Governance & Safety Controls | Zoiko Suite" };

const SAMPLE_MODELS = [
  { provider: "anthropic", model: "claude-3-7-sonnet", region: "eu-west-1", context: 200000, verified: true },
  { provider: "openai", model: "gpt-4o", region: "us-east-1", context: 128000, verified: true },
  { provider: "google", model: "gemini-1.5-pro", region: "europe-west4", context: 1000000, verified: true },
  { provider: "meta", model: "llama-3.3-70b-instruct", region: "local-private-cloud", context: 32768, verified: false },
];

const RISK_TAXONOMY = [
  { action: "INVOICE_AUTONOMOUS_PAYMENT", tier: "TIER_1_CRITICAL", quorum: 2, humanRequired: true },
  { action: "TAX_RETURN_SUBMISSION", tier: "TIER_1_CRITICAL", quorum: 2, humanRequired: true },
  { action: "CONTRACT_AUTO_REVISION", tier: "TIER_2_HIGH", quorum: 1, humanRequired: true },
  { action: "EMPLOYEE_LEAVE_APPROVAL", tier: "TIER_3_MEDIUM", quorum: 1, humanRequired: false },
  { action: "EVIDENCE_OCR_EXTRACTION", tier: "TIER_4_LOW", quorum: 0, humanRequired: false },
];

export default async function AiGovernancePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Bot className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          AI Governance & Guardrail Controls
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Model risk classification, autonomous execution boundaries, and evaluation auditing via ai-governance-svc (:8146).
        </p>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Active Model Providers</CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">4 Verified</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-emerald-600 font-medium">EU & US Sovereignty Compliant</CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Critical Tier-1 Actions</CardDescription>
            <CardTitle className="text-2xl font-bold text-red-600 dark:text-red-400">2 Actions</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">Human-In-The-Loop Enforced</CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Guardrail Interventions (24h)</CardDescription>
            <CardTitle className="text-2xl font-bold text-amber-600 dark:text-amber-400">0 Blocked</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-emerald-600 font-medium">100% Policy Adherence</CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Governance Kill Switch</CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600">ARMED</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">Instant Global Freeze Enabled</CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Model Provider Registry */}
        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <Cpu className="h-4 w-4 text-indigo-500" />
                Vetted LLM & Model Registry
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Approved model endpoints registered with residency pins
              </CardDescription>
            </div>
            <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
              {SAMPLE_MODELS.length} Models
            </span>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {SAMPLE_MODELS.map((m) => (
                <div key={m.model} className="flex items-center justify-between py-3 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      {m.model}
                      {m.verified && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      {m.provider} • Region: <span className="font-mono">{m.region}</span> • Max {m.context.toLocaleString()} tokens
                    </div>
                  </div>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    ONLINE
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Action Risk Classification Taxonomy */}
        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <Lock className="h-4 w-4 text-amber-500" />
                Action Risk Classification & Quorum
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Statutory risk tiers and dual-authorization requirements
              </CardDescription>
            </div>
            <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              {RISK_TAXONOMY.length} Actions
            </span>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {RISK_TAXONOMY.map((r) => (
                <div key={r.action} className="flex items-center justify-between py-2.5 text-xs">
                  <div>
                    <div className="font-mono font-medium text-slate-900 dark:text-slate-100 text-[11px]">
                      {r.action}
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      Quorum: {r.quorum} approver(s) • Human required: {r.humanRequired ? "Yes" : "No"}
                    </div>
                  </div>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      r.tier.startsWith("TIER_1")
                        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                        : r.tier.startsWith("TIER_2")
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {r.tier.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
