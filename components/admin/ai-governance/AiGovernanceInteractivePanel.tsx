"use client";

import { useState, useTransition } from "react";
import {
  executeAiEvaluationAction,
  registerModelAction,
  setActionRiskAction,
  type ActionResult,
} from "@/app/admin/ai-governance/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui";
import { Bot, ShieldCheck, Plus, CheckCircle2, AlertCircle, Play } from "lucide-react";

export function AiGovernanceInteractivePanel() {
  const [activeTab, setActiveTab] = useState<"evaluate" | "register" | "risk">("evaluate");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const handleEvaluateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await executeAiEvaluationAction(fd);
      setResult(res);
    });
  };

  const handleRegisterSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await registerModelAction(fd);
      setResult(res);
    });
  };

  const handleRiskSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await setActionRiskAction(fd);
      setResult(res);
    });
  };

  return (
    <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
      <CardHeader className="border-b border-slate-100 pb-4 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              Interactive AI Governance & Guardrail Controls
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Trigger live evaluations, register vetted LLMs, and adjust autonomous execution policies.
            </CardDescription>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              onClick={() => { setActiveTab("evaluate"); setResult(null); }}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === "evaluate"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Evaluate AI Run
            </button>
            <button
              onClick={() => { setActiveTab("register"); setResult(null); }}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === "register"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Register LLM
            </button>
            <button
              onClick={() => { setActiveTab("risk"); setResult(null); }}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === "risk"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Risk & Quorum
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        {result && (
          <div
            className={`mb-4 flex items-start gap-2.5 rounded-lg p-3 text-xs ${
              result.success
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
            }`}
          >
            {result.success ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            )}
            <div>
              <p className="font-semibold">{result.success ? "Action Completed" : "Operation Failed"}</p>
              <p className="mt-0.5">{result.success ? result.message : result.error}</p>
              {result.success && result.data ? (
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-slate-900/10 p-2 font-mono text-[11px] text-slate-800 dark:bg-slate-950 dark:text-slate-200">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              ) : null}
            </div>
          </div>
        )}

        {/* Tab 1: Evaluate AI Run */}
        {activeTab === "evaluate" && (
          <form onSubmit={handleEvaluateSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Model Provider</label>
                <select
                  name="modelProvider"
                  defaultValue="anthropic"
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI (GPT-4o)</option>
                  <option value="google">Google (Gemini Pro)</option>
                  <option value="meta">Meta (Llama 3.3)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Model Identifier</label>
                <input
                  type="text"
                  name="modelName"
                  defaultValue="claude-3-7-sonnet"
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Governed Purpose / Task Description</label>
              <input
                type="text"
                name="purpose"
                defaultValue="Automated PO invoice variance checking and compliance summary"
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Prompt Tokens</label>
                <input
                  type="number"
                  name="promptTokens"
                  defaultValue={1850}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Completion Tokens</label>
                <input
                  type="number"
                  name="completionTokens"
                  defaultValue={420}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <Play className="h-3.5 w-3.5" />
              {isPending ? "Executing Evaluation..." : "Execute & Audit AI Run"}
            </button>
          </form>
        )}

        {/* Tab 2: Register LLM */}
        {activeTab === "register" && (
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Provider</label>
                <input
                  type="text"
                  name="provider"
                  placeholder="e.g. mistral, cohere, custom"
                  defaultValue="mistral"
                  required
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Model Name</label>
                <input
                  type="text"
                  name="model"
                  placeholder="e.g. mistral-large-2411"
                  defaultValue="mistral-large-2411"
                  required
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Max Context Window (Tokens)</label>
                <input
                  type="number"
                  name="maxContextTokens"
                  defaultValue={128000}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Data Residency Region</label>
                <select
                  name="dataResidencyRegion"
                  defaultValue="eu-west-1"
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="eu-west-1">EU (Ireland) - eu-west-1</option>
                  <option value="eu-central-1">EU (Frankfurt) - eu-central-1</option>
                  <option value="us-east-1">US East (N. Virginia) - us-east-1</option>
                  <option value="local-private">On-Premises Dedicated Enclave</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {isPending ? "Registering..." : "Register Model Provider"}
            </button>
          </form>
        )}

        {/* Tab 3: Risk & Quorum */}
        {activeTab === "risk" && (
          <form onSubmit={handleRiskSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Action Type</label>
                <input
                  type="text"
                  name="actionType"
                  placeholder="e.g. TREASURY_WIRE_TRANSFER"
                  defaultValue="TREASURY_WIRE_TRANSFER"
                  required
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Risk Tier</label>
                <select
                  name="riskTier"
                  defaultValue="TIER_1_CRITICAL"
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="TIER_1_CRITICAL">TIER 1 - CRITICAL (Statutory / High Value)</option>
                  <option value="TIER_2_HIGH">TIER 2 - HIGH (Operational / Medium Value)</option>
                  <option value="TIER_3_MEDIUM">TIER 3 - MEDIUM (Standard Workflow)</option>
                  <option value="TIER_4_LOW">TIER 4 - LOW (Informational / Read Only)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Approval Quorum Count</label>
                <input
                  type="number"
                  name="approvalQuorum"
                  defaultValue={2}
                  min={1}
                  max={5}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    name="requiresHuman"
                    defaultChecked
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Require Human-in-the-loop (No full autonomy)
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Policy Rationale & Notes</label>
              <input
                type="text"
                name="description"
                defaultValue="Mandatory dual-key approval for outgoing disbursements over threshold"
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <Bot className="h-3.5 w-3.5" />
              {isPending ? "Updating Policy..." : "Save Risk Classification"}
            </button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
