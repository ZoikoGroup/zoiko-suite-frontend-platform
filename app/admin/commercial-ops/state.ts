// Shared contract between the purchase-order Server Actions and the forms that
// call them.
//
// This lives outside actions.ts deliberately: a "use server" file may only
// export async functions, so the initial-state constant cannot live there.

export type OrderActionState = {
  status: "idle" | "created" | "replayed" | "amended" | "closed" | "error";
  message: string;
  /** Echoed back so the UI can name what was acted on. */
  poNumber?: string;
};

export const IDLE_ORDER_STATE: OrderActionState = { status: "idle", message: "" };

/** Currencies the issue form offers. The service accepts any code; these are
 *  the ones the demo entities actually transact in. */
export const CURRENCIES = ["GBP", "EUR", "USD", "INR"] as const;

/**
 * Purchase-request outcomes.
 *
 * `replayed` is separate from `created` because the service holds a unique index
 * on (tenant_id, correlation_id) and answers 200 with the ORIGINAL record on a
 * retry — reporting that as a second request would be a lie about what is in the
 * register. `already-decided` is separate from `error` because a 422 here means
 * the request was already approved or rejected, which is a fact about the
 * record rather than a failure of the attempt.
 */
export type RequestActionState = {
  status: "idle" | "created" | "replayed" | "approved" | "rejected" | "already-decided" | "error";
  message: string;
  /** Echoed back so the UI can name what was acted on, and so the operator has
   *  the id to paste into the issue-order form. */
  requestId?: string;
};

export const IDLE_REQUEST_STATE: RequestActionState = { status: "idle", message: "" };
