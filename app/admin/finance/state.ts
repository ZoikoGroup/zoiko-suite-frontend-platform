// Shared contract between the accounts-payable Server Actions and the forms that
// call them.
//
// This lives outside actions.ts deliberately: a "use server" file may only export
// async functions, so the initial-state constant cannot live there.

import type { InvoiceStatus } from "@/lib/api/accounts-payable";

/**
 * Outcomes of a payables write.
 *
 * `replayed` is separate from `recorded` because the service is idempotent on
 * (tenant_id, correlation_id) and answers 200 with the ORIGINAL invoice on a
 * retry — reporting that as a second invoice would overstate the liability on
 * the books, which is exactly what the idempotency exists to prevent.
 *
 * `out-of-sequence` is separate from `error` because a 422 here is a fact about
 * the record, not a failure of the attempt: the invoice was simply not in the
 * stage this transition moves out of. Rendering it red would call a correct
 * refusal a malfunction.
 *
 * `duplicate` is likewise a fact about the register — this vendor already has an
 * invoice under this number — and has a remedy the operator can act on. It only
 * became expressible once the service stopped reporting the collision as 503
 * `store_unavailable`, which was indistinguishable from a dead database.
 */
export type PayableActionState = {
  status:
    | "idle"
    | "recorded"
    | "replayed"
    | "advanced"
    | "out-of-sequence"
    | "duplicate"
    | "error";
  message: string;
  /** Echoed back so the UI can name what was acted on, and so the operator has
   *  the id without hunting the register for the row they just created. */
  invoiceId?: string;
  /** The stage the invoice now sits in, for the banner's wording. */
  stage?: InvoiceStatus;
};

export const IDLE_PAYABLE_STATE: PayableActionState = { status: "idle", message: "" };

/** Currencies the intake form offers. The column is VARCHAR(3) and the service
 *  accepts any three-letter code; these are the ones the demo entities transact
 *  in, matching the commercial-ops forms. */
export const CURRENCIES = ["GBP", "EUR", "USD", "INR"] as const;
