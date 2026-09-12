// accounts-receivable-svc (:8101) — the customer invoice register.
//
// A receivable walks ISSUED -> SENT -> {OVERDUE | PAID}, each hop gated on its
// own authorization action, and PAID is terminal. Four properties shape this
// page:
//
//  1. THE TENANT IS THE CALLER'S, NEVER A PARAMETER. Until 19 Aug the register
//     built its filter from a ?tenant_id= query parameter and the create path
//     read tenant_id out of the request body, and NEITHER consulted the verified
//     X-Tenant-Id. So `?tenant_id=<any-uuid>` returned that tenant's entire
//     receivables register, and a create body naming another tenant filed the
//     invoice there. The service now refuses either with 403
//     tenant_scope_mismatch, and takes the scope from the identity headers this
//     client sends. Nothing here needs to pass a tenant, and nothing should.
//  2. RECORDING A PAYMENT REQUIRES A FINALIZED LEDGER JOURNAL. The pay route
//     asks general-ledger-svc for a FINALIZED journal whose correlation_id is
//     this invoice_id, and fails CLOSED if it cannot find one or cannot reach
//     the ledger. This is not a formality — it is the control that stops cash
//     being recorded against a receivable the books do not know about — but it
//     does mean "Record payment" answers 400 until somebody has posted that
//     journal. explainAccountsReceivableError says so in as many words, because
//     the bare refusal reads like a bug in this page.
//  3. AN INVOICE IS ONLY LATE ONCE IT IS LATE. Marking OVERDUE before the due
//     date has passed is refused (422 not_yet_due). Nothing checked this before,
//     and receivable.overdue is what aging and impairment count downstream, so
//     an invoice that was merely unpaid could present itself as delinquent.
//  4. THE CORRELATION ID IS THE IDEMPOTENCY KEY. The service is idempotent on
//     (tenant_id, correlation_id) against a real partial unique index, so a
//     resubmitted create resolves to the ORIGINAL invoice with 200 rather than
//     opening a second receivable, and does not re-publish invoice.issued.
//     Generate it once per submission — never per attempt, which is what the
//     old client did with `corr-${Date.now()}` and which defeated the index
//     entirely.
//
// This replaces lib/services/accounts-receivable.ts, which was the last
// consumer of the legacy lib/api-client.ts layer. That layer fell back to three
// hardcoded invoices on ANY failure — with the fallback ON by default — so the
// 403 that every write actually received (no RBAC bundle had ever granted
// AR_*) was displayed as a successful create, and its "transition" call posted
// to /v1/invoices/{id}/transition, a route this service does not have. A 404
// plus a mock fallback meant the console flipped an invoice's status in the
// table having changed nothing at all on the server.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

/** One line of the customer's document. The service requires at least one and
 *  balances the whole invoice against them: amount must equal Σ(net) + Σ(tax). */
export type CustomerInvoiceLine = {
  invoice_line_id: string;
  invoice_id: string;
  line_number: number;
  description: string;
  quantity: number;
  unit_price: number;
  net_amount: number;
  tax_code?: string | null;
  tax_amount: number;
  sales_order_line_ref?: string | null;
};

/** Wire shape. Field names match the Go json tags exactly. */
export type CustomerInvoice = {
  invoice_id: string;
  tenant_id: string;
  legal_entity_id: string;
  customer_id: string;
  invoice_number: string;
  /** Gross total. The service refuses to record an invoice whose lines do not
   *  roll up to exactly this figure — see explainAccountsReceivableError. */
  amount: number;
  currency_code: string;
  /** DATE column, carried as an RFC3339 instant at UTC midnight. Format as a
   *  date in UTC or it reads a day early west of Greenwich — see formatDueDate. */
  due_date: string;
  status: InvoiceStatus;
  /** The date on our own document. Same DATE-as-RFC3339 shape as due_date;
   *  distinct from created_at (when it was raised) and from supply_date (when
   *  the supply took place). */
  invoice_date?: string;
  /** The tax point — when the supply took place — and the date that decides
   *  which tax period the invoice lands in. */
  supply_date?: string;
  net_amount?: number;
  tax_amount?: number;
  /** The document of record (document-vault-svc reference). Required to leave
   *  ISSUED, not to enter it — the SEND evidence gate refuses a documented-less
   *  invoice. */
  invoice_document_id?: string | null;
  sales_order_id?: string | null;
  customer_billing_ref?: string | null;
  /** AR-08 cash application: when money arrived and under what customer-side
   *  reference. Optional — the lifecycle stamp is the audit source. */
  payment_date?: string | null;
  payment_reference?: string | null;
  /** Populated by the single-invoice read; absent on the bounded register list. */
  lines?: CustomerInvoiceLine[];
  created_by_principal_id: string;
  correlation_id: string;
  created_at: string;
  sent_by_principal_id?: string | null;
  marked_overdue_by_principal_id?: string | null;
  payment_received_by_principal_id?: string | null;
  sent_at?: string | null;
  marked_overdue_at?: string | null;
  payment_received_at?: string | null;
};

// The service's four states, and only those. The old client's type declared
// "OUTSTANDING" | "PAID" | "OVERDUE" | "DISPUTED" — two of which the service
// has never emitted — so a status badge could never have matched what came back.
export const INVOICE_STATUSES = ["ISSUED", "SENT", "OVERDUE", "PAID"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** The lifecycle in order, for the "stage N of M" reading in the summary.
 *  SENT branches to OVERDUE or straight to PAID, so the position in this list is
 *  not a timeline — paid-on-time invoices never were late. */
export const AR_STAGES: InvoiceStatus[] = [...INVOICE_STATUSES];

export function stageIndex(status: InvoiceStatus): number {
  const index = INVOICE_STATUSES.indexOf(status);
  return index === -1 ? 0 : index;
}

/**
 * Read the receivables register for the caller's tenant.
 *
 * No tenant parameter, deliberately: the scope comes from the verified
 * X-Tenant-Id that identity carries. The service accepts a ?tenant_id= only
 * when it agrees with that header and 403s when it does not, so sending one
 * would add a way to fail and no way to succeed.
 *
 * status is typed to the four real states because an unrecognised one is now a
 * 400 rather than an empty list — a misspelled filter used to read as "this
 * tenant has no invoices".
 */
export async function listCustomerInvoices(params: {
  identity: Identity;
  legalEntityId?: string;
  customerId?: string;
  status?: InvoiceStatus;
  limit?: number;
  offset?: number;
}): Promise<ApiResult<CustomerInvoice[]>> {
  const res = await apiGet<unknown>("accountsReceivable", "/v1/invoices/", {
    identity: params.identity,
    query: {
      legal_entity_id: params.legalEntityId,
      customer_id: params.customerId,
      status: params.status,
      limit: params.limit,
      offset: params.offset,
    },
  });
  if (!res.ok) return res;
  const list = Array.isArray(res.data)
    ? (res.data as CustomerInvoice[])
    : ((res.data as Record<string, unknown>)?.invoices as CustomerInvoice[] | undefined) ?? [];
  return { ok: true, data: list };
}

/**
 * How many invoices the register asks for.
 *
 * The read is BOUNDED at the service now — it used to return every invoice a
 * tenant had ever raised on every dashboard load, and the default page is 100.
 * This asks for more than that so the register is not quietly truncated at a
 * number the panel never mentions, and stays under the service's cap of 500,
 * which refuses rather than clamps. The panel says so when the page comes back
 * full, because a full page means there may be more and a silent truncation reads
 * as a complete register.
 */
export const REGISTER_PAGE_SIZE = 400;

export async function getCustomerInvoice(params: {
  identity: Identity;
  invoiceId: string;
}): Promise<ApiResult<CustomerInvoice>> {
  return apiGet<CustomerInvoice>(
    "accountsReceivable",
    `/v1/invoices/${encodeURIComponent(params.invoiceId)}`,
    { identity: params.identity },
  );
}

/** One line, as the form sends it. net_amount is derived client-side (quantity ×
 *  unit_price); the service balances the whole invoice, so a line that does not
 *  add up is refused. */
export type CreateCustomerInvoiceLineInput = {
  description: string;
  quantity: number;
  unit_price: number;
  net_amount: number;
  tax_code?: string;
  tax_amount: number;
};

/**
 * Issue a customer invoice, in ISSUED status.
 *
 * Authorizes AR_INVOICE_ISSUE against legalEntityId. Note what is NOT sent:
 * no tenant_id (the verified header is the only source), no invoice_id (the
 * service mints it), and no created_by_principal_id (the service takes it from
 * X-Principal-Id). The old client supplied all three from the browser, which is
 * both an attribution the caller should not choose and — since it sent
 * "tenant-zoiko-dev-01" and "le-singapore-01" against UUID NOT NULL columns —
 * a create that could never have succeeded against the real schema.
 *
 * AR-05's required business/source inputs are all here — invoice_date,
 * supply_date, at least one line, and the optional sales-order and document
 * references. The service refuses an invoice unless its lines account for the
 * gross to the cent.
 *
 * A 200 rather than 201 means this correlationId had already been used and the
 * body is the ORIGINAL invoice: the submission was a duplicate and no second
 * receivable was opened.
 */
export async function issueCustomerInvoice(params: {
  identity: Identity;
  legalEntityId: string;
  customerId: string;
  invoiceNumber: string;
  /** Gross total, derived = Σ line net + Σ line tax, never typed. */
  amount: number;
  currencyCode: string;
  /** RFC3339. The Go field is a CalendarDate that accepts a bare YYYY-MM-DD or
   *  an instant; the action converts date inputs to the explicit instant. */
  dueDate: string;
  invoiceDate: string;
  supplyDate: string;
  lines: CreateCustomerInvoiceLineInput[];
  /** Optional. The SEND evidence gate refuses an invoice that has none — see
   *  explainAccountsReceivableError on invoice_document_required. */
  invoiceDocumentId?: string;
  salesOrderId?: string;
  customerBillingRef?: string;
  correlationId: string;
}): Promise<ApiWriteResult<CustomerInvoice>> {
  return apiPost<CustomerInvoice>(
    "accountsReceivable",
    "/v1/invoices/",
    {
      legal_entity_id: params.legalEntityId,
      customer_id: params.customerId,
      invoice_number: params.invoiceNumber,
      amount: params.amount,
      currency_code: params.currencyCode,
      due_date: params.dueDate,
      invoice_date: params.invoiceDate,
      supply_date: params.supplyDate,
      lines: params.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        net_amount: line.net_amount,
        tax_amount: line.tax_amount,
        tax_code: line.tax_code || undefined,
      })),
      invoice_document_id: params.invoiceDocumentId || undefined,
      sales_order_id: params.salesOrderId || undefined,
      customer_billing_ref: params.customerBillingRef || undefined,
      correlation_id: params.correlationId,
    },
    { identity: params.identity, correlationId: params.correlationId },
  );
}

/** ISSUED -> SENT. Authorizes AR_INVOICE_SEND. */
export async function sendCustomerInvoice(params: {
  identity: Identity;
  invoiceId: string;
}): Promise<ApiWriteResult<CustomerInvoice>> {
  return transition(params.identity, params.invoiceId, "send");
}

/**
 * SENT -> OVERDUE. Authorizes AR_MARK_OVERDUE, and refuses while the invoice is
 * still within its due date.
 */
export async function markCustomerInvoiceOverdue(params: {
  identity: Identity;
  invoiceId: string;
}): Promise<ApiWriteResult<CustomerInvoice>> {
  return transition(params.identity, params.invoiceId, "overdue");
}

/**
 * {SENT | OVERDUE} -> PAID, terminal. Authorizes AR_PAYMENT_RECEIVE and then
 * requires a FINALIZED general-ledger journal correlated to this invoice — see
 * property 2 at the top of this file.
 *
 * paymentDate and paymentReference are the AR-08 cash-application payload:
 * when the money arrived and under what customer-side reference. Both optional;
 * the lifecycle stamp is the audit source. Sent as a JSON body only when at
 * least one is present, which is the normal case — the transition carries no
 * body for send or overdue.
 */
export async function receiveCustomerInvoicePayment(params: {
  identity: Identity;
  invoiceId: string;
  paymentDate?: string;
  paymentReference?: string;
}): Promise<ApiWriteResult<CustomerInvoice>> {
  const body: Record<string, unknown> = {};
  if (params.paymentDate) body.payment_date = `${params.paymentDate}T00:00:00Z`;
  if (params.paymentReference) body.payment_reference = params.paymentReference;
  return transition(params.identity, params.invoiceId, "pay", body);
}

// One helper for the three hops because they differ only in the path segment.
// Each is its own ROUTE on the service — /send, /overdue, /pay — not a
// from/to pair posted to a single /transition endpoint. The legacy client
// invented that endpoint, and because it also fell back to mock data on the
// resulting 404, the console reported every status change as having worked.
function transition(
  identity: Identity,
  invoiceId: string,
  hop: "send" | "overdue" | "pay",
  body: Record<string, unknown> = {},
): Promise<ApiWriteResult<CustomerInvoice>> {
  return apiPost<CustomerInvoice>(
    "accountsReceivable",
    `/v1/invoices/${encodeURIComponent(invoiceId)}/${hop}`,
    body,
    { identity },
  );
}

// ── lifecycle ────────────────────────────────────────────────────────────────

/**
 * The transitions that are legal from each status.
 *
 * SENT has TWO, and that is the reason this is a list per status rather than a
 * single next step as accounts-payable-svc has: from SENT an invoice can be
 * declared late OR paid, and both succeed. The register offers exactly the legal
 * set — offering a third would be offering a refusal, and hiding the second would
 * hide a real option.
 *
 * The lifecycle is not a ladder, which is why there is no stage meter on these
 * rows: OVERDUE does not come before PAID. An invoice paid on time goes SENT ->
 * PAID and never touches OVERDUE, so four segments in a row would assert an order
 * that does not exist.
 */
export const LEGAL_HOPS: Record<
  InvoiceStatus,
  ReadonlyArray<{ hop: "send" | "overdue" | "pay"; label: string }>
> = {
  ISSUED: [{ hop: "send", label: "Mark sent" }],
  SENT: [
    { hop: "pay", label: "Record payment" },
    { hop: "overdue", label: "Declare overdue" },
  ],
  OVERDUE: [{ hop: "pay", label: "Record payment" }],
  PAID: [],
};

function dueDateMs(value: string): number {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return Number.POSITIVE_INFINITY;
  return Date.UTC(year, month - 1, day);
}

/**
 * The date part of a due_date, as a calendar date.
 *
 * The column is DATE but the JSON is a full instant at UTC midnight. Rendering
 * that as a local timestamp shows the previous day anywhere west of Greenwich — an
 * invoice due on the 1st reading as due on the 31st — so the date part is taken as
 * a string and formatted in UTC. Same treatment as the payables register.
 */
export function formatDueDate(value: string): string {
  return value.slice(0, 10);
}

/**
 * Whether this invoice's due date has passed while it is still unpaid.
 *
 * This is the console's own reading, and it is NOT the same fact as status
 * OVERDUE: OVERDUE is a recorded declaration, made by a principal holding
 * AR_MARK_OVERDUE and published as receivable.overdue. An invoice can be past due
 * without anyone having declared it, which is precisely the gap worth showing —
 * the row marks it "past due, not declared" rather than quietly presenting it as
 * OVERDUE, because the register is the record of what was declared, not of what
 * this page inferred.
 */
export function isPastDue(invoice: CustomerInvoice, now = new Date()): boolean {
  if (invoice.status === "PAID") return false;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return dueDateMs(invoice.due_date) < today;
}

export type ReceivableStats = {
  issued: number;
  sent: number;
  overdue: number;
  paid: number;
  /** Unpaid value per currency, NEVER summed across them — no service in this
   *  suite holds an FX rate, so a single total would be invented. */
  outstandingByCurrency: Record<string, number>;
  /** Past their due date but not declared OVERDUE. The number worth acting on. */
  pastDueUndeclared: number;
};

export function summariseReceivables(
  invoices: CustomerInvoice[],
  now = new Date(),
): ReceivableStats {
  const stats: ReceivableStats = {
    issued: 0,
    sent: 0,
    overdue: 0,
    paid: 0,
    outstandingByCurrency: {},
    pastDueUndeclared: 0,
  };

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  for (const invoice of invoices) {
    if (invoice.status === "ISSUED") stats.issued += 1;
    else if (invoice.status === "SENT") stats.sent += 1;
    else if (invoice.status === "OVERDUE") stats.overdue += 1;
    else stats.paid += 1;

    if (invoice.status !== "PAID") {
      stats.outstandingByCurrency[invoice.currency_code] =
        (stats.outstandingByCurrency[invoice.currency_code] ?? 0) + invoice.amount;
    }

    if (
      invoice.status !== "PAID" &&
      invoice.status !== "OVERDUE" &&
      dueDateMs(invoice.due_date) < today
    ) {
      stats.pastDueUndeclared += 1;
    }
  }

  return stats;
}

/**
 * Turn a service refusal into something an operator can act on.
 *
 * Several of these describe rules the console cannot check for itself — whether
 * a grant exists, whether the ledger has a matching journal — which is exactly
 * when a bare error string leaves the reader with nothing to do next.
 */
export function explainAccountsReceivableError(message: string): string {
  if (message.includes("ledger_amount_mismatch") || message.includes("does not account for the invoice amount")) {
    return `The books carry a finalized journal for this invoice, but not for this amount, so the payment was not recorded. ${message.replace(/^.*?— /, "")} That is a bookkeeping disagreement rather than a missing posting: correct the journal, or check whether this invoice is for the figure you expect. Until this pass any finalized journal cleared any invoice regardless of its size.`;
  }
  if (message.includes("ledger_verification_failed") || message.includes("no matching finalized journal")) {
    return "general-ledger-svc holds no FINALIZED journal correlated to this invoice, so the payment was not recorded. This is deliberate: cash is only ever recognised against a receivable the books already carry. Post and finalize the journal entry for this invoice (its correlation_id must be this invoice's id) on /admin/finance, then record the payment again.";
  }
  if (message.includes("ledger_service_unavailable")) {
    return "general-ledger-svc could not be reached, so the payment could not be verified against the books and nothing was written. This service fails closed rather than recording cash it cannot substantiate — retry once the ledger is reachable.";
  }
  if (message.includes("not_yet_due") || message.includes("before its due date")) {
    return "This invoice is not late yet, so it cannot be marked overdue. An invoice becomes overdue the day after its due date — receivable.overdue feeds aging and impairment, so an unpaid invoice must not be able to present itself as delinquent early.";
  }
  if (message.includes("legal_entity_not_in_tenant")) {
    return "That legal entity is not one of your tenant's — or does not exist. The two are deliberately one answer, so this endpoint cannot be used to discover which entity ids exist in other tenants. Check the entity id; if it should be yours, it needs registering in tenant-entity-registry-svc (locally, deployments/scripts/seed-demo-registry.ps1 registers the demo one).";
  }
  if (message.includes("legal_entity_not_active")) {
    return "That legal entity exists in your tenant but is not ACTIVE, so it may not take on new receivables. A dissolved or suspended entity plainly cannot invoice; a DORMANT one is by definition not trading. Reactivate it in tenant-entity-registry-svc, or raise the invoice against a trading entity.";
  }
  if (message.includes("entity_registry_unavailable")) {
    return "tenant-entity-registry-svc could not be reached, so the legal entity on this invoice could not be reconciled with your tenant and nothing was written. This service fails closed rather than filing a receivable whose attribution it could not check.";
  }
  if (message.includes("limit must be an integer") || message.includes("offset must not be negative")) {
    return `The register asked for an out-of-range page: ${message}. It is refused rather than silently clamped — a caller who asked for one page size and got another has no way to notice, and would read a truncated register as a complete one.`;
  }
  if (message.includes("legal_entity_id must be a UUID")) {
    return "That legal entity filter is not a UUID. It is refused rather than sent, because the service compares it as text: a malformed value would match nothing and show an empty register, which reads as \"this entity has no invoices\".";
  }
  if (message.includes("tenant_scope_mismatch") || message.includes("does not match the caller's verified tenant")) {
    return "The request named a tenant other than your own. The register is scoped to your verified tenant and nothing else — this refusal is the control working, not a configuration problem.";
  }
  if (message.includes("tenant_scope_missing") || message.includes("caller tenant scope missing")) {
    return "The request carried no verified tenant. Sign in again.";
  }
  if (message.includes("caller identity missing") || message.includes("identity_missing")) {
    return "The register received no verified principal, so no authorization could be checked. Sign in again.";
  }
  if (message.includes("authorization_denied")) {
    return "You do not hold the authority for this step on this legal entity. Issuing an invoice, sending it, declaring it late and recording payment are four separate grants (AR_INVOICE_ISSUE, AR_INVOICE_SEND, AR_MARK_OVERDUE, AR_PAYMENT_RECEIVE) — holding one does not imply the next. Run deployments/scripts/seed-demo-rbac.ps1 if this is a local environment.";
  }
  if (message.includes("self_payment_not_allowed")) {
    return "You issued this invoice, so you cannot also record its payment. Segregation of duties (§12.3 of the design) requires the cash-handling step to be taken by a different principal — sign in as a second principal who holds AR_PAYMENT_RECEIVE, or the invoice stays unpaid. Nothing was written.";
  }
  if (message.includes("invoice_document_required")) {
    return "This invoice cannot be sent without its document. The evidence gate refuses to SEND an invoice with no document of record — an issued-but-not-yet-sent invoice is a normal working state, a sent one without the customer's document behind it is the audit gap. Record an invoice_document_id (or issue the invoice again with one) and try again.";
  }
  if (message.includes("no_lines")) {
    return "The invoice has no lines. AR-05 requires at least one line item — a receivable with nothing on it would let a gross amount ride on thin air. Add a line and try again.";
  }
  if (message.includes("invoice_does_not_balance")) {
    return "The invoice does not balance. The service requires the amount to equal the lines' net plus tax to the cent, and stores nothing until it does. The detail above shows what the lines roll up to versus the amount sent.";
  }
  if (message.includes("invalid_line")) {
    return "A line was rejected — it needs a description, a non-negative net amount, and a non-negative tax amount. The detail above names the offending line.";
  }
  if (message.includes("authorization_service_unavailable") || message.includes("authorization-svc unavailable")) {
    return "authorization-svc could not be reached, so no permission could be checked and nothing was written. This service fails closed rather than guessing.";
  }
  if (message.includes("invalid_transition")) {
    return "This invoice is not in a status that allows that step. The lifecycle is ISSUED -> SENT -> OVERDUE or PAID, and PAID is terminal. Reload the register — somebody else may have moved it already.";
  }
  if (message.includes("must be in SENT or OVERDUE")) {
    return "Payment can only be recorded against an invoice that has been sent. Send it first, or reload — a PAID invoice is terminal.";
  }
  if (message.includes("status must be one of")) {
    return "That is not an invoice status. Use ISSUED, SENT, OVERDUE or PAID — a misspelled filter would otherwise report that this tenant has no receivables.";
  }
  if (message.includes("duplicate_invoice_number")) {
    return "This customer already has an invoice under that number in this tenant, so nothing was written. (customer, invoice number) is unique — if this is genuinely a different invoice, renumber it; if it is the same one, it is already on the register. This used to arrive as a 503 and read as a database outage.";
  }
  if (message.includes("must both be UUIDs")) {
    return "The tenant or legal entity on this request is not a UUID, so the query failed inside the driver before any row was examined. Sign in again — the session should carry UUIDs for both.";
  }
  if (message.includes("amount must be greater than zero")) {
    return "An invoice must be for a positive amount.";
  }
  if (message.includes("invoice_not_found")) {
    return "No invoice with that id in your tenant.";
  }
  if (message.includes("missing_field")) {
    const field = message.includes("invoice_date")
      ? "invoice_date"
      : message.includes("supply_date")
        ? "supply_date"
        : message.includes("due_date")
          ? "due_date"
          : "";
    if (field === "invoice_date") {
      return "The invoice was refused because invoice_date is missing — the date on the document you issued, distinct from the due date. Add it and try again.";
    }
    if (field === "supply_date") {
      return "The invoice was refused because supply_date is missing — the tax point, which can differ from the invoice date. Add it and try again.";
    }
    return `The service refused the submission as incomplete: ${message}`;
  }
  if (message.includes("store_unavailable")) {
    return "The receivables store could not be reached. Nothing was written.";
  }
  return message;
}
