// Pick-lists for client forms, read on the server as the signed-in session and
// served by GET /api/pick-lists/<kind>. The kind is checked against a fixed
// set; each reads the register that issues the ids (see lib/form-options.ts).
// A GET route rather than a Server Action: the browser loads several lists in
// parallel, where Server Actions run one at a time and hold up form submits.

import { sessionIdentity } from "@/app/admin/intelligence/create-support";
import {
  clauseOptions,
  contractOptions,
  counterpartyOptions,
  passedResolutionOptions,
  purchaseRequestOptions,
  spendCategoryOptions,
  vendorProfileOptions,
  documentOptions,
  grantedDecisionOptions,
  principalOptions,
  evidenceDomainOptions,
  draftVatReturnOptions,
  certifiedProfileOptions,
  secretPolicyOptions,
  type Options,
} from "@/lib/form-options";

export const PICK_LIST_KINDS = [
  "counterparties",
  "contracts",
  "clauses",
  "passed-resolutions",
  "vendor-profiles",
  "spend-categories",
  "open-requests",
  "documents",
  "granted-decisions",
  "principals",
  "other-principals",
  "evidence-domains",
  "draft-vat-returns",
  "certified-profiles",
  "secret-policies",
] as const;

export type PickListKind = (typeof PICK_LIST_KINDS)[number];

export const isPickListKind = (k: string): k is PickListKind => (PICK_LIST_KINDS as readonly string[]).includes(k);

/** The options for `kind`, or null when there is no complete session. */
export async function loadPickList(kind: PickListKind): Promise<Options | null> {
  const identity = await sessionIdentity();
  if (!identity) return null;
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
    case "open-requests":
      return purchaseRequestOptions(identity, "DRAFT", "PENDING_APPROVAL");
    case "documents":
      return documentOptions(identity);
    case "granted-decisions":
      return grantedDecisionOptions(identity);
    case "principals":
      return principalOptions(identity);
    case "other-principals":
      return principalOptions(identity, true);
    case "evidence-domains":
      return evidenceDomainOptions(identity);
    case "draft-vat-returns":
      return draftVatReturnOptions(identity);
    case "certified-profiles":
      return certifiedProfileOptions(identity);
    case "secret-policies":
      return secretPolicyOptions(identity);
  }
}
