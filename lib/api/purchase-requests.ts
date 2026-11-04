// purchase-request-svc (:8100, /purchase-request-svc through the gateway) — the
// requisition register that sits UPSTREAM of the purchase-order register.
//
// Lifecycle (domain.ValidRequestTransitions):
//
//   DRAFT ──submit──▶ PENDING_APPROVAL ──approve──▶ APPROVED ──convert──▶ CONVERTED
//                                       └─reject──▶ REJECTED
//   DRAFT | PENDING_APPROVAL | APPROVED ──cancel──▶ CANCELLED
//   PENDING_APPROVAL | APPROVED ──amend──▶ DRAFT (approval invalidated)
//
// A request is created as DRAFT and must be submitted before anyone can decide
// it. Every transition is version-checked: approve and reject REQUIRE
// `expected_version` (400 `expected_version_required` without it), and a stale
// version answers 409 `stale_version`. A transition the state does not allow
// answers 422 `invalid_transition`.
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

export type RequestStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "CONVERTED"
  | "CANCELLED"
  | "EXPIRED";

/** The filters the register offers, in lifecycle order. */
export const REQUEST_STATUSES: readonly RequestStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "CONVERTED",
  "CANCELLED",
  "EXPIRED",
];

/** The service still accepts the legacy "PENDING" alias on filters
 *  (domain.NormalizeStatus); everything it writes uses PENDING_APPROVAL. */
export function normaliseRequestStatus(raw: string | undefined | null): string {
  const s = (raw ?? "").trim();
  return s === "PENDING" ? "PENDING_APPROVAL" : s;
}

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
  /** Optimistic-concurrency version; send it back as expected_version. */
  version: number;
  business_purpose?: string;
  budget_decision?: "NOT_CHECKED" | "NOT_REQUIRED" | "ALLOWED" | "BLOCKED" | string;
  budget_basis?: string;
  submitted_by_principal_id?: string | null;
  approved_by_principal_id?: string | null;
  rejected_by_principal_id?: string | null;
  rejection_reason?: string | null;
  cancelled_by_principal_id?: string | null;
  cancellation_reason?: string | null;
  converted_purchase_order_id?: string | null;
  approval_invalidated_count?: number;
  correlation_id: string;
  created_at: string;
  updated_at?: string;
  submitted_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  cancelled_at?: string | null;
  converted_at?: string | null;
};

/** Actions the service says THIS caller may take now (SoD already applied). */
export type RequestAction =
  | "AmendRequisition"
  | "SubmitRequisition"
  | "CancelRequisition"
  | "ApproveRequisition"
  | "RejectRequisition"
  | "ConvertToPurchaseOrder";

export type AvailableActions = {
  request_id: string;
  status: RequestStatus;
  version: number;
  available_actions: RequestAction[];
};

export type RequestHistoryEntry = {
  history_id: string;
  request_id: string;
  version: number;
  action: string;
  from_status?: string | null;
  to_status: string;
  actor: string;
  reason?: string;
  created_at: string;
};

/** A response body that is an object, so its envelope keys can be read. */
function asEnvelope(raw: unknown): Record<string, unknown> | undefined {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : undefined;
}

/**
 * One request out of a write or read response. The service has answered with
 * the bare record, `{ data: record }` and `{ request: record }`; the first
 * object found under those keys wins, otherwise the body itself is the record.
 */
function unwrapRequest(raw: unknown): PurchaseRequest {
  const envelope = asEnvelope(raw);
  const inner = envelope?.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as PurchaseRequest;
  }
  return (envelope?.request ?? raw) as PurchaseRequest;
}

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
  const result = await apiGet<unknown>(
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
  if (result.data === null || result.data === undefined) return { ok: true, data: [] };

  const raw = result.data;
  const envelope = asEnvelope(raw);
  const list = (Array.isArray(raw)
    ? raw
    : Array.isArray(envelope?.data)
    ? envelope.data
    : Array.isArray(envelope?.requests)
    ? envelope.requests
    : Array.isArray(envelope?.purchase_requests)
    ? envelope.purchase_requests
    : null) as PurchaseRequest[] | null;

  if (!list) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "purchase-request-svc returned a non-array request list",
      },
    };
  }

  const requests = [...list].sort(
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
  const res = await apiGet<unknown>(
    "purchaseRequest",
    `/v1/purchase-requests/${requestId}`,
    { identity },
  );
  if (!res.ok) return res;
  return { ok: true, data: unwrapRequest(res.data) };
}

export type CreateRequestInput = {
  identity: Identity & { principalId: string; tenantId: string; legalEntityId: string };
  description: string;
  amount: number;
  currencyCode: string;
};

/**
 * Raise a new purchase request. It lands DRAFT at version 1 and grants nothing
 * until it is submitted and approved.
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
  const res = await apiPost<unknown>(
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
  if (!res.ok) return res;
  return { ...res, data: unwrapRequest(res.data) };
}

type RequestWriteIdentity = Identity & { principalId: string; tenantId: string };

const requestPath = (id: string, suffix = "") =>
  `/v1/purchase-requests/${encodeURIComponent(id)}${suffix}`;

async function transition(
  requestId: string,
  suffix: string,
  body: Record<string, unknown>,
  identity: RequestWriteIdentity,
): Promise<ApiWriteResult<PurchaseRequest>> {
  const res = await apiPost<unknown>("purchaseRequest", requestPath(requestId, suffix), body, { identity });
  if (!res.ok) return res;
  return { ...res, data: unwrapRequest(res.data) };
}

/**
 * DRAFT → PENDING_APPROVAL. Runs the budget check for controlled categories;
 * 422 `budget_blocked` if spend policy refuses it.
 */
export async function submitPurchaseRequestForApproval(
  requestId: string,
  expectedVersion: number,
  identity: RequestWriteIdentity,
): Promise<ApiWriteResult<PurchaseRequest>> {
  return transition(requestId, "/submit", { expected_version: expectedVersion }, identity);
}

/**
 * PENDING_APPROVAL → APPROVED. 403 `self_approval_not_allowed` /
 * `independent_approver_required` under segregation of duties.
 */
export async function approvePurchaseRequest(
  requestId: string,
  expectedVersion: number,
  identity: RequestWriteIdentity,
): Promise<ApiWriteResult<PurchaseRequest>> {
  return transition(requestId, "/approve", { expected_version: expectedVersion }, identity);
}

/**
 * PENDING_APPROVAL → REJECTED. Terminal. The reason is the audit record for
 * the refusal and is required.
 */
export async function rejectPurchaseRequest(
  requestId: string,
  reason: string,
  expectedVersion: number,
  identity: RequestWriteIdentity,
): Promise<ApiWriteResult<PurchaseRequest>> {
  return transition(
    requestId,
    "/reject",
    { reason, correlation_id: crypto.randomUUID(), expected_version: expectedVersion },
    identity,
  );
}

/** DRAFT | PENDING_APPROVAL | APPROVED → CANCELLED. Terminal. */
export async function cancelPurchaseRequest(
  requestId: string,
  reason: string,
  expectedVersion: number,
  identity: RequestWriteIdentity,
): Promise<ApiWriteResult<PurchaseRequest>> {
  return transition(requestId, "/cancel", { reason, expected_version: expectedVersion }, identity);
}

/** What the signed-in caller may do with this request right now. */
export async function getAvailableActions(
  requestId: string,
  identity: Identity & { tenantId: string },
): Promise<ApiResult<AvailableActions>> {
  const res = await apiGet<AvailableActions>("purchaseRequest", requestPath(requestId, "/available-actions"), {
    identity,
  });
  if (!res.ok) return res;
  return {
    ok: true,
    data: { ...res.data, available_actions: Array.isArray(res.data?.available_actions) ? res.data.available_actions : [] },
  };
}

/** The request's transition history, oldest first. */
export async function getRequestHistory(
  requestId: string,
  identity: Identity & { tenantId: string },
): Promise<ApiResult<RequestHistoryEntry[]>> {
  const res = await apiGet<unknown>("purchaseRequest", requestPath(requestId, "/history"), { identity });
  if (!res.ok) return res;
  const env = asEnvelope(res.data);
  const list = Array.isArray(res.data) ? res.data : Array.isArray(env?.history) ? env.history : [];
  return { ok: true, data: list as RequestHistoryEntry[] };
}

// ─── Derived views ───────────────────────────────────────────────────────────

export type RequestStats = {
  draft: number;
  pending: number;
  approved: number;
  rejected: number;
  /** Value awaiting a decision (PENDING_APPROVAL), by currency. Requests in
   *  different currencies are never summed together. */
  pendingValueByCurrency: Record<string, number>;
};

export function summariseRequests(requests: PurchaseRequest[]): RequestStats {
  const stats: RequestStats = {
    draft: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    pendingValueByCurrency: {},
  };

  for (const r of requests) {
    const status = normaliseRequestStatus(r.status);
    if (status === "APPROVED") stats.approved += 1;
    else if (status === "REJECTED") stats.rejected += 1;
    else if (status === "DRAFT") stats.draft += 1;
    else if (status === "PENDING_APPROVAL") {
      stats.pending += 1;
      const rawCode = r.currency_code ?? (r as unknown as Record<string, unknown>).currency;
      const currency = typeof rawCode === "string" && rawCode.trim().length > 0
        ? rawCode.trim().toUpperCase()
        : "UNSPECIFIED";
      const amount = Number.isFinite(r.amount) ? r.amount : 0;
      stats.pendingValueByCurrency[currency] =
        (stats.pendingValueByCurrency[currency] ?? 0) + amount;
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
  DRAFT: {
    label: "Draft",
    meaning:
      "The request has been written but not submitted. Nobody can approve it yet and it " +
      "authorises nothing. Submit it to send it for a decision.",
    tone: "neutral",
    decided: false,
    issuable: false,
  },
  PENDING_APPROVAL: {
    label: "Awaiting a decision",
    meaning:
      "The request has been submitted and nobody has decided it yet. It commits no money and " +
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
      "can now be placed against it. Amending it sends it back to DRAFT and voids the " +
      "approval; cancelling it stops it for good.",
    tone: "success",
    decided: true,
    issuable: true,
  },
  REJECTED: {
    label: "Rejected",
    meaning:
      "The request was turned down and no purchase order can be placed against it. The " +
      "decision is final — if the spend is still wanted, a new request has to be raised. " +
      "The reason given is stored on the record.",
    tone: "danger",
    decided: true,
    issuable: false,
  },
  CONVERTED: {
    label: "Converted to an order",
    meaning:
      "A purchase order was raised from this request. The request is closed; the spend is " +
      "now tracked on the order.",
    tone: "info",
    decided: true,
    issuable: false,
  },
  CANCELLED: {
    label: "Cancelled",
    meaning: "The request was withdrawn and can no longer be decided or ordered against.",
    tone: "neutral",
    decided: true,
    issuable: false,
  },
  EXPIRED: {
    label: "Expired",
    meaning: "The request's validity window elapsed before it was ordered against. Raise a new one.",
    tone: "neutral",
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
  const stored = normaliseRequestStatus(raw) || "(empty)";
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
export function formatRequestAmount(amount: number, currencyCode?: string | null): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const cleanCode = typeof currencyCode === "string" ? currencyCode.trim().toUpperCase() : "";

  if (/^[A-Z]{3}$/.test(cleanCode)) {
    try {
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: cleanCode,
        maximumFractionDigits: 2,
      }).format(safeAmount);
    } catch {
      // Fallback for unrecognised 3-letter currency code
    }
  }

  const formatted = safeAmount.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  if (cleanCode && cleanCode !== "UNDEFINED" && cleanCode !== "UNSPECIFIED") {
    return `${formatted} ${cleanCode}`;
  }
  return `${formatted} (Currency unspecified)`;
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

  const HEADLINE: Record<RequestStatus, string> = {
    DRAFT: `${money} drafted — not yet submitted for a decision.`,
    PENDING_APPROVAL: `${money} requested, and nobody has decided it yet.`,
    APPROVED: `${money} approved. An order can be placed against this request.`,
    REJECTED: `${money} requested and turned down. No order can be placed against it.`,
    CONVERTED: `${money} approved and converted to a purchase order.`,
    CANCELLED: `${money} requested and then cancelled.`,
    EXPIRED: `${money} requested; the request expired.`,
  };
  const NEXT: Record<RequestStatus, string> = {
    DRAFT: "Submit it for approval. Until then nobody can decide it.",
    PENDING_APPROVAL:
      "It needs a decision. Whoever approves it must be someone other than the person who raised it — the service refuses a request decided by the person who asked for it.",
    APPROVED:
      "The next step is on the order side: an order issued against this request is what actually commits the money.",
    REJECTED:
      "Nothing further can be done to this request. If the spend is still wanted, raise a new one.",
    CONVERTED: "Nothing further here — follow the purchase order.",
    CANCELLED: "Nothing further can be done to this request.",
    EXPIRED: "Nothing further can be done to this request. Raise a new one if the spend is still wanted.",
  };
  const current = status.raw as RequestStatus;

  const headline = status.unmapped
    ? `${money} requested — this console cannot say where it stands.`
    : HEADLINE[current];

  const nextStep = status.unmapped
    ? "Nothing should be placed against this request until someone who operates the service confirms what its status means."
    : NEXT[current];

  const decidedBy =
    request.approved_by_principal_id ?? request.rejected_by_principal_id ?? request.cancelled_by_principal_id ?? null;
  const decidedAt = request.approved_at ?? request.rejected_at ?? request.cancelled_at ?? null;

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
    message.includes("may not approve or reject their own submission") ||
    message.includes("may not approve or decide on their own submission")
  ) {
    return "Refused: you raised this request, so you cannot be the one who decides it. That split is deliberate — one person must not be able to ask for money and then approve it themselves — and no permission grant lifts it. Somebody else with the authority to decide requests has to approve or reject this one.";
  }
  if (message.includes("independent_approver_required")) {
    return "Refused: this request is above the approval threshold, so it needs an approver who did not raise, submit, or last amend it. Somebody else has to decide it.";
  }
  if (message.includes("expected_version_required")) {
    return "Nothing was changed. The decision has to name the version of the request it applies to. This is a console fault, not something you entered — report it.";
  }
  if (message.includes("stale_version")) {
    return "Nothing was changed. The request changed after you loaded it — someone amended, submitted, or decided it. Reload it and decide again on what is there now.";
  }
  if (message.includes("requisition_expired")) {
    return "Nothing was changed. The request's validity window has elapsed, so it can no longer be approved.";
  }
  if (message.includes("budget_blocked")) {
    return "Not submitted: spend policy blocked this request for one of its categories. Check the budget and spend limits for this category.";
  }
  if (message.includes("budget_check_unavailable")) {
    return "Not submitted: the budget check could not be reached, and a request in a controlled category is refused rather than sent unchecked. Try again shortly.";
  }
  if (message.includes("budget_check_required")) {
    return "Not approved: this request has a controlled category without an ALLOWED budget decision. Amend and resubmit it so the budget is checked.";
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
    return "That step is not available from the request's current status, so nothing was changed. A request must be submitted before it can be decided, and a decided, cancelled, or converted request cannot be decided again. Reload the register to see where it stands.";
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
      return "That step is not available from the request's current status, so nothing was changed. Reload the register to see where it stands.";
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
