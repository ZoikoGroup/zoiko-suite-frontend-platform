import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/admin/shared";
import { ControlsFooter, RegisterCard } from "@/components/admin/console";
import { SignInAgain } from "@/components/admin/authorization/kit";
import { RegisterView, type Query, type RegisterSpec } from "@/components/admin/authorization/console/register";
import { SessionChip } from "@/components/admin/authorization/console/SessionChip";
import { loadWorkflow, type WorkflowData } from "@/components/admin/workflow/console/data";
import { pendingRegister } from "@/components/admin/workflow/console/pending";
import { instancesRegister } from "@/components/admin/workflow/console/instances";
import { definitionsRegister } from "@/components/admin/workflow/console/definitions";
import { auditEngagementsRegister } from "@/components/admin/workflow/console/audit";
import { formsRegister } from "@/components/admin/workflow/console/forms";
import { casesRegister } from "@/components/admin/workflow/console/cases";
import { stateMachinesRegister } from "@/components/admin/workflow/console/stateMachines";
import { WorkflowKpis, WorkflowPanels } from "@/components/admin/workflow/console/overview";
import { StartWorkflowDialog, DefineWorkflowDialog } from "@/components/admin/workflow/console/forms";
import { href, type WorkflowCtx } from "@/components/admin/workflow/console/shared";
import { needsAttention } from "@/lib/api/authorization";
import { currentSession } from "@/lib/authz-inbox";

export const metadata: Metadata = { title: "Workflows & Approvals | Zoiko Suite" };

const TABS = [
  { key: "pending", label: "Pending Approvals" },
  { key: "instances", label: "Instances" },
  { key: "definitions", label: "Definitions" },
  { key: "audit", label: "Audit Engagements" },
  { key: "forms", label: "Forms" },
  { key: "cases", label: "Cases" },
  { key: "state-machines", label: "State Machines" },
] as const;

type TabKey = typeof TABS[number]["key"];

async function Page() {
  const session = await currentSession();
  if (!session) return <SignInAgain />;

  const { identity } = session;
  const data = await loadWorkflow(identity);
  const ctx: WorkflowCtx = { me: identity.principalId, canManage: true, legalEntityId: identity.legalEntityId };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Governance › Workflows & Approvals"
        description="Multi-stage approvals for actions that need more than one person. An approval adds to authorization — it never replaces it. The initiator never decides. Nobody decides two stages. A service account never decides."
        actions={
          <>
            <StartWorkflowDialog legalEntityId={identity.legalEntityId} />
            <DefineWorkflowDialog legalEntityId={identity.legalEntityId} />
          </>
        }
      />

      <SessionChip identity={identity} attention={needsAttention(identity)} />

      <WorkflowKpis pending={data.pending.rows} instances={data.instances.rows} />
      <WorkflowPanels pending={data.pending.rows} instances={data.instances.rows} />

      <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
        <RegisterView<TabKey, WorkflowData, WorkflowCtx>
          data={data}
          ctx={ctx}
          tabs={TABS}
          count={(data, tab) => {
            switch (tab) {
              case "pending": return data.pending.error ? null : data.pending.rows.length;
              case "instances": return data.instances.error ? null : data.instances.rows.length;
              case "definitions": return data.definitions.error ? null : data.definitions.rows.length;
              case "audit": return 0;
              case "forms": return 0;
              case "cases": return 0;
              case "state-machines": return 0;
              default: return undefined;
            }
          }}
          registerFor={(tab, data, ctx) => {
            switch (tab) {
              case "pending": return pendingRegister(data, ctx);
              case "instances": return instancesRegister(data, ctx);
              case "definitions": return definitionsRegister(data, ctx);
              case "audit": return auditEngagementsRegister(data, ctx);
              case "forms": return formsRegister(data, ctx);
              case "cases": return casesRegister(data, ctx);
              case "state-machines": return stateMachinesRegister(data, ctx);
              default: return null;
            }
          }}
          tabActions={(tab, legalEntityId) => {
            switch (tab) {
              case "pending":
                return <StartWorkflowDialog legalEntityId={legalEntityId} />;
              case "definitions":
                return <DefineWorkflowDialog legalEntityId={legalEntityId} />;
              default:
                return null;
            }
          }}
          baseHref={BASE}
          firstProblem={(data) => data.pending.error || data.instances.error || data.definitions.error}
        />
      </div>

      <ControlsFooter
        items={[
          { label: "The initiator never decides their own workflow", tone: "info" },
          { label: "Nobody decides two stages of the same workflow", tone: "warning" },
          { label: "A service account or system principal never decides", tone: "danger" },
          { label: "Every decision checked against authorization-svc with workflow_type, approver_role, stage_order", tone: "info" },
          { label: "Policy/authority changes re-check pending approvers and escalate if needed", tone: "warning" },
        ]}
      />
    </div>
  );
}

export default Page;