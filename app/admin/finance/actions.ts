"use server";

// Server Actions that WRITE to accounts-payable-svc (:8099).
//
// Server Actions are reachable by direct POST, not only through this UI, so the
// session is verified inside every action rather than relying on the proxy's
// /admin matcher.
//
// None of these actions decide whether the caller is allowed to act — that is
// authorization-svc's job, checked inside accounts-payable-svc on every mutation
// and failing closed. The session lookup here establishes *who is asking*; it
// deliberately does not pre-empt the backend's answer, so the console can never
// grant something the governance plane would refuse.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createVendorInvoice,
  advanceVendorInvoice,
  getVendorInvoice,
  explainPayableError,
  isInvoiceAction,
  NEXT_STEP,
  type InvoiceAction,
} from "@/lib/api/accounts-payable";
import { formatMoney } from "@/lib/format";
import type { LookupState } from "@/components/admin/shared/lookup";
import type { PayableActionState } from "./state";

// Writes end in refresh(), not revalidatePath. Nothing on this route is cached
// — cacheComponents is off and every panel reads cookies() for the session — so
// there was no cache for revalidatePath to invalidate, while in a Server
// Function it additionally refreshes every previously visited page. refresh()
// re-renders just this route, which is what these actions actually want.

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

const EXPIRED: PayableActionState = {
  status: "error",
  message: "Your session has expired — sign in again.",
};

/**
 * Record a vendor invoice from the intake form. It lands RECEIVED.
 *
 * 201 means an invoice was created. 200 means the service recognised the request
 * as a replay and wrote nothing — reported as such rather than as a second
 * successful intake, because a duplicated liability is what the idempotency is
 * there to prevent.
 */
export async function recordVendorInvoice(
  _previous: PayableActionState,
  formData: FormData,
): Promise<PayableActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const vendorId = String(formData.get("vendor_id") ?? "").trim();
  const invoiceNumber = String(formData.get("invoice_number") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const currencyCode = String(formData.get("currency_code") ?? "").trim();
  const dueDateRaw = String(formData.get("due_date") ?? "").trim();

  if (!vendorId) {
    return {
      status: "error",
      message:
        "A vendor reference is required. Nothing validates it — no Vendor Master service exists — so it is also the one field a typo passes silently.",
    };
  }
  if (!invoiceNumber) {
    return { status: "error", message: "The vendor's invoice number is required." };
  }

  const amount = Number(amountRaw);
  if (amountRaw === "" || !Number.isFinite(amount) || amount <= 0) {
    return { status: "error", message: "Amount must be a number greater than zero." };
  }
  if (!currencyCode) return { status: "error", message: "Currency is required." };

  // The service now accepts a bare "2026-09-01" as well as RFC3339 — due_date is
  // a DATE column, so a day is the honest unit. This still sends the explicit
  // instant: it pins the value to UTC midnight rather than relying on the
  // service's parsing, and a date input is validated here anyway so a direct POST
  // is held to the same contract.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDateRaw)) {
    return { status: "error", message: "A due date is required, as YYYY-MM-DD." };
  }
  const dueDate = `${dueDateRaw}T00:00:00Z`;

  const result = await createVendorInvoice({
    identity,
    vendorId,
    invoiceNumber,
    amount,
    currencyCode,
    dueDate,
  });

  if (!result.ok) {
    // 409 is a re-keyed invoice number, not a failure of the service. Kept apart
    // from `error` so the banner reads as "that number is already on the
    // register" rather than as something broken — this used to arrive as a 503
    // and was reported as an outage.
    if (result.error.status === 409) {
      return {
        status: "duplicate",
        message: `${vendorId} already has an invoice numbered ${invoiceNumber} on this tenant's register, so nothing was written. (vendor, invoice number) is unique — if this is a genuinely different invoice, check the number with the vendor; if it is the same one, it is already recorded.`,
      };
    }
    return { status: "error", message: explainPayableError(result.error.message) };
  }

  refresh();

  const invoice = result.data;
  const money = formatMoney(invoice.amount, invoice.currency_code);

  return result.status === 201
    ? {
        status: "recorded",
        invoiceId: invoice.invoice_id,
        stage: invoice.status,
        message: `Invoice ${invoice.invoice_number} recorded for ${money}, status ${invoice.status} — ID ${invoice.invoice_id}. It authorises no payment: validation, approval, and a payment request are three further steps, each a separate grant.`,
      }
    : {
        status: "replayed",
        invoiceId: invoice.invoice_id,
        stage: invoice.status,
        message: `No new invoice written — this replayed an existing one (${invoice.invoice_number}, ${money}, currently ${invoice.status}, ID ${invoice.invoice_id}). The service is idempotent on correlation ID, so a retried submit resolves to the original rather than booking the liability twice.`,
      };
}

/**
 * Advance one invoice by one stage.
 *
 * The action comes from the form because the register derives it from the row's
 * own status, but it is re-checked here: a Server Action is reachable by direct
 * POST, so an arbitrary route segment must not reach the service. The stage
 * check itself stays with the backend, which does it as one atomic UPDATE.
 */
export async function advanceInvoice(
  _previous: PayableActionState,
  formData: FormData,
): Promise<PayableActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const rawAction = String(formData.get("action") ?? "").trim();

  if (!invoiceId) return { status: "error", message: "Missing invoice ID." };
  if (!isUuid(invoiceId)) {
    // The service now answers 404 for a malformed id rather than 503, so this
    // check is no longer load-bearing — it is kept to save a pointless round trip
    // and to say "that is not an id" instead of "no such invoice".
    return { status: "error", message: "An invoice ID must be a UUID." };
  }
  if (!isInvoiceAction(rawAction)) {
    return { status: "error", message: "Unrecognised transition." };
  }
  const action: InvoiceAction = rawAction;

  const result = await advanceVendorInvoice(invoiceId, action, identity);

  if (!result.ok) {
    if (result.error.status === 422) {
      return { status: "out-of-sequence", message: explainPayableError(result.error.message) };
    }
    return { status: "error", message: explainPayableError(result.error.message) };
  }

  refresh();

  const invoice = result.data;
  const next = NEXT_STEP[invoice.status];

  return {
    status: "advanced",
    invoiceId: invoice.invoice_id,
    stage: invoice.status,
    message:
      invoice.status === "PAYMENT_REQUESTED"
        ? `${invoice.invoice_number} is now PAYMENT_REQUESTED and attributed to you. Terminal here — a payment.requested event has been published, and executing the payment belongs to Treasury, not this service. No further transition is possible.`
        : `${invoice.invoice_number} is now ${invoice.status}, attributed to you. Next: ${next?.label ?? "none"} — a separate authorization grant.`,
  };
}

/**
 * Read one invoice by id.
 *
 * The full record, which the register's table cannot show: every actor and
 * timestamp along the lifecycle, and the correlation id that ties the invoice to
 * its events elsewhere in the suite.
 */
export async function lookupVendorInvoice(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const invoiceId = String(formData.get("lookup_invoice_id") ?? "").trim();
  if (!invoiceId) return { status: "error", message: "Enter an invoice ID." };
  if (!isUuid(invoiceId)) {
    return { status: "error", message: "An invoice ID must be a UUID." };
  }

  const result = await getVendorInvoice(invoiceId, identity);

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "missing",
        message:
          "No invoice with that id exists for this tenant. Two other things read identically: an invoice belonging to another tenant, and a request that carried no tenant scope at all — the store resolves tenant from the X-Tenant-Id header and returns nothing when it is absent.",
      };
    }
    return { status: "error", message: explainPayableError(result.error.message) };
  }

  return { status: "found", record: result.data, message: "" };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
