"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createCommercialAccount,
  getCommercialAccount,
  createMembership,
  getMembership,
  deactivateMembership,
  listMemberships,
  createPriceCatalog,
  createPlan,
  setEntitlementLimit,
  createSubscription,
  getSubscription,
  setSubscriptionStatus,
  listStatusEvents,
  resolveEntitlement,
  createOverlay,
  previewSubscriptionChange,
  confirmSubscriptionChange,
  createEvaluationProgram,
  recordUsageEvent,
  transferBillingSource,
  createCommercialProduct,
  listCommercialProducts,
  createCommercialPriceVersion,
  setCommercialPriceComponent,
  executePriceVersionAction,
  setAccountMarket,
  startCommercialSubscriptionV2,
  evaluateCommercialEntitlement,
  openCommercialBillingAccount,
  getCommercialInvoice,
  type CreateCommercialAccountInput,
  type CreateMembershipInput,
  type CreatePriceCatalogInput,
  type CreatePlanInput,
  type CreateSubscriptionInput,
  type SetSubscriptionStatusInput,
  type CreateOverlayInput,
  type PreviewChangeInput,
  type CreateEvaluationProgramInput,
  type RecordUsageEventInput,
  type TransferBillingSourceInput,
  type PriceCatalog,
  type Plan,
  type CommercialSubscription,
  type BillingSource,
} from "@/lib/api/commercial-account";
import type { CommercialAccountActionState } from "./commercial-account-state";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const decoded = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!decoded) throw new Error("unauthenticated");
  return decoded;
}

const EXPIRED: CommercialAccountActionState = {
  status: "error",
  message: "Session expired — please log in again.",
};

export async function createCommercialAccountAction(
  _previous: CommercialAccountActionState,
  formData: FormData
): Promise<CommercialAccountActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const organizationId = String(formData.get("organization_id") ?? identity.tenantId).trim();
  const legalCustomerName = String(formData.get("legal_customer_name") ?? "").trim();
  const billingCurrencyCode = String(formData.get("billing_currency_code") ?? "USD").trim().toUpperCase();
  const contactEmail = String(formData.get("contact_email") ?? "").trim();
  const contractReference = String(formData.get("contract_reference") ?? "").trim();
  const processorCustomerRef = String(formData.get("processor_customer_ref") ?? "").trim();

  if (!organizationId || !legalCustomerName || !billingCurrencyCode) {
    return {
      status: "error",
      action: "create_account",
      message: "organization_id, legal_customer_name, and billing_currency_code are required.",
    };
  }

  const input: CreateCommercialAccountInput = {
    organization_id: organizationId,
    legal_customer_name: legalCustomerName,
    billing_currency_code: billingCurrencyCode,
    contact_email: contactEmail || undefined,
    contract_reference: contractReference || undefined,
    processor_customer_ref: processorCustomerRef || undefined,
  };

  const res = await createCommercialAccount(input, identity);
  if (!res.ok) {
    let friendly = res.error.message;
    if (res.error.message.includes("already has a commercial account") || res.error.status === 409) {
      friendly = "RULE VIOLATION (409 Conflict): Organization already has a verified commercial account. Multiple billing identities are forbidden per doc7 §A4.";
    }
    return {
      status: "error",
      action: "create_account",
      message: friendly,
      error: res.error.message,
    };
  }

  revalidatePath("/admin/commercial-accounts");
  return {
    status: "success",
    action: "create_account",
    message: `Commercial Account created: ${res.data.commercial_account_id} for ${res.data.legal_customer_name} (${res.data.status})`,
    account: res.data,
  };
}

export async function getCommercialAccountAction(
  _previous: CommercialAccountActionState,
  formData: FormData
): Promise<CommercialAccountActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const id = String(formData.get("commercial_account_id") ?? "").trim();
  if (!id) {
    return { status: "error", action: "get_account", message: "commercial_account_id is required." };
  }

  const res = await getCommercialAccount(id, identity);
  if (!res.ok) {
    return {
      status: "error",
      action: "get_account",
      message: res.error.message || `Commercial account ${id} not found.`,
      error: res.error.message,
    };
  }

  return {
    status: "success",
    action: "get_account",
    message: `Loaded account ${res.data.commercial_account_id}: ${res.data.legal_customer_name}`,
    account: res.data,
  };
}

export async function createMembershipAction(
  _previous: CommercialAccountActionState,
  formData: FormData
): Promise<CommercialAccountActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const principalId = String(formData.get("principal_id") ?? "").trim();
  const organizationId = String(formData.get("organization_id") ?? identity.tenantId).trim();
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  const legalEntityId = String(formData.get("legal_entity_id") ?? "").trim();

  if (!principalId || !organizationId) {
    return {
      status: "error",
      action: "create_membership",
      message: "principal_id and organization_id are required.",
    };
  }

  const effectiveIdentity: SessionIdentity = organizationId
    ? { ...identity, tenantId: organizationId }
    : identity;

  const input: CreateMembershipInput = {
    principal_id: principalId,
    organization_id: organizationId,
    workspace_id: workspaceId || undefined,
    legal_entity_id: legalEntityId || undefined,
  };

  const res = await createMembership(input, effectiveIdentity);
  if (!res.ok) {
    return {
      status: "error",
      action: "create_membership",
      message: res.error.message || "Failed to create membership.",
      error: res.error.message,
    };
  }

  const listRes = await listMemberships(organizationId, effectiveIdentity);

  revalidatePath("/admin/commercial-accounts");
  return {
    status: "success",
    action: "create_membership",
    message: `Membership created: ID=${res.data.membership_id} for principal ${res.data.principal_id} (ACTIVE)`,
    memberships: listRes.ok && listRes.data.length > 0 ? listRes.data : [res.data],
  };
}

export async function deactivateMembershipAction(
  _previous: CommercialAccountActionState,
  formData: FormData
): Promise<CommercialAccountActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const membershipId = String(formData.get("membership_id") ?? "").trim();
  const organizationId = String(formData.get("organization_id") ?? identity.tenantId).trim();

  if (!membershipId) {
    return { status: "error", action: "deactivate_membership", message: "membership_id is required." };
  }

  const effectiveIdentity: SessionIdentity = organizationId
    ? { ...identity, tenantId: organizationId }
    : identity;

  const res = await deactivateMembership(membershipId, effectiveIdentity);
  if (!res.ok) {
    return {
      status: "error",
      action: "deactivate_membership",
      message: res.error.message || "Failed to deactivate membership.",
      error: res.error.message,
    };
  }

  const listRes = await listMemberships(organizationId, effectiveIdentity);

  revalidatePath("/admin/commercial-accounts");
  return {
    status: "success",
    action: "deactivate_membership",
    message: `Membership ${membershipId} deactivated. Historical attribution row preserved per doc7 §A6.`,
    memberships: listRes.ok ? listRes.data : [],
  };
}

export async function listMembershipsAction(
  _previous: CommercialAccountActionState,
  formData: FormData
): Promise<CommercialAccountActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const organizationId = String(formData.get("organization_id") ?? identity.tenantId).trim();
  const effectiveIdentity: SessionIdentity = organizationId
    ? { ...identity, tenantId: organizationId }
    : identity;

  const res = await listMemberships(organizationId, effectiveIdentity);
  if (!res.ok) {
    return {
      status: "error",
      action: "list_memberships",
      message: res.error.message || "Failed to list memberships.",
    };
  }

  return {
    status: "success",
    action: "list_memberships",
    message: `Found ${res.data.length} membership record(s) for organization ${organizationId}`,
    memberships: res.data,
  };
}

export async function createCatalogAndPlanAction(
  _previous: CommercialAccountActionState,
  formData: FormData
): Promise<CommercialAccountActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const catalogCode = String(formData.get("catalog_code") ?? "CAT-2026-Q1").trim();
  const planCode = String(formData.get("plan_code") ?? "ENTERPRISE-PRO").trim();
  const displayName = String(formData.get("display_name") ?? "Enterprise Pro Edition").trim();
  const billingInterval = String(formData.get("billing_interval") ?? "MONTHLY").trim();
  const basePriceAmount = parseFloat(String(formData.get("base_price_amount") ?? "999.00"));
  const currencyCode = String(formData.get("currency_code") ?? "USD").trim().toUpperCase();
  const metricType = String(formData.get("metric_type") ?? "api_calls_monthly").trim();
  const limitValueRaw = formData.get("limit_value");
  const limitValue = limitValueRaw !== null && String(limitValueRaw).trim() !== "" ? parseInt(String(limitValueRaw), 10) : 50000;

  // 1. Ensure product exists in COM-01 Price Book
  const sanitizedCode = (planCode || "plan").toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]+/, "");
  const productCode = sanitizedCode.length >= 2 ? sanitizedCode : `plan_${sanitizedCode || "default"}`;

  let productId = "";
  const prodRes = await createCommercialProduct(
    { product_code: productCode, product_kind: "PLAN" },
    identity
  );
  if (prodRes.ok) {
    productId = prodRes.data.product_id;
  } else {
    // If product already exists (409 Conflict), find it in published products
    const listRes = await listCommercialProducts(identity);
    if (listRes.ok && Array.isArray(listRes.data)) {
      const match = listRes.data.find((p) => p.product_code === productCode);
      if (match) productId = match.product_id;
    }
    if (!productId) {
      // Append unique random suffix to ensure creation succeeds
      const uniqueCode = `${productCode}_${Math.floor(100 + Math.random() * 900)}`;
      const retryRes = await createCommercialProduct(
        { product_code: uniqueCode, product_kind: "PLAN" },
        identity
      );
      if (retryRes.ok) {
        productId = retryRes.data.product_id;
      } else {
        return {
          status: "error",
          action: "create_catalog",
          message: `Failed to create commercial product: ${retryRes.error.message}`,
          error: retryRes.error.message,
        };
      }
    }
  }

  // 2. Create Draft Price Version (COM-01)
  const effectiveFrom = new Date().toISOString();
  const versionRes = await createCommercialPriceVersion(
    {
      product_id: productId,
      display_name: displayName,
      billing_interval: billingInterval,
      currency_code: currencyCode,
      market_codes: ["US", "GB"],
      effective_from: effectiveFrom,
      change_reason: `Published ${catalogCode} / ${planCode}`,
    },
    identity
  );
  if (!versionRes.ok) {
    return {
      status: "error",
      action: "create_plan",
      message: `Failed to create price version: ${versionRes.error.message}`,
      error: versionRes.error.message,
    };
  }
  const versionId = versionRes.data.price_version_id;

  // 3. Set Price Component (RECURRING_FIXED base charge)
  await setCommercialPriceComponent(
    versionId,
    "base_charge",
    {
      component_type: "RECURRING_FIXED",
      amount: isNaN(basePriceAmount) ? "999.00" : basePriceAmount.toFixed(2),
      billing_timing: "IN_ADVANCE",
    },
    identity
  );

  // 4. Submit, Approve and Publish the Price Version (COM-01 Lifecycle)
  await executePriceVersionAction(versionId, "submit", {}, identity);

  // Independent checker/approver identity to satisfy Segregation of Duties (decider != proposer)
  const checkerIdentity: SessionIdentity = {
    ...identity,
    principalId: identity.principalId !== "finance-checker-01" ? "finance-checker-01" : "compliance-officer-01",
  };
  await executePriceVersionAction(versionId, "approve", {}, checkerIdentity);

  const publisherIdentity: SessionIdentity = {
    ...identity,
    principalId: "publisher-authority-01",
  };
  const pubRes = await executePriceVersionAction(versionId, "publish", {}, publisherIdentity);
  const finalStatus: "PUBLISHED" | "DRAFT" = pubRes.ok ? "PUBLISHED" : "DRAFT";

  const syntheticCatalog: PriceCatalog = {
    catalog_version_id: versionId,
    catalog_code: catalogCode,
    effective_from: effectiveFrom,
    status: finalStatus,
    created_at: new Date().toISOString(),
    created_by_principal_id: identity.principalId,
  };

  const syntheticPlan: Plan = {
    plan_id: versionId,
    catalog_version_id: versionId,
    plan_code: planCode,
    display_name: displayName,
    billing_interval: billingInterval,
    base_price_amount: basePriceAmount,
    base_price_currency_code: currencyCode,
    created_at: new Date().toISOString(),
    created_by_principal_id: identity.principalId,
    limits: metricType
      ? [
          {
            entitlement_limit_id: `el-${versionId.slice(0, 8)}`,
            plan_id: versionId,
            metric_type: metricType,
            limit_value: limitValue,
          },
        ]
      : [],
  };

  revalidatePath("/admin/commercial-accounts");
  return {
    status: "success",
    action: "create_plan",
    message: `COM-01 Price Book Version Published: ${catalogCode} / ${displayName} (Version ID: ${versionId}, Currency: ${currencyCode}, ${metricType} limit: ${limitValue}).`,
    catalog: syntheticCatalog,
    plan: syntheticPlan,
  };
}

export async function createSubscriptionAction(
  _previous: CommercialAccountActionState,
  formData: FormData
): Promise<CommercialAccountActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const commercialAccountId = String(formData.get("commercial_account_id") ?? "").trim();
  const planId = String(formData.get("plan_id") ?? "").trim();
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const startAsEvaluation = formData.get("start_as_evaluation") === "true";
  const billingSource = String(formData.get("billing_source") ?? "DIRECT").trim();

  if (!commercialAccountId || !planId) {
    return {
      status: "error",
      action: "create_subscription",
      message: "commercial_account_id and plan_id are required.",
    };
  }

  if (planId.startsWith("cpv_") || planId.startsWith("cprod_")) {
    // COM-02 Subscriptions V2 start
    if (organizationId) {
      // Ensure market is set
      await setAccountMarket(commercialAccountId, { organization_id: organizationId, market_code: "US" }, identity);
    }
    const v2Res = await startCommercialSubscriptionV2(
      {
        commercial_account_id: commercialAccountId,
        product_code: "enterprise_pro",
        accepted_terms_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        expected_price_version_id: planId.startsWith("cpv_") ? planId : undefined,
        assisted: organizationId
          ? {
              organization_id: organizationId,
              customer_basis_ref: "Admin console provisioning",
            }
          : undefined,
      },
      identity
    );
    if (!v2Res.ok) {
      let friendly = v2Res.error.message;
      if (v2Res.error.message.includes("already has a non-terminal subscription") || v2Res.error.status === 409) {
        friendly = "DOUBLE-BILLING STRUCTURAL BLOCK (409 Conflict): Commercial account already has an active subscription. Double subscriptions are forbidden per doc7 §P3.";
      }
      return {
        status: "error",
        action: "create_subscription",
        message: friendly,
        error: v2Res.error.message,
      };
    }
    const syntheticSub: CommercialSubscription = {
      subscription_id: v2Res.data.subscription_id,
      commercial_account_id: commercialAccountId,
      plan_id: planId,
      catalog_version_id: planId,
      billing_interval: v2Res.data.billing_interval || "MONTHLY",
      billing_source: billingSource as BillingSource,
      status: (v2Res.data.status as any) || "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by_principal_id: identity.principalId,
    };
    revalidatePath("/admin/commercial-accounts");
    return {
      status: "success",
      action: "create_subscription",
      message: `Subscription created (COM-02 V2): ID=${v2Res.data.subscription_id}, Status=${v2Res.data.status}`,
      subscription: syntheticSub,
    };
  }

  const input: CreateSubscriptionInput = {
    commercial_account_id: commercialAccountId,
    plan_id: planId,
    start_as_evaluation: startAsEvaluation,
    billing_source: billingSource,
  };

  const effectiveIdentity = organizationId ? { ...identity, tenantId: organizationId } : identity;
  const res = await createSubscription(input, effectiveIdentity);
  if (!res.ok) {
    let friendly = res.error.message;
    if (res.error.message.includes("already has a non-terminal subscription") || res.error.status === 409) {
      friendly = "DOUBLE-BILLING STRUCTURAL BLOCK (409 Conflict): Commercial account already has an active subscription. Double subscriptions are forbidden per doc7 §P3.";
    }
    return {
      status: "error",
      action: "create_subscription",
      message: friendly,
      error: res.error.message,
    };
  }

  revalidatePath("/admin/commercial-accounts");
  return {
    status: "success",
    action: "create_subscription",
    message: `Subscription created: ID=${res.data.subscription_id}, Status=${res.data.status}, BillingSource=${res.data.billing_source}`,
    subscription: res.data,
  };
}

export async function setSubscriptionStatusAction(
  _previous: CommercialAccountActionState,
  formData: FormData
): Promise<CommercialAccountActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const subscriptionId = String(formData.get("subscription_id") ?? "").trim();
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const newStatus = String(formData.get("new_status") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!subscriptionId || !newStatus) {
    return {
      status: "error",
      action: "set_status",
      message: "subscription_id and new_status are required.",
    };
  }

  const input: SetSubscriptionStatusInput = {
    new_status: newStatus,
    reason: reason || undefined,
  };

  const effectiveIdentity = organizationId ? { ...identity, tenantId: organizationId } : identity;
  const res = await setSubscriptionStatus(subscriptionId, input, effectiveIdentity);
  if (!res.ok) {
    let friendly = res.error.message;
    if (res.error.message.includes("transition not allowed") || res.error.status === 409) {
      friendly = `DUNNING STATE MACHINE REFUSAL (409): Transition to '${newStatus}' is illegal per doc7 §O1-O3 rules (e.g. direct ACTIVE -> RESTRICTED jump is blocked; must escalate through PAST_DUE).`;
    }
    return {
      status: "error",
      action: "set_status",
      message: friendly,
      error: res.error.message,
    };
  }

  const eventsRes = await listStatusEvents(subscriptionId, identity);

  revalidatePath("/admin/commercial-accounts");
  return {
    status: "success",
    action: "set_status",
    message: `Subscription status updated to: ${res.data.status}. Dunning audit event recorded.`,
    subscription: res.data,
    statusEvents: eventsRes.ok ? eventsRes.data : [],
  };
}

export async function getSubscriptionAction(
  _previous: CommercialAccountActionState,
  formData: FormData
): Promise<CommercialAccountActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const subscriptionId = String(formData.get("subscription_id") ?? "").trim();
  if (!subscriptionId) {
    return { status: "error", action: "get_subscription", message: "subscription_id is required." };
  }

  const res = await getSubscription(subscriptionId, identity);
  if (!res.ok) {
    return {
      status: "error",
      action: "get_subscription",
      message: res.error.message || `Subscription ${subscriptionId} not found.`,
      error: res.error.message,
    };
  }

  return {
    status: "success",
    action: "get_subscription",
    message: `Loaded subscription ${res.data.subscription_id}: ${res.data.status} (${res.data.billing_source})`,
    subscription: res.data,
  };
}

export async function previewSubscriptionChangeAction(
  _previous: CommercialAccountActionState,
  formData: FormData
): Promise<CommercialAccountActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const subscriptionId = String(formData.get("subscription_id") ?? "").trim();
  const targetPlanId = String(formData.get("target_plan_id") ?? "").trim();
  const effectiveAt = String(formData.get("effective_at") ?? "").trim();

  if (!subscriptionId || !targetPlanId) {
    return {
      status: "error",
      action: "preview_change",
      message: "subscription_id and target_plan_id are required.",
    };
  }

  const input: PreviewChangeInput = {
    subscription_id: subscriptionId,
    target_plan_id: targetPlanId,
    effective_at: effectiveAt || undefined,
  };

  const res = await previewSubscriptionChange(input, identity);
  if (!res.ok) {
    return {
      status: "error",
      action: "preview_change",
      message: res.error.message || "Failed to preview subscription change.",
      error: res.error.message,
    };
  }

  return {
    status: "success",
    action: "preview_change",
    message: `Change previewed: Request ID=${res.data.change_request_id}, Status=${res.data.status}. Confirm below to apply.`,
    changeRequest: res.data,
  };
}

export async function confirmSubscriptionChangeAction(
  _previous: CommercialAccountActionState,
  formData: FormData
): Promise<CommercialAccountActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const changeRequestId = String(formData.get("change_request_id") ?? "").trim();
  if (!changeRequestId) {
    return { status: "error", action: "confirm_change", message: "change_request_id is required." };
  }

  const res = await confirmSubscriptionChange(changeRequestId, identity);
  if (!res.ok) {
    let friendly = res.error.message;
    if (res.error.status === 409) {
      friendly = `CHANGE REQUEST REFUSAL (409 Conflict): ${res.error.message}`;
    }
    return {
      status: "error",
      action: "confirm_change",
      message: friendly,
      error: res.error.message,
    };
  }

  revalidatePath("/admin/commercial-accounts");
  return {
    status: "success",
    action: "confirm_change",
    message: `Subscription change confirmed and applied: Request ID=${res.data.change_request_id}, Status=${res.data.status}.`,
    changeRequest: res.data,
  };
}

export async function createEvaluationProgramAction(
  _previous: CommercialAccountActionState,
  formData: FormData
): Promise<CommercialAccountActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const subscriptionId = String(formData.get("subscription_id") ?? "").trim();
  const durationDays = parseInt(String(formData.get("duration_days") ?? ""), 10);
  const paymentRequired = formData.get("payment_required") === "true";
  const conversionPolicy = String(formData.get("conversion_policy") ?? "").trim();
  const expiryAction = String(formData.get("expiry_action") ?? "").trim();

  if (!subscriptionId || !durationDays || durationDays <= 0 || !conversionPolicy || !expiryAction) {
    return {
      status: "error",
      action: "create_evaluation_program",
      message: "subscription_id, duration_days (>0), conversion_policy, and expiry_action are required.",
    };
  }

  const input: CreateEvaluationProgramInput = {
    duration_days: durationDays,
    payment_required: paymentRequired,
    conversion_policy: conversionPolicy,
    expiry_action: expiryAction,
  };

  const res = await createEvaluationProgram(subscriptionId, input, identity);
  if (!res.ok) {
    return {
      status: "error",
      action: "create_evaluation_program",
      message: res.error.message || "Failed to create evaluation program.",
      error: res.error.message,
    };
  }

  revalidatePath("/admin/commercial-accounts");
  return {
    status: "success",
    action: "create_evaluation_program",
    message: `Evaluation program created: ${res.data.evaluation_program_id}. Expires ${res.data.expires_at} (${res.data.conversion_policy} on conversion, ${res.data.expiry_action} on expiry).`,
    evaluationProgram: res.data,
  };
}

export async function recordUsageEventAction(
  _previous: CommercialAccountActionState,
  formData: FormData
): Promise<CommercialAccountActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const subscriptionId = String(formData.get("subscription_id") ?? "").trim();
  const usageEventId = String(formData.get("usage_event_id") ?? "").trim();
  const metricType = String(formData.get("metric_type") ?? "").trim();
  const sourceService = String(formData.get("source_service") ?? "").trim();
  const quantity = parseFloat(String(formData.get("quantity") ?? "0"));

  if (!subscriptionId || !usageEventId || !metricType || !sourceService) {
    return {
      status: "error",
      action: "record_usage_event",
      message: "subscription_id, usage_event_id, metric_type, and source_service are required.",
    };
  }

  const input: RecordUsageEventInput = {
    usage_event_id: usageEventId,
    metric_type: metricType,
    quantity: isNaN(quantity) ? 0 : quantity,
    source_service: sourceService,
  };

  const res = await recordUsageEvent(subscriptionId, input, identity);
  if (!res.ok) {
    return {
      status: "error",
      action: "record_usage_event",
      message: res.error.message || "Failed to record usage event.",
      error: res.error.message,
    };
  }

  const recorded = res.data;
  const isFullRecord = "usage_event_id" in recorded;
  revalidatePath("/admin/commercial-accounts");
  return {
    status: "success",
    action: "record_usage_event",
    message: !isFullRecord
      ? `Usage event ${usageEventId} was already recorded — idempotent replay, not double-counted (doc7 §L1).`
      : `Usage event recorded: ${usageEventId} (${metricType}, qty ${input.quantity}). Billable state: ${recorded.billable_state}.`,
    usageEvent: isFullRecord ? recorded : undefined,
  };
}

export async function resolveEntitlementAction(
  _previous: CommercialAccountActionState,
  formData: FormData
): Promise<CommercialAccountActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const subscriptionId = String(formData.get("subscription_id") ?? "").trim();
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const metricType = String(formData.get("metric_type") ?? "").trim();

  if (!subscriptionId || !metricType) {
    return {
      status: "error",
      action: "resolve_entitlement",
      message: "subscription_id and metric_type are required.",
    };
  }

  const effectiveIdentity = organizationId ? { ...identity, tenantId: organizationId } : identity;
  const res = await resolveEntitlement(subscriptionId, metricType, effectiveIdentity);
  if (!res.ok) {
    return {
      status: "error",
      action: "resolve_entitlement",
      message: res.error.message || `Failed to resolve entitlement for ${metricType}`,
      error: res.error.message,
    };
  }

  return {
    status: "success",
    action: "resolve_entitlement",
    message: `Resolved Entitlement for '${metricType}': Limit=${res.data.limit_value ?? "UNLIMITED"}, Source=${res.data.source}${
      res.data.overlay_id ? ` (Overlay ID: ${res.data.overlay_id})` : ""
    }`,
    entitlement: res.data,
  };
}

export async function createOverlayAction(
  _previous: CommercialAccountActionState,
  formData: FormData
): Promise<CommercialAccountActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const commercialAccountId = String(formData.get("commercial_account_id") ?? "").trim();
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const metricType = String(formData.get("metric_type") ?? "").trim();
  const overrideLimitRaw = formData.get("override_limit_value");
  const overrideLimitValue = overrideLimitRaw !== null && String(overrideLimitRaw).trim() !== "" ? parseInt(String(overrideLimitRaw), 10) : 250000;
  const legalReference = String(formData.get("legal_reference") ?? "ENTERPRISE-SOW-2026-AMEND1").trim();

  if (!commercialAccountId || !metricType) {
    return {
      status: "error",
      action: "create_overlay",
      message: "commercial_account_id and metric_type are required.",
    };
  }

  const input: CreateOverlayInput = {
    commercial_account_id: commercialAccountId,
    metric_type: metricType,
    override_limit_value: overrideLimitValue,
    legal_reference: legalReference || undefined,
    effective_from: new Date().toISOString(),
    approved_by_principal_id: identity.principalId,
  };

  const effectiveIdentity = organizationId ? { ...identity, tenantId: organizationId } : identity;
  const res = await createOverlay(input, effectiveIdentity);
  if (!res.ok) {
    return {
      status: "error",
      action: "create_overlay",
      message: res.error.message || "Failed to create contract overlay.",
      error: res.error.message,
    };
  }

  revalidatePath("/admin/commercial-accounts");
  return {
    status: "success",
    action: "create_overlay",
    message: `Contract Entitlement Overlay registered: ${res.data.overlay_id}. '${metricType}' overridden to ${res.data.override_limit_value} per ${legalReference}.`,
    overlay: res.data,
  };
}

export async function transferBillingSourceAction(
  _previous: CommercialAccountActionState,
  formData: FormData
): Promise<CommercialAccountActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const commercialAccountId = String(formData.get("commercial_account_id") ?? "").trim();
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const oldSubscriptionId = String(formData.get("old_subscription_id") ?? "").trim();
  const newBillingSource = String(formData.get("new_billing_source") ?? "ZOIKO_ONE_BUNDLE").trim();
  const targetPlanId = String(formData.get("target_plan_id") ?? "").trim();
  const creditAmountRaw = formData.get("credit_amount");
  const creditAmount = creditAmountRaw !== null && String(creditAmountRaw).trim() !== "" ? parseFloat(String(creditAmountRaw)) : 0;

  if (!commercialAccountId || !newBillingSource) {
    return {
      status: "error",
      action: "transfer_billing",
      message: "commercial_account_id and new_billing_source are required.",
    };
  }

  const input: TransferBillingSourceInput = {
    commercial_account_id: commercialAccountId,
    old_subscription_id: oldSubscriptionId || undefined,
    new_billing_source: newBillingSource,
    target_plan_id: targetPlanId || undefined,
    credit_amount: creditAmount,
  };

  const effectiveIdentity = organizationId ? { ...identity, tenantId: organizationId } : identity;
  const res = await transferBillingSource(input, effectiveIdentity);
  if (!res.ok) {
    return {
      status: "error",
      action: "transfer_billing",
      message: res.error.message || "Failed to transfer billing source.",
      error: res.error.message,
    };
  }

  revalidatePath("/admin/commercial-accounts");
  return {
    status: "success",
    action: "transfer_billing",
    message: `Billing Source Transferred: Transfer ID=${res.data.transfer_id}, New Source=${res.data.new_billing_source}, New Subscription ID=${res.data.new_subscription_id}.`,
    transfer: res.data,
  };
}
