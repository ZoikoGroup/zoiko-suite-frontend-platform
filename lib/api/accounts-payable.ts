// accounts-payable-svc (:8099, /accounts-payable-svc through the gateway) — the
// liability side of the ledger: vendor invoice intake and payment readiness.
//
// The lifecycle is strictly linear and every hop is a separate authorization
// grant: RECEIVED -> VALIDATED -> APPROVED -> PAYMENT_REQUESTED. There is no way
// to skip a state, which is how the service enforces the spec's critical
// constraint ("no payable may proceed to payment initiation without
// approval-state and evidence-state validation") — the sequence of transitions
// IS the evidence that every prior check happened. PAYMENT_REQUESTED is terminal
// here; executing the payment belongs to a future Treasury service.
//
// One thing about this service the UI still has to say out loud, because it is
// not guessable from a form: `vendor_id` is a free string, validated by nothing.
// No Vendor Master service exists anywhere in this platform, so a typo produces a
// perfectly valid invoice against a vendor that does not exist — there is no
// vendor_not_found to catch it.
//
// Two traps that USED to live here are now fixed in the service itself, which is
// why the copy below no longer hedges:
//
//  - A duplicate (vendor, invoice_number) answered 503 `store_unavailable`, so a
//    re-keyed number was indistinguishable from a dead database. It is now 409
//    `duplicate_invoice_number`.
//  - A malformed UUID died inside the pg driver and answered 503, so a typo in a
//    URL read as an outage. It is now 404 for a path id, 400 for a query filter.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

export type InvoiceStatus = "RECEIVED" | "VALIDATED" | "APPROVED" | "PAYMENT_REQUESTED";

/** One line of the supplier's document. The service requires at least one and
 *  balances the whole invoice against them: amount must equal Σ(net) + Σ(tax). */
export type InvoiceLine = {
  invoice_line_id: string;
  invoice_id: string;
  line_number: number;
  description: string;
  quantity: number;
  unit_price: number;
  net_amount: number;
  tax_code?: string | null;
  tax_amount: number;
  po_line_reference?: string | null;
};

/** Wire shape. Field names match the Go json tags exactly. */
export type VendorInvoice = {
  invoice_id: string;
  tenant_id: string;
  legal_entity_id: string;
  vendor_id: string;
  invoice_number: string;
  /** Gross total. The service refuses to record an invoice whose lines do not
   *  roll up to exactly this figure — see explainPayableError on
   *  invoice_does_not_balance. */
  amount: number;
  currency_code: string;
  /** DATE column, so this is a calendar date carried as an RFC3339 instant at
   *  UTC midnight. Format it as a date in UTC or it reads a day early west of
   *  Greenwich — see formatDueDate. */
  due_date: string;
  status: InvoiceStatus;
  /** The date printed on the supplier's document. Same DATE-as-RFC3339 shape
   *  as due_date; the service takes the date part only. */
  invoice_date: string;
  /** The tax point — when the supply took place — and the date that decides
   *  which tax period the invoice lands in. */
  supply_date: string;
  net_amount: number;
  tax_amount: number;
  lines: InvoiceLine[];
  purchase_order_id?: string | null;
  goods_receipt_ref?: string | null;
  po_vendor_profile_id?: string | null;
  invoice_document_id?: string | null;
  created_by_principal_id: string;
  validated_by_principal_id?: string | null;
  approved_by_principal_id?: string | null;
  payment_requested_by_principal_id?: string | null;
  correlation_id: string;
  created_at: string;
  validated_at?: string | null;
  approved_at?: string | null;
  payment_requested_at?: string | null;
};

/** The three transitions, named after their route segments. */
export type InvoiceAction = "validate" | "approve" | "request-payment";

export function isInvoiceAction(value: string): value is InvoiceAction {
  return value === "validate" || value === "approve" || value === "request-payment";
}

/**
 * The one legal next hop out of each state, or null at the terminal one.
 *
 * Single source of truth for the register's per-row button. Deriving the action
 * from the row's own status is what keeps the console from ever offering a
 * transition the service would refuse — the backend still checks it atomically,
 * so this is an affordance, not the enforcement.
 */
export const NEXT_STEP: Record<
  InvoiceStatus,
  { action: InvoiceAction; label: string; becomes: InvoiceStatus } | null
> = {
  RECEIVED: { action: "validate", label: "Validate", becomes: "VALIDATED" },
  VALIDATED: { action: "approve", label: "Approve", becomes: "APPROVED" },
  APPROVED: { action: "request-payment", label: "Request payment", becomes: "PAYMENT_REQUESTED" },
  PAYMENT_REQUESTED: null,
};

/** Lifecycle order, for the stage meter and for "step 2 of 4" wording. */
export const INVOICE_STAGES: InvoiceStatus[] = [
  "RECEIVED",
  "VALIDATED",
  "APPROVED",
  "PAYMENT_REQUESTED",
];

export function stageIndex(status: InvoiceStatus): number {
  return INVOICE_STAGES.indexOf(status);
}

export type ListInvoicesInput = {
  identity: Identity & { tenantId: string };
  legalEntityId?: string;
  vendorId?: string;
  status?: InvoiceStatus;
  limit?: number;
  offset?: number;
};

/**
 * How many invoices the register asks for.
 *
 * ListInvoices is now BOUNDED at the service, matching accounts-receivable-svc
 * on the other side of the ledger: an unbounded read used to hand back every
 * invoice a tenant had ever recorded on every dashboard load. The service's
 * own default is no bound, the console's is this page — deliberately under the
 * service's cap of 500, which refuses rather than clamps — and a full page is
 * reported as possibly-truncated (see AccountsPayablePanel) instead of passing
 * for the whole register.
 */
export const REGISTER_PAGE_SIZE = 400;

/**
 * List vendor invoices for the caller's tenant, newest first.
 *
 * `tenant_id` is a required query parameter — the service answers 400 without it
 * — and it must be a UUID: it is fed to `set_config('app.tenant_id')` and cast to
 * UUID by the row-level security policy, so a non-UUID dies inside Postgres and
 * comes back as a 503 rather than a 400.
 *
 * All three optional filters are applied by the service and compose with AND.
 * Ordering is the service's (`ORDER BY created_at DESC`), not re-done here. A
 * limit of 500 or more, or a negative limit, is refused with a 400 — the
 * service does not silently clamp.
 */
export async function listVendorInvoices(
  input: ListInvoicesInput,
): Promise<ApiResult<VendorInvoice[]>> {
  const result = await apiGet<VendorInvoice[] | null>("accountsPayable", "/v1/invoices", {
    query: {
      tenant_id: input.identity.tenantId,
      legal_entity_id: input.legalEntityId,
      vendor_id: input.vendorId,
      status: input.status,
      limit: input.limit,
      offset: input.offset,
    },
    identity: input.identity,
  });

  if (!result.ok) return result;
  // The store returns a nil slice for no rows, which marshals to JSON null.
  if (result.data === null) return { ok: true, data: [] };

  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "accounts-payable-svc returned a non-array invoice list",
      },
    };
  }

  return { ok: true, data: result.data };
}

/**
 * Fetch one invoice.
 *
 * Tenant scope comes from the X-Tenant-Id header only — the store returns
 * "not found" when the header is absent, so a call without identity is
 * indistinguishable from a bad id. Another tenant's invoice reads as absent in
 * exactly the same way, which is the intended behaviour.
 */
export async function getVendorInvoice(
  invoiceId: string,
  identity: Identity & { tenantId: string },
): Promise<ApiResult<VendorInvoice>> {
  return apiGet<VendorInvoice>("accountsPayable", `/v1/invoices/${invoiceId}`, { identity });
}

/** One line, as the form sends it. net_amount is computed client-side as
 *  quantity × unit_price (the form's read-only net per line); the service
 *  balances the whole invoice, so a line that does not add up is refused. */
export type CreateInvoiceLineInput = {
  description: string;
  quantity: number;
  unit_price: number;
  net_amount: number;
  tax_code?: string;
  tax_amount: number;
};

export type CreateInvoiceInput = {
  identity: Identity & { principalId: string; tenantId: string; legalEntityId: string };
  vendorId: string;
  invoiceNumber: string;
  /** Gross total = lines' net + lines' tax. The service refuses to store the
   *  invoice until exactly that holds, so the form derives it before sending. */
  amount: number;
  currencyCode: string;
  /** RFC3339. The Go field is a time.Time, so a bare "2026-09-01" fails to
   *  unmarshal and answers 400 `invalid_json` — the action converts the date
   *  input before it gets here. */
  dueDate: string;
  /** AP-05 required business/source inputs: the date on the supplier's
   *  document, the tax point, and at least one line. */
  invoiceDate: string;
  supplyDate: string;
  lines: CreateInvoiceLineInput[];
  /** Optional. When present, the service verifies it against purchase-order-svc
   *  before anything is written — an unknown or closed PO is refused. */
  purchaseOrderId?: string;
  goodsReceiptRef?: string;
  /** Required before VALIDATE will accept the invoice; recorded here so the
   *  same form can drive the whole way to the register. */
  invoiceDocumentId?: string;
};

/**
 * Record a vendor invoice. It lands RECEIVED and authorises no payment.
 *
 * 201 means an invoice was created; 200 means this replayed an existing one and
 * nothing was written — the service holds a partial unique index on
 * (tenant_id, correlation_id) and resolves a retry to the ORIGINAL record.
 * Reporting a replay as a second invoice would be a lie about the liability on
 * the books, which is the whole point of the idempotency.
 */
export async function createVendorInvoice(
  input: CreateInvoiceInput,
): Promise<ApiWriteResult<VendorInvoice>> {
  return apiPost<VendorInvoice>(
    "accountsPayable",
    "/v1/invoices",
    {
      tenant_id: input.identity.tenantId,
      legal_entity_id: input.identity.legalEntityId,
      vendor_id: input.vendorId,
      invoice_number: input.invoiceNumber,
      amount: input.amount,
      currency_code: input.currencyCode,
      due_date: input.dueDate,
      invoice_date: input.invoiceDate,
      supply_date: input.supplyDate,
      lines: input.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        net_amount: line.net_amount,
        tax_amount: line.tax_amount,
        tax_code: line.tax_code || undefined,
      })),
      purchase_order_id: input.purchaseOrderId || undefined,
      goods_receipt_ref: input.goodsReceiptRef || undefined,
      invoice_document_id: input.invoiceDocumentId || undefined,
      correlation_id: crypto.randomUUID(),
    },
    { identity: input.identity },
  );
}

/**
 * Advance an invoice one stage.
 *
 * All three transitions take no body — the actor comes from X-Principal-Id and
 * the target state is implied by the route. Each is a distinct authorization
 * action (AP_INVOICE_VALIDATE / AP_INVOICE_APPROVE / AP_PAYMENT_REQUEST), so
 * holding one grant does not imply the next.
 *
 * The service performs the check and the move as one atomic UPDATE with
 * `WHERE status = <expected>`, so a stale page cannot skip a stage: it answers
 * 422 `invalid_transition` instead.
 */
export async function advanceVendorInvoice(
  invoiceId: string,
  action: InvoiceAction,
  identity: Identity & { principalId: string; tenantId: string },
): Promise<ApiWriteResult<VendorInvoice>> {
  return apiPost<VendorInvoice>(
    "accountsPayable",
    `/v1/invoices/${invoiceId}/${action}`,
    {},
    { identity },
  );
}

// ─── Derived views ───────────────────────────────────────────────────────────

export type PayableStats = {
  received: number;
  validated: number;
  approved: number;
  paymentRequested: number;
  /** Approved but not yet sent for payment, by currency. Never summed across
   *  currencies — no service in this suite holds an FX rate, so one total would
   *  be a fiction. */
  awaitingPaymentByCurrency: Record<string, number>;
  /** Past its due date and not yet sent for payment. */
  overdue: number;
};

/**
 * Register totals.
 *
 * "Overdue" counts anything still short of PAYMENT_REQUESTED whose due date has
 * passed, not just APPROVED rows: an invoice sitting unvalidated past its due
 * date is the more urgent problem, and excluding it would make the number read
 * better than the position actually is.
 */
export function summariseInvoices(invoices: VendorInvoice[], now = new Date()): PayableStats {
  const stats: PayableStats = {
    received: 0,
    validated: 0,
    approved: 0,
    paymentRequested: 0,
    awaitingPaymentByCurrency: {},
    overdue: 0,
  };

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  for (const invoice of invoices) {
    if (invoice.status === "RECEIVED") stats.received += 1;
    else if (invoice.status === "VALIDATED") stats.validated += 1;
    else if (invoice.status === "APPROVED") stats.approved += 1;
    else stats.paymentRequested += 1;

    if (invoice.status === "APPROVED") {
      stats.awaitingPaymentByCurrency[invoice.currency_code] =
        (stats.awaitingPaymentByCurrency[invoice.currency_code] ?? 0) + invoice.amount;
    }

    if (invoice.status !== "PAYMENT_REQUESTED" && dueDateMs(invoice.due_date) < today) {
      stats.overdue += 1;
    }
  }

  return stats;
}

/** True when this invoice is past due and has not been sent for payment. */
export function isOverdue(invoice: VendorInvoice, now = new Date()): boolean {
  if (invoice.status === "PAYMENT_REQUESTED") return false;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return dueDateMs(invoice.due_date) < today;
}

/**
 * The date part of a due_date, as a calendar date.
 *
 * The column is DATE but the JSON is a full instant at UTC midnight. Rendering
 * that as a local timestamp shows the previous day anywhere west of Greenwich —
 * an invoice due on the 1st reading as due on the 31st — so the date part is
 * taken as a string and formatted in UTC.
 */
export function formatDueDate(value: string): string {
  return value.slice(0, 10);
}

function dueDateMs(value: string): number {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return Number.POSITIVE_INFINITY;
  return Date.UTC(year, month - 1, day);
}

/** Turn a backend failure into something an operator can act on. */
export function explainPayableError(message: string): string {
  if (message.includes("authorization_denied")) {
    return "Authorization denied — this principal does not hold the required permission on this legal entity. Recording, validating, approving, and requesting payment are four separate grants (AP_INVOICE_CREATE, AP_INVOICE_VALIDATE, AP_INVOICE_APPROVE, AP_PAYMENT_REQUEST), so holding one does not imply the next.";
  }
  if (message.includes("self_approval_not_allowed")) {
    return "You cannot approve an invoice you recorded. Segregation of duties (§12.3 of the design) requires the approval step to be taken by a different principal — switch to someone who did not record this invoice, or it stays VALIDATED until they do.";
  }
  if (message.includes("invoice_document_required")) {
    return "This invoice cannot be validated without its document. Validation is the evidence check — the service refuses to pass an invoice toward payment with no document of record. Record an invoice_document_id (or repost the invoice with one) and try again.";
  }
  if (message.includes("invoice_does_not_balance")) {
    return "The invoice does not balance. The service requires the gross amount to equal the lines' total exactly — net + tax — and stores nothing until it does. The detail above shows the net and tax the lines roll up to versus the amount sent.";
  }
  if (message.includes("no_lines")) {
    return "The invoice has no lines. AP-05 requires at least one line item — a document with nothing on it would let a gross amount ride on thin air. Add a line and try again.";
  }
  if (message.includes("invalid_line")) {
    return "A line was rejected — it needs a description, a non-negative net amount, and a non-negative tax amount. The detail above names the offending line.";
  }
  if (message.includes("purchase_order_unverifiable")) {
    return "The purchase order reference could not be verified because purchase-order-svc is unreachable. This is a fail-closed refusal — nothing was recorded — not a finding that the PO is invalid. Retry once the PO service is back.";
  }
  if (message.includes("purchase_order_closed")) {
    return "The referenced purchase order is closed, so goods against it can no longer be invoiced. Nothing was recorded.";
  }
  if (message.includes("purchase_order_unknown")) {
    return "No purchase order with that id exists for this tenant and legal entity, so the invoice was refused rather than recorded against a PO that cannot validate it.";
  }
  if (
    message.includes("limit must be a positive integer") ||
    message.includes("limit may not exceed") ||
    message.includes("offset must be a non-negative integer")
  ) {
    return "The register read asked for an out-of-range page. limit must be 1–500 and offset must not be negative — the service refuses rather than silently clamping.";
  }
  if (message.includes("tenant_scope_mismatch")) {
    return "The tenant named in the request does not match your verified identity scope. Nothing was read or written.";
  }
  if (message.includes("tenant_scope_missing")) {
    return "No tenant scope reached the service, so it failed closed. Sign in again.";
  }
  if (message.includes("authorization_service_unavailable")) {
    return "Could not verify authorization, so the action was refused. authorization-svc is unreachable — this is a fail-closed refusal, not a denial.";
  }
  if (message.includes("identity_missing")) {
    return "No caller identity reached the service, so it failed closed. Sign in again.";
  }
  if (message.includes("invalid_transition")) {
    return "That stage is not reachable from where this invoice currently is. The lifecycle is strictly linear — RECEIVED → VALIDATED → APPROVED → PAYMENT_REQUESTED — and no stage can be skipped or repeated. If the register looks out of date, reload it: the check and the move are one atomic update, so the service refused rather than acting on a stale reading.";
  }
  if (message.includes("invoice_not_found")) {
    return "No invoice with that id exists for this tenant. An invoice belonging to another tenant reads as absent in exactly the same way.";
  }
  if (message.includes("missing_field")) {
    return `A required field was empty: ${message.split("missing_field").pop()?.replace(/[^a-z_ ]/gi, " ").trim() || "check the form"}. Some are easy to miss: invoice_date and supply_date are both required, and supply_date (the tax point) can differ from invoice_date.`;
  }
  if (message.includes("invalid_field")) {
    return `That value was rejected: ${message.split("invalid_field").pop()?.replace(/["{}:,]/g, " ").trim() || "check the form"}.`;
  }
  if (message.includes("duplicate_invoice_number")) {
    return "This vendor already has an invoice with this number on this tenant's register, so nothing was written. (vendor, invoice number) is unique per tenant — the same invoice cannot be booked as a second liability.";
  }
  if (message.includes("unknown_field")) {
    // The service names the offending key, and that name is the whole remedy.
    return `The service refused a field it does not recognise: ${message.split("unknown field").pop()?.replace(/["}{]/g, "").trim() || "check the payload"}. Unknown fields are rejected rather than ignored, so a misspelled key cannot produce a record that silently lacks the value you thought you sent.`;
  }
  if (message.includes("request_too_large")) {
    return "The request body was larger than the service accepts (64 KiB). Nothing was written.";
  }
  if (message.includes("invalid_json")) {
    return "The service could not parse the request body. Due dates accept either YYYY-MM-DD or a full RFC3339 instant; the detail above names the field that failed.";
  }
  if (message.includes("store_unavailable")) {
    // Now genuinely means what it says. It used to double as the answer for a
    // duplicate invoice number, because every store error mapped to this one
    // code — so this message had to hedge between an outage and a typo. The
    // service distinguishes them (409 duplicate_invoice_number), and this can be
    // a single confident statement again.
    return "accounts-payable-svc could not reach its database. Nothing was written.";
  }
  return message;
}
