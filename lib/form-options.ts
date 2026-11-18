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

/** purchase-request-svc: requisitions in the given statuses (e.g. APPROVED for an order). */
export async function purchaseRequestOptions(identity: SessionIdentity, ...statuses: string[]): Promise<Options> {
  const res = await listPurchaseRequests({
    identity,
    legalEntityId: identity.legalEntityId,
    ...(statuses.length === 1 ? { status: statuses[0] as never } : {}),
  });
  if (!res.ok) return fail(res.error.message);
  return ok(
    res.data
      .filter((r) => statuses.includes(r.status))
      .map((r) => ({ value: r.request_id, label: `${r.description} — ${r.amount} ${r.currency_code} (${r.status})` })),
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

// ── Supporting registers (documents, decisions, principals, evidence…) ───────

type Rec = Record<string, unknown>;
/** The rows of a list answer: a bare array, or the array under a known key. */
function rowsOf(data: unknown, keys: string[]): Rec[] {
  if (Array.isArray(data)) return data as Rec[];
  const d = (data ?? {}) as Rec;
  for (const k of keys) if (Array.isArray(d[k])) return d[k] as Rec[];
  return [];
}
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** document-vault-svc: active documents of the entity (evidence, minutes, signed copies). */
export async function documentOptions(identity: SessionIdentity): Promise<Options> {
  const res = await apiGet<unknown>("documentVault", "/v1/documents/", { identity, query: { legal_entity_id: identity.legalEntityId, limit: 200 } });
  if (!res.ok) return fail(res.error.message);
  return ok(
    rowsOf(res.data, ["documents", "items", "data"])
      .filter((d) => !d.status || d.status === "ACTIVE" || d.status === "RETAINED")
      .map((d) => ({ value: str(d.document_id), label: `${str(d.title) || str(d.document_id)}${d.document_type ? ` (${str(d.document_type)})` : ""}` })),
  );
}

/** governance-decision-log-svc: decisions of the entity that granted the action. */
export async function grantedDecisionOptions(identity: SessionIdentity): Promise<Options> {
  const res = await apiGet<unknown>("governance", "/v1/decisions", { identity, query: { entity: identity.legalEntityId, limit: 200 } });
  if (!res.ok) return fail(res.error.message);
  const granted = /^(GRANTED|APPROVED|ALLOW|ALLOWED|AUTHORIZED|PERMITTED)$/i;
  return ok(
    rowsOf(res.data, ["decisions", "items", "data"])
      .filter((d) => granted.test(str(d.outcome)))
      .map((d) => ({ value: str(d.decision_id), label: `${str(d.action_type)} · ${str(d.outcome)} · ${str(d.decision_id).slice(0, 18)}` })),
  );
}

/** identity-context-svc: active principals of the tenant (voters, owners). */
export async function principalOptions(identity: SessionIdentity, excludeSelf = false): Promise<Options> {
  const res = await apiGet<unknown>("identityContext", "/v1/principals", { identity, query: { "filter[status]": "ACTIVE", page_size: 200 } });
  if (!res.ok) return fail(res.error.message);
  return ok(
    rowsOf(res.data, ["items", "principals", "data"])
      .filter((p) => !excludeSelf || str(p.principal_id) !== identity.principalId)
      .map((p) => ({ value: str(p.principal_id), label: `${str(p.display_name) || str(p.email) || str(p.principal_id)}${p.email ? ` <${str(p.email)}>` : ""}` })),
  );
}

/** evidence-requirements-svc: the domain codes that carry filing requirements. */
export async function evidenceDomainOptions(identity: SessionIdentity): Promise<Options> {
  const res = await apiGet<unknown>("evidence", "/v1/evidence-requirements/", { identity, query: { legal_entity_id: identity.legalEntityId } });
  if (!res.ok) return fail(res.error.message);
  const codes = [...new Set(rowsOf(res.data, ["requirements", "items", "data"]).map((r) => str(r.domain_code)).filter(Boolean))].sort();
  return ok(codes.map((c) => ({ value: c, label: c })));
}

/** vat-gst-svc: DRAFT returns of the entity, the ones that can be filed. */
export async function draftVatReturnOptions(identity: SessionIdentity): Promise<Options> {
  const res = await apiGet<unknown>("vatGst", "/v1/vat-returns", { identity, query: { legal_entity_id: identity.legalEntityId, status: "DRAFT" } });
  if (!res.ok) return fail(res.error.message);
  return ok(
    rowsOf(res.data, ["vat_returns", "returns", "items", "data"])
      .filter((r) => !r.status || r.status === "DRAFT")
      .map((r) => ({ value: str(r.return_id), label: `${str(r.tax_period)} · ${str(r.tax_registration_number)} · ${str(r.return_id).slice(0, 18)}` })),
  );
}

/** connectivity-api-bridge-svc: CERTIFIED external provider profiles, as key@version. */
export async function certifiedProfileOptions(identity: SessionIdentity): Promise<Options> {
  const res = await apiGet<unknown>("connectivityApiBridge", "/v1/external-profiles", { identity });
  if (!res.ok) return fail(res.error.message);
  return ok(
    rowsOf(res.data, ["profiles", "items", "data"])
      .filter((p) => p.status === "CERTIFIED")
      .map((p) => ({ value: `${str(p.provider_key)}@${str(p.version)}`, label: `${str(p.provider_key)} v${str(p.version)} (${str(p.provider_type)})` })),
  );
}

/** secret-vault-integration-svc: secret policies of the entity, for a credential reference. */
export async function secretPolicyOptions(identity: SessionIdentity): Promise<Options> {
  const res = await apiGet<unknown>("secretVault", "/v1/secret-policies", { identity, query: { legal_entity_id: identity.legalEntityId } });
  if (!res.ok) return fail(res.error.message);
  return ok(
    rowsOf(res.data, ["secret_policies", "policies", "items", "data"]).map((p) => ({
      value: str(p.secret_policy_id),
      label: `${str(p.secret_path) || str(p.secret_policy_id)}${p.secret_class ? ` (${str(p.secret_class)})` : ""}`,
    })),
  );
}
