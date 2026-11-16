"use client";

// Create forms for corporate-tax-svc and withholding-tax-svc, wired to
// app/admin/tax/tax-actions.ts.
//
// Every amount, rate and currency is the reader's: the service computes the
// derived figures (taxable income and liability; the amount withheld) and the
// form shows what it returned. The legal entity and author are the session's.

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { createCorporateTaxReturnAction, createWithholdingAction } from "@/app/admin/tax/tax-actions";
import {
  IDLE_TAX_STATE,
  type CorporateTaxState,
  type WithholdingState,
} from "@/app/admin/tax/tax-state";
import type { JurisdictionOptions } from "./jurisdiction-options";
import { JurisdictionSelect, jurisdictionsUsable } from "./JurisdictionSelect";
import { RecordRows, WriteFeedback, jurisdictionNamer } from "./TaxRuleForms";

const money = (n: number, currency: string) => `${n.toLocaleString("en-US")} ${currency}`;

function NumberField({ id, name, label, hint, optional }: { id: string; name: string; label: string; hint?: string; optional?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label} {optional && <span className={OPTIONAL}>(optional)</span>}
      </label>
      <input id={id} name={name} type="number" min="0" step="any" required={!optional} className={FIELD} />
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  );
}

function CurrencyField({ id }: { id: string }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>Currency (ISO 4217)</label>
      <input id={id} name="currency" required maxLength={3} pattern="[A-Za-z]{3}" className={FIELD} autoComplete="off" />
    </div>
  );
}

/** Raise a corporate income tax return (corporate-tax-svc). It lands DRAFT. */
export function CorporateTaxReturnForm({ jurisdictions }: { jurisdictions: JurisdictionOptions }) {
  const [state, action, pending] = useActionState<CorporateTaxState, FormData>(createCorporateTaxReturnAction, IDLE_TAX_STATE);
  const usable = jurisdictionsUsable(jurisdictions);
  const name = jurisdictionNamer(jurisdictions);
  const r = state.record;

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Raise a corporate tax return</h4>
      <form action={action} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <JurisdictionSelect id="ct-jurisdiction" name="jurisdiction_id" label="Jurisdiction" options={jurisdictions} className={FIELD} labelClassName={LABEL} />
          <div>
            <label htmlFor="ct-registration" className={LABEL}>Tax registration number</label>
            <input id="ct-registration" name="tax_registration_number" required className={FIELD} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="ct-fiscal-year" className={LABEL}>Fiscal year</label>
            <input id="ct-fiscal-year" name="fiscal_year" type="number" min="1900" max="9999" step="1" required className={FIELD} />
          </div>
          <div>
            <label htmlFor="ct-period-start" className={LABEL}>Accounting period start</label>
            <input id="ct-period-start" name="accounting_period_start" type="date" required className={FIELD} />
          </div>
          <div>
            <label htmlFor="ct-period-end" className={LABEL}>Accounting period end</label>
            <input id="ct-period-end" name="accounting_period_end" type="date" required className={FIELD} />
          </div>
          <CurrencyField id="ct-currency" />
          <NumberField id="ct-gross-revenue" name="gross_revenue" label="Gross revenue" />
          <NumberField id="ct-deductions" name="allowable_deductions" label="Allowable deductions" />
          <NumberField id="ct-rate" name="tax_rate_percent" label="Tax rate (%)" />
          <NumberField id="ct-credits" name="tax_credits" label="Tax credits" />
          <NumberField id="ct-paid" name="tax_already_paid" label="Tax already paid" />
          <div>
            <label htmlFor="ct-effective-from" className={LABEL}>Effective from</label>
            <input id="ct-effective-from" name="effective_from" type="date" required className={FIELD} />
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="ct-notes" className={LABEL}>Notes <span className={OPTIONAL}>(optional)</span></label>
            <input id="ct-notes" name="notes" className={FIELD} autoComplete="off" />
          </div>
        </div>
        <p className={HINT}>corporate-tax-svc computes taxable income, liability and balance due from these figures.</p>
        <Button type="submit" size="sm" loading={pending} disabled={pending || !usable}>
          {pending ? "Raising…" : "Raise return"}
        </Button>
      </form>
      <WriteFeedback state={state}>
        {r && (
          <RecordRows
            rows={[
              ["Return ID", r.return_id],
              ["Jurisdiction", name(r.jurisdiction_id)],
              ["Fiscal year", String(r.fiscal_year)],
              ["Taxable income", money(r.taxable_income, r.currency)],
              ["Rate", `${r.tax_rate_percent}%`],
              ["Gross liability", money(r.gross_tax_liability, r.currency)],
              ["Net payable", money(r.net_tax_payable, r.currency)],
              ["Balance due", money(r.balance_due, r.currency)],
              ["Status", r.status],
            ]}
          />
        )}
      </WriteFeedback>
    </div>
  );
}

export type CounterpartyOptions =
  | { ok: true; items: { id: string; name: string; type: string }[] }
  | { ok: false; error: string };

/** Record a withholding obligation on a payment (withholding-tax-svc). */
export function WithholdingObligationForm({
  jurisdictions,
  counterparties,
}: {
  jurisdictions: JurisdictionOptions;
  counterparties: CounterpartyOptions;
}) {
  const [state, action, pending] = useActionState<WithholdingState, FormData>(createWithholdingAction, IDLE_TAX_STATE);
  const usable = jurisdictionsUsable(jurisdictions) && counterparties.ok && counterparties.items.length > 0;
  const name = jurisdictionNamer(jurisdictions);
  const o = state.record;

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Record a withholding obligation</h4>
      <form action={action} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <JurisdictionSelect id="wht-jurisdiction" name="jurisdiction_id" label="Jurisdiction" options={jurisdictions} className={FIELD} labelClassName={LABEL} />
          <div>
            {counterparties.ok ? (
              <>
                <label htmlFor="wht-counterparty" className={LABEL}>Counterparty paid</label>
                <select id="wht-counterparty" name="counterparty_id" required defaultValue="" className={FIELD}>
                  <option value="" disabled>
                    {counterparties.items.length === 0 ? "No counterparties registered" : "Select a counterparty"}
                  </option>
                  {counterparties.items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
                {counterparties.items.length === 0 && (
                  <p className={HINT}>Register the counterparty in counterparty-management-svc (Legal) first.</p>
                )}
              </>
            ) : (
              <>
                <span className={LABEL}>Counterparty paid</span>
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  The counterparty register could not be read, so this form cannot be submitted: {counterparties.error}
                </p>
              </>
            )}
          </div>
          <div>
            <label htmlFor="wht-payment-ref" className={LABEL}>Payment reference</label>
            <input id="wht-payment-ref" name="payment_reference" required className={FIELD} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="wht-payment-type" className={LABEL}>Payment type</label>
            <input id="wht-payment-type" name="payment_type" required className={FIELD} autoComplete="off" />
          </div>
          <NumberField id="wht-gross" name="gross_payment_amount" label="Gross payment" />
          <NumberField id="wht-base" name="taxable_base_amount" label="Taxable base" optional hint="When empty, the service uses the gross payment." />
          <NumberField id="wht-rate" name="withholding_rate_percent" label="Withholding rate (%)" />
          <CurrencyField id="wht-currency" />
          <div>
            <label htmlFor="wht-effective-from" className={LABEL}>Effective from</label>
            <input id="wht-effective-from" name="effective_from" type="date" required className={FIELD} />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input id="wht-treaty" name="tax_treaty_exemption" type="checkbox" className="h-4 w-4 rounded border-slate-300" />
            <label htmlFor="wht-treaty" className="text-xs text-slate-600 dark:text-slate-400">Treaty exemption claimed</label>
          </div>
          <div>
            <label htmlFor="wht-certificate" className={LABEL}>Exemption certificate <span className={OPTIONAL}>(if claimed)</span></label>
            <input id="wht-certificate" name="exemption_certificate_ref" className={FIELD} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="wht-notes" className={LABEL}>Notes <span className={OPTIONAL}>(optional)</span></label>
            <input id="wht-notes" name="notes" className={FIELD} autoComplete="off" />
          </div>
        </div>
        <Button type="submit" size="sm" loading={pending} disabled={pending || !usable}>
          {pending ? "Recording…" : "Record obligation"}
        </Button>
      </form>
      <WriteFeedback state={state}>
        {o && (
          <RecordRows
            rows={[
              ["Obligation ID", o.obligation_id],
              ["Jurisdiction", name(o.jurisdiction_id)],
              ["Payment", `${o.payment_reference} (${o.payment_type})`],
              ["Gross", money(o.gross_payment_amount, o.currency)],
              ["Taxable base", money(o.taxable_base_amount, o.currency)],
              ["Rate", `${o.withholding_rate_percent}%`],
              ["Withheld", money(o.withheld_amount, o.currency)],
              ["Status", o.status],
            ]}
          />
        )}
      </WriteFeedback>
    </div>
  );
}
