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
import { revalidatePath } from "next/cache";
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
import type { LookupState } from "@/components/admin/shared/lookup";
import type { OrderActionState, RequestActionState } from "./state";

const PATH = "/admin/commercial-ops";

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

  revalidatePath(PATH);

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

  revalidatePath(PATH);

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

  revalidatePath(PATH);

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

  revalidatePath(PATH);

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

  revalidatePath(PATH);

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
