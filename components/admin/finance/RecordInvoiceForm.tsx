"use client";

import { useActionState } from "react";
import { CopyableId, ResultBanner, type BannerTone } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { Button } from "@/components/ui";
import { recordVendorInvoice } from "@/app/admin/finance/actions";
import {
  CURRENCIES,
  IDLE_PAYABLE_STATE,
  type PayableActionState,
} from "@/app/admin/finance/state";

const TONE: Record<PayableActionState["status"], BannerTone> = {
  idle: "neutral",
  recorded: "success",
  // A replay wrote nothing. Green would claim a liability that was not booked.
  replayed: "neutral",
  advanced: "success",
  "out-of-sequence": "warning",
  // A correct refusal with a remedy, not a malfunction: the number is already on
  // the register.
  duplicate: "warning",
  error: "error",
};

/**
 * Stage 1 of 4 — take a vendor invoice onto the books.
 *
 * The invoice lands RECEIVED and authorises no payment. Tenant and legal entity
 * come from the session rather than the form: they are uuid columns fed to the
 * row-level security policy, and they are not the operator's to choose.
 *
 * The created ID is surfaced as a copy button rather than only inside the
 * sentence, because it is the one value that has to leave this form by hand — the
 * lookup panel takes it, and text inside a banner cannot be clicked to copy.
 */
export function RecordInvoiceForm() {
  const [state, action, pending] = useActionState<PayableActionState, FormData>(
    recordVendorInvoice,
    IDLE_PAYABLE_STATE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label htmlFor="vendor_id" className={LABEL}>
            Vendor reference
          </label>
          <input
            id="vendor_id"
            name="vendor_id"
            required
            placeholder="VND-DELL-UK"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Free text, checked against nothing — there is no Vendor Master service in this
            platform, so a mistyped vendor produces a valid invoice against one that does not
            exist.
          </p>
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="invoice_number" className={LABEL}>
            Vendor&apos;s invoice number
          </label>
          <input
            id="invoice_number"
            name="invoice_number"
            required
            placeholder="INV-2026-00417"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Unique per vendor within this tenant. A repeat is refused and named as a duplicate, so
            the same invoice cannot be booked as a second liability. Two different vendors may
            reuse a number.
          </p>
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="due_date" className={LABEL}>
            Due date
          </label>
          <input
            id="due_date"
            name="due_date"
            type="date"
            required
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            A calendar date, stored as one. Past dates are accepted — an invoice received late is
            still a liability, and the register flags it as overdue.
          </p>
        </div>

        <div className="lg:col-span-3">
          <label htmlFor="amount" className={LABEL}>
            Amount <span className={OPTIONAL}>(greater than zero)</span>
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="14750.00"
            className={FIELD}
            autoComplete="off"
          />
        </div>

        <div className="lg:col-span-3">
          <label htmlFor="currency_code" className={LABEL}>
            Currency
          </label>
          <select id="currency_code" name="currency_code" defaultValue="GBP" className={FIELD}>
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Recording…" : "Record invoice"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Stage 1 of 4. Lands RECEIVED — nothing is payable until it has been validated, approved,
          and sent for payment, in that order.
        </p>
      </div>

      <ResultBanner tone={TONE[state.status]} message={state.message}>
        {state.invoiceId && (
          <div className="flex items-center gap-2 text-xs">
            <span className="shrink-0 opacity-70">Invoice ID</span>
            <CopyableId value={state.invoiceId} className="text-[11px]" />
          </div>
        )}
      </ResultBanner>
    </form>
  );
}
