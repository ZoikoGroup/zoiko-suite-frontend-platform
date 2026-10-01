import type { Metadata } from "next";
import { Bot, ShieldCheck, Cpu, Globe, Sliders } from "lucide-react";
import { PageHeader } from "@/components/admin/shared";
import { Card } from "@/components/ui";
import { AIGovernancePanel } from "@/components/admin/security-trust/AIGovernancePanel";
import {
  executeAiEvaluationAction,
  registerModelAction,
  setActionRiskAction,
} from "./actions";

export const metadata: Metadata = {
  title: "AI Governance & Agentic Safety | Zoiko Suite",
  description: "Dynamic LLM output moderation, data residency enforcement, and autonomous action risk tier classification via ai-governance-svc (:8183)",
};

export default function AIGovernancePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Governance & Safety Controls"
        description="Govern autonomous LLM runs, cost allocations, model data residency, and action risk classification under active safety guardrails (:8183)."
      />

      {/* Domain Quick Overview Banner */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-slate-500">Guardrail Engine</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Zero-Trust Evaluated</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Strict PII redaction & output policy checks</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              <Cpu className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-slate-500">Model Providers</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Multi-Model Registry</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Anthropic, OpenAI, AWS Bedrock & Azure</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <Sliders className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-slate-500">Risk Tiering</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">4-Tier Classification</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Enforces human-in-the-loop approvals</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              <Globe className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-slate-500">Data Residency</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">EU & UK Sovereign</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Zero data retention beyond designated VPCs</p>
        </div>
      </div>

      {/* Main AI Governance Panel */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
              <Bot className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                ai-governance-svc Console
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Real-time safety evaluations, token consumption economics, and policy risk registry
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <span className="mr-1.5 h-2 w-2 rounded-full bg-emerald-500" />
              ONLINE :8183
            </span>
          </div>
        </div>

        <AIGovernancePanel />
      </Card>
    </div>
  );
}
