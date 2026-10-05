// Server-side API client for commercial-account-svc (:8144) — Plane 1
// (Zoiko Commercial Account) per docs/original_doc/zoiko_suite_doc7.txt §3, §B, §N, §O, §P.
//
// Owns verified customer commercial accounts, memberships (deactivate-only),
// immutable price catalogs, plans, entitlement limits, commercial subscriptions
// (canonical 7-state machine: EVALUATION/ACTIVE/PAST_DUE/RESTRICTED/SUSPENDED/CANCELED/TERMINATED),
// evaluation programs (explicit trial terms), contract overlays, and billing transfers.

import { apiGet, apiPost, apiPut, apiDelete, type ApiResult, type ApiWriteResult, type Identity } from "./client";

export type CommercialAccountStatus = "ACTIVE" | "PAST_DUE" | "RESTRICTED" | "SUSPENDED" | "CANCELED";

export type CommercialAccount = {
  commercial_account_id: string;
  organization_id: string;
  legal_customer_name: string;
  billing_currency_code: string;
  contact_email?: string;
  contract_reference?: string | null;
  processor_customer_ref?: string | null;
  status: CommercialAccountStatus;
  created_at: string;
  updated_at: string;
  created_by_principal_id: string;
};

export type MembershipStatus = "ACTIVE" | "DEACTIVATED";

export type Membership = {
  membership_id: string;
  principal_id: string;
  organization_id: string;
  workspace_id?: string | null;
  legal_entity_id?: string | null;
  status: MembershipStatus;
  effective_from: string;
  effective_to?: string | null;
  created_at: string;
  created_by_principal_id: string;
};

export type CatalogStatus = "DRAFT" | "PUBLISHED" | "RETIRED";

export type PriceCatalog = {
  catalog_version_id: string;
  catalog_code: string;
  status: CatalogStatus;
  effective_from: string;
  effective_to?: string | null;
  created_at: string;
  created_by_principal_id: string;
};

export type EntitlementLimit = {
  entitlement_limit_id: string;
  plan_id: string;
  metric_type: string;
  limit_value?: number | null; // null = unlimited
};

export type Plan = {
  plan_id: string;
  catalog_version_id: string;
  plan_code: string;
  display_name: string;
  billing_interval: string; // MONTHLY | ANNUAL
  base_price_amount: number;
  base_price_currency_code: string;
  market_scope?: string | null;
  created_at: string;
  created_by_principal_id: string;
  limits?: EntitlementLimit[];
};

export type SubscriptionStatus =
  | "EVALUATION"
  | "ACTIVE"
  | "PAST_DUE"
  | "RESTRICTED"
  | "SUSPENDED"
  | "CANCELED"
  | "TERMINATED";

export type BillingSource = "DIRECT" | "ZOIKO_ONE_BUNDLE";

export type CommercialSubscription = {
  subscription_id: string;
  commercial_account_id: string;
  plan_id: string;
  catalog_version_id: string;
  billing_interval: string;
  billing_source: BillingSource;
  status: SubscriptionStatus;
  renewal_date?: string | null;
  canceled_at?: string | null;
  processor_subscription_ref?: string | null;
  created_at: string;
  updated_at: string;
  created_by_principal_id: string;
};

export type SubscriptionStatusEvent = {
  status_event_id: string;
  subscription_id: string;
  previous_status: string;
  new_status: string;
  reason?: string | null;
  created_at: string;
  created_by_principal_id: string;
};

export type ResolvedEntitlement = {
  metric_type: string;
  limit_value?: number | null;
  source: "PLAN" | "OVERLAY";
  overlay_id?: string | null;
};

export type ContractEntitlementOverlay = {
  overlay_id: string;
  commercial_account_id: string;
  metric_type: string;
  override_limit_value?: number | null;
  legal_reference?: string | null;
  effective_from: string;
  effective_to?: string | null;
  approved_by_principal_id: string;
  created_at: string;
  created_by_principal_id: string;
};

export type SubscriptionChangeRequest = {
  change_request_id: string;
  subscription_id: string;
  target_plan_id: string;
  effective_at: string;
  status: string; // PREVIEWED | CONFIRMED | APPLIED | CANCELED
  requested_by_principal_id: string;
  created_at: string;
  applied_at?: string | null;
};

export type BillingSourceTransfer = {
  transfer_id: string;
  commercial_account_id: string;
  old_billing_source?: string | null;
  new_billing_source: string;
  old_subscription_id?: string | null;
  new_subscription_id?: string | null;
  entitlement_continuity: boolean;
  credit_amount?: number | null;
  reconciliation_status: string;
  created_at: string;
  created_by_principal_id: string;
};

export type CreateCommercialAccountInput = {
  organization_id: string;
  legal_customer_name: string;
  billing_currency_code: string;
  contact_email?: string;
  contract_reference?: string;
  processor_customer_ref?: string;
};

export type CreateMembershipInput = {
  principal_id: string;
  organization_id: string;
  workspace_id?: string;
  legal_entity_id?: string;
};

export type CreatePriceCatalogInput = {
  catalog_code: string;
  effective_from: string;
};

export type CreatePlanInput = {
  catalog_version_id: string;
  plan_code: string;
  display_name: string;
  billing_interval: string;
  base_price_amount: number;
  base_price_currency_code: string;
  market_scope?: string;
};

export type SetEntitlementLimitInput = {
  metric_type: string;
  limit_value?: number | null;
};

export type CreateSubscriptionInput = {
  commercial_account_id: string;
  plan_id: string;
  start_as_evaluation?: boolean;
  billing_source?: string;
};

export type SetSubscriptionStatusInput = {
  new_status: string;
  reason?: string;
};

export type CreateOverlayInput = {
  commercial_account_id: string;
  metric_type: string;
  override_limit_value?: number | null;
  legal_reference?: string;
  effective_from: string;
  effective_to?: string;
  approved_by_principal_id: string;
};

export type PreviewChangeInput = {
  subscription_id: string;
  target_plan_id: string;
  effective_at?: string;
};

export type EvaluationProgram = {
  evaluation_program_id: string;
  subscription_id: string;
  duration_days: number;
  payment_required: boolean;
  conversion_policy: string; // AUTO_CONVERT | MANUAL | EXPIRE
  expiry_action: string; // SUSPEND | CANCEL | CONVERT
  started_at: string;
  expires_at: string;
  created_at: string;
  created_by_principal_id: string;
};

export type CreateEvaluationProgramInput = {
  duration_days: number;
  payment_required?: boolean;
  conversion_policy: string;
  expiry_action: string;
};

export type UsageMeterEvent = {
  usage_event_id: string;
  subscription_id: string;
  metric_type: string;
  quantity: number;
  occurred_at: string;
  source_service: string;
  billable_state: string; // PENDING | VALIDATED | AGGREGATED | BILLED | REJECTED
  created_at: string;
};

export type RecordUsageEventInput = {
  usage_event_id: string;
  metric_type: string;
  quantity: number;
  source_service: string;
};

export type TransferBillingSourceInput = {
  commercial_account_id: string;
  old_subscription_id?: string;
  new_billing_source: string;
  target_plan_id?: string;
  credit_amount?: number;
};

// ── API Functions ─────────────────────────────────────────────────────────────

export async function createCommercialAccount(
  input: CreateCommercialAccountInput,
  identity?: Identity
): Promise<ApiWriteResult<CommercialAccount>> {
  return apiPost<CommercialAccount>("commercialAccount", "/v1/commercial-accounts", input, { identity });
}

export async function getCommercialAccount(
  id: string,
  identity?: Identity
): Promise<ApiResult<CommercialAccount>> {
  return apiGet<CommercialAccount>("commercialAccount", `/v1/commercial-accounts/${encodeURIComponent(id)}`, {
    identity,
  });
}

export async function createMembership(
  input: CreateMembershipInput,
  identity?: Identity
): Promise<ApiWriteResult<Membership>> {
  return apiPost<Membership>("commercialAccount", "/v1/memberships", input, { identity });
}

export async function getMembership(
  id: string,
  identity?: Identity
): Promise<ApiResult<Membership>> {
  return apiGet<Membership>("commercialAccount", `/v1/memberships/${encodeURIComponent(id)}`, { identity });
}

export async function deactivateMembership(
  id: string,
  identity?: Identity
): Promise<ApiWriteResult<{ status: string }>> {
  return apiDelete<{ status: string }>("commercialAccount", `/v1/memberships/${encodeURIComponent(id)}`, {
    identity,
  });
}

export async function listMemberships(
  organizationId: string,
  identity?: Identity
): Promise<ApiResult<Membership[]>> {
  const res = await apiGet<{ memberships: Membership[]; total: number }>(
    "commercialAccount",
    `/v1/organizations/${encodeURIComponent(organizationId)}/memberships`,
    { identity }
  );
  if (!res.ok) return res;
  return { ok: true, data: Array.isArray(res.data?.memberships) ? res.data.memberships : [] };
}

export async function createPriceCatalog(
  input: CreatePriceCatalogInput,
  identity?: Identity
): Promise<ApiWriteResult<PriceCatalog>> {
  return apiPost<PriceCatalog>("commercialAccount", "/v1/price-catalogs", input, { identity });
}

export async function getPriceCatalog(
  id: string,
  identity?: Identity
): Promise<ApiResult<PriceCatalog>> {
  return apiGet<PriceCatalog>("commercialAccount", `/v1/price-catalogs/${encodeURIComponent(id)}`, { identity });
}

export async function createPlan(
  input: CreatePlanInput,
  identity?: Identity
): Promise<ApiWriteResult<Plan>> {
  return apiPost<Plan>("commercialAccount", "/v1/plans", input, { identity });
}

export async function getPlan(
  id: string,
  identity?: Identity
): Promise<ApiResult<Plan>> {
  return apiGet<Plan>("commercialAccount", `/v1/plans/${encodeURIComponent(id)}`, { identity });
}

export async function setEntitlementLimit(
  planId: string,
  input: SetEntitlementLimitInput,
  identity?: Identity
): Promise<ApiWriteResult<EntitlementLimit>> {
  return apiPut<EntitlementLimit>(
    "commercialAccount",
    `/v1/plans/${encodeURIComponent(planId)}/entitlement-limits`,
    input,
    { identity }
  );
}

export async function createSubscription(
  input: CreateSubscriptionInput,
  identity?: Identity
): Promise<ApiWriteResult<CommercialSubscription>> {
  return apiPost<CommercialSubscription>("commercialAccount", "/v1/subscriptions", input, { identity });
}

export async function getSubscription(
  id: string,
  identity?: Identity
): Promise<ApiResult<CommercialSubscription>> {
  return apiGet<CommercialSubscription>("commercialAccount", `/v1/subscriptions/${encodeURIComponent(id)}`, {
    identity,
  });
}

export async function resolveEntitlement(
  subscriptionId: string,
  metricType: string,
  identity?: Identity
): Promise<ApiResult<ResolvedEntitlement>> {
  return apiGet<ResolvedEntitlement>(
    "commercialAccount",
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}/entitlements/${encodeURIComponent(metricType)}`,
    { identity }
  );
}

export async function setSubscriptionStatus(
  subscriptionId: string,
  input: SetSubscriptionStatusInput,
  identity?: Identity
): Promise<ApiWriteResult<CommercialSubscription>> {
  return apiPost<CommercialSubscription>(
    "commercialAccount",
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}/status`,
    input,
    { identity }
  );
}

export async function listStatusEvents(
  subscriptionId: string,
  identity?: Identity
): Promise<ApiResult<SubscriptionStatusEvent[]>> {
  const res = await apiGet<{ status_events: SubscriptionStatusEvent[] }>(
    "commercialAccount",
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}/status-events`,
    { identity }
  );
  if (!res.ok) return res;
  return { ok: true, data: Array.isArray(res.data?.status_events) ? res.data.status_events : [] };
}

export async function previewSubscriptionChange(
  input: PreviewChangeInput,
  identity?: Identity
): Promise<ApiWriteResult<SubscriptionChangeRequest>> {
  return apiPost<SubscriptionChangeRequest>("commercialAccount", "/v1/subscription-change-requests", input, {
    identity,
  });
}

export async function confirmSubscriptionChange(
  changeRequestId: string,
  identity?: Identity
): Promise<ApiWriteResult<SubscriptionChangeRequest>> {
  return apiPost<SubscriptionChangeRequest>(
    "commercialAccount",
    `/v1/subscription-change-requests/${encodeURIComponent(changeRequestId)}/confirm`,
    {},
    { identity }
  );
}

export async function createEvaluationProgram(
  subscriptionId: string,
  input: CreateEvaluationProgramInput,
  identity?: Identity
): Promise<ApiWriteResult<EvaluationProgram>> {
  return apiPost<EvaluationProgram>(
    "commercialAccount",
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}/evaluation-program`,
    input,
    { identity }
  );
}

export async function recordUsageEvent(
  subscriptionId: string,
  input: RecordUsageEventInput,
  identity?: Identity
): Promise<ApiWriteResult<UsageMeterEvent | { status: string }>> {
  return apiPost<UsageMeterEvent | { status: string }>(
    "commercialAccount",
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}/usage-events`,
    input,
    { identity }
  );
}

export async function createOverlay(
  input: CreateOverlayInput,
  identity?: Identity
): Promise<ApiWriteResult<ContractEntitlementOverlay>> {
  return apiPost<ContractEntitlementOverlay>(
    "commercialAccount",
    "/v1/contract-entitlement-overlays",
    input,
    { identity }
  );
}

export async function transferBillingSource(
  input: TransferBillingSourceInput,
  identity?: Identity
): Promise<ApiWriteResult<BillingSourceTransfer>> {
  return apiPost<BillingSourceTransfer>("commercialAccount", "/v1/billing-source-transfers", input, { identity });
}

// ── COM-01..05 Modern Commercial Plane Contracts ──────────────────────────

export type CommercialProduct = {
  product_id: string;
  product_code: string;
  product_kind: "PLAN" | "ADD_ON";
  created_at?: string;
  created_by_principal_id?: string;
};

export type CommercialPriceComponent = {
  component_key: string;
  component_type: string;
  amount?: string;
  billing_timing?: string;
  unit_name?: string;
};

export type CommercialPriceVersion = {
  price_version_id: string;
  product_id: string;
  product_code?: string;
  product_kind?: string;
  version_number?: number;
  display_name: string;
  billing_interval: string;
  currency_code: string;
  market_codes?: string[];
  effective_from: string;
  effective_to?: string | null;
  change_reason?: string;
  status: "DRAFT" | "REVIEW" | "APPROVED" | "PUBLISHED" | "DEPRECATED" | "RETIRED";
  row_version?: number;
  components?: CommercialPriceComponent[];
};

export type CreateProductInput = {
  product_code: string;
  product_kind: "PLAN" | "ADD_ON";
};

// The backend's canonical set (domain.ValidateDraftHeader / pricebook.go's
// billingIntervals) — exactly these three, case-sensitive. Not "MONTHLY".
export type BillingInterval = "MONTH" | "QUARTER" | "YEAR";

export type CreatePriceVersionInput = {
  product_id: string;
  display_name: string;
  billing_interval: BillingInterval;
  billing_interval_count?: number;
  currency_code: string;
  market_codes?: string[];
  effective_from: string;
  effective_to?: string | null;
  change_reason?: string;
  clone_previous?: boolean;
};

export type PutPriceComponentInput = {
  component_type: string;
  amount?: string;
  billing_timing?: string;
  unit_name?: string;
};

export async function createCommercialProduct(
  input: CreateProductInput,
  identity?: Identity
): Promise<ApiWriteResult<CommercialProduct>> {
  return apiPost<CommercialProduct>("commercialAccount", "/v1/commercial/products", input, { identity });
}

export async function listCommercialProducts(
  identity?: Identity
): Promise<ApiResult<CommercialProduct[]>> {
  const res = await apiGet<{ products: CommercialProduct[] }>("commercialAccount", "/v1/commercial/products", { identity });
  if (!res.ok) return res;
  return { ok: true, data: Array.isArray(res.data?.products) ? res.data.products : [] };
}

export async function createCommercialPriceVersion(
  input: CreatePriceVersionInput,
  identity?: Identity
): Promise<ApiWriteResult<CommercialPriceVersion>> {
  return apiPost<CommercialPriceVersion>("commercialAccount", "/v1/commercial/price-versions", input, { identity });
}

export async function getCommercialPriceVersion(
  id: string,
  identity?: Identity
): Promise<ApiResult<CommercialPriceVersion>> {
  return apiGet<CommercialPriceVersion>("commercialAccount", `/v1/commercial/price-versions/${encodeURIComponent(id)}`, { identity });
}

export async function setCommercialPriceComponent(
  versionId: string,
  key: string,
  input: PutPriceComponentInput,
  identity?: Identity
): Promise<ApiWriteResult<CommercialPriceVersion>> {
  return apiPut<CommercialPriceVersion>(
    "commercialAccount",
    `/v1/commercial/price-versions/${encodeURIComponent(versionId)}/components/${encodeURIComponent(key)}`,
    input,
    { identity }
  );
}

export async function executePriceVersionAction(
  versionId: string,
  action: "submit" | "approve" | "reject" | "publish" | "retire",
  body: { reason?: string } = {},
  identity?: Identity
): Promise<ApiWriteResult<CommercialPriceVersion>> {
  return apiPost<CommercialPriceVersion>(
    "commercialAccount",
    `/v1/commercial/price-versions/${encodeURIComponent(versionId)}:${action}`,
    body,
    { identity }
  );
}

export async function resolveSellableOffers(
  params?: { product_code?: string; currency?: string; market?: string },
  identity?: Identity
): Promise<ApiResult<CommercialPriceVersion[]>> {
  const q = new URLSearchParams();
  if (params?.product_code) q.set("product_code", params.product_code);
  if (params?.currency) q.set("currency", params.currency);
  if (params?.market) q.set("market", params.market);
  const qs = q.toString() ? `?${q.toString()}` : "";
  const res = await apiGet<{ offers?: CommercialPriceVersion[]; versions?: CommercialPriceVersion[] }>(
    "commercialAccount",
    `/v1/commercial/sellable-offers${qs}`,
    { identity }
  );
  if (!res.ok) return res;
  const list = res.data?.offers || res.data?.versions || [];
  return { ok: true, data: list };
}

export type CommercialSubscriptionV2 = {
  subscription_id: string;
  commercial_account_id: string;
  status: string;
  current_price_version_id?: string;
  renewal_date?: string;
  billing_interval?: string;
  currency_code?: string;
};

export type StartSubscriptionV2Input = {
  commercial_account_id: string;
  product_code: string;
  accepted_terms_sha256: string;
  expected_price_version_id?: string;
  assisted?: {
    organization_id: string;
    customer_basis_ref: string;
  };
};

export async function setAccountMarket(
  accountId: string,
  input: { organization_id: string; market_code: string },
  identity?: Identity
): Promise<ApiWriteResult<{ commercial_account_id: string; market_code: string }>> {
  return apiPut<{ commercial_account_id: string; market_code: string }>(
    "commercialAccount",
    `/v1/commercial/accounts/${encodeURIComponent(accountId)}/market`,
    input,
    { identity }
  );
}

export async function startCommercialSubscriptionV2(
  input: StartSubscriptionV2Input,
  identity?: Identity
): Promise<ApiWriteResult<CommercialSubscriptionV2>> {
  return apiPost<CommercialSubscriptionV2>(
    "commercialAccount",
    "/v1/commercial/subscriptions:start",
    input,
    { identity }
  );
}

export async function getCommercialSubscriptionV2(
  id: string,
  identity?: Identity
): Promise<ApiResult<CommercialSubscriptionV2>> {
  return apiGet<CommercialSubscriptionV2>(
    "commercialAccount",
    `/v1/commercial/subscriptions/${encodeURIComponent(id)}`,
    { identity }
  );
}

// Field names match the backend's evaluateRequest struct
// (com03_entitlement_handler.go) exactly: organization_id, capability_key,
// requested_quantity. A prior version of this type used feature_key/
// LIMIT_EXCEEDED, which do not exist in the real contract.
export type EvaluateEntitlementInput = {
  organization_id: string;
  capability_key: string;
  requested_quantity?: number;
};

// Matches domain.CapabilityDecision (com03_entitlement.go) exactly.
export type EvaluateEntitlementResult = {
  capability_key: string;
  outcome: "ALLOW" | "ALLOW_WITH_LIMIT" | "READ_ONLY" | "RESTRICTED" | "DENY";
  limit_value?: number;
  limit_unit?: string;
  subscription_outcome: "ALLOW" | "ALLOW_WITH_LIMIT" | "READ_ONLY" | "RESTRICTED" | "DENY";
  restriction_outcome?: "ALLOW" | "ALLOW_WITH_LIMIT" | "READ_ONLY" | "RESTRICTED" | "DENY";
  applied_restriction_id?: string;
  policy_version?: number;
  subscription_id?: string;
  reason: string;
  decided_at: string;
};

export async function evaluateCommercialEntitlement(
  input: EvaluateEntitlementInput,
  identity?: Identity
): Promise<ApiWriteResult<EvaluateEntitlementResult>> {
  return apiPost<EvaluateEntitlementResult>(
    "commercialAccount",
    "/v1/commercial/entitlements:evaluate",
    input,
    { identity }
  );
}

// Field names match domain.BillingAccount (com05_billing.go) exactly.
export type CommercialBillingAccount = {
  billing_account_id: string;
  organization_id: string;
  selling_entity: string;
  billing_currency_code: string;
  invoice_numbering_profile: string;
  payment_provider_ref: string;
  accounting_mapping_key: string;
  status: string;
};

// Field names match the backend's openBillingAccountRequest struct exactly;
// all six are required by domain.ValidateBillingAccount. A prior version of
// this input only had organization_id/currency_code, which does not satisfy
// the real contract.
export type OpenBillingAccountInput = {
  organization_id: string;
  selling_entity: string;
  billing_currency_code: string;
  invoice_numbering_profile: string;
  payment_provider_ref: string;
  accounting_mapping_key: string;
};

export async function openCommercialBillingAccount(
  input: OpenBillingAccountInput,
  identity?: Identity
): Promise<ApiWriteResult<CommercialBillingAccount>> {
  return apiPost<CommercialBillingAccount>(
    "commercialAccount",
    "/v1/commercial/billing-accounts",
    input,
    { identity }
  );
}

export async function getCommercialBillingAccount(
  organizationId: string,
  identity?: Identity
): Promise<ApiResult<CommercialBillingAccount>> {
  return apiGet<CommercialBillingAccount>(
    "commercialAccount",
    `/v1/commercial/billing-accounts/${encodeURIComponent(organizationId)}`,
    { identity }
  );
}

// Field names match domain.PlatformCommercialInvoice (com05_billing.go); a
// prior version of this type claimed a "status" field that does not exist
// on the real response and was missing several real fields (invoice_number,
// lines, tax fields).
export type CommercialInvoice = {
  invoice_id: string;
  invoice_number: string;
  organization_id: string;
  billing_account_id: string;
  candidate_id: string;
  subscription_id: string;
  term_no: number;
  currency_code: string;
  subtotal_amount: string;
  tax_jurisdiction_code: string;
  tax_rate_basis_points: number;
  tax_amount: string;
  total_amount: string;
  issued_at: string;
};

export async function getCommercialInvoice(
  invoiceId: string,
  organizationId: string,
  identity?: Identity
): Promise<ApiResult<CommercialInvoice>> {
  return apiGet<CommercialInvoice>(
    "commercialAccount",
    `/v1/commercial/invoices/${encodeURIComponent(invoiceId)}?organization_id=${encodeURIComponent(organizationId)}`,
    { identity }
  );
}

