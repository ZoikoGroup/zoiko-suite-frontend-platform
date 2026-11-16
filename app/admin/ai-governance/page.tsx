import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui";
import { PageHeader, CopyableId } from "@/components/admin/shared";
import { RegisterCard } from "@/components/admin/my-work/RegisterCard";
import { currentSession } from "@/lib/authz-inbox";
import {
  listRiskClassifications,
  listModelProviders,
  listAutomationPolicies,
  listAutomationActions,
  listPolicyChangeApprovals,
  listUseCases,
  listModelReleases,
  type RiskClassificationRecord,
  type ModelProviderRecord,
  type AutomationPolicyRecord,
  type AutomationActionRecord,
  type PolicyChangeApprovalRecord,
  type UseCaseRecord,
  type ModelReleaseRecord,
} from "@/lib/api/ai-governance";
import { formatDateTime } from "@/lib/format";
import { humanizeCode } from "@/lib/humanize";

export const metadata: Metadata = {
  title: "AI Governance | Zoiko Suite",
  description: "AI use cases, model providers and releases, action risk classifications and automation policies, read live from ai-governance-svc.",
};

const SERVICE = "ai-governance-svc";

const yesNo = (v: boolean) => <Badge tone={v ? "warning" : "neutral"}>{v ? "Yes" : "No"}</Badge>;

export default async function AIGovernancePage() {
  const current = await currentSession();
  if (!current) redirect("/login");
  const { identity } = current;

  const [useCases, providers, releases, risk, policies, actions, approvals] = await Promise.all([
    listUseCases(identity),
    listModelProviders(identity),
    listModelReleases(identity),
    listRiskClassifications(identity),
    listAutomationPolicies(identity),
    listAutomationActions(identity),
    listPolicyChangeApprovals(identity),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Governance & Safety Controls"
        description="AI use cases, model providers and releases, action risk classifications and automation policies, read live from ai-governance-svc with your session. AI runs are read by id only: the service has no endpoint that lists them."
      />

      <RegisterCard<UseCaseRecord>
        title="AI use cases"
        description="Registered AI use cases and their lifecycle state."
        service={SERVICE}
        read={useCases}
        rowKey={(u) => u.use_case_id}
        emptyLabel="No AI use case is registered"
        columns={[
          { header: "Purpose", cell: (u) => u.purpose },
          { header: "Domain", cell: (u) => humanizeCode(u.domain) },
          { header: "Automation", cell: (u) => humanizeCode(u.automation_level) },
          { header: "State", cell: (u) => <Badge tone="neutral">{humanizeCode(u.lifecycle_state)}</Badge> },
          { header: "Created", cell: (u) => formatDateTime(u.created_at) },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <RegisterCard<ModelProviderRecord>
          title="Model providers"
          description="Provider registrations, data region and DPA status."
          service={SERVICE}
          read={providers}
          rowKey={(p) => p.provider_registration_id}
          emptyLabel="No model provider is registered"
          columns={[
            { header: "Provider", cell: (p) => p.provider_name },
            { header: "Model", cell: (p) => p.model_name },
            { header: "Region", cell: (p) => p.data_region },
            { header: "DPA verified", cell: (p) => <Badge tone={p.dpa_verified ? "success" : "warning"}>{p.dpa_verified ? "Yes" : "No"}</Badge> },
          ]}
        />

        <RegisterCard<ModelReleaseRecord>
          title="Model releases"
          description="Model releases and their approval state."
          service={SERVICE}
          read={releases}
          rowKey={(r) => r.model_release_id}
          emptyLabel="No model release is registered"
          columns={[
            { header: "Provider", cell: (r) => r.provider },
            { header: "Model", cell: (r) => r.provider_model_id },
            { header: "Region", cell: (r) => r.deployment_region },
            { header: "State", cell: (r) => <Badge tone="neutral">{humanizeCode(r.release_state)}</Badge> },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <RegisterCard<RiskClassificationRecord>
          title="Action risk classifications"
          description="How each AI action type is classified, and whether it needs human review."
          service={SERVICE}
          read={risk}
          rowKey={(r) => r.action_type}
          emptyLabel="No action type is classified"
          columns={[
            { header: "Action", cell: (r) => <code className="text-xs">{r.action_type}</code> },
            { header: "Risk", cell: (r) => humanizeCode(r.risk_category) },
            { header: "Human review", cell: (r) => yesNo(r.human_review_trigger) },
            { header: "Maker-checker", cell: (r) => yesNo(r.requires_maker_checker) },
          ]}
        />

        <RegisterCard<AutomationPolicyRecord>
          title="Automation policies"
          description="What each role may automate, with limits and kill switch."
          service={SERVICE}
          read={policies}
          rowKey={(p) => p.automation_policy_id}
          emptyLabel="No automation policy is defined"
          columns={[
            { header: "Role", cell: (p) => p.role },
            { header: "Action", cell: (p) => <code className="text-xs">{p.action_type}</code> },
            { header: "Approvals", cell: (p) => p.required_approvals },
            { header: "Kill switch", cell: (p) => <Badge tone={p.kill_switch_engaged ? "danger" : "neutral"}>{p.kill_switch_engaged ? "Engaged" : "Off"}</Badge> },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <RegisterCard<AutomationActionRecord>
          title="Automation actions"
          description="Actions AI has proposed and their approval status."
          service={SERVICE}
          read={actions}
          rowKey={(a) => a.automation_action_id}
          emptyLabel="No automation action has been proposed"
          columns={[
            { header: "Action", cell: (a) => <code className="text-xs">{a.action_type}</code> },
            { header: "Approval", cell: (a) => humanizeCode(a.approval_status) },
            { header: "Status", cell: (a) => humanizeCode(a.status) },
            { header: "Proposed by", cell: (a) => <CopyableId value={a.proposed_by_principal_id} /> },
          ]}
        />

        <RegisterCard<PolicyChangeApprovalRecord>
          title="Policy change approvals"
          description="Proposed changes to AI policies and their decisions."
          service={SERVICE}
          read={approvals}
          rowKey={(a) => a.policy_change_approval_id}
          emptyLabel="No policy change is pending or decided"
          columns={[
            { header: "Policy", cell: (a) => a.target_policy_ref },
            { header: "Decision", cell: (a) => (a.decision ? humanizeCode(a.decision) : "Pending") },
            { header: "Proposed", cell: (a) => formatDateTime(a.created_at) },
          ]}
        />
      </div>
    </div>
  );
}
