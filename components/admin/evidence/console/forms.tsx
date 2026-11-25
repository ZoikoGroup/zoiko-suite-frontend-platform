// The Evidence Requirements console's dialogs. Each opens over the page, sends
// one Server Action and reports what the service decided, through the same
// ActionDialog every console uses (reason, step-up retry, result in words).
//
// A form that can be sent twice carries one Idempotency-Key for its lifetime,
// so a double-click records one requirement, one check, one request.

import { CalendarClock, CheckCheck, ClipboardCheck, FileSearch, Lock, Plus, Send, ShieldCheck, UserRoundCog, X } from "lucide-react";
import { ActionDialog } from "@/components/admin/authorization/kit/ActionDialog";
import { Field, FieldGrid, SelectField, TextArea } from "@/components/admin/authorization/ui";
import {
  addRequirementAction,
  checkEvidenceAction,
  newEvidenceRequestAction,
  requestCommandAction,
  retireRequirementAction,
  scanResultAction,
} from "@/app/admin/evidence/actions";
import { DOMAIN_CODES } from "@/app/admin/evidence/state";
import { EVIDENCE_TYPES, describeEvidenceType, domainLabel, type EvidenceRequestCommand } from "@/lib/api/evidence";

const ICON = "h-4 w-4";

const DOMAINS = [["", "Choose…"], ...DOMAIN_CODES.map((d) => [d, domainLabel(d)] as const)] as const;
const TYPES = [
  ["", "Choose…"],
  ...EVIDENCE_TYPES.map((t) => {
    const d = describeEvidenceType(t);
    return [t, d.verified ? `${d.label} — checked by ${d.verifiedBy}` : `${d.label} — caller's word`] as const;
  }),
] as const;

export function AddRequirementDialog({ legalEntityId, size = "md" }: { legalEntityId: string; size?: "sm" | "md" }) {
  return (
    <ActionDialog
      label="Add requirement"
      icon={<Plus className={ICON} />}
      tone="accent"
      size={size}
      variant="drawer"
      title="Add an evidence requirement"
      description="From its start date, the action named here cannot complete until this evidence is on file."
      action={addRequirementAction}
      hidden={{ idempotency_key: crypto.randomUUID() }}
      submitLabel="Add requirement"
    >
      <FieldGrid>
        <SelectField name="domain_code" label="Business area" defaultValue="" options={DOMAINS} />
        <Field name="action_type" label="Action" placeholder="e.g. JOURNAL_POST" />
        <SelectField name="evidence_type" label="Evidence" defaultValue="" className="sm:col-span-2" options={TYPES} />
        <Field name="minimum_count" label="How many" type="number" min={1} max={50} defaultValue={1} />
        <Field name="artifact_subtype" label="Of the kind" optional placeholder="e.g. BANK_STATEMENT" />
        <Field name="legal_entity_id" label="Company (legal entity)" optional defaultValue={legalEntityId} hint="Blank = every company; permission is then checked platform-wide." className="sm:col-span-2" />
        <Field name="effective_from" label="Starts" type="datetime-local" optional hint="Blank = now. Never in the past." />
        <TextArea name="description" label="What to produce" optional hint="Shown to a blocked caller as the fix." className="sm:col-span-2" />
      </FieldGrid>
    </ActionDialog>
  );
}

export function CheckEvidenceDialog({ legalEntityId, size = "md", tone = "secondary" }: { legalEntityId: string; size?: "sm" | "md"; tone?: "secondary" | "primary" }) {
  return (
    <ActionDialog
      label="Check evidence"
      icon={<FileSearch className={ICON} />}
      tone={tone}
      size={size}
      variant="drawer"
      title="Check the evidence for an action"
      description="Records the determination in the evidence ledger. A document, manifest or signature is confirmed with the service that holds it; if that service cannot answer, nothing is recorded."
      action={checkEvidenceAction}
      hidden={{ idempotency_key: crypto.randomUUID() }}
      submitLabel="Check"
    >
      <FieldGrid>
        <Field name="legal_entity_id" label="Company (legal entity)" defaultValue={legalEntityId} className="sm:col-span-2" />
        <SelectField name="domain_code" label="Business area" defaultValue="" options={DOMAINS} />
        <Field name="action_type" label="Action" placeholder="e.g. JOURNAL_POST" />
        <TextArea
          name="artifacts"
          label="Evidence on file"
          optional
          rows={4}
          placeholder={"SUPPORTING_DOCUMENT 3f2a…-document-id\nAPPROVAL_RECORD APR-1042"}
          hint="One per line: the evidence type, its reference, and optionally its kind."
          className="sm:col-span-2"
        />
      </FieldGrid>
    </ActionDialog>
  );
}

export function NewEvidenceRequestDialog({ legalEntityId }: { legalEntityId: string }) {
  return (
    <ActionDialog
      label="New request"
      icon={<Plus className={ICON} />}
      tone="primary"
      variant="drawer"
      title="Request evidence from someone"
      description="Drafted first; nothing reaches the person until you send it."
      action={newEvidenceRequestAction}
      hidden={{ idempotency_key: `evidence-pbc-${crypto.randomUUID().slice(0, 8)}` }}
      submitLabel="Draft request"
    >
      <FieldGrid>
        <Field name="title" label="Title" placeholder="e.g. Q3 bank confirmation" className="sm:col-span-2" />
        <Field name="assigned_to" label="From (principal ID)" />
        <Field name="due_at" label="Due" type="datetime-local" />
        <Field name="legal_entity_id" label="Company (legal entity)" defaultValue={legalEntityId} className="sm:col-span-2" />
        <Field name="requirement_id" label="For requirement" optional hint="The catalogue requirement this evidence will satisfy." className="sm:col-span-2" />
        <TextArea name="description" label="What is needed" optional className="sm:col-span-2" />
      </FieldGrid>
    </ActionDialog>
  );
}

export function RetireRequirementDialog({ id, version }: { id: string; version: number }) {
  return (
    <ActionDialog
      label="Withdraw"
      icon={<X className={ICON} />}
      tone="danger"
      title="Withdraw this requirement"
      description="It stops gating the action from the end date and is kept on record, so decisions made under it remain explicable. If someone changed it since you opened it, this is refused."
      action={retireRequirementAction}
      hidden={{ id, expected_version: version }}
      submitLabel="Withdraw"
      reasons="end"
    >
      <Field name="effective_to" label="End at" type="datetime-local" optional hint="Blank = straight away." />
    </ActionDialog>
  );
}

const COMMANDS: Record<EvidenceRequestCommand, { label: string; title: string; description: string; tone: "secondary" | "danger" | "accent" | "approve"; icon: typeof Send }> = {
  send: { label: "Send", title: "Send this request", description: "The person named on it is asked for the evidence.", tone: "accent", icon: Send },
  reassign: { label: "Reassign", title: "Reassign this request", description: "Someone else is asked instead.", tone: "secondary", icon: UserRoundCog },
  "extend-due-date": { label: "Extend", title: "Move the due date", description: "The request stays open until the new date.", tone: "secondary", icon: CalendarClock },
  clarify: { label: "Ask to clarify", title: "Ask for clarification", description: "The contributor is asked to correct or complete the response.", tone: "secondary", icon: ClipboardCheck },
  "mark-satisfied": { label: "Mark satisfied", title: "Mark the request satisfied", description: "Only once the latest response is scanned clean, and never by the person who submitted it.", tone: "approve", icon: CheckCheck },
  close: { label: "Close", title: "Close this request", description: "It stays on record and cannot be reopened.", tone: "danger", icon: Lock },
};

export function RequestCommandDialog({ command, id, version }: { command: EvidenceRequestCommand; id: string; version: number }) {
  const c = COMMANDS[command];
  const Icon = c.icon;
  return (
    <ActionDialog
      label={c.label}
      icon={<Icon className={ICON} />}
      tone={c.tone}
      title={c.title}
      description={`${c.description} If someone changed the request since you opened it, this is refused.`}
      action={requestCommandAction}
      hidden={{ command, id, expected_version: version }}
      submitLabel={c.label}
      reasons={command === "clarify" ? "change" : undefined}
    >
      {command === "reassign" && <Field name="new_assignee_principal_id" label="To (principal ID)" />}
      {command === "extend-due-date" && <Field name="new_due_at" label="New due date" type="datetime-local" />}
    </ActionDialog>
  );
}

export function ScanResultDialog() {
  return (
    <ActionDialog
      label="Record scan"
      icon={<ShieldCheck className={ICON} />}
      tone="secondary"
      title="Record a malware scan result"
      description="The scanner's verdict on one response. Only a CLEAN response can be marked satisfied."
      action={scanResultAction}
      submitLabel="Record"
    >
      <FieldGrid>
        <Field name="response_id" label="Response ID" className="sm:col-span-2" />
        <SelectField name="result" label="Verdict" defaultValue="CLEAN" options={[["CLEAN", "Clean"], ["QUARANTINED", "Quarantined"]]} />
      </FieldGrid>
    </ActionDialog>
  );
}
