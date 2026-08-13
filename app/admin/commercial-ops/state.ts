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

/**
 * Spend-policy outcomes. Setting a limit is an ordinary write; the only unusual
 * case is that there is no update route, so a second policy for the same category
 * supersedes the first rather than replacing it.
 */
export type SpendPolicyActionState = {
  status: "idle" | "created" | "superseded" | "error";
  message: string;
  policyId?: string;
};

export const IDLE_SPEND_POLICY_STATE: SpendPolicyActionState = { status: "idle", message: "" };

/**
 * Spend-check outcomes, which are decisions rather than writes.
 *
 * Four readings, deliberately not three. `unevaluated` is the one that would do
 * real damage if collapsed into `permitted`: the service answers 200 ALLOWED with
 * basis `no_policy_configured` when no limit exists for the category, and showing
 * that green would report an ungoverned spend as an approved one. `refused` is
 * separate from `error` because a BLOCKED decision is the control working, not
 * failing.
 */
export type SpendCheckActionState = {
  status: "idle" | "permitted" | "unevaluated" | "refused" | "replayed" | "error";
  message: string;
  /** The figures the decision was made against, so a refusal can show its work. */
  detail?: {
    priorConsumption: number;
    projectedTotal: number;
    thresholdAmount?: number;
    currencyCode?: string;
    consumptionId?: string;
  };
};

export const IDLE_SPEND_CHECK_STATE: SpendCheckActionState = { status: "idle", message: "" };

/** Categories the forms offer. The service accepts any string — there is no
 *  category registry anywhere in the platform — so these are a convenience, and
 *  the field stays free text. */
export const SPEND_CATEGORIES = [
  "PROCUREMENT",
  "TRAVEL",
  "PROFESSIONAL_SERVICES",
  "SOFTWARE",
  "MARKETING",
] as const;

/**
 * Vendor due-diligence outcomes. Four readings, and the naming is the point.
 *
 * `screened-no-match` is NOT called "clear" or "passed". The service's only
 * screening is an exact match against a hardcoded list of two names — there is no
 * sanctions feed on this platform to call — so the honest claim is "we looked and
 * found nothing", not "this vendor is clear". Calling it a pass, or rendering it
 * the same green as a genuine approval elsewhere in the console, would report an
 * effectively unscreened counterparty as a screened one that cleared. Same defect
 * class as `unevaluated` above, and worse in consequence: the assertion being made
 * is that a counterparty is not sanctioned.
 *
 * `unconcluded` covers a check recorded but never concluded. The screening is
 * synchronous, so this is not "in progress" — it is a lost result, and it carries
 * no outcome. `failed` is the service saying so itself.
 */
export type VendorCheckActionState = {
  status:
    | "idle"
    | "screened-no-match"
    | "flagged"
    | "unconcluded"
    | "failed"
    | "replayed"
    | "error";
  message: string;
  /** Echoed back so the operator can read the check and its evidence. */
  checkId?: string;
  /** The screening's own account of itself, shown rather than paraphrased. */
  detail?: {
    vendorName: string;
    screeningBasis?: string;
    /** STUB_DENYLIST while no real feed exists. Rendered, not hidden — it is
     *  what stops a no-match reading as a clearance. */
    screeningSource?: string;
    evidenceCount: number;
    documentReference?: string;
  };
};

export const IDLE_VENDOR_CHECK_STATE: VendorCheckActionState = { status: "idle", message: "" };
