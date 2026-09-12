"use client";

import { LookupById } from "@/components/admin/shared";
import { lookupCustomerInvoice } from "@/app/admin/finance/actions";
import { CustomerInvoiceSummary } from "./CustomerInvoiceSummary";

/**
 * "Paste an invoice ID, read the invoice."
 *
 * A client component purely to hold the render function: `renderRecord` is an
 * ordinary function prop, which cannot cross the server/client boundary, so the
 * finance page cannot pass it to LookupById directly — the same device
 * InvoiceLookup uses for payables.
 *
 * The wording differs per page, so it is taken as props rather than fixed here.
 */
export function CustomerInvoiceLookup({
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
      action={lookupCustomerInvoice}
      inputName="lookup_invoice_id"
      label={label}
      placeholder={placeholder}
      hint={hint}
      buttonLabel={buttonLabel}
      renderRecord={(invoice) => <CustomerInvoiceSummary invoice={invoice} />}
    />
  );
}