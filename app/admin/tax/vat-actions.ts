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

  const legalEntityId = String(formData.get("legal_entity_id") ?? identity.legalEntityId).trim();
  const jurisdictionId = String(formData.get("jurisdiction_id") ?? "GB").trim();
  const taxRegistrationNumber = String(formData.get("tax_registration_number") ?? "GB-987654321").trim();
  const taxPeriod = String(formData.get("tax_period") ?? "").trim();
  const totalSalesStr = String(formData.get("total_sales_amount") ?? "").trim();
  const totalPurchasesStr = String(formData.get("total_purchase_amount") ?? "").trim();
  const outputTaxStr = String(formData.get("output_tax_amount") ?? "").trim();
  const inputTaxStr = String(formData.get("input_tax_amount") ?? "").trim();
  const currency = String(formData.get("currency") ?? "GBP").trim().toUpperCase();
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();

  if (!taxPeriod || !totalSalesStr || !totalPurchasesStr || !outputTaxStr || !inputTaxStr || !effectiveFrom) {
    return {
      status: "error",
      message: "Tax period, total sales, purchases, output tax, input tax, and effective date are all required.",
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
  return {
    status: "success",
    message: `VAT Return for ${taxPeriod} successfully registered in DRAFT state. Net tax payable: ${res.data.net_tax_payable.toLocaleString()} ${res.data.currency}.`,
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
  const filedBy = String(formData.get("filed_by") ?? "Lingaraj (Super Admin)").trim();

  if (!returnId) {
    return { status: "error", message: "Return ID is required to file with the tax authority." };
  }
  if (!filedBy) {
    return { status: "error", message: "Signatory (Filed By) name is required." };
  }

  const payload: FileVATReturnInput = { filed_by: filedBy };
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
    message: `VAT Return ${returnId} officially FILED and locked with statutory tax gateway.`,
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
