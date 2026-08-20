// Shared contract between the contract-lifecycle Server Actions and the forms
// that call them.
//
// This lives outside actions.ts deliberately: a "use server" file may only
// export async functions, so the initial-state constant cannot live there.

/** One state per lifecycle step rather than a single "success", so a form can
 *  report what actually happened — a revision and an activation both return 200
 *  and reading them as the same event would lose the transition. */
export type ContractActionState = {
  status: "idle" | "drafted" | "revised" | "submitted" | "activated" | "terminated" | "error";
  message: string;
  /** Echoed back so the UI can name what was acted on. */
  title?: string;
  /** Set on a successful draft so the form can link straight to the new record. */
  contractId?: string;
};

export const IDLE_CONTRACT_STATE: ContractActionState = { status: "idle", message: "" };

/** Currencies the draft form offers. The service accepts any code and defaults
 *  the column to USD; these are the ones the demo entities actually contract in. */
export const CONTRACT_CURRENCIES = ["GBP", "EUR", "USD", "INR"] as const;

/** Shared contract between the board-resolutions-svc Server Actions and the
 *  forms that call them. One state per lifecycle step, same doctrine as
 *  ContractActionState: a vote and a pass both return 200 and reading them as
 *  the same event would lose which transition actually happened. */
export type BoardActionState = {
  status: "idle" | "created" | "voted" | "passed" | "error";
  message: string;
  /** Echoed back so the UI can name what was acted on. */
  title?: string;
  /** Set on a successful create so the form can link straight to the record. */
  recordId?: string;
  /** Present when the resolution was just passed, so the UI can show the
   *  evidence gate that was satisfied. */
  passedBy?: string;
};

export const IDLE_BOARD_STATE: BoardActionState = { status: "idle", message: "" };
