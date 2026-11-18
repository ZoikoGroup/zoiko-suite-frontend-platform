// Pick-lists for the Blocks 6-7 forms, read on the server from the registers
// that issue the ids, as the signed-in session.
//
// A form that needs another service's id (a counterparty, a vendor profile,
// an approved requisition…) offers the records that service holds rather than
// a free-text box: the registers issue prefixed ids (cpty-…, ctr-…, cls-…,
// res-…) that are easy to mistype, and several services store an unknown id
// without checking it. A failed read is reported with the service's reason;
// nothing is filled in instead.

import { apiGet, type Identity } from "@/lib/api/client";
import { listCounterparties, listClauses, listBoardResolutions, listObligations } from "@/lib/api/legal";
import { listContracts } from "@/lib/api/legal";
import { listPurchaseRequests } from "@/lib/api/purchase-requests";
import { listSpendPolicies } from "@/lib/api/spend-controls";
import type { FieldOption } from "@/components/admin/intelligence/create-state";

export type Options = { ok: true; items: FieldOption[] } | { ok: false; error: string };

type SessionIdentity = Identity & { principalId: string; tenantId: string; legalEntityId?: string };

const ok = (items: FieldOption[]): Options => ({ ok: true, items });
const fail = (error: string): Options => ({ ok: false, error });

/** counterparty-management-svc: cpty-… ids. */
export async function counterpartyOptions(identity: SessionIdentity): Promise<Options> {
  const res = await listCounterparties(identity);
  if (!res.ok) return fail(res.error.message);
  return ok(res.data.map((c) => ({ value: c.counterparty_id, label: `${c.name} (${c.counterparty_type})` })));
}

/** contract-lifecycle-svc: ctr-… ids. */
export async function contractOptions(identity: SessionIdentity): Promise<Options> {
  const res = await listContracts(identity);
  if (!res.ok) return fail(res.error.message);
  return ok(res.data.map((c) => ({ value: c.contract_id, label: `${c.title} (${c.status})` })));
}

/** clause-template-svc: cls-… ids. */
export async function clauseOptions(identity: SessionIdentity): Promise<Options> {
  const res = await listClauses(identity);
  if (!res.ok) return fail(res.error.message);
  return ok(res.data.map((c) => ({ value: c.clause_id, label: `${c.title} (${c.status})` })));
}

/** obligation-tracking-svc: obg-… ids. */
export async function obligationOptions(identity: SessionIdentity): Promise<Options> {
  const res = await listObligations(identity);
  if (!res.ok) return fail(res.error.message);
  return ok(res.data.map((o) => ({ value: o.obligation_id, label: `${o.title} (${o.status})` })));
}

/** board-resolutions-svc: PASSED resolutions only, the ones a corporate action may cite. */
export async function passedResolutionOptions(identity: SessionIdentity): Promise<Options> {
  const res = await listBoardResolutions(identity, { status: "PASSED" });
  if (!res.ok) return fail(res.error.message);
  return ok(res.data.map((r) => ({ value: r.resolution_id, label: r.title })));
}

/** purchase-request-svc: requisitions in one status (e.g. APPROVED for an order). */
export async function purchaseRequestOptions(identity: SessionIdentity, status: "APPROVED" | "PENDING_APPROVAL"): Promise<Options> {
  const res = await listPurchaseRequests({ identity, legalEntityId: identity.legalEntityId, status });
  if (!res.ok) return fail(res.error.message);
  return ok(
    res.data
      .filter((r) => r.status === status)
      .map((r) => ({ value: r.request_id, label: `${r.description} — ${r.amount} ${r.currency_code}` })),
  );
}

type VendorProfile = { vendor_profile_id: string; vendor_name: string; due_diligence_status?: string; risk_rating?: string };

/** vendor-due-diligence-svc: vendor profiles (plain UUIDs). The list is a bare array. */
export async function vendorProfileOptions(identity: SessionIdentity): Promise<Options> {
  const res = await apiGet<VendorProfile[] | { vendor_profiles?: VendorProfile[] } | null>("vendorDueDiligence", "/v1/vendor-profiles", {
    identity,
    query: { legal_entity_id: identity.legalEntityId },
  });
  if (!res.ok) return fail(res.error.message);
  const rows = Array.isArray(res.data) ? res.data : res.data?.vendor_profiles ?? [];
  return ok(
    rows.map((v) => ({
      value: v.vendor_profile_id,
      label: `${v.vendor_name}${v.due_diligence_status ? ` (due diligence ${v.due_diligence_status})` : ""}`,
    })),
  );
}

/** spend-controls-svc: the categories of the policies in force. Matching is exact and upper-case. */
export async function spendCategoryOptions(identity: SessionIdentity): Promise<Options> {
  const res = await listSpendPolicies({ identity, legalEntityId: identity.legalEntityId });
  if (!res.ok) return fail(res.error.message);
  const categories = [...new Set(res.data.filter((p) => p.active_flag !== false).map((p) => p.category))].sort();
  return ok(categories.map((c) => ({ value: c, label: c })));
}

/** The options, or none when the read failed (the form then shows the reason in its hint). */
export const itemsOf = (o: Options): FieldOption[] => (o.ok ? o.items : []);
export const hintOf = (o: Options, service: string, empty: string): string | undefined =>
  !o.ok ? `${service} could not be read: ${o.error}` : o.items.length === 0 ? empty : undefined;
