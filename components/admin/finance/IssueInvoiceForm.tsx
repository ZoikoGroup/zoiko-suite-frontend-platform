"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { CopyableId, ResultBanner, type BannerTone } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { Button } from "@/components/ui";
import { issueCustomerInvoiceAction } from "@/app/admin/finance/actions";
import {
  CURRENCIES,
  IDLE_RECEIVABLE_STATE,
  INVOICE_LINE_SLOTS,
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
  // The issuer tried to record their own invoice's payment (segregation of
  // duties), or a documentless invoice was refused for sending (the evidence
  // gate). Both are rules with a named remedy.
  "self-payment": "warning",
  "document-required": "warning",
  "out-of-sequence": "warning",
  duplicate: "warning",
  error: "error",
};

const CELL_FIELD = `${FIELD} text-sm`;

function money(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
 *
 * AR-05's required business/source inputs are here and are all sent on the
 * written path: the invoice date, the supply date (the tax point), and at least
 * one line. The gross amount is DERIVED from the lines, never typed — the
 * service refuses to store an invoice whose amount does not equal the lines'
 * net plus tax to the cent, so the only amount this form shows is the one that
 * balances by construction.
 *
 * The document reference is optional at issue but load-bearing for what comes
 * next: the SEND evidence gate refuses to transmit an invoice with none on
 * record, so issuing without one makes "Mark sent" the refusal to expect until
 * it is recorded.
 */
export function IssueInvoiceForm() {
  const [state, action, pending] = useActionState<ReceivableActionState, FormData>(
    issueCustomerInvoiceAction,
    IDLE_RECEIVABLE_STATE,
  );

  // Line rows, added and removed client-side and submitted as parallel arrays.
  // State mirrors only what the running totals need (quantity, unit price, tax);
  // the submitted values are the inputs' own, so this state can never disagree
  // with what is sent — it is display, not a source of truth.
  const [lineIds, setLineIds] = useState<number[]>(() =>
    Array.from({ length: INVOICE_LINE_SLOTS.initial }, (_, i) => i),
  );
  const [nextId, setNextId] = useState<number>(INVOICE_LINE_SLOTS.initial);
  const [entries, setEntries] = useState<
    Record<number, { quantity: string; unitPrice: string; tax: string }>
  >({});

  // Net per line is quantity × unit price, rounded the same way the service
  // accounts for the invoice (whole minor units). A blank quantity is 1, the
  // same default the Server Action applies, so the display and the submission
  // can never disagree.
  function lineNet(id: number): number {
    const quantityRaw = entries[id]?.quantity ?? "";
    const unitPriceRaw = entries[id]?.unitPrice ?? "";
    const quantity = quantityRaw === "" ? 1 : Number(quantityRaw);
    const unitPrice = unitPriceRaw === "" ? 0 : Number(unitPriceRaw);
    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return 0;
    return Math.round(quantity * unitPrice * 100) / 100;
  }

  function lineTax(id: number): number {
    const taxRaw = entries[id]?.tax ?? "";
    if (taxRaw === "") return 0;
    const tax = Number(taxRaw);
    return Number.isFinite(tax) && tax > 0 ? Math.round(tax * 100) / 100 : 0;
  }

  const netTotal = lineIds.reduce((sum, id) => sum + lineNet(id), 0);
  const taxTotal = lineIds.reduce((sum, id) => sum + lineTax(id), 0);
  const gross = Math.round((netTotal + taxTotal) * 100) / 100;
  const anyValue = netTotal > 0 || taxTotal > 0;

  function setEntry(id: number, key: keyof (typeof entries)[number], value: string) {
    setEntries((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));
  }

  function addLine() {
    if (lineIds.length >= INVOICE_LINE_SLOTS.max) return;
    setLineIds((ids) => [...ids, nextId]);
    setNextId((id) => id + 1);
  }

  function removeLine(id: number) {
    // Never below one row: a no-lines invoice is refused by the service, and an
    // empty form gives an operator nothing to start from.
    if (lineIds.length <= 1) return;
    setLineIds((ids) => ids.filter((existing) => existing !== id));
    setEntries((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

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
    <form action={action} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
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
            platform, so a mistyped customer produces a valid receivable against one that does
            not exist.
          </p>
        </div>

        <div>
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

        <div>
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

      {/*
        AR-05's three calendar dates (the service refuses an invoice missing any
        of them). All are DATE columns stored as UTC midnights; invoice_date and
        supply_date can differ — the supply date is the tax point and decides the
        tax period the invoice lands in.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="ar_invoice_date" className={LABEL}>
            Invoice date
          </label>
          <input
            id="ar_invoice_date"
            name="invoice_date"
            type="date"
            required
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            The date printed on the document you issued — the day the receivable comes into
            being, which can differ from the due date.
          </p>
        </div>

        <div>
          <label htmlFor="ar_supply_date" className={LABEL}>
            Supply date <span className={OPTIONAL}>(tax point)</span>
          </label>
          <input
            id="ar_supply_date"
            name="supply_date"
            type="date"
            required
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            When the supply took place. Drives which tax period the invoice lands in, and may
            differ from the invoice date.
          </p>
        </div>

        <div>
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
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className={LABEL}>Lines — the invoice balances against these</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {lineIds.length} of {INVOICE_LINE_SLOTS.max}
          </p>
        </div>

        <div className="space-y-2">
          {lineIds.map((id, index) => (
            <div
              key={id}
              className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-12 dark:border-slate-800"
            >
              <div className="sm:col-span-3">
                <label htmlFor={`ar_line_description-${id}`} className={LABEL}>
                  Description
                </label>
                <input
                  id={`ar_line_description-${id}`}
                  name="line_description"
                  placeholder="Managed hosting, 1 x 24 mo"
                  className={CELL_FIELD}
                  autoComplete="off"
                />
              </div>

              <div className="sm:col-span-1">
                <label htmlFor={`ar_line_quantity-${id}`} className={LABEL}>
                  Qty
                </label>
                <input
                  id={`ar_line_quantity-${id}`}
                  name="line_quantity"
                  type="number"
                  step="1"
                  min="1"
                  placeholder="1"
                  className={`${CELL_FIELD} tabular-nums`}
                  autoComplete="off"
                  value={entries[id]?.quantity ?? ""}
                  onChange={(event) => setEntry(id, "quantity", event.target.value)}
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor={`ar_line_unit_price-${id}`} className={LABEL}>
                  Unit price
                </label>
                <input
                  id={`ar_line_unit_price-${id}`}
                  name="line_unit_price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className={`${CELL_FIELD} tabular-nums`}
                  autoComplete="off"
                  value={entries[id]?.unitPrice ?? ""}
                  onChange={(event) => setEntry(id, "unitPrice", event.target.value)}
                />
              </div>

              {/*
                Computed, not submitted: net = quantity × unit price. It is the
                figure the service accounts for (whole minor units), and showing
                it here is what lets an operator see that a line carries value
                without the form pretending to type a number that must exactly
                agree with two others.
              */}
              <div className="sm:col-span-2">
                <span className={LABEL}>Net</span>
                <div className="flex h-[38px] items-center rounded-lg bg-slate-100 px-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {money(lineNet(id))}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor={`ar_line_tax_amount-${id}`} className={LABEL}>
                  Tax
                </label>
                <input
                  id={`ar_line_tax_amount-${id}`}
                  name="line_tax_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className={`${CELL_FIELD} tabular-nums`}
                  autoComplete="off"
                  value={entries[id]?.tax ?? ""}
                  onChange={(event) => setEntry(id, "tax", event.target.value)}
                />
              </div>

              <div className="sm:col-span-1">
                <label htmlFor={`ar_line_tax_code-${id}`} className={LABEL}>
                  Tax code
                </label>
                <input
                  id={`ar_line_tax_code-${id}`}
                  name="line_tax_code"
                  placeholder="V20"
                  className={CELL_FIELD}
                  autoComplete="off"
                />
              </div>

              <div className="flex items-end sm:col-span-1">
                <button
                  type="button"
                  onClick={() => removeLine(id)}
                  disabled={lineIds.length <= 1}
                  aria-label={`Remove line ${index + 1}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={addLine}
            disabled={lineIds.length >= INVOICE_LINE_SLOTS.max}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add line
          </Button>

          {/* A statement of fact, not a gate: the gross is derived from the same
              lines the service will balance, so it cannot disagree with them. */}
          <p
            className={
              !anyValue
                ? "text-xs text-slate-400 dark:text-slate-500"
                : "text-xs font-medium text-emerald-600 dark:text-emerald-400"
            }
            role="status"
            aria-live="polite"
          >
            {!anyValue
              ? "Net 0.00 · Tax 0.00 · Gross 0.00"
              : `Net ${money(netTotal)} · Tax ${money(taxTotal)} · Gross ${money(gross)} — the amount the invoice is issued for`}
          </p>
        </div>
      </div>

      {/*
        AR-05's optional customer-side references. Unlike the payables form's
        purchase order, the sales order one has NO check behind it — no
        sales-order service exists in this platform, so it is carried
        unvalidated (AR-06 will need it). The document reference is the only one
        that changes what comes next: the SEND evidence gate refuses to transmit
        an invoice with none on record.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="ar_sales_order_id" className={LABEL}>
            Sales order <span className={OPTIONAL}>(optional)</span>
          </label>
          <input
            id="ar_sales_order_id"
            name="sales_order_id"
            placeholder="SO-2026-1122"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            The sales order this invoice answers (AR-06). Carried unvalidated — no sales-order
            service exists to check it, so a typo cannot be caught here either.
          </p>
        </div>

        <div>
          <label htmlFor="ar_customer_billing_ref" className={LABEL}>
            Customer billing reference <span className={OPTIONAL}>(optional)</span>
          </label>
          <input
            id="ar_customer_billing_ref"
            name="customer_billing_ref"
            placeholder="APEX-PO-22014"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            The customer&apos;s own reference for the statement. Carried unvalidated.
          </p>
        </div>

        <div>
          <label htmlFor="ar_invoice_document_id" className={LABEL}>
            Document reference <span className={OPTIONAL}>(optional here, required to send)</span>
          </label>
          <input
            id="ar_invoice_document_id"
            name="invoice_document_id"
            placeholder="CTR-ID-0891"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            The document of record. Sending is the evidence gate and will refuse an invoice with
            none — recording it here lets one intake drive all the way to with the customer.
          </p>
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