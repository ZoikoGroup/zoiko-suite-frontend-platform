// The Governance Log's commands. Each opens the shared ActionDialog, sends one
// Server Action, and reports what the ledger answered. There is no edit and no
// delete: the ledger is append-only, so "changing" a decision means recording
// a follow-up that names it.

import { CornerDownRight, FileCheck2, Plus, RotateCcw, ShieldCheck, Stamp } from "lucide-react";
import type { LegalEntity } from "@/lib/api/tenants";
import { PRIORITIES, decisionTitle, type GovernanceDecision } from "@/lib/api/governance";
import {
  recordDecisionAction,
  replayDecisionAction,
  sealPackageAction,
  verifyChainAction,
  verifyPackageAction,
} from "@/app/admin/governance/actions";
import { ActionDialog } from "@/components/admin/authorization/kit/ActionDialog";
import { Field, FieldGrid, SelectField, TextArea } from "@/components/admin/authorization/ui";

const ICON = "h-4 w-4";

/** Outcomes the console records; each maps to a status category in the ledger. */
const OUTCOMES = [
  ["APPROVED", "Approved"],
  ["PENDING", "Pending"],
  ["IN_PROGRESS", "In progress"],
  ["ESCALATED", "Escalated"],
  ["DENIED", "Denied"],
] as const;

const PRIORITY_OPTIONS = [["", "Not set"], ...PRIORITIES.map((p) => [p, p.charAt(0) + p.slice(1).toLowerCase()] as const)] as const;

function entityOptions(entities: LegalEntity[], fallback?: string): (readonly [string, string])[] {
  const opts = entities.map((e) => [e.legal_entity_id, e.trading_name || e.legal_name] as const);
  if (fallback && !entities.some((e) => e.legal_entity_id === fallback)) opts.unshift([fallback, fallback]);
  return opts;
}

export function NewDecisionDialog({
  entities,
  domains,
  defaultEntity,
}: {
  entities: LegalEntity[];
  domains: { code: string; label: string }[];
  defaultEntity?: string;
}) {
  return (
    <ActionDialog
      label="New Decision"
      icon={<Plus className={ICON} />}
      tone="accent"
      size="md"
      variant="drawer"
      title="Record a governance decision"
      description="Appends one immutable record to the ledger and links it into the evidence chain. Services record their own decisions automatically; record here a decision made by people — a committee, an approver, a review."
      action={recordDecisionAction}
      submitLabel="Record decision"
      footnote="Recorded decisions cannot be edited or deleted. A correction is a follow-up that names this one."
    >
      <FieldGrid>
        <Field name="title" label="Decision" placeholder="e.g. Approve vendor contract renewal" className="sm:col-span-2" maxLength={200} />
        <TextArea name="summary" label="Summary" optional placeholder="What was decided, and why" className="sm:col-span-2" maxLength={2000} />
        <Field name="action_type" label="Action type" placeholder="e.g. VENDOR_CONTRACT_RENEWAL" hint="What kind of action was decided." />
        <SelectField name="outcome" label="Outcome" defaultValue="APPROVED" options={OUTCOMES} />
        <SelectField
          name="domain"
          label="Domain"
          optional
          defaultValue=""
          options={[["", "Classify from the action type"], ...domains.map((d) => [d.code, d.label] as const)]}
        />
        <SelectField name="priority" label="Priority" optional defaultValue="" options={PRIORITY_OPTIONS} />
        <SelectField
          name="legal_entity_id"
          label="Legal entity"
          defaultValue={defaultEntity}
          options={entityOptions(entities, defaultEntity)}
        />
        <Field name="jurisdiction" label="Jurisdiction" optional placeholder="e.g. GB" maxLength={64} />
        <Field name="rule_basis" label="Rule basis" placeholder="e.g. PROCUREMENT-POLICY:v2.1" hint="The rule or authority the decision rests on." className="sm:col-span-2" maxLength={256} />
        <Field name="subject_id" label="Reference" optional placeholder="e.g. CON-2026-7890" maxLength={64} />
        <Field name="related_obligation_id" label="Related obligation" optional placeholder="e.g. OB-2026-1123" maxLength={64} />
        <Field name="tags" label="Tags" optional placeholder="Vendor, Contract, Renewal" hint="Comma-separated, at most 10." className="sm:col-span-2" />
        <Field name="decided_at" label="Decided" type="datetime-local" optional hint="Blank = now." />
        <TextArea name="evaluation_context" label="Evaluation context (JSON)" optional placeholder='{"amount": 12000}' className="sm:col-span-2" />
      </FieldGrid>
    </ActionDialog>
  );
}

/** A new decision naming this one as its cause: how a pending or escalated decision is resolved. */
export function FollowUpDialog({ decision, entities }: { decision: GovernanceDecision; entities: LegalEntity[] }) {
  const open = decision.status_category === "PENDING" || decision.status_category === "ESCALATED";
  return (
    <ActionDialog
      label={open ? "Record Outcome" : "Record Follow-up"}
      icon={<CornerDownRight className={ICON} />}
      tone="accent"
      variant="drawer"
      title={open ? `Record the outcome of ${decision.display_ref}` : `Record a follow-up to ${decision.display_ref}`}
      description="Appends a new decision that names this one as its cause. The original stays exactly as recorded; the register shows them linked."
      action={recordDecisionAction}
      hidden={{ causation_id: decision.decision_id, action_type: decision.action_type, domain: decision.domain }}
      submitLabel="Record follow-up"
    >
      <FieldGrid>
        <Field name="title" label="Decision" defaultValue={`Resolve: ${decisionTitle(decision)}`.slice(0, 200)} className="sm:col-span-2" maxLength={200} />
        <SelectField name="outcome" label="Outcome" defaultValue="APPROVED" options={OUTCOMES} />
        <SelectField name="priority" label="Priority" optional defaultValue={decision.priority ?? ""} options={PRIORITY_OPTIONS} />
        <SelectField
          name="legal_entity_id"
          label="Legal entity"
          defaultValue={decision.legal_entity_id}
          options={entityOptions(entities, decision.legal_entity_id)}
        />
        <Field name="jurisdiction" label="Jurisdiction" optional defaultValue={decision.jurisdiction_context ?? ""} maxLength={64} />
        <Field name="rule_basis" label="Rule basis" defaultValue={decision.rule_basis} className="sm:col-span-2" maxLength={256} />
        <TextArea name="summary" label="Summary" optional placeholder="What was decided, and by whom" className="sm:col-span-2" maxLength={2000} />
        <Field name="subject_id" label="Reference" optional defaultValue={decision.action_subject_id ?? ""} maxLength={64} />
        <Field name="related_obligation_id" label="Related obligation" optional defaultValue={decision.related_obligation_id ?? ""} maxLength={64} />
        <Field name="tags" label="Tags" optional defaultValue={(decision.tags ?? []).join(", ")} className="sm:col-span-2" />
      </FieldGrid>
    </ActionDialog>
  );
}

export function ReplayDialog({ decision }: { decision: GovernanceDecision }) {
  return (
    <ActionDialog
      label="Replay"
      icon={<RotateCcw className={ICON} />}
      tone="secondary"
      title={`Replay ${decision.display_ref}`}
      description="Re-evaluates the decision against the exact policy version it used, with the facts it recorded, and records a permanent manifest saying whether the outcome reproduced."
      action={replayDecisionAction}
      hidden={{ decision_id: decision.decision_id }}
      submitLabel="Replay now"
    />
  );
}

export function SealDialog({ unsealed }: { unsealed: number }) {
  return (
    <ActionDialog
      label="Seal Package"
      icon={<Stamp className={ICON} />}
      tone="accent"
      variant="drawer"
      title="Seal the evidence chain"
      description={`Verifies the chain, then records an append-only package committing to it (RFC 6962 Merkle root). ${unsealed} decision(s) are not yet sealed.`}
      action={sealPackageAction}
      submitLabel="Seal"
      footnote="Needs GOVERNANCE_EVIDENCE_SEAL. A sealed package can never be changed or removed."
    >
      <FieldGrid>
        <Field name="label" label="Label" optional placeholder="e.g. November 2026 close" maxLength={200} className="sm:col-span-2" />
        <TextArea name="reason" label="Reason" optional placeholder="Why this point is being sealed" maxLength={500} className="sm:col-span-2" />
        <Field name="through_decision_id" label="Seal through decision id" optional hint="Blank = every decision recorded so far." className="sm:col-span-2" maxLength={64} />
      </FieldGrid>
    </ActionDialog>
  );
}

export function VerifyChainDialog() {
  return (
    <ActionDialog
      label="Verify Chain"
      icon={<ShieldCheck className={ICON} />}
      tone="secondary"
      size="md"
      title="Verify the evidence chain"
      description="Re-computes every decision's hash link and every sealed package from the records as stored now. Nothing is written."
      action={verifyChainAction}
      submitLabel="Verify"
    />
  );
}

export function VerifyPackageDialog({ packageId, seq }: { packageId: string; seq: number }) {
  return (
    <ActionDialog
      label="Verify Package"
      icon={<FileCheck2 className={ICON} />}
      tone="accent"
      title={`Verify package #${seq}`}
      description="Re-computes the package's Merkle root and chain hash from the decisions as stored now."
      action={verifyPackageAction}
      hidden={{ package_id: packageId }}
      submitLabel="Verify"
    />
  );
}
