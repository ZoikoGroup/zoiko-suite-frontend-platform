"use server";

// Server Actions that WRITE to purchase-order-svc (:8129).
//
// Server Actions are reachable by direct POST, not only through this UI, so the
// session is verified inside every action rather than relying on the proxy's
// /admin matcher.
//
// None of these actions decide whether the caller is allowed to act — that is
// authorization-svc's job, checked inside purchase-order-svc on every mutation.
// The session lookup here establishes *who is asking*; it deliberately does not
// pre-empt the backend's answer, so the console can never grant something the
// governance plane would refuse.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  issuePurchaseOrder,
  amendPurchaseOrder,
  closePurchaseOrder,
  getPurchaseOrder,
  listOrderAmendments,
  explainWriteError,
} from "@/lib/api/purchase-orders";
import {
  createPurchaseRequest,
  approvePurchaseRequest,
  rejectPurchaseRequest,
  getPurchaseRequest,
  explainRequestError,
} from "@/lib/api/purchase-requests";
import {
  createSpendPolicy,
  deactivateSpendPolicy,
  submitSpendCheck,
  readDecision,
  explainSpendError,
  type SpendPeriod,
} from "@/lib/api/spend-controls";
import {
  startVendorCheck,
  getVendorCheck,
  readCheck,
  explainVendorDDError,
} from "@/lib/api/vendor-due-diligence";
import { formatMoney } from "@/lib/format";
import type { LookupState } from "@/components/admin/shared/lookup";
import type {
  OrderActionState,
  RequestActionState,
  SpendCheckActionState,
  SpendPolicyActionState,
  VendorCheckActionState,
} from "./state";

// Every write below ends in refresh(), not revalidatePath("/admin/commercial-ops").
//
// There is no Next data cache on this route to invalidate: cacheComponents is off
// and every panel reads cookies() for the session, so all four registers are fully
// dynamic. revalidatePath was therefore purging nothing while still carrying its
// documented side effect — in a Server Function it "also causes all previously
// visited pages to refresh when navigated to again", so a spend check here also
// invalidated the client cache for /admin/finance and everywhere else the operator
// had been. refresh() is the API for the thing these actions actually want:
// re-render the current route so the register shows the write that just landed.
//
// This narrows the blast radius. It is NOT proven to fix the intermittent lost
// confirmation banner recorded against this route — that needs a live reproduction
// with all four services up.

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };
}

const EXPIRED: OrderActionState = {
  status: "error",
  message: "Your session has expired — sign in again.",
};

/**
 * Issue a purchase order from the form.
 *
 * 201 means the order was created. 200 means the service recognised the request
 * as a replay and wrote nothing — reported as such rather than as a second
 * successful issue, because a duplicated commitment is exactly what the
 * idempotency is there to prevent.
 */
export async function issueOrder(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const amountRaw = String(formData.get("total_amount") ?? "").trim();
  const currencyCode = String(formData.get("currency_code") ?? "").trim();
  const purchaseRequestId = String(formData.get("purchase_request_id") ?? "").trim();
  const vendorProfileId = String(formData.get("vendor_profile_id") ?? "").trim();

  const totalAmount = Number(amountRaw);
  if (amountRaw === "" || !Number.isFinite(totalAmount) || totalAmount <= 0) {
    return { status: "error", message: "Order total must be a number greater than zero." };
  }
  if (!currencyCode) {
    return { status: "error", message: "Currency is required." };
  }
  // Checked here as well as by the service: these are uuid columns, and a
  // malformed id fails in the driver and comes back as a 503 that reads like an
  // outage rather than a typo.
  if (purchaseRequestId && !isUuid(purchaseRequestId)) {
    return { status: "error", message: "Purchase request ID must be a UUID." };
  }
  if (vendorProfileId && !isUuid(vendorProfileId)) {
    return { status: "error", message: "Vendor profile ID must be a UUID." };
  }

  const result = await issuePurchaseOrder({
    identity,
    totalAmount,
    currencyCode,
    purchaseRequestId: purchaseRequestId || undefined,
    vendorProfileId: vendorProfileId || undefined,
  });

  if (!result.ok) {
    return { status: "error", message: explainWriteError(result.error.message) };
  }

  refresh();

  const order = result.data;
  return result.status === 201
    ? {
        status: "created",
        poNumber: order.po_number,
        message: `${order.po_number} issued for ${formatAmount(order.total_amount, order.currency_code)}.`,
      }
    : {
        status: "replayed",
        poNumber: order.po_number,
        message: `No change — this request replayed ${order.po_number}. Nothing was written.`,
      };
}

/** Restate an order's total. The reason is mandatory: it is the audit record. */
export async function amendOrder(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const orderId = String(formData.get("purchase_order_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const amountRaw = String(formData.get("new_total_amount") ?? "").trim();

  if (!orderId) return { status: "error", message: "Missing purchase order ID." };
  if (!reason) return { status: "error", message: "An amendment reason is required." };

  const newTotalAmount = Number(amountRaw);
  if (amountRaw === "" || !Number.isFinite(newTotalAmount) || newTotalAmount <= 0) {
    return { status: "error", message: "Revised total must be a number greater than zero." };
  }

  const result = await amendPurchaseOrder({ orderId, identity, newTotalAmount, reason });

  if (!result.ok) {
    return { status: "error", message: explainWriteError(result.error.message) };
  }

  refresh();

  const order = result.data;
  return {
    status: "amended",
    poNumber: order.po_number,
    message: `${order.po_number} amended to ${formatAmount(order.total_amount, order.currency_code)} — now at version ${order.version}.`,
  };
}

/** Close an order. Terminal. */
export async function closeOrder(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const orderId = String(formData.get("purchase_order_id") ?? "").trim();
  if (!orderId) return { status: "error", message: "Missing purchase order ID." };

  const result = await closePurchaseOrder(orderId, identity);

  if (!result.ok) {
    return { status: "error", message: explainWriteError(result.error.message) };
  }

  refresh();

  return {
    status: "closed",
    poNumber: result.data.po_number,
    message: `${result.data.po_number} closed. No further amendments are possible.`,
  };
}

/**
 * Read one order by id.
 *
 * The full record, which the register's table cannot show: the linked purchase
 * request and vendor profile, who closed it, and the correlation id that ties the
 * order to its events elsewhere in the suite.
 *
 * The amendment history is NOT here — it has its own route and its own reader,
 * lookupOrderAmendments below. This returns the order's current state; that
 * returns how it got there.
 */
export async function lookupOrder(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const orderId = String(formData.get("purchase_order_id") ?? "").trim();
  if (!orderId) return { status: "error", message: "Enter a purchase order ID." };
  if (!isUuid(orderId)) {
    // The column is uuid: a malformed id fails inside the driver and comes back
    // as a 503 that reads like an outage rather than a typo.
    return { status: "error", message: "A purchase order ID must be a UUID." };
  }

  const result = await getPurchaseOrder(orderId, identity);

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "missing",
        message:
          "No order with that id exists for this tenant. Row-level security hides another tenant's order the same way, so both read as not found.",
      };
    }
    return { status: "error", message: explainWriteError(result.error.message) };
  }

  return { status: "found", record: result.data, message: "" };
}

/**
 * Read one order's amendment ledger.
 *
 * Every amend records the before/after total and the operator's stated reason.
 * That history used to be genuinely unreadable — no route exposed it, so an
 * order's `version` was the only trace it had ever been restated. It is now
 * readable, which is what makes an amendment auditable rather than merely
 * counted.
 */
export async function lookupOrderAmendments(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const orderId = String(formData.get("amendments_purchase_order_id") ?? "").trim();
  if (!orderId) return { status: "error", message: "Enter a purchase order ID." };
  if (!isUuid(orderId)) {
    return { status: "error", message: "A purchase order ID must be a UUID." };
  }

  const result = await listOrderAmendments(orderId, identity);

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "missing",
        message:
          "No order with that id exists for this tenant. Note this is not the same as an order with no amendments — that returns an empty ledger, not a 404.",
      };
    }
    return { status: "error", message: explainWriteError(result.error.message) };
  }

  if (result.data.length === 0) {
    return {
      status: "missing",
      message:
        "This order exists and has never been amended, so its ledger is empty and it is still at version 1.",
    };
  }

  return { status: "found", record: result.data, message: "" };
}

// ── purchase-request-svc (:8100) ─────────────────────────────────────────────
//
// Upstream of the order register: an order can only be issued against a request
// that is APPROVED. These three actions are what make that precondition
// reachable from the console instead of something an operator has to arrange by
// hand and paste an id for.

const EXPIRED_REQUEST: RequestActionState = {
  status: "error",
  message: "Your session has expired — sign in again.",
};

/** Raise a purchase request. Lands PENDING; grants nothing on its own. */
export async function submitPurchaseRequest(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED_REQUEST;
  }

  const description = String(formData.get("description") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const currencyCode = String(formData.get("currency_code") ?? "").trim();

  if (!description) {
    return { status: "error", message: "A description is required — it is what an approver reads." };
  }
  const amount = Number(amountRaw);
  if (amountRaw === "" || !Number.isFinite(amount) || amount <= 0) {
    return { status: "error", message: "Amount must be a number greater than zero." };
  }
  if (!currencyCode) return { status: "error", message: "Currency is required." };

  const result = await createPurchaseRequest({ identity, description, amount, currencyCode });

  if (!result.ok) {
    return { status: "error", message: explainRequestError(result.error.message) };
  }

  refresh();

  const request = result.data;
  const money = formatAmount(request.amount, request.currency_code);
  // The ID goes in the message because it is the only way out of this form: the
  // next two steps (decide, then issue an order against it) both take it by
  // hand, and there is no picker. Without it the operator has to go hunting in
  // the register for the row they just created.
  return result.status === 201
    ? {
        status: "created",
        requestId: request.request_id,
        message: `Request raised for ${money}, status ${request.status} — ID ${request.request_id}. It authorises nothing until approved; an order cannot be issued against it yet.`,
      }
    : {
        status: "replayed",
        requestId: request.request_id,
        message: `No new request written — this replayed an existing one for ${money}, currently ${request.status}, ID ${request.request_id}. The service is idempotent on correlation ID, so a retried submit resolves to the original rather than duplicating it.`,
      };
}

/** Approve a PENDING request. Terminal. */
export async function submitRequestApproval(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  return decideRequest(formData, "approve");
}

/** Reject a PENDING request, with a reason. Terminal. */
export async function submitRequestRejection(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  return decideRequest(formData, "reject");
}

/**
 * The two decisions share everything except the call and the wording, and both
 * are terminal — so a 422 is reported as "already decided" rather than an error,
 * because it is a fact about the record, not a failure of the attempt.
 */
async function decideRequest(
  formData: FormData,
  decision: "approve" | "reject",
): Promise<RequestActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED_REQUEST;
  }

  const requestId = String(formData.get("request_id") ?? "").trim();
  if (!requestId) return { status: "error", message: "A purchase request ID is required." };
  if (!isUuid(requestId)) {
    // uuid column: a malformed id dies in the driver and surfaces as a 503 that
    // reads like an outage rather than a typo.
    return { status: "error", message: "A purchase request ID must be a UUID." };
  }

  let reason = "";
  if (decision === "reject") {
    reason = String(formData.get("reason") ?? "").trim();
    if (!reason) {
      return {
        status: "error",
        message:
          "A reason is required to reject. The reason is the audit record for the refusal, so the service will not accept an unexplained one.",
      };
    }
  }

  const result =
    decision === "approve"
      ? await approvePurchaseRequest(requestId, identity)
      : await rejectPurchaseRequest(requestId, reason, identity);

  if (!result.ok) {
    if (result.error.status === 422) {
      return { status: "already-decided", message: explainRequestError(result.error.message) };
    }
    return { status: "error", message: explainRequestError(result.error.message) };
  }

  refresh();

  const request = result.data;
  return decision === "approve"
    ? {
        status: "approved",
        requestId: request.request_id,
        message: `Request APPROVED and attributed to you. An order can now be issued against it — paste this ID into the issue form above: ${request.request_id}`,
      }
    : {
        status: "rejected",
        requestId: request.request_id,
        message: `Request REJECTED, with your reason stored on the record. No order can be issued against it.`,
      };
}

/** Read one purchase request by id. */
export async function lookupPurchaseRequest(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const requestId = String(formData.get("lookup_request_id") ?? "").trim();
  if (!requestId) return { status: "error", message: "Enter a purchase request ID." };
  if (!isUuid(requestId)) {
    return { status: "error", message: "A purchase request ID must be a UUID." };
  }

  const result = await getPurchaseRequest(requestId, identity);

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "missing",
        message:
          "No purchase request with that id exists for this tenant. A request belonging to another tenant reads as absent in exactly the same way.",
      };
    }
    return { status: "error", message: explainRequestError(result.error.message) };
  }

  return { status: "found", record: result.data, message: "" };
}

// ── spend-controls-svc (:8131) ───────────────────────────────────────────────
//
// The limit across procurement. A check here is a decision with four distinct
// readings, and the actions below keep them apart rather than reducing them to
// success/failure — see state.ts for why `unevaluated` cannot be green.

const EXPIRED_SPEND_POLICY: SpendPolicyActionState = {
  status: "error",
  message: "Your session has expired — sign in again.",
};

const EXPIRED_SPEND_CHECK: SpendCheckActionState = {
  status: "error",
  message: "Your session has expired — sign in again.",
};

/** Set a spend limit for a category on the session's legal entity. */
export async function setSpendPolicy(
  _previous: SpendPolicyActionState,
  formData: FormData,
): Promise<SpendPolicyActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED_SPEND_POLICY;
  }

  const category = String(formData.get("category") ?? "").trim();
  const period = String(formData.get("period") ?? "").trim();
  const currencyCode = String(formData.get("policy_currency_code") ?? "").trim();
  const thresholdRaw = String(formData.get("threshold_amount") ?? "").trim();

  if (!category) return { status: "error", message: "A category is required." };
  if (!isSpendPeriod(period)) {
    return { status: "error", message: "Period must be PER_TRANSACTION, MONTHLY, or ANNUAL." };
  }
  if (!currencyCode) return { status: "error", message: "Currency is required." };

  const thresholdAmount = Number(thresholdRaw);
  if (thresholdRaw === "" || !Number.isFinite(thresholdAmount) || thresholdAmount <= 0) {
    return { status: "error", message: "The threshold must be a number greater than zero." };
  }

  const result = await createSpendPolicy({
    identity,
    category,
    period,
    thresholdAmount,
    currencyCode,
  });

  if (!result.ok) {
    return { status: "error", message: explainSpendError(result.error.message) };
  }

  refresh();

  const policy = result.data;
  const money = formatMoney(policy.threshold_amount, policy.currency_code);
  const window =
    policy.period === "PER_TRANSACTION"
      ? "per transaction"
      : policy.period === "MONTHLY"
        ? "per calendar month"
        : "per calendar year";

  // The count comes from the write itself rather than a read taken beforehand,
  // which could disagree with what the write then did.
  return policy.superseded > 0
    ? {
        status: "superseded",
        policyId: policy.spend_policy_id,
        message: `${policy.category} is now limited to ${money} ${window}. This replaced ${policy.superseded === 1 ? "the previous limit" : `${policy.superseded} previous limits`} for this category, which ${policy.superseded === 1 ? "is" : "are"} no longer in force — the row is kept rather than overwritten, so what the limit used to be is still on record.`,
      }
    : {
        status: "created",
        policyId: policy.spend_policy_id,
        message: `${policy.category} is now limited to ${money} ${window}. Every spend check against this category and entity is judged against it from now on.`,
      };
}

/**
 * Withdraw a limit, so the category stops being governed.
 *
 * Deliberately not phrased as a deletion: the row and its consumption history stay.
 * The consequence worth stating in the banner is that checks against the category
 * are no longer evaluated at all — which reads as ALLOWED, and is not approval.
 */
export async function withdrawSpendPolicy(
  _previous: SpendPolicyActionState,
  formData: FormData,
): Promise<SpendPolicyActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED_SPEND_POLICY;
  }

  const policyId = String(formData.get("spend_policy_id") ?? "").trim();
  const category = String(formData.get("withdraw_category") ?? "").trim();

  if (!policyId) return { status: "error", message: "Missing policy ID." };
  if (!isUuid(policyId)) return { status: "error", message: "A policy ID must be a UUID." };

  const result = await deactivateSpendPolicy(policyId, identity);

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "error",
        message:
          "No limit with that id is in force for this tenant. Another tenant's limit reads as absent in exactly the same way.",
      };
    }
    return { status: "error", message: explainSpendError(result.error.message) };
  }

  refresh();

  const label = category || "This category";
  return result.data.withdrawn
    ? {
        status: "superseded",
        policyId,
        message: `${label} is no longer governed. Spend checks against it will now return ALLOWED without evaluating anything — which is not approval, it is the absence of a control. The limit's record and everything spent against it are kept.`,
      }
    : {
        status: "superseded",
        policyId,
        message: `Nothing changed — that limit was already not in force, either withdrawn earlier or superseded by a newer one.`,
      };
}

/**
 * Ask whether a proposed spend is permitted.
 *
 * The correlation id is generated here, once per submission: it is the
 * idempotency key, and reusing one would replay the earlier decision instead of
 * evaluating this spend.
 */
export async function submitSpendCheckAction(
  _previous: SpendCheckActionState,
  formData: FormData,
): Promise<SpendCheckActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED_SPEND_CHECK;
  }

  const category = String(formData.get("check_category") ?? "").trim();
  const currencyCode = String(formData.get("check_currency_code") ?? "").trim();
  const amountRaw = String(formData.get("check_amount") ?? "").trim();
  const sourceReference = String(formData.get("source_reference") ?? "").trim();

  if (!category) return { status: "error", message: "A category is required." };
  if (!currencyCode) return { status: "error", message: "Currency is required." };

  const amount = Number(amountRaw);
  if (amountRaw === "" || !Number.isFinite(amount) || amount <= 0) {
    return { status: "error", message: "The amount must be a number greater than zero." };
  }

  const result = await submitSpendCheck({
    identity,
    category,
    amount,
    currencyCode,
    sourceReference: sourceReference || undefined,
    correlationId: crypto.randomUUID(),
  });

  if (!result.ok) {
    // A cross-currency check is a refusal with a remedy, not a malfunction: the
    // policy is denominated in another currency and nothing here can convert.
    if (result.error.status === 422) {
      return { status: "refused", message: explainSpendError(result.error.message) };
    }
    return { status: "error", message: explainSpendError(result.error.message) };
  }

  refresh();

  const decision = result.data;
  const detail = {
    priorConsumption: decision.prior_consumption,
    projectedTotal: decision.projected_total,
    thresholdAmount: decision.threshold_amount,
    currencyCode: decision.currency_code ?? currencyCode,
    consumptionId: decision.consumption_id,
  };
  const money = (value: number) => formatMoney(value, detail.currencyCode ?? currencyCode);

  switch (readDecision(decision)) {
    case "replayed":
      return {
        status: "replayed",
        detail,
        message: `No new spend recorded — this replayed an earlier decision for the same correlation ID, which was ${decision.decision_outcome}. The service is idempotent on that key, so a retry resolves to the original rather than booking the amount twice.`,
      };
    case "unevaluated":
      // 200 ALLOWED, but nothing was checked. Rendering this as an approval would
      // report an ungoverned category as a governed one that agreed.
      return {
        status: "unevaluated",
        detail,
        message: `No limit is configured for ${category} on this entity, so nothing constrained this spend and nothing was recorded. It was not approved — it was simply never checked. Set a limit above if this category is meant to be governed.`,
      };
    case "refused":
      return {
        status: "refused",
        detail,
        message: `Refused: ${money(amount)} would take ${category} to ${money(decision.projected_total)} against a limit of ${money(decision.threshold_amount ?? 0)}. ${money(decision.prior_consumption)} is already committed. The attempt is recorded as refused, and it consumed none of the budget.`,
      };
    default:
      return {
        status: "permitted",
        detail,
        message: `Permitted: ${money(amount)} recorded against ${category}, taking committed spend to ${money(decision.projected_total)} of ${money(decision.threshold_amount ?? 0)}.`,
      };
  }
}

// ── vendor-due-diligence-svc (:8135) ─────────────────────────────────────────
//
// Screening a counterparty before commercial exposure to it. The service's only
// screening is an exact match against a hardcoded two-name denylist, so a no-match
// result is NOT a clearance — see state.ts and lib/api/vendor-due-diligence.ts for
// why that distinction is load-bearing rather than pedantic.

const EXPIRED_VENDOR_CHECK: VendorCheckActionState = {
  status: "error",
  message: "Your session has expired — sign in again.",
};

/**
 * Screen a counterparty and record the result with its evidence.
 *
 * Synchronous, so this returns a finished outcome rather than a job id. The
 * correlation id is generated here, once per submission: it is the idempotency
 * key, and reusing one would replay the earlier check instead of running this one.
 */
export async function startVendorDueDiligence(
  _previous: VendorCheckActionState,
  formData: FormData,
): Promise<VendorCheckActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED_VENDOR_CHECK;
  }

  const counterpartyId = String(formData.get("counterparty_id") ?? "").trim();
  const vendorName = String(formData.get("vendor_name") ?? "").trim();
  const documentReference = String(formData.get("document_reference") ?? "").trim();

  if (!counterpartyId) {
    return { status: "error", message: "A counterparty ID is required — it is what the outcome is recorded against." };
  }
  if (!vendorName) {
    // Trimmed before this test, deliberately. The service refuses a blank name
    // too, and for a sharper reason: a whitespace-only name matches nothing on the
    // denylist, so it would otherwise conclude as a screened vendor with no match
    // — a clean due-diligence result for a vendor with no name.
    return {
      status: "error",
      message:
        "A vendor name is required. It is the only thing actually screened, so a blank one would produce a no-match result that means nothing.",
    };
  }

  const result = await startVendorCheck({
    identity,
    counterpartyId,
    vendorName,
    documentReference: documentReference || undefined,
    correlationId: crypto.randomUUID(),
  });

  if (!result.ok) {
    // 409 means another request concluded this check first. Its outcome stands —
    // reported as a conflict rather than a failure, because nothing is broken and
    // there is a result to read.
    if (result.error.status === 409) {
      return { status: "unconcluded", message: explainVendorDDError(result.error.message) };
    }
    return { status: "error", message: explainVendorDDError(result.error.message) };
  }

  refresh();

  const { check, evidence, replayed } = result.data;
  const detail = {
    vendorName: check.vendor_name,
    screeningBasis: check.screening_basis,
    screeningSource: check.screening_source,
    evidenceCount: evidence.length,
    documentReference: evidence[0]?.document_reference,
  };

  if (replayed) {
    // A replay can resolve to a check an earlier attempt abandoned in STARTED, so
    // the stored status is reported rather than assumed to be a conclusion.
    const concluded = check.status === "COMPLETED";
    return {
      status: "replayed",
      checkId: check.check_id,
      detail,
      message: concluded
        ? `No new screening ran — this replayed an existing check of ${check.vendor_name}, which concluded ${check.risk_outcome}. The service is idempotent on correlation ID, so a retry resolves to the original rather than screening twice.`
        : `No new screening ran — this replayed an existing check of ${check.vendor_name} that is still ${check.status} and carries no outcome. An earlier attempt recorded the check but never concluded it, so this counterparty has NOT been screened. Screening is synchronous here, so this is a lost result rather than one still in progress.`,
    };
  }

  switch (readCheck(check)) {
    case "flagged":
      return {
        status: "flagged",
        checkId: check.check_id,
        detail,
        message: `FLAGGED — ${check.vendor_name} matched the screening list. ${check.screening_basis ?? ""} The counterparty record has been pushed to REJECTED with risk category HIGH in counterparty-management-svc, and the finding is recorded as evidence.`.trim(),
      };
    case "failed":
      return {
        status: "failed",
        checkId: check.check_id,
        detail,
        message: `The screening ran but could not be recorded, so there is NO due diligence result for ${check.vendor_name}. The check is marked FAILED and vendor.dd.failed was published. Do not treat this counterparty as screened — run the check again.`,
      };
    case "unconcluded":
      return {
        status: "unconcluded",
        checkId: check.check_id,
        detail,
        message: `The check for ${check.vendor_name} was recorded but carries no outcome, so this counterparty has not been screened. Screening is synchronous here, so this is a lost result rather than one still running.`,
      };
    default:
      // The careful one. 201 with CLEAR, and it is still not an approval: the
      // list holds two names and the match is exact, so this says "we looked and
      // found nothing" and nothing more.
      return {
        status: "screened-no-match",
        checkId: check.check_id,
        detail,
        message: `Screened — ${check.vendor_name} did not match the screening list, and the result is recorded with its evidence. This is not a sanctions clearance: the only list available is a hardcoded two-name stub matched exactly, so a near-miss such as a trailing "Ltd" would also read as no match. Treat it as "checked against what we have", not as "approved".`,
      };
  }
}

/** Read one check with the evidence gathered for it. */
export async function lookupVendorCheck(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const checkId = String(formData.get("vendor_check_id") ?? "").trim();
  if (!checkId) return { status: "error", message: "Enter a check ID." };
  if (!isUuid(checkId)) {
    // check_id IS a uuid column here (unlike this service's entity and
    // counterparty columns, which are VARCHAR), so a malformed value would die in
    // the driver. The service maps that to not-found rather than 503, but
    // rejecting it here gives the better message.
    return { status: "error", message: "A check ID must be a UUID." };
  }

  const result = await getVendorCheck(checkId, identity);

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "missing",
        message:
          "No check with that id exists for this tenant. Row-level security hides another tenant's check the same way, so both read as not found.",
      };
    }
    return { status: "error", message: explainVendorDDError(result.error.message) };
  }

  return { status: "found", record: result.data, message: "" };
}

function isSpendPeriod(value: string): value is SpendPeriod {
  return value === "PER_TRANSACTION" || value === "MONTHLY" || value === "ANNUAL";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}
