// purchase-request-svc (:8100, /purchase-request-svc through the gateway) — the
// requisition register that sits UPSTREAM of the purchase-order register.
//
// Lifecycle is one hop and terminal on both branches: PENDING -> APPROVED or
// PENDING -> REJECTED. There is no route back. Attempting a second transition
// answers 422 `invalid_transition` rather than silently re-stamping the record,
// so who approved a request and when cannot be overwritten.
//
// Why the console cares: purchase-order-svc will only issue an order against a
// purchase request that is APPROVED and owned by the same tenant and legal
// entity. Before this client existed the Commercial Ops page let an operator
// type a `purchase_request_id` it had no way to look up or create, and mapped
// three errors (`purchase_request_not_approved`, `_not_found`, `_mismatch`) whose
// subject was invisible in the UI.
//
// Every mutation is authorization-checked before it is applied and fails closed,
// so 403 ("you may not") and 503 ("we could not determine whether you may") are
// kept apart — collapsing them would report a governance failure as a
// permissions problem.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";
import { humanizeKey } from "@/lib/humanize";

export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";

/** Wire shape. Field names match the Go json tags exactly. */
export type PurchaseRequest = {
  request_id: string;
  tenant_id: string;
  legal_entity_id: string;
  requested_by_principal_id: string;
  description: string;
  amount: number;
  currency_code: string;
  status: RequestStatus;
  approved_by_principal_id?: string | null;
  rejected_by_principal_id?: string | null;
  rejection_reason?: string | null;
  correlation_id: string;
  created_at: string;
  approved_at?: string | null;
  rejected_at?: string | null;
};

export type ListRequestsInput = {
  identity: Identity & { tenantId: string };
  legalEntityId?: string;
  status?: RequestStatus;
};

/**
 * List purchase requests for the caller's tenant, newest first.
 *
 * `tenant_id` is a required query parameter — the service answers 400 without
 * it — and must be a UUID, since it is compared against a uuid column. A
 * non-UUID fails inside the driver and surfaces as 503, not 400.
 *
 * Normalises a JSON `null` result to `[]` so call sites do not each repeat it.
 */
export async function listPurchaseRequests(
  input: ListRequestsInput,
): Promise<ApiResult<PurchaseRequest[]>> {
  const result = await apiGet<PurchaseRequest[] | null>(
    "purchaseRequest",
    "/v1/purchase-requests",
    {
      query: {
        tenant_id: input.identity.tenantId,
        legal_entity_id: input.legalEntityId,
        status: input.status,
      },
      identity: input.identity,
    },
  );

  if (!result.ok) return result;
  if (result.data === null) return { ok: true, data: [] };

  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "purchase-request-svc returned a non-array request list",
      },
    };
  }

  const requests = [...result.data].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return { ok: true, data: requests };
}

/**
 * Fetch one request.
 *
 * Tenant scope comes from the X-Tenant-Id header, and the store returns "not
 * found" when it is absent — so a call without identity is indistinguishable
 * from a bad id, exactly as in purchase-order-svc.
 */
export async function getPurchaseRequest(
  requestId: string,
  identity: Identity & { tenantId: string },
): Promise<ApiResult<PurchaseRequest>> {
  return apiGet<PurchaseRequest>(
    "purchaseRequest",
    `/v1/purchase-requests/${requestId}`,
    { identity },
  );
}

export type CreateRequestInput = {
  identity: Identity & { principalId: string; tenantId: string; legalEntityId: string };
  description: string;
  amount: number;
  currencyCode: string;
};

/**
 * Raise a new purchase request. It lands PENDING and grants nothing.
 *
 * 201 means a request was created; 200 means this replayed an existing one and
 * nothing new was written — the service holds a partial unique index on
 * (tenant_id, correlation_id), so a retried submit resolves to the ORIGINAL
 * record instead of duplicating it. Both are success, and the caller is told
 * which so a retry does not report a second request that does not exist.
 */
export async function createPurchaseRequest(
  input: CreateRequestInput,
): Promise<ApiWriteResult<PurchaseRequest>> {
  return apiPost<PurchaseRequest>(
    "purchaseRequest",
    "/v1/purchase-requests",
    {
      tenant_id: input.identity.tenantId,
      legal_entity_id: input.identity.legalEntityId,
      description: input.description,
      amount: input.amount,
      currency_code: input.currencyCode,
      correlation_id: crypto.randomUUID(),
    },
    { identity: input.identity },
  );
}

/** Approve a PENDING request. Terminal — a second call answers 422. */
export async function approvePurchaseRequest(
  requestId: string,
  identity: Identity & { principalId: string; tenantId: string },
): Promise<ApiWriteResult<PurchaseRequest>> {
  return apiPost<PurchaseRequest>(
    "purchaseRequest",
    `/v1/purchase-requests/${requestId}/approve`,
    { correlation_id: crypto.randomUUID() },
    { identity },
  );
}

/**
 * Reject a PENDING request. Terminal — a second call answers 422.
 *
 * `reason` is required by the service (400 `missing_field` without it): the
 * reason IS the audit record for a refusal, so an unexplained rejection is not
 * accepted.
 */
export async function rejectPurchaseRequest(
  requestId: string,
  reason: string,
  identity: Identity & { principalId: string; tenantId: string },
): Promise<ApiWriteResult<PurchaseRequest>> {
  return apiPost<PurchaseRequest>(
    "purchaseRequest",
    `/v1/purchase-requests/${requestId}/reject`,
    { reason, correlation_id: crypto.randomUUID() },
    { identity },
  );
}

// ─── Derived views ───────────────────────────────────────────────────────────

export type RequestStats = {
  pending: number;
  approved: number;
  rejected: number;
  /** Value awaiting a decision, by currency. Requests in different currencies
   *  are never summed together — a single total would be a fiction. */
  pendingValueByCurrency: Record<string, number>;
};

export function summariseRequests(requests: PurchaseRequest[]): RequestStats {
  const stats: RequestStats = {
    pending: 0,
    approved: 0,
    rejected: 0,
    pendingValueByCurrency: {},
  };

  for (const r of requests) {
    if (r.status === "APPROVED") stats.approved += 1;
    else if (r.status === "REJECTED") stats.rejected += 1;
    else {
      stats.pending += 1;
      stats.pendingValueByCurrency[r.currency_code] =
        (stats.pendingValueByCurrency[r.currency_code] ?? 0) + r.amount;
    }
  }

  return stats;
}

/** True when this request can still be issued against by purchase-order-svc. */
export function isIssuable(request: PurchaseRequest): boolean {
  return request.status === "APPROVED";
}

// ─── Reading a request without reading the schema ────────────────────────────
//
// The people who read a requisition — a budget holder deciding it, a requester
// chasing it, an auditor asking who approved what — are not the people who
// wrote the service. `{"status":"PENDING","approved_by_principal_id":null}` does
// not tell them whether anyone has decided it, whether an order can be placed
// against it, or who is allowed to decide it next.
//
// These helpers say what a record means in prose. They never alter or drop a
// stored value: the code the service holds stays visible next to the plain
// wording, on the doctrine the policy, governance, board and close consoles
// already follow.

/** Badge tones, matching the vocabulary `Badge` accepts. */
export type RequestTone = "success" | "warning" | "danger" | "neutral" | "info";

export type RequestStatusDescription = {
  /** Short label for a badge — "Awaiting a decision", "Approved". */
  label: string;
  /** What the status means for the reader, and what it does not. */
  meaning: string;
  tone: RequestTone;
  /** The status exactly as stored. */
  raw: string;
  /** True once the request has been decided and can never be decided again. */
  decided: boolean;
  /** True when purchase-order-svc will issue an order against it. */
  issuable: boolean;
  unmapped: boolean;
};

const REQUEST_STATUS_MEANING: Record<
  RequestStatus,
  { label: string; meaning: string; tone: RequestTone; decided: boolean; issuable: boolean }
> = {
  PENDING: {
    label: "Awaiting a decision",
    meaning:
      "The request has been raised and nobody has decided it yet. It commits no money and " +
      "authorises nothing — no purchase order can be placed against it in this state. It " +
      "needs someone other than the person who raised it to approve or reject it.",
    tone: "warning",
    decided: false,
    issuable: false,
  },
  APPROVED: {
    label: "Approved",
    meaning:
      "Someone with the authority to decide it approved this request, and a purchase order " +
      "can now be placed against it. The decision is final: it cannot be reversed, and who " +
      "approved it and when are recorded permanently. To stop the spend now, the order side " +
      "is where that happens — not here.",
    tone: "success",
    decided: true,
    issuable: true,
  },
  REJECTED: {
    label: "Rejected",
    meaning:
      "The request was turned down and no purchase order can be placed against it. The " +
      "decision is final and cannot be reversed — if the spend is still wanted, a new " +
      "request has to be raised. The reason given is stored on the record.",
    tone: "danger",
    decided: true,
    issuable: false,
  },
};

/**
 * Say where a request stands.
 *
 * An unrecognised status is never reported as approved. This record is the
 * precondition purchase-order-svc checks before it commits money, and the safe
 * reading of a value we cannot interpret is that nothing has been authorised —
 * the same way the order service itself refuses anything that is not exactly
 * APPROVED.
 */
export function describeRequestStatus(raw: string): RequestStatusDescription {
  const stored = raw?.trim() || "(empty)";
  const known = REQUEST_STATUS_MEANING[stored as RequestStatus];

  if (!known) {
    return {
      label: "Needs review",
      meaning:
        `The record holds the status "${stored}", which is not one this console knows how ` +
        "to read. It is deliberately not shown as approved: nothing here can confirm this " +
        "request authorises any spend. Check with whoever operates the service before " +
        "relying on it.",
      tone: "warning",
      raw: stored,
      decided: true,
      issuable: false,
      unmapped: true,
    };
  }

  return { ...known, raw: stored, unmapped: false };
}

export type RequestExplanation = {
  status: RequestStatusDescription;
  /** One line: where this request stands, naming the money. */
  headline: string;
  /** What has to happen next, and who may do it. */
  nextStep: string;
  /** The decision trail as a sentence, or absence stated as a fact. */
  decisionTrail: string;
};

/** Format an amount with its currency. Requests in different currencies are
 *  never combined anywhere in this module — there is no FX rate in this
 *  service, and a single total would be a fiction. */
export function formatRequestAmount(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // An unrecognised currency code throws rather than falling back, and a
    // request whose currency the browser does not know is still a request whose
    // amount has to be legible.
    return `${amount.toLocaleString("en-GB", { maximumFractionDigits: 2 })} ${currencyCode}`;
  }
}

/**
 * Read one request as prose: where it stands, what happens next, who decided it.
 *
 * "Where it stands" leads, because it is the question a requisition exists to
 * answer and the one the raw status answers worst — PENDING and APPROVED look
 * equally settled next to each other in a JSON blob, and only one of them means
 * money may be committed.
 */
export function explainRequest(request: PurchaseRequest): RequestExplanation {
  const status = describeRequestStatus(request.status);
  const money = formatRequestAmount(request.amount, request.currency_code);

  const headline = status.unmapped
    ? `${money} requested — this console cannot say where it stands.`
    : request.status === "PENDING"
      ? `${money} requested, and nobody has decided it yet.`
      : request.status === "APPROVED"
        ? `${money} approved. An order can be placed against this request.`
        : `${money} requested and turned down. No order can be placed against it.`;

  const nextStep = status.unmapped
    ? "Nothing should be placed against this request until someone who operates the service confirms what its status means."
    : request.status === "PENDING"
      ? "It needs a decision. Whoever approves it must be someone other than the person who raised it — the service refuses a request decided by the person who asked for it, so a requester cannot approve their own spend."
      : request.status === "APPROVED"
        ? "Nothing further is needed here. The next step is on the order side: an order issued against this request is what actually commits the money."
        : "Nothing further can be done to this request. If the spend is still wanted, raise a new one — this record stays as it is, so the refusal and its reason remain on file.";

  const decidedBy = request.approved_by_principal_id ?? request.rejected_by_principal_id ?? null;
  const decidedAt = request.approved_at ?? request.rejected_at ?? null;

  const decisionTrail = decidedBy
    ? `Decided by ${decidedBy}${decidedAt ? ` on ${new Date(decidedAt).toLocaleString("en-GB")}` : ""}.`
    : status.decided
      ? "The record is closed but names nobody as having decided it, which should not happen — worth raising with whoever operates the service."
      : "Nobody has decided it, so no decision is recorded against it yet.";

  return { status, headline, nextStep, decisionTrail };
}

/**
 * What a request failure carries beyond its message.
 *
 * purchase-request-svc answers some refusals with a code the console can match
 * on and others — the envelope middleware's 401, a bare 500 — with something
 * that names a header, or with nothing at all. The status is the only thing
 * present in every case, so it is passed alongside rather than parsed back out
 * of the folded message string.
 */
export type RequestErrorContext = {
  /** The HTTP status, when the failure had one. */
  status?: number;
  /** What a 404 means for this particular action. */
  notFound?: string;
};

/** Strip the console's own framing off a refusal, leaving the service's words.
 *
 *  client.ts folds a failure into `purchase-request-svc rejected the write (400)
 *  — <detail>`. That prefix is for a developer reading a log; quoting it back at
 *  a budget holder names a service and a status code they cannot act on. Only
 *  the detail is ever shown, and only as a marked quotation. */
function requestDetail(message: string): string {
  const separator = message.indexOf(" — ");
  return separator === -1 ? message : message.slice(separator + 3).trim();
}

/** The field names the service reports, as the words on the form. It names its
 *  own columns — `legal_entity_id`, `currency_code` — and a reader who filled in
 *  a box labelled "Currency" should not have to map one onto the other. */
const FIELD_WORDS: Record<string, string> = {
  description: "what is being requested",
  amount: "the amount",
  currency_code: "the currency",
  reason: "a reason for the rejection",
  tenant_id: "your organisation (which comes from your session, not the form)",
  legal_entity_id: "the company it applies to (which comes from your session, not the form)",
  correlation_id: "the request reference (which this console fills in)",
  status: "the status filter",
};

/** Read the service's field list back as the words a reader recognises. */
function namedFields(fragment: string): string[] {
  return fragment
    .replace(/[^A-Za-z0-9_,\s-]/g, " ")
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => FIELD_WORDS[token] ?? humanizeKey(token).toLowerCase())
    .filter(Boolean);
}

/**
 * Turn a backend failure into something an operator can act on.
 *
 * Nothing here returns the service's phrasing on its own. A budget holder told
 * `self_approval_not_allowed: principal may not approve or decide on their own
 * submission` learns only that something was refused, and not the thing that
 * matters — that the refusal is the control working, and that the fix is for
 * somebody else to decide the request. Where no wording fits, the fallback says
 * what happened and quotes the service's words as a quotation, so the fact stays
 * reportable without being the answer.
 */
export function explainRequestError(
  message: string,
  context: RequestErrorContext = {},
): string {
  // ── The request never reached the service ────────────────────────────────
  //
  // These arrive as sentences already, but they name a port and a URL. The
  // register degrades to a written empty state, while an action in the same
  // session would otherwise report the same outage as machine text.
  if (message.includes("is unreachable at")) {
    return "Nothing was changed. The service that holds the requisition register is not running, or cannot be reached from here — this is not something you entered. It has to be started before requests can be raised or decided.";
  }
  if (message.includes("did not respond within")) {
    return "Nothing was changed — but this one is worth confirming rather than assuming. The service did not answer in time, which does not by itself prove it did not act. Reload the register and check where the request stands before deciding it again.";
  }
  if (message.includes("non-JSON body")) {
    return "The service sent back something this console could not read, so it cannot say whether the request was decided. Reload the register and check its status before doing anything else, and report it.";
  }

  // ── The refusal that matters most on this service ────────────────────────
  //
  // Segregation of duties: the person who raised a request may not be the one
  // who decides it. Matched before the permission branches, because it is not a
  // permissions problem and telling the reader to go and ask for a grant would
  // send them to fix something that is not broken — no grant lifts this.
  if (
    message.includes("self_approval_not_allowed") ||
    message.includes("may not approve or decide on their own submission")
  ) {
    return "Refused: you raised this request, so you cannot be the one who decides it. That split is deliberate — one person must not be able to ask for money and then approve it themselves — and no permission grant lifts it. Somebody else with the authority to decide requests has to approve or reject this one.";
  }

  // ── Refused before the handler ever saw the request ──────────────────────
  //
  // Checked ahead of the field branches: the envelope names its unmet fields —
  // `legal_entity_id`, `correlation_id` — in the same string, so a later match
  // on one of those would report a console fault as something the operator left
  // blank and send them back to a form that is already complete.
  if (message.includes("envelope_incomplete")) {
    return "Nothing was changed. The request was missing information the service requires on every change. This is a fault in the console rather than in anything you entered — report it rather than retyping the form.";
  }

  if (message.includes("authorization_denied")) {
    return "You do not have permission to do this for this company. Raising a request, approving one, and rejecting one are three separate permissions, so holding one does not imply the others — whoever administers access can grant the rest.";
  }
  if (message.includes("authorization_service_unavailable")) {
    return "Nothing was changed. Your permission to do this could not be checked, so the action was refused rather than allowed through unchecked. This is a safety refusal, not a decision about you — try again shortly.";
  }
  if (message.includes("identity_missing")) {
    return "Nothing was changed. Your session was not recognised — sign in again.";
  }
  if (message.includes("tenant_scope_mismatch")) {
    return "Refused: this request belongs to a different organisation from the one you are signed in to. Nothing was changed.";
  }
  if (message.includes("tenant_scope_missing")) {
    return "Nothing was changed. Your session did not say which organisation you are acting for — sign in again.";
  }
  if (message.includes("invalid_transition")) {
    return "This request has already been decided, so nothing was changed. Approval and rejection are both final — a second decision is refused rather than overwriting who decided it first and when. Reload the register to see how it was decided.";
  }
  if (message.includes("request_not_found")) {
    return (
      context.notFound ??
      "No request with that reference exists for your organisation. A request belonging to another organisation reads the same way, so this does not confirm it exists elsewhere. Check the reference against the register."
    );
  }
  if (message.includes("missing_field")) {
    const fields = namedFields(message.split("missing_field").pop() ?? "");
    return fields.length > 0
      ? `Something required was left empty: ${fields.join(", ")}. Nothing was saved.`
      : "Something required was left empty, so nothing was saved. Check every field on the form and try again.";
  }
  if (message.includes("invalid_field")) {
    // The service's own details here are already readable sentences — "amount
    // must be greater than zero", "legal_entity_id must be a UUID". The first
    // is fine as it stands; the second names a column and a format, neither of
    // which the reader typed, so the known cases are said in the reader's terms.
    if (message.includes("amount must be greater than zero")) {
      return "The amount has to be greater than zero. A request for nothing cannot be approved into an order.";
    }
    if (message.includes("status is not a recognised")) {
      return "That is not a status the register can filter by. Use one of the filters above rather than editing the address bar.";
    }
    if (message.includes("must be a UUID")) {
      return "One of the references sent with this was not in the form the service expects. If you pasted a reference, copy it again from the register — they are long and easy to truncate. If you did not, it is a fault in the console and worth reporting.";
    }
    const detail = requestDetail(message).replace(/^invalid_field:?\s*/, "");
    return `That value was not accepted: ${detail || "check the form and try again"}. Nothing was saved.`;
  }
  if (message.includes("invalid_json")) {
    return "Nothing was saved. The service could not read the request this console sent — that is a fault in the console rather than in what you entered, so it is worth reporting rather than retyping.";
  }
  if (message.includes("request_too_large")) {
    return "Nothing was saved. The request was larger than the service accepts. Shorten the description and try again.";
  }
  if (message.includes("store_unavailable")) {
    return "The service could not reach its database, and nothing was written. This is an outage rather than anything you entered — if it keeps happening it needs looking into.";
  }

  // ── Status-based fallback ────────────────────────────────────────────────
  //
  // The branch that catches whatever the service adds later without the console
  // being taught its wording. A status alone cannot say which conflict or which
  // missing record it is, so a caller supplies the wording for its own action
  // where it knows it.
  switch (context.status) {
    case 400:
      return "The service rejected this as invalid and saved nothing. Check what you entered and try again.";
    case 401:
      return "The service no longer accepts this session. Sign in again and repeat this.";
    case 403:
      return "Refused. Either you do not have permission to do this for this company, or the request belongs to a different organisation from the one you are signed in to. Nothing was changed.";
    case 404:
      return (
        context.notFound ??
        "No request with that reference exists for your organisation. Check it against the register — references are long and easy to mistype."
      );
    case 409:
      return "This clashes with something already on record, so nothing was saved. Reload the register to see what is there now.";
    case 413:
      return "Nothing was saved. The request was larger than the service accepts. Shorten the description and try again.";
    case 422:
      return "This request has already been decided, so nothing was changed. Both decisions are final. Reload the register to see how it was decided.";
    case 503:
      return "Nothing was changed. Something this action depends on was unavailable, so it was refused rather than allowed through unchecked. Try again shortly.";
    default:
      break;
  }
  if (context.status !== undefined && context.status >= 500) {
    return "The service failed while handling this. Reload the register and check where the request stands before retrying — this console cannot tell from the failure alone whether the decision was recorded.";
  }

  // Last resort. The service's own words are quoted rather than presented as
  // the answer: a reader cannot act on them, but whoever they report this to
  // can, and dropping them would make the refusal unreportable.
  return (
    "The requisition service refused this. It gave a reason this console does not have " +
    `wording for yet, repeated here as it was sent: “${requestDetail(message)}”. Reload the ` +
    "register to see where the request stands, and report that wording if it keeps happening."
  );
}
