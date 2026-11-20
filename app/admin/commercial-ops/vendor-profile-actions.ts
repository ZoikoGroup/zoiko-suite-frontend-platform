"use server";

// Create a vendor profile in vendor-due-diligence-svc for a counterparty of
// the session's entity. Approval follows as a row action, once the
// counterparty's screening has completed CLEAR.

import { refresh } from "next/cache";
import { apiPost } from "@/lib/api/client";
import type { CreateState } from "@/components/admin/intelligence/create-state";
import { sessionIdentity, expired, missing, text, toState, show } from "@/app/admin/intelligence/create-support";

export async function createVendorProfileAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);
  const absent = missing(previous, fd, [["counterparty_id", "Counterparty"], ["vendor_name", "Vendor name"]]);
  if (absent) return absent;
  const res = await apiPost<Record<string, unknown>>(
    "vendorDueDiligence",
    "/v1/vendor-profiles",
    { legal_entity_id: identity.legalEntityId, counterparty_id: text(fd, "counterparty_id"), vendor_name: text(fd, "vendor_name") },
    { identity, purposeContext: "vendor_due_diligence" },
  );
  if (res.ok) refresh();
  return toState(previous, fd, res, "vendor-due-diligence-svc", (p) => [
    ["Vendor profile", show(p.vendor_profile_id)],
    ["Vendor", show(p.vendor_name)],
    ["Due diligence", show(p.due_diligence_status)],
  ]);
}
