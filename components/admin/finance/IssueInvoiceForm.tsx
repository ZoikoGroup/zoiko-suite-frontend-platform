"use client";

import { useActionState } from "react";
import { CopyableId, ResultBanner, type BannerTone } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { Button } from "@/components/ui";
import { issueCustomerInvoiceAction } from "@/app/admin/finance/actions";
import {
  CURRENCIES,
  IDLE_RECEIVABLE_STATE,
  type ReceivableActionState,
} from "@/app/admin/finance/state";

const TONE: Record<ReceivableActionState["status"], BannerTone> = {
  idle: "neutral",
  issued: "success",
  // A replay wrote nothing. Green would claim a receivable that was not opened.
  replayed: "neutral",
  advanced: "success",
  // Correct refusals with a remedy, not malfunctions.
  "not-yet-due": "neutral",
  unledgered: "neutral",
  // The books disagree about the amount. A bookkeeping error to look at, so amber
  // rather than the neutral tone the "nothing posted yet" case gets.
  unbalanced: "warning",
  // The legal entity is not this tenant's, or is not trading. The control working.
  "entity-refused": "warning",
  "out-of-sequence": "warning",
  duplicate: "warning",
  error: "error",
};

/**
 * Open a customer receivable. It lands ISSUED.
 *
 * Tenant, legal entity and the issuing principal all come from the session, not
 * from this form: they are the values the service authorizes and isolates on, and
 * they are not the operator's to choose. The previous version of this page did
 * choose them — it posted `tenant_id: "tenant-zoiko-dev-01"`,
 * `legal_entity_id: "le-singapore-01"` and
 * `created_by_principal_id: "principal-admin-01"` from the browser, none of them
 * UUIDs, against three UUID NOT NULL columns.
 */
export function IssueInvoiceForm() {
  const [state, action, pending] = useActionState<ReceivableActionState, FormData>(
    issueCustomerInvoiceAction,
    IDLE_RECEIVABLE_STATE,
  );

  // The correlation id is minted in the Server Action, not here.
  //
  // This form briefly carried a hidden field set from useId(), on the reasoning
  // that one stable key per mounted form would collapse a double-submit into one
  // receivable. It does — but useId is deterministic per position in the tree, so
  // the key was ALSO stable across genuinely different submissions and across page
  // loads. Issuing a second invoice without reloading resolved to the first one as
  // an idempotent replay, and the form could never create more than one. The
  // click-through caught it on its second run.
  //
  // A fresh key per submission is therefore right, and the double-submit case is
  // covered by the schema instead: (customer, invoice_number) is unique, so
  // sending the same form twice is refused as a duplicate invoice number rather
  // than opening a second receivable.

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label htmlFor="ar_customer_id" className={LABEL}>
            Customer reference
          </label>
          <input
            id="ar_customer_id"
            name="customer_id"
            required
            placeholder="CUST-APEX-CORP"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Free text, checked against nothing — there is no Customer Master service in this
            platform, so a mistyped customer produces a valid receivable against one that does not
            exist.
          </p>
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="ar_invoice_number" className={LABEL}>
            Invoice number
          </label>
          <input
            id="ar_invoice_number"
            name="invoice_number"
            required
            placeholder="INV-2026-0891"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Unique per customer within this tenant. A repeat is refused and named as a duplicate, so
            the same invoice cannot be raised twice. Two different customers may reuse a number.
          </p>
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="ar_due_date" className={LABEL}>
            Due date
          </label>
          <input
            id="ar_due_date"
            name="due_date"
            type="date"
            required
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            A calendar date, stored as one, and load-bearing: the invoice cannot be declared overdue
            until the day after it. Past dates are accepted — an invoice raised late is still owed.
          </p>
        </div>

        <div className="lg:col-span-3">
          <label htmlFor="ar_amount" className={LABEL}>
            Amount <span className={OPTIONAL}>(greater than zero)</span>
          </label>
          <input
            id="ar_amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="24500.00"
            className={FIELD}
            autoComplete="off"
          />
        </div>

        <div className="lg:col-span-3">
          <label htmlFor="ar_currency_code" className={LABEL}>
            Currency
          </label>
          <select id="ar_currency_code" name="currency_code" defaultValue="GBP" className={FIELD}>
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
          {pending ? "Issuing…" : "Issue invoice"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Lands ISSUED. Sending it, declaring it late and recording payment are three further steps,
          each a separate grant — and recording payment additionally requires a FINALIZED
          general-ledger journal for this invoice.
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
