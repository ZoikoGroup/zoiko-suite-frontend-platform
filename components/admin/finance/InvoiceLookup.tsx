"use client";

import { LookupById } from "@/components/admin/shared";
import { lookupVendorInvoice } from "@/app/admin/finance/actions";
import { InvoiceLookupSummary } from "./InvoiceLookupSummary";

/**
 * "Paste an invoice ID, read the invoice."
 *
 * A client component purely to hold the render function: `renderRecord` is an
 * ordinary function prop, which cannot cross the server/client boundary, so the
 * finance page cannot pass it to LookupById directly. This is the same device
 * PurchaseRequestLookup uses, imported here only so the vendor-id reply in this
 * panel no longer stands out as the one lookup still answering with JSON.
 *
 * The wording differs per page, so it is taken as props rather than fixed here.
 */
export function InvoiceLookup({
  label = "Invoice ID",
  hint,
  placeholder = "00000000-0000-0000-0000-000000000000",
  buttonLabel,
}: {
  label?: string;
  hint?: string;
  placeholder?: string;
  buttonLabel?: string;
}) {
  return (
    <LookupById
      action={lookupVendorInvoice}
      inputName="lookup_invoice_id"
      label={label}
      placeholder={placeholder}
      hint={hint}
      buttonLabel={buttonLabel}
      renderRecord={(invoice) => <InvoiceLookupSummary invoice={invoice} />}
    />
  );
}