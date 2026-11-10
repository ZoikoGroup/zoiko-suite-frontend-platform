"use client";

// Create forms for obligation-tracking-svc, counterparty-management-svc and
// corporate-actions-svc, wired to app/admin/legal/register-actions.ts.
//
// The legal entity and author are the session's and are not fields here.
// Each form shows the record the service returned, and the panel below it
// re-renders with the new row (the actions end in refresh()).

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import {
  createObligationAction,
  createCounterpartyAction,
  createCorporateActionAction,
} from "@/app/admin/legal/register-actions";
import { IDLE_LEGAL_CREATE, type LegalCreateState } from "@/app/admin/legal/state";
import type { Obligation, Counterparty, CorporateAction } from "@/lib/api/legal";
import type { JurisdictionOptions } from "@/components/admin/tax/jurisdiction-options";
import { JurisdictionSelect, jurisdictionsUsable } from "@/components/admin/tax/JurisdictionSelect";
import { RecordRows, WriteFeedback, jurisdictionNamer } from "@/components/admin/tax/TaxRuleForms";

// The services' declared values (lib/api/legal.ts exports the same lists, but
// that module is server-only).
const SOURCE_TYPES = ["CONTRACT", "CLAUSE"] as const;
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const COUNTERPARTY_TYPES = ["VENDOR", "CUSTOMER", "PARTNER", "REGULATOR", "FINANCIAL_INSTITUTION", "OTHER"] as const;
const RISK_CATEGORIES = ["LOW", "MEDIUM", "HIGH", "RESTRICTED"] as const;
const ACTION_TYPES = [
  "MERGER", "ACQUISITION", "SHARE_ISSUANCE", "SHARE_BUYBACK", "RESTRUCTURE", "DIVIDEND_DECLARATION", "NAME_CHANGE",
] as const;

const BOX = "space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40";
const TITLE = "text-sm font-semibold text-slate-800 dark:text-slate-200";

function Select({ id, name, label, values, required = true, optional }: { id: string; name: string; label: string; values: readonly string[]; required?: boolean; optional?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label} {optional && <span className={OPTIONAL}>(optional)</span>}
      </label>
      <select id={id} name={name} required={required} defaultValue="" className={FIELD}>
        <option value="" disabled={required}>{optional ? "Not stated" : "Select…"}</option>
        {values.map((v) => <option key={v} value={v}>{v.replace(/_/g, " ")}</option>)}
      </select>
    </div>
  );
}

function Input({ id, name, label, type = "text", optional, hint }: { id: string; name: string; label: string; type?: string; optional?: boolean; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label} {optional && <span className={OPTIONAL}>(optional)</span>}
      </label>
      <input id={id} name={name} type={type} required={!optional} className={FIELD} autoComplete="off" />
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  );
}

/** Record a contract-derived obligation (obligation-tracking-svc). */
export function CreateObligationForm() {
  const [state, action, pending] = useActionState<LegalCreateState<Obligation>, FormData>(createObligationAction, IDLE_LEGAL_CREATE);
  const o = state.record;
  return (
    <div className={BOX}>
      <h4 className={TITLE}>Record an obligation</h4>
      <form action={action} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select id="obl-source-type" name="source_type" label="Source" values={SOURCE_TYPES} />
          <Input id="obl-source-id" name="source_id" label="Source contract or clause ID" />
          <Select id="obl-risk" name="risk_level" label="Risk level" values={RISK_LEVELS} />
          <div className="sm:col-span-2">
            <Input id="obl-title" name="title" label="Title" />
          </div>
          <Input id="obl-assigned" name="assigned_to" label="Assigned to" optional />
          <div className="sm:col-span-3">
            <Input id="obl-description" name="description" label="Description" optional />
          </div>
          <Input id="obl-due" name="due_date" label="Due date" type="date" />
          <Input id="obl-effective-from" name="effective_from" label="Effective from" type="date" />
          <Input id="obl-effective-to" name="effective_to" label="Effective to" type="date" optional />
        </div>
        <p className={HINT}>
          obligation-tracking-svc tracks contractual obligations only; statutory and regulatory ones belong in
          obligations-svc. It lands PLANNED.
        </p>
        <Button type="submit" size="sm" loading={pending} disabled={pending}>
          {pending ? "Recording…" : "Record obligation"}
        </Button>
      </form>
      <WriteFeedback state={state}>
        {o && (
          <RecordRows
            rows={[
              ["Obligation ID", o.obligation_id],
              ["Title", o.title],
              ["Source", `${o.source_type} ${o.source_id}`],
              ["Type", o.obligation_type],
              ["Risk", o.risk_level],
              ["Due", o.due_date],
              ["Status", o.status],
            ]}
          />
        )}
      </WriteFeedback>
    </div>
  );
}

/** Register a counterparty (counterparty-management-svc). */
export function CreateCounterpartyForm({ jurisdictions }: { jurisdictions: JurisdictionOptions }) {
  const [state, action, pending] = useActionState<LegalCreateState<Counterparty>, FormData>(createCounterpartyAction, IDLE_LEGAL_CREATE);
  const usable = jurisdictionsUsable(jurisdictions);
  const name = jurisdictionNamer(jurisdictions);
  const c = state.record;
  return (
    <div className={BOX}>
      <h4 className={TITLE}>Register a counterparty</h4>
      <form action={action} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input id="cp-name" name="name" label="Name" />
          <Select id="cp-type" name="counterparty_type" label="Type" values={COUNTERPARTY_TYPES} />
          <JurisdictionSelect id="cp-jurisdiction" name="jurisdiction_id" label="Jurisdiction" options={jurisdictions} className={FIELD} labelClassName={LABEL} />
          <Select id="cp-risk" name="risk_category" label="Risk category" values={RISK_CATEGORIES} required={false} optional />
          <Input id="cp-registration" name="registration_number" label="Registration number" optional />
          <Input id="cp-tax-id" name="tax_id" label="Tax ID" optional />
          <Input id="cp-email" name="contact_email" label="Contact email" type="email" optional />
          <Input id="cp-phone" name="phone" label="Phone" optional />
          <Input id="cp-effective-from" name="effective_from" label="Effective from" type="date" />
          <div className="sm:col-span-3">
            <Input id="cp-address" name="address" label="Address" optional />
          </div>
        </div>
        <Button type="submit" size="sm" loading={pending} disabled={pending || !usable}>
          {pending ? "Registering…" : "Register counterparty"}
        </Button>
      </form>
      <WriteFeedback state={state}>
        {c && (
          <RecordRows
            rows={[
              ["Counterparty ID", c.counterparty_id],
              ["Name", c.name],
              ["Type", c.counterparty_type],
              ["Jurisdiction", name(c.jurisdiction_id)],
              ["Risk", c.risk_category || "—"],
              ["Status", c.status],
              ["Compliance", c.compliance_status],
            ]}
          />
        )}
      </WriteFeedback>
    </div>
  );
}

/** Propose a corporate action (corporate-actions-svc). */
export function CreateCorporateActionForm() {
  const [state, action, pending] = useActionState<LegalCreateState<CorporateAction>, FormData>(createCorporateActionAction, IDLE_LEGAL_CREATE);
  const a = state.record;
  return (
    <div className={BOX}>
      <h4 className={TITLE}>Propose a corporate action</h4>
      <form action={action} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Input id="ca-title" name="title" label="Title" />
          </div>
          <Select id="ca-type" name="action_type" label="Action type" values={ACTION_TYPES} />
          <Input id="ca-effective-date" name="effective_date" label="Effective date" type="date" />
          <div className="sm:col-span-2">
            <Input
              id="ca-resolution"
              name="resolution_id"
              label="Authorising board resolution ID"
              optional
              hint="When given, corporate-actions-svc checks it is a PASSED resolution of this entity."
            />
          </div>
          <div className="sm:col-span-3">
            <Input id="ca-description" name="description" label="Description" optional />
          </div>
        </div>
        <Button type="submit" size="sm" loading={pending} disabled={pending}>
          {pending ? "Proposing…" : "Propose action"}
        </Button>
      </form>
      <WriteFeedback state={state}>
        {a && (
          <RecordRows
            rows={[
              ["Action ID", a.action_id],
              ["Title", a.title],
              ["Type", a.action_type],
              ["Effective", a.effective_date],
              ["Resolution", a.resolution_id || "—"],
              ["Status", a.status],
            ]}
          />
        )}
      </WriteFeedback>
    </div>
  );
}
