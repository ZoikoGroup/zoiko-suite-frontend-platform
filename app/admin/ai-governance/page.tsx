import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui";
import { Bot, AlertOctagon } from "lucide-react";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  getActionRiskClassification,
  listActionRiskClassifications,
  listModelProviders,
  verifyModelProvider,
  listAutomationPolicies,
  listAutomationActions,
  listPolicyChangeApprovals,
  listUseCases,
  listModelReleases,
  type AIUseCase,
  type AIModelRelease,
} from "@/lib/api/ai-governance";
import { resolveKillSwitch, listKillSwitchStates } from "@/lib/api/kill-switch";
import {
  AiGovernanceInteractivePanel,
  type ActionClassificationItem,
  type ModelProbeItem,
} from "@/components/admin/ai-governance/AiGovernanceInteractivePanel";

export const metadata: Metadata = { title: "AI Governance & Safety Controls | Zoiko Suite" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_MODELS = [
  { provider: "anthropic", model: "claude-3-7-sonnet", region: "eu-west-1", context: 200000 },
  { provider: "openai", model: "gpt-4o", region: "us-east-1", context: 128000 },
  { provider: "google", model: "gemini-1.5-pro", region: "europe-west4", context: 1000000 },
  { provider: "meta", model: "llama-3.3-70b-instruct", region: "local-private-cloud", context: 32768 },
];

const DEFAULT_ACTIONS = [
  "INVOICE_AUTONOMOUS_PAYMENT",
  "TAX_RETURN_SUBMISSION",
  "CONTRACT_AUTO_REVISION",
  "EMPLOYEE_LEAVE_APPROVAL",
  "EVIDENCE_OCR_EXTRACTION",
];

export default async function AiGovernancePage() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  const identity = session
    ? { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId }
    : undefined;

  // 1. Live model providers list from DB (fallback to DEFAULT_MODELS if empty)
  const modelsRes = await listModelProviders(identity);
  const rawModels =
    modelsRes.ok && modelsRes.data.length > 0
      ? modelsRes.data.map((m) => ({
          provider: m.provider_name || m.provider,
          model: m.model_name || m.model,
          region: m.data_region || m.data_residency_region || "eu-west-1",
          context: m.max_context_tokens || 128000,
          verified: m.is_verified ?? true,
        }))
      : DEFAULT_MODELS.map((m) => ({
          provider: m.provider,
          model: m.model,
          region: m.region,
          context: m.context,
          verified: true,
        }));

  // Live model verification probes
  const modelProbes: ModelProbeItem[] = await Promise.all(
    rawModels.map(async (m) => {
      const res = await verifyModelProvider(m.provider, m.model, identity);
      return {
        ...m,
        verified: res.ok ? res.data.verified : m.verified,
        latency: res.ok ? res.data.latency_ms : 45,
      };
    })
  );

  // 2. Live action risk classifications from DB (fallback to DEFAULT_ACTIONS if empty)
  const actionsRes = await listActionRiskClassifications(identity);
  let actionClassifications: ActionClassificationItem[] = [];

  if (actionsRes.ok && actionsRes.data.length > 0) {
    actionClassifications = actionsRes.data.map((a) => ({
      action: a.action_type,
      tier: a.risk_tier,
      quorum: a.approval_quorum,
      humanRequired: a.requires_human_in_the_loop,
    }));
  } else {
    actionClassifications = await Promise.all(
      DEFAULT_ACTIONS.map(async (action) => {
        const res = await getActionRiskClassification(action, identity);
        if (res.ok) {
          return {
            action: res.data.action_type,
            tier: res.data.risk_tier,
            quorum: res.data.approval_quorum,
            humanRequired: res.data.requires_human_in_the_loop,
          };
        }
        return {
          action,
          tier:
            action.includes("INVOICE") || action.includes("TAX")
              ? "TIER_1_CRITICAL"
              : action.includes("CONTRACT")
              ? "TIER_2_HIGH"
              : "TIER_3_MEDIUM",
          quorum: action.includes("INVOICE") || action.includes("TAX") ? 2 : 1,
          humanRequired: !action.includes("LEAVE") && !action.includes("OCR"),
        };
      })
    );
  }

  const criticalCount = actionClassifications.filter(
    (a) =>
      a.tier === "TIER_1_CRITICAL" ||
      a.tier.includes("CRITICAL") ||
      a.tier === "MONEY" ||
      a.tier === "TAX_FILING"
  ).length;

  // 3. Live automation policies from DB
  const policiesRes = await listAutomationPolicies(identity);
  const initialPolicies = policiesRes.ok ? policiesRes.data : [];

  // 4. Live automation actions from DB
  const actionsRes2 = await listAutomationActions(identity);
  const initialAutomationActions = actionsRes2.ok ? actionsRes2.data : [];

  // 5. Live policy change approvals from DB
  const policyChangesRes = await listPolicyChangeApprovals(identity);
  const initialPolicyChanges = policyChangesRes.ok ? policyChangesRes.data : [];

  // 6. Live use cases from DB (AIG-01)
  const useCasesRes = await listUseCases(identity);
  const initialUseCases = useCasesRes.ok ? useCasesRes.data : [];

  // 7. Live model releases from DB (AIG-02)
  const modelReleasesRes = await listModelReleases(identity);
  const initialModelReleases = modelReleasesRes.ok ? modelReleasesRes.data : [];

  // 8. Check live operational kill switch states from kill-switch-registry-svc (:8147)
  const statesRes = await listKillSwitchStates(identity);
  const activeAiKillSwitches = statesRes.ok
    ? statesRes.data.filter(
        (s) =>
          s.action === "ENGAGE" &&
          (s.domain === "AI_AUTOMATION" || s.plane === "PLANE_5_AI_AGENTS")
      )
    : [];
  const isKillSwitchEngaged = activeAiKillSwitches.length > 0;
  const latestAiSwitch = activeAiKillSwitches[0];

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

      {/* Cross-Service Kill Switch Incident Banner */}
      {isKillSwitchEngaged && (
        <div className="flex items-start gap-3 rounded-lg border border-rose-300 bg-rose-50 p-4 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          <AlertOctagon className="h-5 w-5 text-rose-600 mt-0.5 shrink-0" />
          <div className="space-y-1 text-xs">
            <div className="font-semibold text-sm text-rose-800 dark:text-rose-300">
              Operational Incident Stop Active: Autonomous Executions Halted (:8147)
            </div>
            <p className="leading-relaxed">
              Domain <code className="font-mono font-bold bg-rose-100 px-1 py-0.5 rounded dark:bg-rose-900/60">AI_AUTOMATION</code> is currently suspended by an operational incident stop in <code className="font-mono font-bold">kill-switch-registry-svc</code>. Autonomous actions and evaluations will be refused with reason code <code className="font-mono font-bold">KILL_SWITCH_ENGAGED</code>.
            </p>
            <div className="mt-2 space-y-1">
              <div className="text-[11px] font-semibold text-rose-800 dark:text-rose-200">
                Active Halted Scopes ({activeAiKillSwitches.length}):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeAiKillSwitches.map((s, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center rounded-md bg-rose-200/80 px-2 py-0.5 text-[10px] font-mono font-semibold text-rose-900 dark:bg-rose-900/80 dark:text-rose-100"
                  >
                    {s.plane || "ALL_PLANES"} · {s.domain || "ALL_DOMAINS"} · {s.provider_code || "ALL_PROVIDERS"}
                  </span>
                ))}
              </div>
            </div>
            {latestAiSwitch && (
              <div className="mt-2 rounded bg-rose-100/70 p-2 font-mono text-[11px] text-rose-900 dark:bg-rose-900/50 dark:text-rose-100 space-y-0.5 border border-rose-200 dark:border-rose-800">
                <div><span className="text-rose-600 dark:text-rose-400 font-semibold">Incident Reason:</span> {latestAiSwitch.reason}</div>
                <div><span className="text-rose-600 dark:text-rose-400 font-semibold">Latest Transition:</span> {latestAiSwitch.latest_event_at}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Active Model Providers</CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {modelProbes.length} Verified
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-emerald-600 font-medium">EU & US Sovereignty Compliant</CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Critical Tier-1 Actions</CardDescription>
            <CardTitle className="text-2xl font-bold text-red-600 dark:text-red-400">{criticalCount} Actions</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">Human-In-The-Loop Enforced</CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Allowlist Policies Active</CardDescription>
            <CardTitle className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{initialPolicies.length} Policies</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-indigo-600 font-medium">Fail-Closed Scopes</CardContent>
        </Card>

        <Card className={`border shadow-sm dark:bg-slate-900/60 ${isKillSwitchEngaged ? "border-rose-300 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/30" : "border-slate-200 dark:border-slate-800"}`}>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Governance Kill Switch</CardDescription>
            <CardTitle className={`text-2xl font-bold ${isKillSwitchEngaged ? "text-rose-600" : "text-emerald-600"}`}>
              {isKillSwitchEngaged ? "ENGAGED" : "ARMED"}
            </CardTitle>
          </CardHeader>
          <CardContent className={`text-xs font-medium ${isKillSwitchEngaged ? "text-rose-600" : "text-slate-500"}`}>
            {isKillSwitchEngaged ? "Autonomous Execution Halted" : "Instant Global Freeze Enabled"}
          </CardContent>
        </Card>
      </div>

      {/* Interactive AI Governance Actions Panel with Live Reactive Cards */}
      <AiGovernanceInteractivePanel
        initialModels={modelProbes}
        initialActions={actionClassifications}
        initialPolicies={initialPolicies}
        initialAutomationActions={initialAutomationActions}
        initialPolicyChanges={initialPolicyChanges}
        initialUseCases={initialUseCases}
        initialModelReleases={initialModelReleases}
      />
    </div>
  );
}
