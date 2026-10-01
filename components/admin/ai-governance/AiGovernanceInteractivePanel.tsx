"use client";

import { useState, useEffect, useTransition } from "react";
import {
  executeAiEvaluationAction,
  registerModelAction,
  setActionRiskAction,
  createAutomationPolicyAction,
  resolvePolicyAction,
  proposeAutomationActionAction,
  decideAutomationActionAction,
  type ActionResult,
} from "@/app/admin/ai-governance/actions";
import type { AutomationPolicy, AutomationAction } from "@/lib/api/ai-governance";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui";
import {
  Bot,
  ShieldCheck,
  Plus,
  CheckCircle2,
  AlertCircle,
  Play,
  Cpu,
  Lock,
  UserCheck,
  FileCheck2,
  Scale,
  RefreshCw,
} from "lucide-react";

export type ModelProbeItem = {
  provider: string;
  model: string;
  region: string;
  context: number;
  verified: boolean;
  latency: number | null;
};

export type ActionClassificationItem = {
  action: string;
  tier: string;
  quorum: number;
  humanRequired: boolean;
};

interface AiGovernanceInteractivePanelProps {
  initialModels?: ModelProbeItem[];
  initialActions?: ActionClassificationItem[];
  initialPolicies?: AutomationPolicy[];
  initialAutomationActions?: AutomationAction[];
}

export function AiGovernanceInteractivePanel({
  initialModels = [],
  initialActions = [],
  initialPolicies = [],
  initialAutomationActions = [],
}: AiGovernanceInteractivePanelProps) {
  const [activeTab, setActiveTab] = useState<
    "evaluate" | "allowlist" | "approvals" | "register" | "risk"
  >("evaluate");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [resolutionResult, setResolutionResult] = useState<ActionResult | null>(null);

  const [models, setModels] = useState<ModelProbeItem[]>(initialModels);
  const [actions, setActions] = useState<ActionClassificationItem[]>(initialActions);
  const [policies, setPolicies] = useState<AutomationPolicy[]>(initialPolicies);
  const [automationActions, setAutomationActions] =
    useState<AutomationAction[]>(initialAutomationActions);

  useEffect(() => {
    if (initialModels && initialModels.length > 0) {
      setModels((prev) => {
        const map = new Map<string, ModelProbeItem>();
        for (const m of initialModels) {
          map.set(m.model.toLowerCase(), m);
        }
        for (const m of prev) {
          if (!map.has(m.model.toLowerCase())) {
            map.set(m.model.toLowerCase(), m);
          }
        }
        return Array.from(map.values());
      });
    }
  }, [initialModels]);

  useEffect(() => {
    if (initialActions && initialActions.length > 0) {
      setActions((prev) => {
        const map = new Map<string, ActionClassificationItem>();
        for (const a of initialActions) {
          map.set(a.action.toUpperCase(), a);
        }
        for (const a of prev) {
          if (!map.has(a.action.toUpperCase())) {
            map.set(a.action.toUpperCase(), a);
          }
        }
        return Array.from(map.values());
      });
    }
  }, [initialActions]);

  useEffect(() => {
    if (initialPolicies && initialPolicies.length > 0) {
      setPolicies(initialPolicies);
    }
  }, [initialPolicies]);

  useEffect(() => {
    if (initialAutomationActions && initialAutomationActions.length > 0) {
      setAutomationActions(initialAutomationActions);
    }
  }, [initialAutomationActions]);

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
    const formElement = e.currentTarget;
    const fd = new FormData(formElement);
    const provider = String(fd.get("provider") || "").trim().toLowerCase();
    const model = String(fd.get("model") || "").trim().toLowerCase();
    const region = String(fd.get("dataResidencyRegion") || "eu-west-1").trim();
    const context = Number(fd.get("maxContextTokens") || 128000);

    if (!provider || !model) return;

    const optimisticModel: ModelProbeItem = {
      provider,
      model,
      region,
      context,
      verified: true,
      latency: 45,
    };

    setModels((prev) => {
      const filtered = prev.filter((m) => m.model.toLowerCase() !== model.toLowerCase());
      return [...filtered, optimisticModel];
    });

    startTransition(async () => {
      const res = await registerModelAction(fd);
      setResult(res);
      if (!res.success) {
        setModels((prev) => prev.filter((m) => m.model.toLowerCase() !== model.toLowerCase()));
      }
    });
  };

  const handleRiskSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formElement = e.currentTarget;
    const fd = new FormData(formElement);
    const actionType = String(fd.get("actionType") || "").trim().toUpperCase();
    const riskTier = String(fd.get("riskTier") || "TIER_1_CRITICAL");
    const approvalQuorum = Number(fd.get("approvalQuorum") || 1);
    const requiresHuman = fd.get("requiresHuman") === "on" || fd.get("requiresHuman") === "true";

    if (!actionType) return;

    const optimisticAction: ActionClassificationItem = {
      action: actionType,
      tier: riskTier,
      quorum: approvalQuorum,
      humanRequired: requiresHuman,
    };

    setActions((prev) => {
      const filtered = prev.filter((a) => a.action.toUpperCase() !== actionType.toUpperCase());
      return [...filtered, optimisticAction];
    });

    startTransition(async () => {
      const res = await setActionRiskAction(fd);
      setResult(res);
      if (!res.success) {
        setActions((prev) => prev.filter((a) => a.action.toUpperCase() !== actionType.toUpperCase()));
      }
    });
  };

  const handleCreatePolicySubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formElement = e.currentTarget;
    const fd = new FormData(formElement);
    const role = String(fd.get("role") || "").trim();
    const riskCategory = String(fd.get("riskCategory") || "MONEY").trim();
    const tool = String(fd.get("tool") || "").trim();
    const actionType = String(fd.get("actionType") || "").trim().toUpperCase();
    const requiredApprovals = Number(fd.get("requiredApprovals") || 0);

    if (!role || !tool || !actionType) return;

    const optimisticPolicy: AutomationPolicy = {
      automation_policy_id: `pol-${Date.now().toString(36)}`,
      role,
      risk_category: riskCategory,
      tool,
      action_type: actionType,
      required_approvals: requiredApprovals,
      kill_switch_engaged: false,
      created_at: new Date().toISOString(),
    };

    setPolicies((prev) => [optimisticPolicy, ...prev]);

    startTransition(async () => {
      const res = await createAutomationPolicyAction(fd);
      setResult(res);
      if (!res.success) {
        setPolicies((prev) =>
          prev.filter((p) => p.automation_policy_id !== optimisticPolicy.automation_policy_id)
        );
      }
    });
  };

  const handleResolvePolicySubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await resolvePolicyAction(fd);
      setResolutionResult(res);
    });
  };

  const handleProposeActionSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formElement = e.currentTarget;
    const fd = new FormData(formElement);
    const actionType = String(fd.get("actionType") || "").trim().toUpperCase();
    const role = String(fd.get("role") || "agent-operator").trim();
    const tool = String(fd.get("tool") || "automated-tool").trim();

    if (!actionType) return;

    const optimisticAction: AutomationAction = {
      automation_action_id: `act-${Date.now().toString(36)}`,
      tenant_id: "tenant-active",
      action_type: actionType,
      risk_category: "MONEY",
      idempotency_key: `idem-${Date.now().toString(36)}`,
      preconditions_met: true,
      approval_status: "PENDING",
      postcondition_verified: false,
      status: "PROPOSED",
      proposed_by_principal_id: "principal-proposer-agent",
      created_at: new Date().toISOString(),
    };

    setAutomationActions((prev) => [optimisticAction, ...prev]);

    startTransition(async () => {
      const res = await proposeAutomationActionAction(fd);
      setResult(res);
      if (!res.success) {
        setAutomationActions((prev) =>
          prev.filter((a) => a.automation_action_id !== optimisticAction.automation_action_id)
        );
      }
    });
  };

  const handleDecideActionSubmit = (
    actionId: string,
    decision: "APPROVED" | "REJECTED",
    checkerPrincipalId: string
  ) => {
    const fd = new FormData();
    fd.set("actionId", actionId);
    fd.set("decision", decision);
    fd.set("checkerPrincipalId", checkerPrincipalId);
    fd.set("reason", `Decision via AI Governance Operator Console`);

    startTransition(async () => {
      const res = await decideAutomationActionAction(fd);
      setResult(res);
      if (res.success) {
        setAutomationActions((prev) =>
          prev.map((a) =>
            a.automation_action_id === actionId
              ? {
                  ...a,
                  approval_status: decision,
                  status: decision === "APPROVED" ? "APPROVED" : "REJECTED",
                  approved_by_principal_id: checkerPrincipalId,
                }
              : a
          )
        );
      }
    });
  };

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <CardHeader className="border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                Interactive AI Governance & Guardrail Controls
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Trigger live evaluations, manage autonomous allowlists, and enforce Maker-Checker SoD approvals.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              <button
                onClick={() => {
                  setActiveTab("evaluate");
                  setResult(null);
                }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === "evaluate"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                Run Evaluation
              </button>
              <button
                onClick={() => {
                  setActiveTab("allowlist");
                  setResult(null);
                }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === "allowlist"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                Autonomous Allowlist
              </button>
              <button
                onClick={() => {
                  setActiveTab("approvals");
                  setResult(null);
                }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === "approvals"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                Maker-Checker SoD
              </button>
              <button
                onClick={() => {
                  setActiveTab("register");
                  setResult(null);
                }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === "register"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                Register Model
              </button>
              <button
                onClick={() => {
                  setActiveTab("risk");
                  setResult(null);
                }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === "risk"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                Risk Taxonomy
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          {/* Status Notification Banner */}
          {result && (
            <div
              className={`mb-6 flex items-start gap-3 rounded-lg border p-4 text-xs ${
                result.success
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200"
                  : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
              }`}
            >
              {result.success ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-semibold">
                  {result.success ? "Operation Succeeded" : "Action Blocked by Gate"}
                </div>
                <div className="leading-relaxed">
                  {result.success ? result.message : result.error}
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: RUN EVALUATION */}
          {activeTab === "evaluate" && (
            <form onSubmit={handleEvaluateSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Vetted Model Target
                  </label>
                  <select
                    name="modelName"
                    defaultValue="claude-3-7-sonnet"
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {models.map((m) => (
                      <option key={m.model} value={m.model}>
                        {m.model} ({m.provider} - {m.region})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Model Provider
                  </label>
                  <select
                    name="modelProvider"
                    defaultValue="anthropic"
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="anthropic">Anthropic (eu-west-1 Sovereign)</option>
                    <option value="openai">OpenAI (us-east-1 Enterprise)</option>
                    <option value="google">Google Cloud (europe-west4)</option>
                    <option value="meta">Meta Llama (Private On-Premise VPC)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Business Purpose & Guardrail Scope
                </label>
                <input
                  type="text"
                  name="purpose"
                  defaultValue="PO invoice variance checking and autonomous compliance summary"
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Simulated Prompt Tokens
                  </label>
                  <input
                    type="number"
                    name="promptTokens"
                    defaultValue={1850}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Simulated Completion Tokens
                  </label>
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
                {isPending ? "Executing Evaluation Gate..." : "Execute Governed Evaluation"}
              </button>
            </form>
          )}

          {/* TAB 2: AUTONOMOUS ALLOWLIST */}
          {activeTab === "allowlist" && (
            <div className="space-y-6">
              <form onSubmit={handleCreatePolicySubmit} className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <FileCheck2 className="h-4 w-4 text-indigo-500" />
                  Define Fail-Closed Autonomous Policy (doc7 §G7)
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Agent Role
                    </label>
                    <input
                      type="text"
                      name="role"
                      placeholder="e.g. finance-agent"
                      defaultValue="billing-agent"
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Risk Category (§G2)
                    </label>
                    <select
                      name="riskCategory"
                      defaultValue="MONEY"
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="MONEY">MONEY (Financial Transfer/Refund)</option>
                      <option value="CONTRACTUAL_COMMITMENT">CONTRACTUAL_COMMITMENT</option>
                      <option value="EMPLOYMENT">EMPLOYMENT (HR & Payroll)</option>
                      <option value="TAX_FILING">TAX_FILING (Statutory Returns)</option>
                      <option value="ACCESS_SECURITY">ACCESS_SECURITY</option>
                      <option value="NONE">NONE (Low-Risk)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Authorized Tool
                    </label>
                    <input
                      type="text"
                      name="tool"
                      placeholder="e.g. stripe-refund-tool"
                      defaultValue="stripe-refund-tool"
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Action Type
                    </label>
                    <input
                      type="text"
                      name="actionType"
                      placeholder="e.g. SEND_REFUND"
                      defaultValue="SEND_REFUND"
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono uppercase text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Max Monetary Scope Limit ($)
                    </label>
                    <input
                      type="number"
                      name="maxScopeAmount"
                      placeholder="e.g. 5000"
                      defaultValue={1000}
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Required Human Approvals (Quorum)
                    </label>
                    <input
                      type="number"
                      name="requiredApprovals"
                      min={0}
                      max={3}
                      defaultValue={1}
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div className="flex items-center pt-6">
                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        name="dryRunRequired"
                        defaultChecked
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      Require Dry-Run / Preview First
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {isPending ? "Creating Allowlist Policy..." : "Create Allowlist Policy"}
                </button>
              </form>

              {/* Live Policy Resolution Query Tool */}
              <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
                <form onSubmit={handleResolvePolicySubmit} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      <RefreshCw className="h-4 w-4 text-emerald-500" />
                      Live Pre-Execution Resolution Check (GET /v1/automation-policies/resolve)
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        Query Role
                      </label>
                      <input
                        type="text"
                        name="role"
                        defaultValue="billing-agent"
                        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        Query Risk Category
                      </label>
                      <input
                        type="text"
                        name="riskCategory"
                        defaultValue="MONEY"
                        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        Query Tool
                      </label>
                      <input
                        type="text"
                        name="tool"
                        defaultValue="stripe-refund-tool"
                        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        Query Action Type
                      </label>
                      <input
                        type="text"
                        name="actionType"
                        defaultValue="SEND_REFUND"
                        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono uppercase text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Query Allowlist Resolution
                  </button>
                  {resolutionResult && (
                    <div
                      className={`mt-2 rounded-md p-3 text-xs font-mono ${
                        resolutionResult.success
                          ? "bg-emerald-50 text-emerald-900 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                          : "bg-rose-50 text-rose-900 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
                      }`}
                    >
                      {resolutionResult.success
                        ? resolutionResult.message
                        : resolutionResult.error}
                    </div>
                  )}
                </form>
              </div>
            </div>
          )}

          {/* TAB 3: MAKER-CHECKER SOD APPROVALS */}
          {activeTab === "approvals" && (
            <div className="space-y-6">
              {/* Proposal Form */}
              <form onSubmit={handleProposeActionSubmit} className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <Scale className="h-4 w-4 text-indigo-500" />
                  Propose Autonomous Agent Action (doc7 §G2, §G7)
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Action Type
                    </label>
                    <input
                      type="text"
                      name="actionType"
                      placeholder="e.g. INVOICE_AUTONOMOUS_PAYMENT"
                      defaultValue="INVOICE_AUTONOMOUS_PAYMENT"
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono uppercase text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Agent Role
                    </label>
                    <input
                      type="text"
                      name="role"
                      defaultValue="billing-agent"
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Tool Invocation
                    </label>
                    <input
                      type="text"
                      name="tool"
                      defaultValue="payment-gateway-tool"
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Rollback / Compensation Plan
                  </label>
                  <input
                    type="text"
                    name="rollbackPlan"
                    defaultValue="Automatic webhook cancellation with compensatory ledger reversal within 120s"
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  <Play className="h-3.5 w-3.5" />
                  {isPending ? "Proposing Action..." : "Propose Action"}
                </button>
              </form>

              {/* Pending Decisions List with Maker-Checker Persona Selector */}
              <div className="border-t border-slate-100 pt-6 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <UserCheck className="h-4 w-4 text-amber-500" />
                    Maker-Checker Decisions (Enforces decider != proposer)
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {automationActions.length} Total Actions Recorded
                  </span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                  {automationActions.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      No automation actions recorded yet. Propose an action above to test the dual-authorization gate.
                    </div>
                  ) : (
                    automationActions.map((act) => {
                      const isPendingDecision =
                        act.status === "PROPOSED" || act.approval_status === "PENDING";
                      return (
                        <div
                          key={act.automation_action_id}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                                {act.action_type}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                  act.approval_status === "APPROVED"
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                    : act.approval_status === "REJECTED"
                                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                }`}
                              >
                                {act.approval_status}
                              </span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {act.status}
                              </span>
                            </div>
                            <div className="text-slate-500 text-[11px]">
                              Proposer:{" "}
                              <code className="font-mono font-medium text-slate-700 dark:text-slate-300">
                                {act.proposed_by_principal_id}
                              </code>
                              {act.approved_by_principal_id && (
                                <>
                                  {" "}
                                  • Decider:{" "}
                                  <code className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                                    {act.approved_by_principal_id}
                                  </code>
                                </>
                              )}
                              {" "}• ID: <span className="font-mono">{act.automation_action_id}</span>
                            </div>
                          </div>

                          {isPendingDecision && (
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() =>
                                  handleDecideActionSubmit(
                                    act.automation_action_id,
                                    "APPROVED",
                                    "safety-officer-persona-02"
                                  )
                                }
                                className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                                title="Approve with an independent safety officer persona (passes SoD)"
                              >
                                Approve (Safety Officer)
                              </button>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() =>
                                  handleDecideActionSubmit(
                                    act.automation_action_id,
                                    "REJECTED",
                                    "safety-officer-persona-02"
                                  )
                                }
                                className="rounded bg-rose-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-rose-700 transition-colors disabled:opacity-50"
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() =>
                                  handleDecideActionSubmit(
                                    act.automation_action_id,
                                    "APPROVED",
                                    act.proposed_by_principal_id
                                  )
                                }
                                className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300 transition-colors disabled:opacity-50"
                                title="Test live that proposing principal cannot approve own action (returns 403 Forbidden)"
                              >
                                Test Self-Approval (Assert 403)
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: REGISTER MODEL */}
          {activeTab === "register" && (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Model Provider Name
                  </label>
                  <input
                    type="text"
                    name="provider"
                    placeholder="e.g. mistral"
                    defaultValue="mistral"
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Model Identifier
                  </label>
                  <input
                    type="text"
                    name="model"
                    placeholder="e.g. mistral-large-2407"
                    defaultValue="mistral-large-2407"
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Data Residency Region
                  </label>
                  <select
                    name="dataResidencyRegion"
                    defaultValue="eu-west-1"
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="eu-west-1">EU West 1 (Ireland Sovereign Cloud)</option>
                    <option value="europe-west4">EU West 4 (Eemshaven Sovereign Cloud)</option>
                    <option value="us-east-1">US East 1 (Virginia Enterprise Cloud)</option>
                    <option value="local-private-cloud">Local Private On-Premise VPC</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Max Context Tokens
                  </label>
                  <input
                    type="number"
                    name="maxContextTokens"
                    defaultValue={128000}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {isPending ? "Registering Model..." : "Register Model Provider"}
              </button>
            </form>
          )}

          {/* TAB 5: RISK TAXONOMY */}
          {activeTab === "risk" && (
            <form onSubmit={handleRiskSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Governed Action Type
                  </label>
                  <input
                    type="text"
                    name="actionType"
                    placeholder="e.g. TREASURY_LIQUIDITY_SWEEP"
                    defaultValue="TREASURY_LIQUIDITY_SWEEP"
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono uppercase text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Risk Classification Tier
                  </label>
                  <select
                    name="riskTier"
                    defaultValue="TIER_1_CRITICAL"
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="TIER_1_CRITICAL">Tier 1: Critical (Disbursements, Tax, Legal)</option>
                    <option value="TIER_2_HIGH">Tier 2: High (Contract revisions, Org changes)</option>
                    <option value="TIER_3_MEDIUM">Tier 3: Medium (Employee workflows, Internal logs)</option>
                    <option value="TIER_4_LOW">Tier 4: Low (Telemetry extraction, Draft summaries)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Approval Quorum Required
                  </label>
                  <input
                    type="number"
                    name="approvalQuorum"
                    defaultValue={2}
                    min={1}
                    max={4}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
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
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Policy Rationale & Notes
                </label>
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

      {/* Dynamic 4-Way Workbench Summary Grids */}
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
              {models.length} Models
            </span>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {models.map((m) => (
                <div key={m.model} className="flex items-center justify-between py-3 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      {m.model}
                      {m.verified && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      {m.provider} • Region: <span className="font-mono">{m.region}</span> • Max{" "}
                      <span suppressHydrationWarning>
                        {m.context.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                      </span>{" "}
                      tokens
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.latency && (
                      <span className="text-[10px] text-slate-400 font-mono">{m.latency}ms</span>
                    )}
                    <span className="rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-mono font-medium">
                      ONLINE
                    </span>
                  </div>
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
              {actions.length} Actions
            </span>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {actions.map((r) => (
                <div key={r.action} className="flex items-center justify-between py-2.5 text-xs">
                  <div>
                    <div className="font-mono font-medium text-slate-900 dark:text-slate-100 text-[11px]">
                      {r.action}
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      Quorum: {r.quorum} approver(s) • Human required:{" "}
                      {r.humanRequired ? "Yes" : "No"}
                    </div>
                  </div>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      r.tier.startsWith("TIER_1") || r.tier === "MONEY" || r.tier === "TAX_FILING"
                        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                        : r.tier.startsWith("TIER_2") || r.tier === "CONTRACTUAL_COMMITMENT"
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

        {/* Autonomous Policy Allowlist */}
        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <FileCheck2 className="h-4 w-4 text-indigo-500" />
                Autonomous Policy Allowlists
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                doc7 §G7 fail-closed allowlists per role, tool, and action
              </CardDescription>
            </div>
            <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
              {policies.length} Policies
            </span>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {policies.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-500">
                  No allowlist policies defined. Actions fail-closed by default.
                </div>
              ) : (
                policies.map((p) => (
                  <div
                    key={p.automation_policy_id || `${p.role}-${p.tool}-${p.action_type}`}
                    className="flex items-center justify-between py-2.5 text-xs"
                  >
                    <div>
                      <div className="font-mono font-medium text-slate-900 dark:text-slate-100 text-[11px]">
                        {p.action_type}
                      </div>
                      <div className="text-slate-500 text-[11px]">
                        Role: <span className="font-semibold">{p.role}</span> • Tool:{" "}
                        <span className="font-semibold">{p.tool}</span> • Approvals:{" "}
                        {p.required_approvals ?? 0}
                      </div>
                    </div>
                    <span className="rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 px-1.5 py-0.5 text-[10px] font-semibold">
                      {p.risk_category}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Action Audit Trail & Approvals */}
        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <Scale className="h-4 w-4 text-emerald-500" />
                Action Audit Trail & SoD
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Immutable action lifecycle with dual-key verification
              </CardDescription>
            </div>
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              {automationActions.length} Actions
            </span>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {automationActions.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-500">
                  No autonomous actions executed yet.
                </div>
              ) : (
                automationActions.slice(0, 5).map((a) => (
                  <div key={a.automation_action_id} className="py-2.5 text-xs space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium text-slate-900 dark:text-slate-100 text-[11px]">
                        {a.action_type}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                          a.approval_status === "APPROVED"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : a.approval_status === "REJECTED"
                            ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        }`}
                      >
                        {a.approval_status}
                      </span>
                    </div>
                    <div className="text-slate-500 text-[10px] truncate">
                      By: {a.proposed_by_principal_id}{" "}
                      {a.approved_by_principal_id && `• Decided by: ${a.approved_by_principal_id}`}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
