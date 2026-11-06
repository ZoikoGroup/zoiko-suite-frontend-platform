"use client";

// Forms wired to app/admin/tax/tax-actions.ts: create a tax rule, change one
// (activate, deprecate, edit a DRAFT), and evaluate a determination.
//
// Jurisdictions are picked from jurisdiction-rules-svc's register, read on the
// server and passed in; the value sent is the jurisdiction UUID, which is what
// tax-determination-svc validates and what it looks rules up by. There is no
// free-text jurisdiction and no fallback list: when the register cannot be
// read the error is shown and the submit stays disabled.

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { BANNER_ERROR, BANNER_SUCCESS, FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import {
  createTaxRuleAction,
  updateTaxRuleAction,
  evaluateDeterminationAction,
} from "@/app/admin/tax/tax-actions";
import {
  IDLE_TAX_STATE,
  TAX_RULE_CATEGORIES,
  type TaxWriteState,
  type TaxRuleState,
  type DeterminationState,
} from "@/app/admin/tax/tax-state";
import type { TaxRule, TaxDetermination } from "@/lib/api/tax";
import type { JurisdictionOptions } from "./jurisdiction-options";
import { JurisdictionSelect, jurisdictionsUsable, jurisdictionLabel } from "./JurisdictionSelect";

/** The jurisdiction's code and name, or its id when the register does not list it. */
export function jurisdictionNamer(options: JurisdictionOptions) {
  return (id: string | undefined | null) => {
    if (!id) return "—";
    const j = options.ok ? options.items.find((x) => x.id === id) : undefined;
    return j ? jurisdictionLabel(j.code, j.name) : id;
  };
}

/** Outcome banner: the service's message, then the record it returned. */
export function WriteFeedback<T>({ state, children }: { state: TaxWriteState<T>; children?: React.ReactNode }) {
  if (state.status === "idle") return null;
  const isError = state.status === "error";
  return (
    <div
      className={cn("flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm animate-fade-up", isError ? BANNER_ERROR : BANNER_SUCCESS)}
      role="status"
      aria-live="polite"
    >
      {isError ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
      <div className="min-w-0 flex-1 space-y-2">
        <p className="break-words leading-relaxed">{state.message}</p>
        {!isError && children && (
          <div className="rounded-lg bg-white/70 p-3 ring-1 ring-inset ring-black/5 dark:bg-slate-900/40 dark:ring-white/5">{children}</div>
        )}
      </div>
    </div>
  );
}

/** Label/value rows for a returned record. */
export function RecordRows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
          <dd className="break-all font-mono text-slate-800 dark:text-slate-200">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function RuleRecord({ rule, jurisdictionName }: { rule: TaxRule; jurisdictionName: (id: string) => string }) {
  return (
    <RecordRows
      rows={[
        ["Rule ID", rule.rule_id],
        ["Rule code", rule.rule_code],
        ["Name", rule.name],
        ["Jurisdiction", jurisdictionName(rule.jurisdiction_id)],
        ["Category", rule.category],
        ["Rate", `${rule.tax_rate_percentage}%`],
        ["Effective", `${rule.effective_from}${rule.effective_to ? ` → ${rule.effective_to}` : ""}`],
        ["Status", rule.status],
        ["Version", String(rule.version)],
      ]}
    />
  );
}

// ── Create a rule ────────────────────────────────────────────────────────────

export function NewTaxRuleForm({ jurisdictions }: { jurisdictions: JurisdictionOptions }) {
  const [state, action, pending] = useActionState<TaxRuleState, FormData>(createTaxRuleAction, IDLE_TAX_STATE);
  const usable = jurisdictionsUsable(jurisdictions);
  const name = jurisdictionNamer(jurisdictions);

  return (
    <div className="space-y-3">
      <form action={action} className="space-y-3">
        <JurisdictionSelect
          id="rule-jurisdiction"
          name="jurisdiction_id"
          label="Jurisdiction"
          options={jurisdictions}
          className={FIELD}
          labelClassName={LABEL}
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rule-code" className={LABEL}>Rule code</label>
            <input id="rule-code" name="rule_code" required className={FIELD} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="rule-category" className={LABEL}>Tax category</label>
            <select id="rule-category" name="category" required defaultValue="" className={FIELD}>
              <option value="" disabled>Select a category</option>
              {TAX_RULE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label htmlFor="rule-name" className={LABEL}>Rule name</label>
            <input id="rule-name" name="name" required className={FIELD} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="rule-rate" className={LABEL}>Tax rate (%)</label>
            <input id="rule-rate" name="tax_rate_percentage" type="number" min="0" max="100" step="any" required className={FIELD} />
          </div>
          <div>
            <label htmlFor="rule-effective-from" className={LABEL}>Effective from</label>
            <input id="rule-effective-from" name="effective_from" type="date" required className={FIELD} />
          </div>
          <div>
            <label htmlFor="rule-effective-to" className={LABEL}>Effective to <span className={OPTIONAL}>(optional)</span></label>
            <input id="rule-effective-to" name="effective_to" type="date" className={FIELD} />
          </div>
        </div>
        <p className={HINT}>The rule lands DRAFT. A determination uses it only once it is activated.</p>
        <Button type="submit" size="sm" loading={pending} disabled={pending || !usable}>
          {pending ? "Creating…" : "Create rule"}
        </Button>
      </form>
      <WriteFeedback state={state}>{state.record && <RuleRecord rule={state.record} jurisdictionName={name} />}</WriteFeedback>
    </div>
  );
}

// ── Change a rule ────────────────────────────────────────────────────────────

/**
 * Activate, deprecate or edit one rule from the rules register. The status
 * shown after a change is the one the service returned. ACTIVE and DEPRECATED
 * rules cannot be changed in place; the service's 409 is shown as sent.
 */
export function TaxRuleRowActions({ rule }: { rule: Pick<TaxRule, "rule_id" | "rule_code" | "name" | "status" | "tax_rate_percentage" | "effective_to"> }) {
  const [state, action, pending] = useActionState<TaxRuleState, FormData>(updateTaxRuleAction, IDLE_TAX_STATE);
  const [editing, setEditing] = useState(false);
  const status = state.record?.status ?? rule.status;
  const btn =
    "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50 " +
    "border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800";

  return (
    <div className="space-y-1.5" data-rule-id={rule.rule_id}>
      <form action={action} className="flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="rule_id" value={rule.rule_id} />
        {status !== "ACTIVE" && status !== "DEPRECATED" && (
          <button type="submit" name="intent" value="activate" disabled={pending} className={btn}>Activate</button>
        )}
        {status !== "DEPRECATED" && (
          <button type="submit" name="intent" value="deprecate" disabled={pending} className={btn}>Deprecate</button>
        )}
        {status === "DRAFT" && (
          <button type="button" onClick={() => setEditing((e) => !e)} disabled={pending} className={btn}>
            {editing ? "Close edit" : "Edit"}
          </button>
        )}
        {pending && <Loader2 className="h-3 w-3 animate-spin text-slate-400" aria-label="Working" />}
      </form>
      {editing && status === "DRAFT" && (
        <form action={action} className="grid grid-cols-3 gap-1.5" aria-label={`Edit rule ${rule.rule_code}`}>
          <input type="hidden" name="rule_id" value={rule.rule_id} />
          <input type="hidden" name="intent" value="edit" />
          <input name="name" defaultValue={rule.name} aria-label="Rule name" className={cn(FIELD, "px-2 py-1 text-xs")} />
          <input name="tax_rate_percentage" type="number" min="0" max="100" step="any" defaultValue={rule.tax_rate_percentage} aria-label="Tax rate (%)" className={cn(FIELD, "px-2 py-1 text-xs")} />
          <input name="effective_to" type="date" defaultValue={rule.effective_to ?? ""} aria-label="Effective to" className={cn(FIELD, "px-2 py-1 text-xs")} />
          <button type="submit" disabled={pending} className={cn(btn, "col-span-3 justify-self-start")}>Save draft</button>
        </form>
      )}
      {state.status !== "idle" && (
        <p role="status" className={cn("max-w-[260px] break-words text-[11px]", state.status === "error" ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400")}>
          {state.message}
        </p>
      )}
    </div>
  );
}

// ── Determination ────────────────────────────────────────────────────────────

// tax-determination-svc's TAX-03 classifications (the same values as
// SUPPLY_KINDS / SUPPLY_TYPES in lib/api/tax.ts, which is server-only).
const SUPPLY_KINDS = [
  { value: "GOODS", label: "Goods" },
  { value: "SERVICES", label: "Services" },
  { value: "DIGITAL_SERVICES", label: "Digital services" },
] as const;
const SUPPLY_TYPES = [
  { value: "B2C", label: "B2C — consumer" },
  { value: "B2B", label: "B2B — business" },
  { value: "B2G", label: "B2G — public body" },
] as const;

function money(n: number | undefined, currency: string) {
  return n == null ? "—" : `${n.toLocaleString("en-US")} ${currency}`;
}

function DeterminationRecord({ d, jurisdictionName }: { d: TaxDetermination; jurisdictionName: (id: string) => string }) {
  return (
    <RecordRows
      rows={[
        ["Determination", d.determination_id],
        ["Rule applied", d.rule_id ?? "—"],
        ["Jurisdiction", jurisdictionName(d.jurisdiction_id)],
        ["Place of supply", jurisdictionName(d.supply_jurisdiction_id)],
        ["Gross", money(d.gross_amount, d.currency)],
        ["Taxable base", money(d.taxable_amount, d.currency)],
        ["Rate", d.tax_rate_percentage == null ? "—" : `${d.tax_rate_percentage}%`],
        ["Calculated tax", money(d.calculated_tax_amount, d.currency)],
        ["Status", d.status],
      ]}
    />
  );
}

export function DeterminationForm({ jurisdictions }: { jurisdictions: JurisdictionOptions }) {
  const [state, action, pending] = useActionState<DeterminationState, FormData>(evaluateDeterminationAction, IDLE_TAX_STATE);
  const [supplyType, setSupplyType] = useState("");
  const usable = jurisdictionsUsable(jurisdictions);
  const name = jurisdictionNamer(jurisdictions);

  const textFields: [string, string, string?][] = [
    ["transaction_id", "Transaction ID"],
    ["gross_amount", "Gross amount", "number"],
    ["currency", "Currency (ISO 4217)"],
    ["seller_party_id", "Seller party ID"],
    ["buyer_party_id", "Buyer party ID"],
    ["supply_date", "Supply date", "date"],
    ["product_classification", "Product classification"],
  ];

  return (
    <div className="space-y-3">
      <form action={action} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <JurisdictionSelect id="det-jurisdiction_id" name="jurisdiction_id" label="Jurisdiction" options={jurisdictions} className={FIELD} labelClassName={LABEL} />
          <JurisdictionSelect id="det-supply_jurisdiction_id" name="supply_jurisdiction_id" label="Place of supply" options={jurisdictions} className={FIELD} labelClassName={LABEL} />
          <div>
            <label htmlFor="det-tax_category" className={LABEL}>Tax category</label>
            <select id="det-tax_category" name="tax_category" required defaultValue="" className={FIELD}>
              <option value="" disabled>Select a category</option>
              {TAX_RULE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {textFields.map(([k, label, type]) => (
            <div key={k}>
              <label htmlFor={`det-${k}`} className={LABEL}>{label}</label>
              <input
                id={`det-${k}`}
                name={k}
                type={type ?? "text"}
                required
                {...(type === "number" ? { min: "0", step: "any" } : {})}
                {...(k === "currency" ? { maxLength: 3, pattern: "[A-Za-z]{3}" } : {})}
                className={FIELD}
                autoComplete="off"
              />
            </div>
          ))}
          <div>
            <label htmlFor="det-supply_kind" className={LABEL}>Supply kind</label>
            <select id="det-supply_kind" name="supply_kind" required defaultValue="" className={FIELD}>
              <option value="" disabled>Select…</option>
              {SUPPLY_KINDS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="det-supply_type" className={LABEL}>Supply type</label>
            <select id="det-supply_type" name="supply_type" required value={supplyType} onChange={(e) => setSupplyType(e.target.value)} className={FIELD}>
              <option value="" disabled>Select…</option>
              {SUPPLY_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {supplyType === "B2B" && (
            <div className="col-span-2">
              <label htmlFor="det-buyer_tax_registration_id" className={LABEL}>Buyer tax registration (place of supply)</label>
              <input id="det-buyer_tax_registration_id" name="buyer_tax_registration_id" required className={FIELD} autoComplete="off" />
            </div>
          )}
        </div>
        <Button type="submit" size="sm" loading={pending} disabled={pending || !usable}>
          {pending ? "Evaluating…" : "Run evaluation"}
        </Button>
      </form>
      <WriteFeedback state={state}>{state.record && <DeterminationRecord d={state.record} jurisdictionName={name} />}</WriteFeedback>
    </div>
  );
}
