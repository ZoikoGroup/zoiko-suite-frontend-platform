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
