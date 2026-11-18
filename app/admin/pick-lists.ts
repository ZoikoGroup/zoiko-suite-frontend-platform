"use server";

// Pick-lists for client forms, read on the server as the signed-in session.
// The kind is checked against a fixed set; each reads the register that
// issues the ids (see lib/form-options.ts).

import { sessionIdentity } from "@/app/admin/intelligence/create-support";
import {
  clauseOptions,
  contractOptions,
  counterpartyOptions,
  passedResolutionOptions,
  purchaseRequestOptions,
  spendCategoryOptions,
  vendorProfileOptions,
  type Options,
} from "@/lib/form-options";

export type PickListKind =
  | "counterparties"
  | "contracts"
  | "clauses"
  | "passed-resolutions"
  | "vendor-profiles"
  | "spend-categories"
  | "approved-requests"
  | "pending-requests";

export async function loadPickList(kind: PickListKind): Promise<Options> {
  const identity = await sessionIdentity();
  if (!identity) return { ok: false, error: "Your session has expired — sign in again." };
  switch (kind) {
    case "counterparties":
      return counterpartyOptions(identity);
    case "contracts":
      return contractOptions(identity);
    case "clauses":
      return clauseOptions(identity);
    case "passed-resolutions":
      return passedResolutionOptions(identity);
    case "vendor-profiles":
      return vendorProfileOptions(identity);
    case "spend-categories":
      return spendCategoryOptions(identity);
    case "approved-requests":
      return purchaseRequestOptions(identity, "APPROVED");
    case "pending-requests":
      return purchaseRequestOptions(identity, "PENDING_APPROVAL");
    default:
      return { ok: false, error: "Unknown list." };
  }
}
