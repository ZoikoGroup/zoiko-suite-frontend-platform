// Server wrapper for the issue-order form: reads the approved requisitions and
// vendor profiles it offers, as the signed-in session.

import { sessionIdentity } from "@/app/admin/intelligence/create-support";
import { purchaseRequestOptions, vendorProfileOptions, type Options } from "@/lib/form-options";
import { IssueOrderForm } from "./IssueOrderForm";

const NO_SESSION: Options = { ok: false, error: "no active session" };

export async function IssueOrderSection() {
  const identity = await sessionIdentity();
  const [approvedRequests, vendorProfiles] = identity
    ? await Promise.all([purchaseRequestOptions(identity, "APPROVED"), vendorProfileOptions(identity)])
    : [NO_SESSION, NO_SESSION];
  return <IssueOrderForm approvedRequests={approvedRequests} vendorProfiles={vendorProfiles} />;
}
