"use client";

import { LookupById } from "@/components/admin/shared";
import { lookupPurchaseRequest } from "@/app/admin/commercial-ops/actions";
import { PurchaseRequestSummary } from "./PurchaseRequestSummary";

/**
 * "Paste a request ID, read the request."
 *
 * A client component purely to hold the render function: `renderRecord` is an
 * ordinary function prop, which cannot cross the server/client boundary, so a
 * page cannot pass it to LookupById directly. Both pages that offer this lookup
 * render this instead of wiring LookupById themselves — that is what stopped
 * them diverging, and one of them showing JSON while the other did not.
 *
 * The wording differs per page, so it is taken as props rather than fixed here.
 */
export function PurchaseRequestLookup({
  label = "Purchase request ID",
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
      action={lookupPurchaseRequest}
      inputName="lookup_request_id"
      label={label}
      placeholder={placeholder}
      hint={hint}
      buttonLabel={buttonLabel}
      renderRecord={(request) => <PurchaseRequestSummary request={request} />}
    />
  );
}
