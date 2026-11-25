// The Authorization console's "new record" dialogs. Each opens as a side
// drawer over the page, sends one Server Action, and reports what the service
// decided — including "recorded, waiting for a second person", which is how
// most of these end: nearly every change here is maker-checker.

import { FileSearch, Handshake, KeyRound, LifeBuoy, Plus, RefreshCw, Search, Siren, Timer } from "lucide-react";
import type { SessionIdentity } from "@/lib/auth";
import { ABAC_OPERATORS, type AuthorityLimit, type Role } from "@/lib/api/authorization";
import {
  changeLimitAction,
  conflictingPermissionsAction,
  createAbacRuleAction,
  createSoDRuleAction,
  grantRoleAction,
  invalidateCacheAction,
  issueBreakGlassAction,
  issueJitAction,
  lendAuthorityAction,
  lookupDecisionAction,
  openSupportSessionAction,
  requestLimitAction,
  requestSoDExceptionAction,
  reviewSessionAction,
  saveWorkloadBindingAction,
} from "@/app/admin/authorization/actions";
import { FIELD, LABEL } from "@/components/admin/shared/form";
import { ActionDialog } from "../kit/ActionDialog";
import { Field, FieldGrid, SelectField } from "../ui";

const ICON = "h-4 w-4";

const CURRENCIES = [
  ["GBP", "GBP"],
  ["EUR", "EUR"],
  ["USD", "USD"],
  ["CAD", "CAD"],
  ["AUD", "AUD"],
  ["CHF", "CHF"],
  ["JPY", "JPY"],
] as const;

// ── grants ───────────────────────────────────────────────────────────────────

export function GrantRoleDialog({ roles, identity, size = "sm" }: { roles: Role[]; identity: SessionIdentity; size?: "sm" | "md" }) {
  const active = roles.filter((r) => r.active_flag);
  return (
    <ActionDialog
      label="Grant role"
      icon={<Plus className={ICON} />}
      tone="accent"
      size={size}
      variant="drawer"
      title="Grant a role"
      description="A privileged role is held for an independent approver unless you have approval rights; it grants nothing until then."
      action={grantRoleAction}
      submitLabel="Grant"
    >
      {active.length === 0 ? (
        <p className="text-sm text-slate-500">No active role exists to grant. Define one on Roles &amp; Access first.</p>
      ) : (
        <FieldGrid>
          <Field name="principal_id" label="Person (principal ID)" className="sm:col-span-2" />
          <SelectField
            name="role_id"
            label="Role"
            defaultValue=""
            className="sm:col-span-2"
            options={[["", "Choose…"], ...active.map((r) => [r.role_id, `${r.role_code} — ${r.role_name}`] as const)]}
          />
          <SelectField
            name="scope"
            label="Applies to"
            defaultValue="entity"
            options={[
              ["entity", "One legal entity"],
              ["tenant", "Whole organisation (organisation-wide roles only)"],
            ]}
          />
          <Field name="legal_entity_id" label="Legal entity" optional defaultValue={identity.legalEntityId} />
          <Field name="effective_from" label="Starts" type="datetime-local" optional hint="Blank = now." />
          <Field name="effective_to" label="Ends" type="datetime-local" optional hint="Blank = open-ended." />
          <Field name="approval_reference" label="Approval reference" optional hint="The request this grant was approved under." className="sm:col-span-2" />
        </FieldGrid>
      )}
    </ActionDialog>
  );
}

// ── separation of duties ─────────────────────────────────────────────────────

export function NewSoDRuleDialog() {
  return (
    <ActionDialog
      label="New rule"
      icon={<Plus className={ICON} />}
      tone="primary"
      variant="drawer"
      title="Add a separation-of-duties rule"
      description="Proposed now, in force once someone other than you publishes it."
      action={createSoDRuleAction}
      submitLabel="Propose rule"
    >
      <FieldGrid>
        <Field name="domain_code" label="Area" placeholder="e.g. FINANCE" />
        <SelectField
          name="conflict_type"
          label="Kind"
          defaultValue="HARD"
          options={[
            ["HARD", "Two actions nobody may hold together"],
            ["OWN_OBJECT_FORBIDDEN", "One action nobody may take on their own record"],
          ]}
        />
        <Field name="action_a" label="Action" placeholder="e.g. payment.create" />
        <Field name="action_b" label="Conflicts with" optional placeholder="e.g. payment.approve" hint="Not needed for an own-record rule." />
      </FieldGrid>
    </ActionDialog>
  );
}

export function ConflictLookupDialog() {
  return (
    <ActionDialog
      label="What conflicts?"
      icon={<Search className={ICON} />}
      title="What conflicts with an action?"
      description="Every action that may never be held together with this one."
      action={conflictingPermissionsAction}
      submitLabel="Look up"
    >
      <Field name="action_type" label="Action" placeholder="e.g. payment.approve" />
    </ActionDialog>
  );
}

export function RequestExceptionDialog({ ruleId }: { ruleId: string }) {
  return (
    <ActionDialog
      label="Request exception"
      variant="drawer"
      title="Request a duty-conflict exception"
      description="A time-boxed permission to hold this conflicting pair under a compensating control. Decided by someone other than you and the person it covers."
      action={requestSoDExceptionAction}
      hidden={{ sod_rule_id: ruleId }}
      submitLabel="Request"
    >
      <FieldGrid>
        <Field name="principal_id" label="Person (principal ID)" className="sm:col-span-2" />
        <Field name="compensating_control" label="Compensating control" placeholder="e.g. Monthly review by CFO" className="sm:col-span-2" />
        <Field name="reason" label="Reason" className="sm:col-span-2" />
        <Field name="effective_from" label="From" type="datetime-local" optional hint="Blank = now." />
        <Field name="expires_at" label="Expires" type="datetime-local" />
      </FieldGrid>
    </ActionDialog>
  );
}

// ── conditions ───────────────────────────────────────────────────────────────

export function NewConditionDialog() {
  return (
    <ActionDialog
      label="New condition"
      icon={<Plus className={ICON} />}
      tone="primary"
      variant="drawer"
      title="Add an access condition"
      description="A condition can only take an action away, never grant one. Requiring an attribute the calling service never sends refuses the action for everyone."
      action={createAbacRuleAction}
      submitLabel="Propose condition"
      footnote="Proposed now, in force once someone other than you publishes it."
    >
      <FieldGrid>
        <Field name="rule_code" label="Code" placeholder="e.g. PAYMENTS_WORKING_HOURS" />
        <Field name="action_type" label="Action" placeholder="e.g. payment.release" />
        <SelectField
          name="effect"
          label="Effect"
          defaultValue="REQUIRE"
          className="sm:col-span-2"
          options={[
            ["REQUIRE", "Require — refuse unless the condition holds"],
            ["FORBID", "Forbid — refuse when the condition holds"],
          ]}
        />
        <Field name="attribute_key" label="Attribute" placeholder="e.g. channel" />
        <SelectField name="operator" label="Comparison" defaultValue="eq" options={ABAC_OPERATORS.map((o) => [o.raw, o.label] as const)} />
        <Field
          name="attribute_value"
          label="Value"
          optional
          hint="Comma-separate for one of / none of. Not used for present / absent."
          className="sm:col-span-2"
        />
      </FieldGrid>
    </ActionDialog>
  );
}

// ── authority limits ─────────────────────────────────────────────────────────

export function RequestLimitDialog({ roles }: { roles: Role[] }) {
  return (
    <ActionDialog
      label="Request limit"
      icon={<Plus className={ICON} />}
      tone="primary"
      variant="drawer"
      title="Request an authority limit"
      description="The most a person or a role may approve or release in one act. It applies only after someone other than you, and other than the person it is for, approves it."
      action={requestLimitAction}
      reasons="change"
      submitLabel="Request"
    >
      <FieldGrid>
        <SelectField
          name="target"
          label="For"
          defaultValue="person"
          options={[
            ["person", "A person"],
            ["role", "Everyone holding a role"],
          ]}
          className="sm:col-span-2"
        />
        <Field name="principal_id" label="Person (principal ID)" optional hint="When the limit is for a person." />
        <SelectField
          name="role_id"
          label="Role"
          optional
          defaultValue=""
          hint="When the limit is for a role."
          options={[["", "Choose…"], ...roles.filter((r) => r.active_flag).map((r) => [r.role_id, r.role_code] as const)]}
        />
        <Field name="authority_type" label="Governs (action)" placeholder="e.g. payment.approve" className="sm:col-span-2" />
        <SelectField name="currency" label="Currency" options={CURRENCIES} defaultValue="GBP" />
        <Field name="legal_entity_id" label="Legal entity" optional hint="Blank = every legal entity." />
        <Field name="lower_limit" label="From amount" optional inputMode="decimal" placeholder="0" />
        <Field name="upper_limit" label="Up to amount" inputMode="decimal" placeholder="e.g. 25000" />
        <Field name="effective_from" label="Starts" type="datetime-local" optional hint="Blank = on approval." />
        <Field name="effective_to" label="Ends" type="datetime-local" optional hint="Blank = open-ended." />
      </FieldGrid>
    </ActionDialog>
  );
}

export function ChangeLimitDialog({ limit }: { limit: AuthorityLimit }) {
  return (
    <ActionDialog
      label="Request change"
      variant="drawer"
      title="Change this limit"
      description="The current limit keeps applying until someone else approves the new one. Leave a field blank to keep it."
      action={changeLimitAction}
      hidden={{ id: limit.authority_limit_id, expected_version: limit.version }}
      reasons="change"
      submitLabel="Request change"
    >
      <FieldGrid>
        <Field name="lower_limit" label="From amount" optional inputMode="decimal" placeholder={limit.lower_limit} />
        <Field name="upper_limit" label="Up to amount" optional inputMode="decimal" placeholder={limit.upper_limit} />
        <SelectField name="currency" label="Currency" options={CURRENCIES} defaultValue={limit.currency} />
        <Field name="effective_from" label="Starts" type="datetime-local" optional />
        <Field name="effective_to" label="Ends" type="datetime-local" optional className="sm:col-span-2" />
      </FieldGrid>
    </ActionDialog>
  );
}

// ── elevated access ──────────────────────────────────────────────────────────

export function JitDialog() {
  return (
    <ActionDialog
      label="Request JIT access"
      icon={<Timer className={ICON} />}
      tone="primary"
      variant="drawer"
      title="Request just-in-time access"
      description="Temporary elevation for a ticket, 8 hours at most. Anything beyond read access waits for an independent approver."
      action={issueJitAction}
      submitLabel="Request"
      footnote="Needs a two-step sign-in from the last 15 minutes; you will be asked for a code if yours is older."
    >
      <FieldGrid>
        <Field name="requested_actions" label="Actions" placeholder="comma-separated, no wildcards" className="sm:col-span-2" />
        <Field name="principal_id" label="For (principal ID)" optional placeholder="Blank = you" />
        <Field name="ticket_ref" label="Ticket" />
        <Field name="resource_scope" label="Resource" placeholder="e.g. ledger:GB01" />
        <SelectField
          name="target_environment"
          label="Environment"
          defaultValue="production"
          options={[
            ["production", "Production"],
            ["staging", "Staging"],
            ["test", "Test"],
          ]}
        />
        <Field name="duration_hours" label="Hours" type="number" min={0.25} max={8} step={0.25} defaultValue={1} />
        <Field name="reason" label="Reason" className="sm:col-span-2" />
      </FieldGrid>
    </ActionDialog>
  );
}

export function BreakGlassDialog() {
  return (
    <ActionDialog
      label="Break glass"
      icon={<Siren className={ICON} />}
      tone="danger"
      variant="drawer"
      title="Request emergency access"
      description="Tied to a declared incident; raises a critical security alert and opens a review when it ends. Never includes payment, posting or filing powers."
      action={issueBreakGlassAction}
      submitLabel="Request break-glass"
      footnote="Starts only when independent approvers approve it, and lapses if nobody does within an hour."
    >
      <FieldGrid>
        <Field name="incident_id" label="Incident reference" />
        <Field name="principal_id" label="For (principal ID)" optional placeholder="Blank = you" />
        <Field name="duration_minutes" label="Minutes" type="number" min={5} max={120} step={5} optional hint="Blank = service default." />
        <Field name="requested_actions" label="Actions" placeholder="comma-separated" className="sm:col-span-2" />
        <Field name="reason" label="Reason" className="sm:col-span-2" />
      </FieldGrid>
    </ActionDialog>
  );
}

export function SupportDialog() {
  return (
    <ActionDialog
      label="Support access"
      icon={<LifeBuoy className={ICON} />}
      variant="drawer"
      title="Open support access"
      description="Purpose-bound access for a support ticket, 4 hours at most. Read-only unless writes are named; nothing is granted without stated consent."
      action={openSupportSessionAction}
      submitLabel="Open"
    >
      <FieldGrid>
        <Field name="ticket_ref" label="Ticket" />
        <SelectField
          name="tenant_consent_obtained"
          label="Organisation consented?"
          defaultValue=""
          options={[
            ["", "Choose…"],
            ["yes", "Yes — consent or support agreement covers this"],
            ["no", "No"],
          ]}
        />
        <Field name="purpose" label="Purpose" className="sm:col-span-2" />
        <Field name="support_operator_id" label="Operator (principal ID)" optional placeholder="Blank = you" />
        <Field name="duration_hours" label="Hours" type="number" min={0.25} max={4} step={0.25} optional hint="Blank = service default." />
        <Field name="allowed_actions" label="Writes allowed" optional placeholder="Blank = read-only" className="sm:col-span-2" />
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" name="allow_bulk_export" /> Allow bulk export
        </label>
      </FieldGrid>
    </ActionDialog>
  );
}

/** Attest or flag an ended JIT or break-glass session. */
export function ReviewSessionDialog({ kind, id }: { kind: "privileged" | "break_glass"; id: string }) {
  return (
    <ActionDialog
      label="Review session"
      icon={<FileSearch className={ICON} />}
      tone="accent"
      title="Review this session"
      description="Read what the session did, then attest that it was appropriate or flag it. Flagging raises a security alert."
      action={reviewSessionAction}
      hidden={{ kind, id }}
      submitLabel="Record review"
    >
      <fieldset className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
        <legend className={LABEL}>Outcome</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="outcome" value="ATTESTED" defaultChecked /> Attest — nothing wrong found
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="outcome" value="FLAGGED" /> Flag — raises a security alert
        </label>
      </fieldset>
      <div>
        <label htmlFor={`review-${id}-notes`} className={LABEL}>
          Notes <span className="font-normal text-slate-400">(required to flag)</span>
        </label>
        <textarea id={`review-${id}-notes`} name="notes" rows={3} className={FIELD} />
      </div>
    </ActionDialog>
  );
}

// ── delegation ───────────────────────────────────────────────────────────────

export function LendDialog() {
  return (
    <ActionDialog
      label="Lend authority"
      icon={<Handshake className={ICON} />}
      tone="primary"
      variant="drawer"
      title="Lend your authority"
      description="Lends what you hold yourself, for a fixed period. It never confers more than you hold, and access-administration and platform powers cannot be lent."
      action={lendAuthorityAction}
      submitLabel="Lend"
    >
      <FieldGrid>
        <Field name="delegate_principal_id" label="Borrower (principal ID)" className="sm:col-span-2" />
        <SelectField
          name="scope_type"
          label="What to lend"
          defaultValue="ACTION_SUBSET"
          options={[
            ["FULL", "All of my authority"],
            ["ACTION_SUBSET", "Only the actions listed"],
          ]}
        />
        <Field name="delegated_actions" label="Actions" optional placeholder="comma-separated" hint="Needed when lending only some actions." />
        <Field name="effective_from" label="From" type="datetime-local" optional hint="Blank = now." />
        <Field name="effective_to" label="Until" type="datetime-local" />
        <Field name="legal_entity_id" label="Legal entity" optional hint="Blank = every legal entity you hold it in." className="sm:col-span-2" />
        <Field name="reason" label="Reason" placeholder="e.g. Annual leave cover" />
        <Field name="approval_reference" label="Approval reference" optional />
      </FieldGrid>
    </ActionDialog>
  );
}

// ── service access ───────────────────────────────────────────────────────────

export function SaveWorkloadDialog() {
  return (
    <ActionDialog
      label="Save binding"
      icon={<KeyRound className={ICON} />}
      tone="primary"
      variant="drawer"
      title="Save a workload binding"
      description="What one service identity may do. A binding only narrows: a bound workload can take only the actions listed, whatever its roles say. Saving an existing workload replaces its list."
      action={saveWorkloadBindingAction}
      reasons="change"
      submitLabel="Save"
    >
      <FieldGrid>
        <Field name="workload_id" label="Workload" placeholder="certificate name, e.g. payment-run-svc" className="sm:col-span-2" />
        <Field name="allowed_audience" label="Audience" placeholder="e.g. authorization-svc" />
        <Field name="allowed_actions" label="Actions" placeholder="comma-separated, no wildcards" />
      </FieldGrid>
    </ActionDialog>
  );
}

export function RefreshCacheDialog() {
  return (
    <ActionDialog
      label="Refresh cache"
      icon={<RefreshCw className={ICON} />}
      title="Refresh cached decisions"
      description="Decisions are cached for about five seconds. Use this when a revocation must take effect on every replica immediately."
      action={invalidateCacheAction}
      reasons="change"
      submitLabel="Refresh cache"
    >
      <Field name="principal_id" label="About (principal ID)" optional hint="Recorded as the reason's subject; the whole organisation's cache is dropped." />
    </ActionDialog>
  );
}

// ── decisions ────────────────────────────────────────────────────────────────

export function ExplainDecisionDialog({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <ActionDialog
      label="Explain a decision"
      icon={<FileSearch className={ICON} />}
      size={size}
      title="Explain one decision"
      description="Read back a decision by the ID a check or a refusal reported."
      action={lookupDecisionAction}
      submitLabel="Explain"
    >
      <Field name="access_decision_id" label="Decision ID" />
    </ActionDialog>
  );
}
