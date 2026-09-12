"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { CopyableId, ResultBanner, type BannerTone } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { Button } from "@/components/ui";
import { recordVendorInvoice } from "@/app/admin/finance/actions";
import {
  CURRENCIES,
  IDLE_PAYABLE_STATE,
  INVOICE_LINE_SLOTS,
  type PayableActionState,
} from "@/app/admin/finance/state";

const TONE: Record<PayableActionState["status"], BannerTone> = {
  idle: "neutral",
  recorded: "success",
  // A replay wrote nothing. Green would claim a liability that was not booked.
  replayed: "neutral",
  advanced: "success",
  "out-of-sequence": "warning",
  // Correct refusals with a remedy, not malfunctions: the number is already on
  // the register, the approver is the recorder, or the document is missing.
  duplicate: "warning",
  "self-approval": "warning",
  "document-required": "warning",
  error: "error",
};

const CELL_FIELD = `${FIELD} text-sm`;

function money(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Stage 1 of 4 — take a vendor invoice onto the books.
 *
 * The invoice lands RECEIVED and authorises no payment. Tenant and legal entity
 * come from the session rather than the form: they are uuid columns fed to the
 * row-level security policy, and they are not the operator's to choose.
 *
 * AP-05's required business/source inputs are all here and are all sent on the
 * written path: the invoice date, the supply date (the tax point), and at least
 * one line. The gross amount is DERIVED from the lines, never typed — the
 * service refuses to store an invoice whose amount does not equal the lines'
 * net plus tax to the cent, so the only amount this form shows is the one that
 * balances by construction. `vendor_id` stays free text: no Vendor Master
 * service exists, so nothing can check it, and the form says so rather than
 * pretending.
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

  return (
    <form action={action} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
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

        <div>
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

        <div>
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

      {/*
        AP-05's three calendar dates (the service refuses an invoice missing any
        of them). All are DATE columns stored as UTC midnights; invoice_date and
        supply_date can differ — the supply date is the tax point and decides the
        tax period the invoice lands in.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="invoice_date" className={LABEL}>
            Invoice date
          </label>
          <input
            id="invoice_date"
            name="invoice_date"
            type="date"
            required
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            The date printed on the supplier&apos;s document.
          </p>
        </div>

        <div>
          <label htmlFor="supply_date" className={LABEL}>
            Supply date <span className={OPTIONAL}>(tax point)</span>
          </label>
          <input
            id="supply_date"
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
                <label htmlFor={`line_description-${id}`} className={LABEL}>
                  Description
                </label>
                <input
                  id={`line_description-${id}`}
                  name="line_description"
                  placeholder="Contract storage, 4 x 2 TB"
                  className={CELL_FIELD}
                  autoComplete="off"
                />
              </div>

              <div className="sm:col-span-1">
                <label htmlFor={`line_quantity-${id}`} className={LABEL}>
                  Qty
                </label>
                <input
                  id={`line_quantity-${id}`}
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
                <label htmlFor={`line_unit_price-${id}`} className={LABEL}>
                  Unit price
                </label>
                <input
                  id={`line_unit_price-${id}`}
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
                <label htmlFor={`line_tax_amount-${id}`} className={LABEL}>
                  Tax
                </label>
                <input
                  id={`line_tax_amount-${id}`}
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
                <label htmlFor={`line_tax_code-${id}`} className={LABEL}>
                  Tax code
                </label>
                <input
                  id={`line_tax_code-${id}`}
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
              : `Net ${money(netTotal)} · Tax ${money(taxTotal)} · Gross ${money(gross)} — the amount the invoice is booked for`}
          </p>
        </div>
      </div>

      {/*
        AP-05's optional references. The purchase order one is the only one with
        a genuine check behind it — the service verifies it against
        purchase-order-svc before anything is written, and an unknown or closed
        PO is refused. The document reference is what lets this same intake drive
        all the way through to VALIDATED: the evidence check refuses to pass an
        invoice that has none on record.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="purchase_order_id" className={LABEL}>
            Purchase order <span className={OPTIONAL}>(optional)</span>
          </label>
          <input
            id="purchase_order_id"
            name="purchase_order_id"
            placeholder="PO-REF-DELL-2026"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Verified against purchase-order-svc when present: an unknown, other-entity, or
            closed PO is refused rather than recorded.
          </p>
        </div>

        <div>
          <label htmlFor="goods_receipt_ref" className={LABEL}>
            Goods receipt <span className={OPTIONAL}>(optional)</span>
          </label>
          <input
            id="goods_receipt_ref"
            name="goods_receipt_ref"
            placeholder="GRN-...-0042"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            The goods-service-receipt reference (AP-05). Carried; no service verifies it yet.
          </p>
        </div>

        <div>
          <label htmlFor="invoice_document_id" className={LABEL}>
            Document reference <span className={OPTIONAL}>(optional here, required to validate)</span>
          </label>
          <input
            id="invoice_document_id"
            name="invoice_document_id"
            placeholder="VC-ID-00417"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            The document of record (voucher). Validation is the evidence check and will refuse an
            invoice with none — recording it here lets one intake run all the way through.
          </p>
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