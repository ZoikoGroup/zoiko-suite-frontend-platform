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
  explainWriteError,
} from "@/lib/api/purchase-orders";
import type { OrderActionState } from "./state";

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
