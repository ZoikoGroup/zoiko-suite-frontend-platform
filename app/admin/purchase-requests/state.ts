// Shared contract between the purchase-request Server Actions and the forms
// that call them.
//
// Lives outside actions.ts because "use server" files may only export async
// functions — the initial-state constants cannot live there.

/**
 * Purchase-request action outcomes.
 *
 * `replayed` is distinct from `created`: purchase-request-svc holds a unique
 * index on (tenant_id, correlation_id) and answers 200 with the ORIGINAL
 * record on a retry — reporting that as a second new request would be
 * incorrect. `already-decided` is distinct from `error` because a 422 here
 * means the request was already approved or rejected, which is a fact about
 * the record rather than a failure of the attempt.
 */
export type RequestActionState = {
  status: "idle" | "created" | "replayed" | "approved" | "rejected" | "already-decided" | "error";
  message: string;
  /** Echoed back so the UI can name what was acted on, and so the operator has
   *  the id to paste into the order-issue form. */
  requestId?: string;
};

export const IDLE_REQUEST_STATE: RequestActionState = { status: "idle", message: "" };

/** Currencies the forms offer. The service accepts any code; these are the
 *  ones Zoiko entities actually transact in. */
export const CURRENCIES = ["GBP", "EUR", "USD", "INR"] as const;
