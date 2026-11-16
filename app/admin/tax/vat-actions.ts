"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createVATReturn,
  fileVATReturn,
  getVATReturn,
  type VATReturn,
  type CreateVATReturnInput,
  type FileVATReturnInput,
} from "@/lib/api/tax";
import type { LookupState } from "@/components/admin/shared/lookup";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const decoded = decodeSession(raw);
  if (!decoded) {
    throw new Error("unauthenticated");
  }
  return decoded;
}

export type VatActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  returnId?: string;
  vatReturn?: VATReturn;
};

export async function createVatReturnAction(
  _previous: VatActionState,
  formData: FormData
): Promise<VatActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  // The legal entity is the session's. It used to be a form field prefilled
  // with a demo entity, which let a return be raised for any entity.
  const legalEntityId = identity.legalEntityId;
  const jurisdictionId = String(formData.get("jurisdiction_id") ?? "").trim();
  const taxRegistrationNumber = String(formData.get("tax_registration_number") ?? "").trim();
  const taxPeriod = String(formData.get("tax_period") ?? "").trim();
  const totalSalesStr = String(formData.get("total_sales_amount") ?? "").trim();
  const totalPurchasesStr = String(formData.get("total_purchase_amount") ?? "").trim();
  const outputTaxStr = String(formData.get("output_tax_amount") ?? "").trim();
  const inputTaxStr = String(formData.get("input_tax_amount") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim().toUpperCase();
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();

  if (!jurisdictionId || !taxRegistrationNumber || !currency || !taxPeriod || !totalSalesStr || !totalPurchasesStr || !outputTaxStr || !inputTaxStr || !effectiveFrom) {
    return {
      status: "error",
      message: "Jurisdiction, VAT registration number, currency, tax period, total sales, purchases, output tax, input tax and effective date are all required.",
    };
  }

  const totalSales = parseFloat(totalSalesStr);
  const totalPurchases = parseFloat(totalPurchasesStr);
  const outputTax = parseFloat(outputTaxStr);
  const inputTax = parseFloat(inputTaxStr);

  if (isNaN(totalSales) || isNaN(totalPurchases) || isNaN(outputTax) || isNaN(inputTax)) {
    return { status: "error", message: "Monetary amounts must be valid numbers." };
  }

  const payload: CreateVATReturnInput = {
    legal_entity_id: legalEntityId,
    jurisdiction_id: jurisdictionId,
    tax_registration_number: taxRegistrationNumber,
    tax_period: taxPeriod,
    total_sales_amount: totalSales,
    total_purchase_amount: totalPurchases,
    output_tax_amount: outputTax,
    input_tax_amount: inputTax,
    currency,
    effective_from: effectiveFrom,
  };

  const res = await createVATReturn(payload, identity);

  if (!res.ok) {
    return {
      status: "error",
      message: res.error.message || "Failed to create VAT return",
    };
  }

  revalidatePath("/admin/tax");
  const netPayable = res.data.net_tax_payable ?? 0;
  const displayCurrency = res.data.currency ?? currency;
  return {
    status: "success",
    message: `VAT Return for ${taxPeriod} successfully registered in DRAFT state. Net tax payable: ${netPayable.toLocaleString()} ${displayCurrency}`.trimEnd() + ".",
    returnId: res.data.return_id,
    vatReturn: res.data,
  };
}

export async function fileVatReturnAction(
  _previous: VatActionState,
  formData: FormData
): Promise<VatActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const returnId = String(formData.get("return_id") ?? "").trim();
  // The filer is the signed-in principal; it used to be a free-text name
  // prefilled with the demo administrator's name, stored by the service as given.
  // The filing gate requires evidence references (X-Evidence-Refs).
  const evidenceRefs = String(formData.get("evidence_refs") ?? "")
    .split(/[\s,]+/)
    .map((r) => r.trim())
    .filter(Boolean);

  if (!returnId) {
    return { status: "error", message: "Return ID is required to file the return." };
  }
  if (evidenceRefs.length === 0) {
    return { status: "error", message: "At least one evidence reference is required to file a return." };
  }

  const payload: FileVATReturnInput = { evidence_refs: evidenceRefs };
  const res = await fileVATReturn(returnId, payload, identity);

  if (!res.ok) {
    return {
      status: "error",
      message: res.error.message || `Failed to file VAT return ${returnId}`,
    };
  }

  revalidatePath("/admin/tax");
  return {
    status: "success",
    message: `VAT Return ${returnId} recorded as FILED in vat-gst-svc. Nothing is sent to a tax authority from here.`,
    returnId: res.data.return_id,
    vatReturn: res.data,
  };
}

export async function lookupVatReturnAction(
  _previous: LookupState<VATReturn>,
  formData: FormData
): Promise<LookupState<VATReturn>> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const returnId = String(formData.get("return_id") ?? "").trim();
  if (!returnId) {
    return { status: "error", message: "Please provide a valid VAT Return ID." };
  }

  const res = await getVATReturn(returnId, identity);

  if (!res.ok) {
    if (res.error.kind === "http" && res.error.status === 404) {
      return {
        status: "missing",
        message: `No VAT return found with ID "${returnId}" in your tenant isolation scope.`,
      };
    }
    return {
      status: "error",
      message: res.error.message || `Failed to retrieve return ${returnId}`,
    };
  }

  return {
    status: "found",
    message: `VAT return ${returnId} retrieved successfully from vat-gst-svc (:8127).`,
    record: res.data,
  };
}
