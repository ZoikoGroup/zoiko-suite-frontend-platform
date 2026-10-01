"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionPayload } from "@/lib/auth";
import {
  createReceipt,
  getReceipt,
  amendReceiptDraft,
  attachReceiptEvidence,
  listReceiptEvidence,
  recordServiceAcceptance,
  confirmReceipt,
  rejectReceipt,
  reverseReceipt,
  getReceiptAccountingStatus,
  listReceiptsForPO,
  getReceivedToDate,
  type GoodsServiceReceipt,
  type ReceiptEvidence,
  type ReceiptAccountingEvent,
  type ReceivedToDateSummary,
  type ReceiptType,
} from "@/lib/api/goods-service-receipt";

type SessionIdentity = {
  principalId: string;
  tenantId: string;
  legalEntityId: string;
};

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

export type ReceiptActionState = {
  status: "idle" | "created" | "amended" | "evidence_attached" | "confirmed" | "rejected" | "reversed" | "error";
  message?: string;
  receipt?: GoodsServiceReceipt | null;
  accountingEvent?: ReceiptAccountingEvent | null;
  evidenceList?: ReceiptEvidence[];
  receivedToDate?: ReceivedToDateSummary | null;
};

export async function actionCreateReceipt(
  formData: FormData,
): Promise<ReceiptActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Unauthorized - please log in." };
  }

  const purchaseOrderId = String(formData.get("purchase_order_id") ?? "").trim();
  const receiptType = (String(formData.get("receipt_type") ?? "GOODS").trim() as ReceiptType);
  const quantity = parseFloat(String(formData.get("quantity") ?? "1"));
  const unitOfMeasure = String(formData.get("unit_of_measure") ?? "EA").trim();
  const amount = parseFloat(String(formData.get("amount") ?? "0"));
  const currencyCode = String(formData.get("currency_code") ?? "GBP").trim();
  const receiptDate = String(formData.get("receipt_date") ?? new Date().toISOString().slice(0, 10)).trim();
  const location = String(formData.get("location") ?? "Primary Receiving Bay").trim();
  const inspectionResult = String(formData.get("inspection_result") ?? "PASSED").trim();
  const requiresIndependentAcceptance = formData.get("requires_independent_acceptance") === "on" || formData.get("requires_independent_acceptance") === "true";
  const toleranceExceptionRef = String(formData.get("tolerance_exception_ref") ?? "").trim();

  if (!purchaseOrderId) {
    return { status: "error", message: "Purchase Order ID is required." };
  }
  if (isNaN(amount) || amount <= 0) {
    return { status: "error", message: "Amount must be a positive number." };
  }
  if (isNaN(quantity) || quantity <= 0) {
    return { status: "error", message: "Quantity must be greater than zero." };
  }

  const res = await createReceipt(
    {
      legal_entity_id: identity.legalEntityId,
      purchase_order_id: purchaseOrderId,
      receipt_type: receiptType,
      quantity,
      unit_of_measure: unitOfMeasure,
      amount,
      currency_code: currencyCode,
      receipt_date: new Date(receiptDate).toISOString(),
      location,
      inspection_result: inspectionResult,
      requires_independent_acceptance: requiresIndependentAcceptance,
      tolerance_exception_ref: toleranceExceptionRef,
    },
    identity,
  );

  if (!res.ok) {
    return { status: "error", message: res.error.message };
  }

  revalidatePath("/admin/commercial-ops");
  return {
    status: "created",
    message: `Receipt draft created successfully [ID: ${res.data.receipt_id}] for PO ${purchaseOrderId.slice(0, 8)}... Status: DRAFT`,
    receipt: res.data,
  };
}

export async function actionAmendReceipt(
  receiptId: string,
  formData: FormData,
): Promise<ReceiptActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Unauthorized." };
  }

  const quantityRaw = formData.get("quantity");
  const amountRaw = formData.get("amount");
  const unitOfMeasure = formData.get("unit_of_measure") ? String(formData.get("unit_of_measure")).trim() : undefined;
  const location = formData.get("location") ? String(formData.get("location")).trim() : undefined;
  const inspectionResult = formData.get("inspection_result") ? String(formData.get("inspection_result")).trim() : undefined;
  const reason = String(formData.get("reason") ?? "Amended receipt quantities upon re-inspection").trim();

  const res = await amendReceiptDraft(
    receiptId,
    {
      quantity: quantityRaw ? parseFloat(String(quantityRaw)) : undefined,
      amount: amountRaw ? parseFloat(String(amountRaw)) : undefined,
      unit_of_measure: unitOfMeasure,
      location,
      inspection_result: inspectionResult,
      reason,
    },
    identity,
  );

  if (!res.ok) {
    return { status: "error", message: res.error.message };
  }

  const rtdRes = await getReceivedToDate(res.data.purchase_order_id, identity);

  revalidatePath("/admin/commercial-ops");
  return {
    status: "amended",
    message: `Receipt draft ${receiptId} amended successfully.`,
    receipt: res.data,
    receivedToDate: rtdRes.ok ? rtdRes.data : null,
  };
}

export async function actionAttachEvidence(
  receiptId: string,
  formData: FormData,
): Promise<ReceiptActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Unauthorized." };
  }

  const evidenceRef = String(formData.get("evidence_ref") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!evidenceRef) {
    return { status: "error", message: "Evidence Reference is required (e.g. DOC-BOL-2026)." };
  }

  const res = await attachReceiptEvidence(
    receiptId,
    { evidence_ref: evidenceRef, description },
    identity,
  );

  if (!res.ok) {
    return { status: "error", message: res.error.message };
  }

  // Fetch updated receipt to show new status
  const rcptRes = await getReceipt(receiptId, identity);

  revalidatePath("/admin/commercial-ops");
  return {
    status: "evidence_attached",
    message: `Evidence attachment recorded [Ref: ${evidenceRef}]. Receipt advanced to PENDING_CONFIRMATION.`,
    receipt: rcptRes.ok ? rcptRes.data : null,
  };
}

export async function actionRecordServiceAcceptance(
  receiptId: string,
  formData: FormData,
): Promise<ReceiptActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Unauthorized." };
  }

  const evidenceRef = String(formData.get("evidence_ref") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!evidenceRef) {
    return { status: "error", message: "Evidence Reference is required for service milestone acceptance." };
  }

  const res = await recordServiceAcceptance(
    receiptId,
    { evidence_ref: evidenceRef, notes },
    identity,
  );

  if (!res.ok) {
    return { status: "error", message: res.error.message };
  }

  revalidatePath("/admin/commercial-ops");
  return {
    status: "evidence_attached",
    message: `Service acceptance recorded [Ref: ${evidenceRef}]. Receipt advanced to PENDING_CONFIRMATION.`,
    receipt: res.data,
  };
}

export async function actionConfirmReceipt(
  receiptId: string,
): Promise<ReceiptActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Unauthorized." };
  }

  const res = await confirmReceipt(receiptId, identity);
  if (!res.ok) {
    return { status: "error", message: res.error.message };
  }

  revalidatePath("/admin/commercial-ops");
  const journalMsg = res.data.accounting_event?.journal_id
    ? ` Posted GRNI Journal [ID: ${res.data.accounting_event.journal_id}] to general-ledger-svc (:8098).`
    : ` GRNI Status: ${res.data.accounting_event?.status ?? "CONFIRMED"}.`;

  return {
    status: "confirmed",
    message: `Receipt ${receiptId} confirmed successfully (Status: CONFIRMED).${journalMsg}`,
    receipt: res.data.receipt,
    accountingEvent: res.data.accounting_event ?? null,
  };
}

export async function actionRejectReceipt(
  receiptId: string,
  formData: FormData,
): Promise<ReceiptActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Unauthorized." };
  }

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) {
    return { status: "error", message: "Rejection reason is required." };
  }

  const res = await rejectReceipt(receiptId, reason, identity);
  if (!res.ok) {
    return { status: "error", message: res.error.message };
  }

  revalidatePath("/admin/commercial-ops");
  return {
    status: "rejected",
    message: `Receipt ${receiptId} rejected with reason: "${reason}". Terminal state reached.`,
    receipt: res.data,
  };
}

export async function actionReverseReceipt(
  receiptId: string,
  formData: FormData,
): Promise<ReceiptActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Unauthorized." };
  }

  const reversedAmount = parseFloat(String(formData.get("reversed_amount") ?? "0"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (isNaN(reversedAmount) || reversedAmount <= 0) {
    return { status: "error", message: "Reversed amount must be a positive number." };
  }
  if (!reason) {
    return { status: "error", message: "Reason for reversal is required." };
  }

  const res = await reverseReceipt(receiptId, { reversed_amount: reversedAmount, reason }, identity);
  if (!res.ok) {
    return { status: "error", message: res.error.message };
  }

  revalidatePath("/admin/commercial-ops");
  return {
    status: "reversed",
    message: `Receipt ${receiptId} reversal of ${res.data.currency_code} ${reversedAmount.toFixed(2)} recorded. New Status: ${res.data.status} (Total Reversed: ${res.data.reversed_amount.toFixed(2)}).`,
    receipt: res.data,
  };
}

export async function actionFetchReceiptDetails(receiptId: string) {
  try {
    const identity = await requireIdentity();
    const [rcptRes, evRes, acctRes] = await Promise.all([
      getReceipt(receiptId, identity),
      listReceiptEvidence(receiptId, identity),
      getReceiptAccountingStatus(receiptId, identity),
    ]);

    let receivedToDate: ReceivedToDateSummary | null = null;
    if (rcptRes.ok && rcptRes.data.purchase_order_id) {
      const rtdRes = await getReceivedToDate(rcptRes.data.purchase_order_id, identity);
      if (rtdRes.ok) receivedToDate = rtdRes.data;
    }

    return {
      receipt: rcptRes.ok ? rcptRes.data : null,
      evidenceList: evRes.ok ? evRes.data : [],
      accountingEvent: acctRes.ok ? acctRes.data : null,
      receivedToDate,
      error: !rcptRes.ok ? rcptRes.error.message : null,
    };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to load receipt details" };
  }
}

export async function actionFetchPOReceipts(purchaseOrderId: string) {
  try {
    const identity = await requireIdentity();
    const [listRes, rtdRes] = await Promise.all([
      listReceiptsForPO(purchaseOrderId, identity),
      getReceivedToDate(purchaseOrderId, identity),
    ]);
    return {
      receipts: listRes.ok ? listRes.data : [],
      receivedToDate: rtdRes.ok ? rtdRes.data : null,
      error: !listRes.ok ? listRes.error.message : null,
    };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to fetch PO receipts" };
  }
}
