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
  proposePolicyChangeAction,
  decidePolicyChangeAction,
  // AIG-01
  createUseCaseAction,
  startAssessmentAction,
  decideAssessmentAction,
  activateUseCaseAction,
  suspendUseCaseAction,
  requestReassessmentAction,
  retireUseCaseAction,
  getEffectiveUseCaseControlAction,
  // AIG-02
  registerModelReleaseAction,
  recordDueDiligenceAction,
  recordEvaluationAction,
  approveReleaseAction,
  rejectReleaseAction,
  blockReleaseAction,
  activateReleaseAction,
  restrictReleaseAction,
  unrestrictReleaseAction,
  quarantineReleaseAction,
  retireReleaseAction,
  createGovernedExecutionAction,
  createAIIncidentAction,
  createOutputDispositionAction,
  decideOutputDispositionAction,
  type ActionResult,
} from "@/app/admin/ai-governance/actions";
import type {
  AutomationPolicy,
  AutomationAction,
  PolicyChangeApproval,
  AIUseCase,
  AIImpactAssessment,
  EffectiveUseCaseControl,
  AIModelRelease,
  AIExecution,
  AIIncident,
  AIOutputDisposition,
} from "@/lib/api/ai-governance";
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
  XCircle,
  FileText,
  ClipboardList,
  Layers,
  AlertOctagon,
  Shield,
  Archive,
  RotateCcw,
  Unlock,
  Zap,
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

export type UseCaseItem = AIUseCase;

export type ModelReleaseItem = AIModelRelease;

interface AiGovernanceInteractivePanelProps {
  initialModels?: ModelProbeItem[];
  initialActions?: ActionClassificationItem[];
  initialPolicies?: AutomationPolicy[];
  initialAutomationActions?: AutomationAction[];
  initialPolicyChanges?: PolicyChangeApproval[];
  initialUseCases?: UseCaseItem[];
  initialModelReleases?: ModelReleaseItem[];
}

export function AiGovernanceInteractivePanel({
  initialModels = [],
  initialActions = [],
  initialPolicies = [],
  initialAutomationActions = [],
  initialPolicyChanges = [],
  initialUseCases = [],
  initialModelReleases = [],
}: AiGovernanceInteractivePanelProps) {
  const [activeTab, setActiveTab] = useState<
    "evaluate" | "allowlist" | "approvals" | "policy-changes" | "register" | "risk" | "use-cases" | "model-releases" | "executions" | "incidents" | "dispositions"
  >("evaluate");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [resolutionResult, setResolutionResult] = useState<ActionResult | null>(null);

  const [models, setModels] = useState<ModelProbeItem[]>(initialModels);
  const [actions, setActions] = useState<ActionClassificationItem[]>(initialActions);
  const [policies, setPolicies] = useState<AutomationPolicy[]>(initialPolicies);
  const [automationActions, setAutomationActions] =
    useState<AutomationAction[]>(initialAutomationActions);
  const [policyChanges, setPolicyChanges] =
    useState<PolicyChangeApproval[]>(initialPolicyChanges);
  const [useCases, setUseCases] = useState<UseCaseItem[]>(initialUseCases);
  const [modelReleases, setModelReleases] = useState<ModelReleaseItem[]>(initialModelReleases);
  const [executions, setExecutions] = useState<AIExecution[]>([]);
  const [executionKey, setExecutionKey] = useState("");
  const [incidents, setIncidents] = useState<AIIncident[]>([]);
  const [incidentKey, setIncidentKey] = useState("");
  const [dispositions, setDispositions] = useState<AIOutputDisposition[]>([]);
  const [dispositionKey, setDispositionKey] = useState("");

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

  useEffect(() => {
    if (initialPolicyChanges && initialPolicyChanges.length > 0) {
      setPolicyChanges(initialPolicyChanges);
    }
  }, [initialPolicyChanges]);

  useEffect(() => {
    if (initialUseCases && initialUseCases.length > 0) {
      setUseCases((prev) => {
        const map = new Map<string, UseCaseItem>();
        for (const u of initialUseCases) {
          map.set(u.use_case_id, u);
        }
        for (const u of prev) {
          if (!map.has(u.use_case_id)) {
            map.set(u.use_case_id, u);
          }
        }
        return Array.from(map.values());
      });
    }
  }, [initialUseCases]);

  useEffect(() => {
    if (initialModelReleases && initialModelReleases.length > 0) {
      setModelReleases((prev) => {
        const map = new Map<string, ModelReleaseItem>();
        for (const m of initialModelReleases) {
          map.set(m.model_release_id, m);
        }
        for (const m of prev) {
          if (!map.has(m.model_release_id)) {
            map.set(m.model_release_id, m);
          }
        }
        return Array.from(map.values());
      });
    }
  }, [initialModelReleases]);

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
    const riskCategory = String(fd.get("riskCategory") || fd.get("riskTier") || "MONEY").trim();
    const approvalQuorum = Number(fd.get("approvalQuorum") || 1);
    const requiresHuman = fd.get("requiresHuman") === "on" || fd.get("requiresHuman") === "true";

    if (!actionType) return;

    const optimisticAction: ActionClassificationItem = {
      action: actionType,
      tier: riskCategory,
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
    decision: "APPROVED" | "REJECTED"
  ) => {
    const fd = new FormData();
    fd.set("actionId", actionId);
    fd.set("decision", decision);
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
                }
              : a
          )
        );
      }
    });
  };

  const handleProposePolicyChangeSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formElement = e.currentTarget;
    const fd = new FormData(formElement);
    const targetPolicyRef = String(fd.get("targetPolicyRef") || "").trim();
    const proposedChange = String(fd.get("proposedChange") || "").trim();

    if (!targetPolicyRef || !proposedChange) return;

    const optimisticApproval: PolicyChangeApproval = {
      policy_change_approval_id: `pca-${Date.now().toString(36)}`,
      target_policy_ref: targetPolicyRef,
      proposed_change: proposedChange,
      proposed_by_principal_id: "operator-proposer",
      decision: "PENDING",
      created_at: new Date().toISOString(),
    };

    setPolicyChanges((prev) => [optimisticApproval, ...prev]);

    startTransition(async () => {
      const res = await proposePolicyChangeAction(fd);
      setResult(res);
      if (!res.success) {
        setPolicyChanges((prev) =>
          prev.filter((p) => p.policy_change_approval_id !== optimisticApproval.policy_change_approval_id)
        );
      } else if (res.data) {
        setPolicyChanges((prev) => [
          res.data,
          ...prev.filter((p) => p.policy_change_approval_id !== optimisticApproval.policy_change_approval_id),
        ]);
      }
    });
  };

  const handleDecidePolicyChangeSubmit = (
    approvalId: string,
    decision: "APPROVED" | "REJECTED",
    reason: string
  ) => {
    const fd = new FormData();
    fd.set("approvalId", approvalId);
    fd.set("decision", decision);
    fd.set("reason", reason || `Policy change decided as ${decision}`);

    startTransition(async () => {
      const res = await decidePolicyChangeAction(fd);
      setResult(res);
      if (res.success && res.data) {
        setPolicyChanges((prev) =>
          prev.map((p) =>
            p.policy_change_approval_id === approvalId
              ? res.data
              : p
          )
        );
      }
    });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // AIG-01: AI Use-Case Registry Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const handleCreateUseCaseSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await createUseCaseAction(new FormData(e.currentTarget));
      setResult(res);
    });
  };

  const handleStartAssessmentSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await startAssessmentAction(new FormData(e.currentTarget));
      setResult(res);
    });
  };

  const handleDecideAssessmentSubmit = (
    assessmentId: string,
    decision: "APPROVED" | "REJECTED",
    reason: string
  ) => {
    const fd = new FormData();
    fd.set("assessmentId", assessmentId);
    fd.set("decision", decision);
    fd.set("reason", reason || `Assessment decided as ${decision}`);

    startTransition(async () => {
      const res = await decideAssessmentAction(fd);
      setResult(res);
      if (res.success) {
        setUseCases((prev) =>
          prev.map((uc) =>
            uc.use_case_id === assessmentId // assessment is linked to use case
              ? { ...uc, lifecycle_state: decision === "APPROVED" ? "APPROVED" : "REJECTED" }
              : uc
          )
        );
      }
    });
  };

  const handleActivateUseCaseSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await activateUseCaseAction(new FormData(e.currentTarget));
      setResult(res);
      if (res.success && res.data) {
        setUseCases((prev) =>
          prev.map((uc) =>
            uc.use_case_id === res.data?.use_case_id ? res.data : uc
          )
        );
      }
    });
  };

  const handleSuspendUseCaseSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await suspendUseCaseAction(new FormData(e.currentTarget));
      setResult(res);
      if (res.success && res.data) {
        setUseCases((prev) =>
          prev.map((uc) =>
            uc.use_case_id === res.data?.use_case_id ? res.data : uc
          )
        );
      }
    });
  };

  const handleRequestReassessmentSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await requestReassessmentAction(new FormData(e.currentTarget));
      setResult(res);
      if (res.success && res.data) {
        setUseCases((prev) =>
          prev.map((uc) =>
            uc.use_case_id === res.data?.use_case_id ? res.data : uc
          )
        );
      }
    });
  };

  const handleRetireUseCaseSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await retireUseCaseAction(new FormData(e.currentTarget));
      setResult(res);
      if (res.success && res.data) {
        setUseCases((prev) =>
          prev.map((uc) =>
            uc.use_case_id === res.data?.use_case_id ? res.data : uc
          )
        );
      }
    });
  };

  const handleGetEffectiveUseCaseControlSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await getEffectiveUseCaseControlAction(new FormData(e.currentTarget));
      setResult(res);
    });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // AIG-02: Model Release Registry Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const handleRegisterModelReleaseSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formElement = e.currentTarget;
    const fd = new FormData(formElement);
    const provider = String(fd.get("provider") || "").trim().toLowerCase();
    const providerModelId = String(fd.get("providerModelId") || "").trim();
    const deploymentRegion = String(fd.get("deploymentRegion") || "").trim();

    if (!provider || !providerModelId || !deploymentRegion) return;

    const optimisticRelease: ModelReleaseItem = {
      model_release_id: `mr-${Date.now().toString(36)}`,
      provider,
      provider_model_id: providerModelId,
      deployment_region: deploymentRegion,
      capability_set: String(fd.get("capabilitySet") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      context_limit: fd.get("contextLimit") ? Number(fd.get("contextLimit")) : undefined,
      training_use: String(fd.get("trainingUse") || "NO_TRAINING") as ModelReleaseItem["training_use"],
      retention: String(fd.get("retention") || "").trim() || undefined,
      approved_scopes: String(fd.get("approvedScopes") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      control_evidence: fd.get("controlEvidence") ? JSON.parse(String(fd.get("controlEvidence"))) : undefined,
      release_state: "DISCOVERED",
      status_reason: undefined,
      created_at: new Date().toISOString(),
      created_by_principal_id: "operator-register",
      updated_at: new Date().toISOString(),
    };

    setModelReleases((prev) => [optimisticRelease, ...prev]);

    startTransition(async () => {
      const res = await registerModelReleaseAction(fd);
      setResult(res);
      if (!res.success) {
        setModelReleases((prev) =>
          prev.filter((m) => m.model_release_id !== optimisticRelease.model_release_id)
        );
      } else if (res.data) {
        setModelReleases((prev) => [
          res.data,
          ...prev.filter((m) => m.model_release_id !== optimisticRelease.model_release_id),
        ]);
      }
    });
  };

  const handleRecordDueDiligenceSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await recordDueDiligenceAction(new FormData(e.currentTarget));
      setResult(res);
      if (res.success && res.data) {
        setModelReleases((prev) =>
          prev.map((m) =>
            m.model_release_id === res.data?.model_release_id ? res.data : m
          )
        );
      }
    });
  };

  const handleRecordEvaluationSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await recordEvaluationAction(new FormData(e.currentTarget));
      setResult(res);
      if (res.success && res.data) {
        setModelReleases((prev) =>
          prev.map((m) =>
            m.model_release_id === res.data?.model_release_id ? res.data : m
          )
        );
      }
    });
  };

  const handleApproveReleaseSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await approveReleaseAction(new FormData(e.currentTarget));
      setResult(res);
      if (res.success && res.data) {
        setModelReleases((prev) =>
          prev.map((m) =>
            m.model_release_id === res.data?.model_release_id ? res.data : m
          )
        );
      }
    });
  };

  const handleRejectReleaseSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const modelReleaseId = String(fd.get("modelReleaseId") || "").trim();
    const reason = String(fd.get("reason") || "").trim();

    if (!modelReleaseId || !reason) return;

    startTransition(async () => {
      const res = await rejectReleaseAction(fd);
      setResult(res);
      if (res.success && res.data) {
        setModelReleases((prev) =>
          prev.map((m) =>
            m.model_release_id === res.data?.model_release_id ? res.data : m
          )
        );
      }
    });
  };

  const handleBlockReleaseSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const modelReleaseId = String(fd.get("modelReleaseId") || "").trim();
    const reason = String(fd.get("reason") || "").trim();

    if (!modelReleaseId || !reason) return;

    startTransition(async () => {
      const res = await blockReleaseAction(fd);
      setResult(res);
      if (res.success && res.data) {
        setModelReleases((prev) =>
          prev.map((m) =>
            m.model_release_id === res.data?.model_release_id ? res.data : m
          )
        );
      }
    });
  };

  const handleActivateReleaseSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await activateReleaseAction(new FormData(e.currentTarget));
      setResult(res);
      if (res.success && res.data) {
        setModelReleases((prev) =>
          prev.map((m) =>
            m.model_release_id === res.data?.model_release_id ? res.data : m
          )
        );
      }
    });
  };

  const handleRestrictReleaseSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const modelReleaseId = String(fd.get("modelReleaseId") || "").trim();
    const reason = String(fd.get("reason") || "").trim();

    if (!modelReleaseId || !reason) return;

    startTransition(async () => {
      const res = await restrictReleaseAction(fd);
      setResult(res);
      if (res.success && res.data) {
        setModelReleases((prev) =>
          prev.map((m) =>
            m.model_release_id === res.data?.model_release_id ? res.data : m
          )
        );
      }
    });
  };

  const handleUnrestrictReleaseSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await unrestrictReleaseAction(new FormData(e.currentTarget));
      setResult(res);
      if (res.success && res.data) {
        setModelReleases((prev) =>
          prev.map((m) =>
            m.model_release_id === res.data?.model_release_id ? res.data : m
          )
        );
      }
    });
  };

  const handleQuarantineReleaseSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const modelReleaseId = String(fd.get("modelReleaseId") || "").trim();
    const reason = String(fd.get("reason") || "").trim();

    if (!modelReleaseId || !reason) return;

    startTransition(async () => {
      const res = await quarantineReleaseAction(fd);
      setResult(res);
      if (res.success && res.data) {
        setModelReleases((prev) =>
          prev.map((m) =>
            m.model_release_id === res.data?.model_release_id ? res.data : m
          )
        );
      }
    });
  };

  const handleRetireReleaseSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const modelReleaseId = String(fd.get("modelReleaseId") || "").trim();
    const reason = String(fd.get("reason") || "").trim();

    if (!modelReleaseId || !reason) return;

    startTransition(async () => {
      const res = await retireReleaseAction(fd);
      setResult(res);
      if (res.success && res.data) {
        setModelReleases((prev) =>
          prev.map((m) =>
            m.model_release_id === res.data?.model_release_id ? res.data : m
          )
        );
      }
    });
  };

  const handleCreateExecutionSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const key = executionKey || crypto.randomUUID();
    setExecutionKey(key);
    fd.set("idempotencyKey", key);
    startTransition(async () => {
      const res = await createGovernedExecutionAction(fd);
      setResult(res);
      if (res.success) {
        setExecutions((previous) => [res.data, ...previous]);
        setExecutionKey(crypto.randomUUID());
      }
    });
  };

  const handleCreateIncidentSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const key = incidentKey || crypto.randomUUID();
    setIncidentKey(key);
    fd.set("idempotencyKey", key);
    startTransition(async () => {
      const res = await createAIIncidentAction(fd);
      setResult(res);
      if (res.success) {
        setIncidents((previous) => [res.data, ...previous]);
        setIncidentKey(crypto.randomUUID());
      }
    });
  };

  const handleCreateDispositionSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const key = dispositionKey || crypto.randomUUID();
    setDispositionKey(key);
    fd.set("idempotencyKey", key);
    startTransition(async () => {
      const res = await createOutputDispositionAction(fd);
      setResult(res);
      if (res.success) {
        setDispositions((previous) => [res.data, ...previous]);
        setDispositionKey(crypto.randomUUID());
      }
    });
  };

  const handleDecideDispositionSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await decideOutputDispositionAction(fd);
      setResult(res);
      if (res.success) {
        setDispositions((previous) =>
          previous.map((d) => (d.disposition_id === res.data.disposition_id ? res.data : d))
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
                Action Approvals
              </button>
              <button
                onClick={() => {
                  setActiveTab("policy-changes");
                  setResult(null);
                }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === "policy-changes"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                Policy Changes SoD
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
              <button
                onClick={() => {
                  setActiveTab("use-cases");
                  setResult(null);
                }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === "use-cases"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                Use Case Registry
              </button>
              <button
                onClick={() => {
                  setActiveTab("model-releases");
                  setResult(null);
                }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === "model-releases"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                Model Releases
              </button>
              <button
                onClick={() => {
                  setActiveTab("executions");
                  setResult(null);
                }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === "executions"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                Governed Execution
              </button>
              <button
                onClick={() => {
                  setActiveTab("incidents");
                  setResult(null);
                }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === "incidents"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                Incident Governance
              </button>
              <button
                onClick={() => {
                  setActiveTab("dispositions");
                  setResult(null);
                }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === "dispositions"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                Output Disposition
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

          {activeTab === "executions" && (
            <div className="space-y-5">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                Execution attempts are persisted and fail closed. This service has no configured IAM, COM, PRV,
                PDC, or XIC execution gateway; no provider inference or tool side effect will occur.
              </div>
              <form onSubmit={handleCreateExecutionSubmit} className="grid gap-3 md:grid-cols-2">
                <label className="text-xs text-slate-700 dark:text-slate-300">
                  Active use-case ID
                  <input name="useCaseId" required className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800" />
                </label>
                <label className="text-xs text-slate-700 dark:text-slate-300">
                  Active model-release ID
                  <input name="modelReleaseId" required className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800" />
                </label>
                <label className="text-xs text-slate-700 dark:text-slate-300">
                  Immutable execution-package ID
                  <input name="packageId" required className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800" />
                </label>
                <label className="text-xs text-slate-700 dark:text-slate-300">
                  Package version
                  <input name="packageVersion" required className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800" />
                </label>
                <label className="text-xs text-slate-700 dark:text-slate-300 md:col-span-2">
                  Request input (JSON; not forwarded to a provider)
                  <textarea
                    name="input"
                    required
                    defaultValue='{"purpose":"governed execution request"}'
                    rows={3}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50 md:col-span-2"
                >
                  Record Fail-Closed Execution Attempt
                </button>
              </form>
              {executions.length > 0 && (
                <div className="space-y-2">
                  {executions.map((execution) => (
                    <div key={execution.execution_id} className="rounded-md border border-slate-200 p-3 text-xs dark:border-slate-700">
                      <div className="font-mono">{execution.execution_id} · {execution.status}</div>
                      <div className="mt-1 text-slate-600 dark:text-slate-400">{execution.block_reason}: {execution.blocked_by.join(", ")}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "incidents" && (
            <div className="space-y-5">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                Opening AI-P0 atomically quarantines the selected model release. External kill-switch, incident-response
                assignment, and governed reactivation integrations are not configured here.
              </div>
              <form onSubmit={handleCreateIncidentSubmit} className="grid gap-3 md:grid-cols-2">
                <label className="text-xs text-slate-700 dark:text-slate-300">
                  Severity
                  <select name="severity" defaultValue="AI-P2" className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                    <option value="AI-P0">AI-P0 · Critical</option>
                    <option value="AI-P1">AI-P1 · High</option>
                    <option value="AI-P2">AI-P2 · Medium</option>
                    <option value="AI-P3">AI-P3 · Low</option>
                  </select>
                </label>
                <label className="text-xs text-slate-700 dark:text-slate-300">
                  Model-release ID
                  <input name="modelReleaseId" required className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800" />
                </label>
                <label className="text-xs text-slate-700 dark:text-slate-300 md:col-span-2">
                  Incident description
                  <textarea name="description" required maxLength={4000} rows={3} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800" />
                </label>
                <button type="submit" disabled={isPending} className="rounded-md bg-rose-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50 md:col-span-2">
                  Open Governed AI Incident
                </button>
              </form>
              {incidents.length > 0 && (
                <div className="space-y-2">
                  {incidents.map((incident) => (
                    <div key={incident.incident_id} className="rounded-md border border-slate-200 p-3 text-xs dark:border-slate-700">
                      <div className="font-mono">{incident.incident_id} · {incident.severity} · {incident.status}</div>
                      <div className="mt-1 text-slate-600 dark:text-slate-400">{incident.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "dispositions" && (
            <div className="space-y-5">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                O4 is AI-prohibited and is refused outright. O0 is created as a terminal record needing no review.
                O1/O2/O3 require a decision from a reviewer distinct from whoever created the disposition — WFC
                reviewer assignment, delegation and escalation are not configured here.
              </div>
              <form onSubmit={handleCreateDispositionSubmit} className="grid gap-3 md:grid-cols-2">
                <label className="text-xs text-slate-700 dark:text-slate-300">
                  AI Run ID
                  <input name="aiRunId" required className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800" />
                </label>
                <label className="text-xs text-slate-700 dark:text-slate-300">
                  Oversight class
                  <select name="oversightClass" defaultValue="O2" className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                    <option value="O0">O0 · No material consequence</option>
                    <option value="O1">O1 · Identified user review</option>
                    <option value="O2">O2 · Qualified reviewer</option>
                    <option value="O3">O3 · Dual/control review</option>
                    <option value="O4">O4 · AI prohibited</option>
                  </select>
                </label>
                <button type="submit" disabled={isPending} className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50 md:col-span-2">
                  Create Output Disposition
                </button>
              </form>
              {dispositions.length > 0 && (
                <div className="space-y-2">
                  {dispositions.map((disposition) => (
                    <div key={disposition.disposition_id} className="rounded-md border border-slate-200 p-3 text-xs dark:border-slate-700">
                      <div className="font-mono">
                        {disposition.disposition_id} · {disposition.oversight_class} · {disposition.status}
                      </div>
                      <div className="mt-1 text-slate-600 dark:text-slate-400">AI Run: {disposition.ai_run_id}</div>
                      {disposition.status === "REVIEW_REQUIRED" && (
                        <form onSubmit={handleDecideDispositionSubmit} className="mt-2 flex flex-wrap items-end gap-2">
                          <input type="hidden" name="dispositionId" value={disposition.disposition_id} />
                          <label className="text-xs text-slate-700 dark:text-slate-300">
                            Decision
                            <select name="decision" defaultValue="ACCEPTED" className="mt-1 block rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800">
                              <option value="ACCEPTED">ACCEPTED</option>
                              <option value="REJECTED">REJECTED</option>
                            </select>
                          </label>
                          <label className="flex-1 text-xs text-slate-700 dark:text-slate-300">
                            Reason
                            <input name="reason" className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800" />
                          </label>
                          <button type="submit" disabled={isPending} className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                            Record Decision
                          </button>
                        </form>
                      )}
                      {disposition.decided_by_principal_id && (
                        <div className="mt-1 text-slate-500 dark:text-slate-500">
                          Decided by {disposition.decided_by_principal_id}
                          {disposition.reason ? `: ${disposition.reason}` : ""}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
                                    "APPROVED"
                                  )
                                }
                                className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                                title="Approve as the authenticated user; the service enforces separation of duties"
                              >
                                Approve (Safety Officer)
                              </button>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() =>
                                  handleDecideActionSubmit(
                                    act.automation_action_id,
                                    "REJECTED"
                                  )
                                }
                                className="rounded bg-rose-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-rose-700 transition-colors disabled:opacity-50"
                              >
                                Reject
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

          {/* TAB: POLICY CHANGE APPROVALS (doc7 §G3, §H3) */}
          {activeTab === "policy-changes" && (
            <div className="space-y-6">
              {/* Proposal Form */}
              <form onSubmit={handleProposePolicyChangeSubmit} className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <Scale className="h-4 w-4 text-indigo-500" />
                  Propose Governance Policy Change (doc7 §G3, §H3 — Maker-Checker Governed)
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Target Policy Reference
                    </label>
                    <input
                      type="text"
                      name="targetPolicyRef"
                      placeholder="e.g. policy-treasury-disbursement-001"
                      defaultValue="policy-treasury-disbursement-001"
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Proposed Policy Modification
                    </label>
                    <input
                      type="text"
                      name="proposedChange"
                      placeholder="e.g. Update max monetary scope limit to $50,000 for AP automation"
                      defaultValue="Update max monetary scope limit to $50,000 for AP automation"
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      required
                    />
                  </div>
                </div>

                <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800/50">
                  <div className="font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    Maker-Checker Rule (Self-Approval Blocked):
                  </div>
                  <p className="mt-1 leading-relaxed">
                    Per doc7 §G3/§H3 doctrine, no policy change proposal may be approved or rejected by the same principal who proposed it. Decisions require an independent second-key authorization.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {isPending ? "Submitting..." : "Propose Policy Change"}
                </button>
              </form>

              {/* Policy Change Approvals Table */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>Policy Change Requests ({policyChanges.length})</span>
                  <span className="text-[11px] text-slate-500 font-normal">
                    {policyChanges.filter((p) => p.decision === "PENDING").length} Pending Review
                  </span>
                </div>

                {policyChanges.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                    No policy change proposals registered yet. Use the form above to propose a change.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {policyChanges.map((p) => {
                      const isPendingDecision = p.decision === "PENDING";
                      return (
                        <div
                          key={p.policy_change_approval_id}
                          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm text-xs space-y-3 dark:border-slate-800 dark:bg-slate-900/60"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                <span className="font-mono text-indigo-600 dark:text-indigo-400">
                                  {p.target_policy_ref}
                                </span>
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                    p.decision === "APPROVED"
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                      : p.decision === "REJECTED"
                                      ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                                      : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                  }`}
                                >
                                  {p.decision}
                                </span>
                              </div>
                              <p className="mt-1 text-slate-700 dark:text-slate-300 font-medium">
                                {p.proposed_change}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                                <span>ID: <code className="font-mono">{p.policy_change_approval_id}</code></span>
                                <span>Proposed By: <code className="font-mono">{p.proposed_by_principal_id}</code></span>
                                {p.created_at && (
                                  <span>Proposed: {new Date(p.created_at).toLocaleTimeString()}</span>
                                )}
                                {p.decided_by_principal_id && (
                                  <span>Decided By: <code className="font-mono">{p.decided_by_principal_id}</code></span>
                                )}
                                {p.decision_reason && (
                                  <span>Reason: {p.decision_reason}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action Bar for Pending Items */}
                          {isPendingDecision && (
                            <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                              <PolicyDecisionForm
                                approval={p}
                                isPending={isPending}
                                onDecide={handleDecidePolicyChangeSubmit}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
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
                    Risk Category (doc7 §G2 Taxonomy)
                  </label>
                  <select
                    name="riskCategory"
                    defaultValue="MONEY"
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 font-mono"
                  >
                    <option value="MONEY">MONEY — Disbursements, payouts, refunds</option>
                    <option value="EMPLOYMENT">EMPLOYMENT — Hiring, termination, compensation</option>
                    <option value="TAX_FILING">TAX_FILING — Tax returns, regulatory filings</option>
                    <option value="LEGAL_POSITION">LEGAL_POSITION — Legal claims, disclosures</option>
                    <option value="EXTERNAL_CERTIFICATION">EXTERNAL_CERTIFICATION — Audits, certifications</option>
                    <option value="ACCESS_SECURITY">ACCESS_SECURITY — IAM, keys, credentials</option>
                    <option value="CONTRACTUAL_COMMITMENT">CONTRACTUAL_COMMITMENT — Contracts, agreements</option>
                    <option value="RECORD_DELETION">RECORD_DELETION — Permanent record deletion</option>
                    <option value="RETENTION_LEGAL_HOLD">RETENTION_LEGAL_HOLD — Legal hold modifications</option>
                    <option value="REGULATED_REPORTING">REGULATED_REPORTING — Statutorily mandated reporting</option>
                    <option value="NONE">NONE — Low risk / informational</option>
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

interface PolicyDecisionFormProps {
  approval: PolicyChangeApproval;
  isPending: boolean;
  onDecide: (
    approvalId: string,
    decision: "APPROVED" | "REJECTED",
    reason: string
  ) => void;
}

function PolicyDecisionForm({ approval, isPending, onDecide }: PolicyDecisionFormProps) {
  const [reason, setReason] = useState("");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <label className="text-[10px] text-slate-500 block">Decision Reason / Audit Note</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            placeholder="e.g. Risk reviewed and approved"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            onDecide(
              approval.policy_change_approval_id,
              "APPROVED",
              reason || "Approved by compliance officer"
            )
          }
          className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          Approve (Checker)
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            onDecide(
              approval.policy_change_approval_id,
              "REJECTED",
              reason || "Rejected by compliance officer"
            )
          }
          className="rounded bg-rose-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-rose-700 transition-colors disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
