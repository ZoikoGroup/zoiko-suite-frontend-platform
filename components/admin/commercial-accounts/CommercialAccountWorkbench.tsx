"use client";

import { useState, useActionState, useEffect, startTransition } from "react";
import {
  CreditCard,
  Building2,
  Users,
  ShieldCheck,
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Lock,
  ArrowRight,
  Database,
  History,
  Layers,
  Sparkles,
  RefreshCw,
  Clock,
  UserCheck,
  UserX,
  FileText,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from "@/components/ui";
import { FIELD, LABEL, HINT } from "@/components/admin/shared/form";
import { ResultBanner, CopyableId, JsonBlock } from "@/components/admin/shared";
import {
  createCommercialAccountAction,
  getCommercialAccountAction,
  createMembershipAction,
  deactivateMembershipAction,
  listMembershipsAction,
  createCatalogAndPlanAction,
  approveAndPublishPriceVersionAction,
  createSubscriptionAction,
  getSubscriptionAction,
  setSubscriptionStatusAction,
  previewSubscriptionChangeAction,
  confirmSubscriptionChangeAction,
  createEvaluationProgramAction,
  recordUsageEventAction,
  resolveEntitlementAction,
  createOverlayAction,
  transferBillingSourceAction,
  evaluateCommercialEntitlementAction,
  openBillingAccountAction,
  getInvoiceAction,
} from "@/app/admin/commercial-accounts/commercial-account-actions";
import { IDLE_COMMERCIAL_STATE, type CommercialAccountActionState } from "@/app/admin/commercial-accounts/commercial-account-state";
import type {
  CommercialAccount,
  Membership,
  PriceCatalog,
  Plan,
  CommercialSubscription,
  ResolvedEntitlement,
  SubscriptionStatusEvent,
  SubscriptionChangeRequest,
  BillingSource,
} from "@/lib/api/commercial-account";

export function CommercialAccountWorkbench({ initialTenantId }: { initialTenantId: string }) {
  // Action states
  const [accountState, accountAction, accountPending] = useActionState(
    createCommercialAccountAction,
    IDLE_COMMERCIAL_STATE
  );
  const [getAccountState, getAccountAction, getAccountPending] = useActionState(
    getCommercialAccountAction,
    IDLE_COMMERCIAL_STATE
  );
  const [membershipState, membershipAction, membershipPending] = useActionState(
    createMembershipAction,
    IDLE_COMMERCIAL_STATE
  );
  const [deactivateState, deactivateAction, deactivatePending] = useActionState(
    deactivateMembershipAction,
    IDLE_COMMERCIAL_STATE
  );
  const [listMemberState, listMemberAction, listMemberPending] = useActionState(
    listMembershipsAction,
    IDLE_COMMERCIAL_STATE
  );
  const [catalogPlanState, catalogPlanAction, catalogPlanPending] = useActionState(
    createCatalogAndPlanAction,
    IDLE_COMMERCIAL_STATE
  );
  const [approvePublishState, approvePublishAction, approvePublishPending] = useActionState(
    approveAndPublishPriceVersionAction,
    IDLE_COMMERCIAL_STATE
  );
  const [subState, subAction, subPending] = useActionState(
    createSubscriptionAction,
    IDLE_COMMERCIAL_STATE
  );
  const [statusState, statusAction, statusPending] = useActionState(
    setSubscriptionStatusAction,
    IDLE_COMMERCIAL_STATE
  );
  const [getSubState, getSubAction, getSubPending] = useActionState(
    getSubscriptionAction,
    IDLE_COMMERCIAL_STATE
  );
  const [previewChangeState, previewChangeAction, previewChangePending] = useActionState(
    previewSubscriptionChangeAction,
    IDLE_COMMERCIAL_STATE
  );
  const [confirmChangeState, confirmChangeAction, confirmChangePending] = useActionState(
    confirmSubscriptionChangeAction,
    IDLE_COMMERCIAL_STATE
  );
  const [evalProgramState, evalProgramAction, evalProgramPending] = useActionState(
    createEvaluationProgramAction,
    IDLE_COMMERCIAL_STATE
  );
  const [usageEventState, usageEventAction, usageEventPending] = useActionState(
    recordUsageEventAction,
    IDLE_COMMERCIAL_STATE
  );
  const [entitlementState, entitlementAction, entitlementPending] = useActionState(
    resolveEntitlementAction,
    IDLE_COMMERCIAL_STATE
  );
  const [overlayState, overlayAction, overlayPending] = useActionState(
    createOverlayAction,
    IDLE_COMMERCIAL_STATE
  );
  const [transferState, transferAction, transferPending] = useActionState(
    transferBillingSourceAction,
    IDLE_COMMERCIAL_STATE
  );
  const [evalCommercialEntitlementState, evalCommercialEntitlementFormAction, evalCommercialEntitlementPending] = useActionState(
    evaluateCommercialEntitlementAction,
    IDLE_COMMERCIAL_STATE
  );
  const [openBillingAccountState, openBillingAccountFormAction, openBillingAccountPending] = useActionState(
    openBillingAccountAction,
    IDLE_COMMERCIAL_STATE
  );
  const [getInvoiceState, getInvoiceFormAction, getInvoicePending] = useActionState(
    getInvoiceAction,
    IDLE_COMMERCIAL_STATE
  );

  // Active Loaded Objects
  const [activeAccount, setActiveAccount] = useState<CommercialAccount | null>(null);
  const [activeMemberships, setActiveMemberships] = useState<Membership[]>([]);
  const [activeCatalog, setActiveCatalog] = useState<PriceCatalog | null>(null);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [activeSubscription, setActiveSubscription] = useState<CommercialSubscription | null>(null);
  const [activeEntitlement, setActiveEntitlement] = useState<ResolvedEntitlement | null>(null);
  const [activeStatusEvents, setActiveStatusEvents] = useState<SubscriptionStatusEvent[]>([]);
  const [activeChangeRequest, setActiveChangeRequest] = useState<SubscriptionChangeRequest | null>(null);

  // Account Intake Form Fields
  const [orgId, setOrgId] = useState(initialTenantId);
  const [legalCustomerName, setLegalCustomerName] = useState("Acme Global Enterprises Ltd");
  const [billingCurrency, setBillingCurrency] = useState("USD");
  const [contactEmail, setContactEmail] = useState("billing@acmeglobal.com");
  const [contractRef, setContractRef] = useState("AG-2026-MSA-001");
  const [processorRef, setProcessorRef] = useState("cus_stripe_acme99");

  // Membership Form Fields
  const [memberPrincipal, setMemberPrincipal] = useState("33333333-3333-3333-3333-333333333333");
  const [memberWorkspace, setMemberWorkspace] = useState("");
  const [memberEntity, setMemberEntity] = useState("");

  // Catalog & Plan Form Fields
  const [catCode, setCatCode] = useState("CAT-2026-Q1");
  const [planCode, setPlanCode] = useState("ENTERPRISE-PRO");
  const [displayName, setDisplayName] = useState("Enterprise Pro Suite");
  const [planPrice, setPlanPrice] = useState("999.00");
  // Backend's canonical set is exactly MONTH | QUARTER | YEAR
  // (domain.ValidateDraftHeader) — never "MONTHLY".
  const [planBillingInterval, setPlanBillingInterval] = useState<"MONTH" | "QUARTER" | "YEAR">("MONTH");
  const [planMetric, setPlanMetric] = useState("api_calls_monthly");
  const [planLimit, setPlanLimit] = useState("50000");

  // Subscription Tabs
  const [subTab, setSubTab] = useState<"provision" | "dunning" | "change_plan" | "overlay" | "transfer" | "pricebook" | "billing">("provision");

  // Dunning Form
  const [targetStatus, setTargetStatus] = useState("PAST_DUE");
  const [dunningReason, setDunningReason] = useState("Primary card processor chargeback / failure");

  // Overlay Form
  const [overlayMetric, setOverlayMetric] = useState("api_calls_monthly");
  const [overlayLimit, setOverlayLimit] = useState("250000");
  const [overlayLegalRef, setOverlayLegalRef] = useState("ENTERPRISE-SOW-2026-AMEND1");

  // Transfer Form
  const [transferSource, setTransferSource] = useState("ZOIKO_ONE_BUNDLE");

  // Step A2 Subscription Form Fields
  const [subAccountId, setSubAccountId] = useState("");
  const [subPlanId, setSubPlanId] = useState("");

  // Dunning Form Fields
  const [dunningSubId, setDunningSubId] = useState("");

  // Plan Change Form Fields
  const [lookupSubId, setLookupSubId] = useState("");
  const [changeSubId, setChangeSubId] = useState("");
  const [changeTargetPlanId, setChangeTargetPlanId] = useState("");
  const [changeRequestIdInput, setChangeRequestIdInput] = useState("");

  // Evaluation Program Form Fields
  const [evalProgramSubId, setEvalProgramSubId] = useState("");
  const [evalDurationDays, setEvalDurationDays] = useState("30");
  const [evalConversionPolicy, setEvalConversionPolicy] = useState("AUTO_CONVERT");
  const [evalExpiryAction, setEvalExpiryAction] = useState("SUSPEND");

  // Usage Event Form Fields
  const [usageEventSubId, setUsageEventSubId] = useState("");
  const [usageEventId, setUsageEventId] = useState("use-2026-001");
  const [usageMetricType, setUsageMetricType] = useState("api_calls_monthly");
  const [usageQuantity, setUsageQuantity] = useState("1500");
  const [usageSourceService, setUsageSourceService] = useState("commercial-account-svc-console");

  // Overlay & Entitlement Form Fields
  const [entitlementSubId, setEntitlementSubId] = useState("");
  const [overlayAccountId, setOverlayAccountId] = useState("");

  // Transfer Form Fields
  const [transferAccountId, setTransferAccountId] = useState("");
  const [transferOldSubId, setTransferOldSubId] = useState("");

  // Sync state
  useEffect(() => {
    if (accountState.status === "success" && accountState.account) {
      setActiveAccount(accountState.account);
    }
  }, [accountState]);

  useEffect(() => {
    if (getAccountState.status === "success" && getAccountState.account) {
      setActiveAccount(getAccountState.account);
    }
  }, [getAccountState]);

  useEffect(() => {
    if (membershipState.status === "success" && membershipState.memberships) {
      setActiveMemberships(membershipState.memberships);
    }
  }, [membershipState]);

  useEffect(() => {
    if (deactivateState.status === "success" && deactivateState.memberships) {
      setActiveMemberships(deactivateState.memberships);
    }
  }, [deactivateState]);

  useEffect(() => {
    if (listMemberState.status === "success" && listMemberState.memberships) {
      setActiveMemberships(listMemberState.memberships);
    }
  }, [listMemberState]);

  useEffect(() => {
    if (catalogPlanState.status === "success") {
      if (catalogPlanState.catalog) setActiveCatalog(catalogPlanState.catalog);
      if (catalogPlanState.plan) setActivePlan(catalogPlanState.plan);
    }
  }, [catalogPlanState]);

  useEffect(() => {
    if (subState.status === "success" && subState.subscription) {
      setActiveSubscription(subState.subscription);
    }
  }, [subState]);

  useEffect(() => {
    if (statusState.status === "success" && statusState.subscription) {
      setActiveSubscription(statusState.subscription);
      if (statusState.statusEvents) setActiveStatusEvents(statusState.statusEvents);
    }
  }, [statusState]);

  useEffect(() => {
    if (entitlementState.status === "success" && entitlementState.entitlement) {
      setActiveEntitlement(entitlementState.entitlement);
    }
  }, [entitlementState]);

  useEffect(() => {
    if (getSubState.status === "success" && getSubState.subscription) {
      setActiveSubscription(getSubState.subscription);
    }
  }, [getSubState]);

  useEffect(() => {
    if (previewChangeState.status === "success" && previewChangeState.changeRequest) {
      setActiveChangeRequest(previewChangeState.changeRequest);
    }
  }, [previewChangeState]);

  useEffect(() => {
    if (confirmChangeState.status === "success" && confirmChangeState.changeRequest) {
      setActiveChangeRequest(confirmChangeState.changeRequest);
      if (activeSubscription) {
        setActiveSubscription({ ...activeSubscription, plan_id: confirmChangeState.changeRequest.target_plan_id });
      }
    }
  }, [confirmChangeState]);

  useEffect(() => {
    if (transferState.status === "success" && transferState.transfer) {
      const newSubId = transferState.transfer.new_subscription_id;
      if (newSubId) {
        setDunningSubId(newSubId);
        setEntitlementSubId(newSubId);
        setTransferOldSubId(newSubId);
      }
      if (activeSubscription && newSubId) {
        setActiveSubscription({
          ...activeSubscription,
          subscription_id: newSubId,
          billing_source: transferState.transfer.new_billing_source as BillingSource,
          status: "ACTIVE",
        });
      }
    }
  }, [transferState]);

  // Sync active objects to input fields
  useEffect(() => {
    if (activeAccount?.commercial_account_id) {
      setSubAccountId(activeAccount.commercial_account_id);
      setOverlayAccountId(activeAccount.commercial_account_id);
      setTransferAccountId(activeAccount.commercial_account_id);
    }
  }, [activeAccount]);

  useEffect(() => {
    if (activePlan?.plan_id) {
      setSubPlanId(activePlan.plan_id);
    }
  }, [activePlan]);

  useEffect(() => {
    if (activeSubscription?.subscription_id) {
      setDunningSubId(activeSubscription.subscription_id);
      setEntitlementSubId(activeSubscription.subscription_id);
      setTransferOldSubId(activeSubscription.subscription_id);
      setLookupSubId(activeSubscription.subscription_id);
      setChangeSubId(activeSubscription.subscription_id);
      setEvalProgramSubId(activeSubscription.subscription_id);
      setUsageEventSubId(activeSubscription.subscription_id);
    }
  }, [activeSubscription]);

  useEffect(() => {
    if (activeChangeRequest?.change_request_id) {
      setChangeRequestIdInput(activeChangeRequest.change_request_id);
    }
  }, [activeChangeRequest]);

  // Auto-fetch memberships roster whenever orgId changes
  useEffect(() => {
    if (orgId) {
      startTransition(() => {
        const form = new FormData();
        form.append("organization_id", orgId);
        listMemberAction(form);
      });
    }
  }, [orgId]);

  // Fast Presets
  const applyPreset = (type: "acme" | "fintech_eu" | "uk_ops") => {
    switch (type) {
      case "acme":
        setOrgId(initialTenantId);
        setLegalCustomerName("Acme Global Enterprises Ltd");
        setBillingCurrency("USD");
        setContactEmail("billing@acmeglobal.com");
        setContractRef("AG-2026-MSA-001");
        setProcessorRef("cus_stripe_acme99");
        break;
      case "fintech_eu":
        setOrgId("22222222-2222-2222-2222-222222222222");
        setLegalCustomerName("Zoiko Fintech Germany GmbH");
        setBillingCurrency("EUR");
        setContactEmail("invoicing@zoikofintech.de");
        setContractRef("EU-2026-FIN-441");
        setProcessorRef("cus_stripe_eu_441");
        break;
      case "uk_ops":
        setOrgId("33333333-3333-3333-3333-333333333333");
        setLegalCustomerName("Zoiko Suite UK Operations Plc");
        setBillingCurrency("GBP");
        setContactEmail("accounts@zoiko.co.uk");
        setContractRef("UK-2026-OPS-11");
        setProcessorRef("cus_stripe_uk_11");
        break;
    }
  };

  // Active banner feedback tracking latest triggered operation
  const [latestFeedback, setLatestFeedback] = useState<CommercialAccountActionState | null>(null);

  useEffect(() => { if (accountState.status !== "idle") setLatestFeedback(accountState); }, [accountState]);
  useEffect(() => { if (getAccountState.status !== "idle") setLatestFeedback(getAccountState); }, [getAccountState]);
  useEffect(() => { if (membershipState.status !== "idle") setLatestFeedback(membershipState); }, [membershipState]);
  useEffect(() => { if (deactivateState.status !== "idle") setLatestFeedback(deactivateState); }, [deactivateState]);
  useEffect(() => { if (listMemberState.status !== "idle") setLatestFeedback(listMemberState); }, [listMemberState]);
  useEffect(() => { if (catalogPlanState.status !== "idle") setLatestFeedback(catalogPlanState); }, [catalogPlanState]);
  useEffect(() => { if (subState.status !== "idle") setLatestFeedback(subState); }, [subState]);
  useEffect(() => { if (statusState.status !== "idle") setLatestFeedback(statusState); }, [statusState]);
  useEffect(() => { if (entitlementState.status !== "idle") setLatestFeedback(entitlementState); }, [entitlementState]);
  useEffect(() => { if (overlayState.status !== "idle") setLatestFeedback(overlayState); }, [overlayState]);
  useEffect(() => { if (transferState.status !== "idle") setLatestFeedback(transferState); }, [transferState]);

  const getSubStatusBadge = (status?: string) => {
    switch (status) {
      case "ACTIVE":
        return <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">ACTIVE</span>;
      case "EVALUATION":
        return <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">EVALUATION</span>;
      case "PAST_DUE":
        return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">PAST_DUE</span>;
      case "RESTRICTED":
        return <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-800 dark:bg-orange-950 dark:text-orange-300">RESTRICTED</span>;
      case "SUSPENDED":
        return <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">SUSPENDED</span>;
      case "CANCELED":
      case "TERMINATED":
        return <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-300">{status}</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Top Header & Fast Presets ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-700/10 dark:bg-amber-950/60 dark:text-amber-400">
              Plane 1: commercial-account-svc (:8144)
            </span>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Commercial Accounts, Subscriptions & Entitlements
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Verified customer billing identities (doc7 §A4), memberships (deactivate-only, §A6), 7-state dunning (§29), and double-billing structural protection (§P3).
          </p>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
            <Zap className="h-3 w-3 text-amber-500" /> Presets:
          </span>
          <button
            type="button"
            onClick={() => applyPreset("acme")}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            Acme Corp (USD)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("fintech_eu")}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            Fintech GmbH (EUR)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("uk_ops")}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            Zoiko UK (GBP)
          </button>
        </div>
      </div>

      {/* ── Feedback Banner ── */}
      {latestFeedback && latestFeedback.status !== "idle" && (
        <ResultBanner
          tone={latestFeedback.status === "success" ? "success" : "error"}
          message={latestFeedback.message || "Operation completed."}
        />
      )}

      {/* ── Statutory Invariants Alert ── */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-900 dark:text-amber-200">
            <span className="font-bold text-amber-950 dark:text-amber-100">
              Five-Plane Trust Doctrine & Structural Invariants:
            </span>{" "}
            (1) <span className="font-bold">One Customer Record Rule</span> (doc7 §A4): An organization has at most ONE verified commercial account; duplicate creation fails with HTTP 409. (2) <span className="font-bold">Deactivate-Only Memberships</span> (§A6): Historical attribution rows are never deleted. (3) <span className="font-bold">Double-Charge Prevention</span> (§P3): An account can have at most ONE active subscription; direct double-subscriptions fail with 409. (4) <span className="font-bold">Dunning State Machine</span>: Transitions are validated fail-closed; direct jumps like ACTIVE &rarr; RESTRICTED are strictly refused.
          </div>
        </div>
      </div>

      {/* ── Main Two-Column Layout ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (Forms & Actions) */}
        <div className="space-y-6 lg:col-span-7">
          {/* ── Card 1: Commercial Customer Account Intake ── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white">
                    1
                  </span>
                  <CardTitle className="text-base">Commercial Customer Account (Plane 1)</CardTitle>
                </div>
                <span className="text-xs font-medium text-slate-500">POST /v1/commercial-accounts</span>
              </div>
              <CardDescription>
                Register the verified customer billing identity for the organization.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={accountAction} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={LABEL}>
                      Organization ID (Tenant UUID) (<span className="text-rose-500">*</span>)
                    </label>
                    <input
                      name="organization_id"
                      type="text"
                      required
                      value={orgId}
                      onChange={(e) => setOrgId(e.target.value)}
                      className={`${FIELD} font-mono text-xs`}
                    />
                    <p className={HINT}>The stable platform tenant ID owning this commercial customer record.</p>
                  </div>

                  <div>
                    <label className={LABEL}>
                      Legal Customer Name (<span className="text-rose-500">*</span>)
                    </label>
                    <input
                      name="legal_customer_name"
                      type="text"
                      required
                      value={legalCustomerName}
                      onChange={(e) => setLegalCustomerName(e.target.value)}
                      className={FIELD}
                    />
                  </div>

                  <div>
                    <label className={LABEL}>
                      Billing Currency (<span className="text-rose-500">*</span>)
                    </label>
                    <select
                      name="billing_currency_code"
                      value={billingCurrency}
                      onChange={(e) => setBillingCurrency(e.target.value)}
                      className={FIELD}
                    >
                      <option value="USD">USD - US Dollar</option>
                      <option value="EUR">EUR - Euro</option>
                      <option value="GBP">GBP - British Pound</option>
                      <option value="CAD">CAD - Canadian Dollar</option>
                    </select>
                  </div>

                  <div>
                    <label className={LABEL}>Billing Contact Email</label>
                    <input
                      name="contact_email"
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className={FIELD}
                    />
                  </div>

                  <div>
                    <label className={LABEL}>Contract Reference</label>
                    <input
                      name="contract_reference"
                      type="text"
                      value={contractRef}
                      onChange={(e) => setContractRef(e.target.value)}
                      className={FIELD}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className={LABEL}>Payment Processor Customer Ref</label>
                    <input
                      name="processor_customer_ref"
                      type="text"
                      value={processorRef}
                      onChange={(e) => setProcessorRef(e.target.value)}
                      className={FIELD}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={accountPending} className="flex items-center gap-2">
                    {accountPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                    <span>{accountPending ? "Registering..." : "Create Commercial Account"}</span>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* ── Card 2: Organization Memberships Roster ── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white">
                    2
                  </span>
                  <CardTitle className="text-base">Organization Memberships (Deactivate-Only)</CardTitle>
                </div>
                <span className="text-xs font-medium text-slate-500">POST /v1/memberships</span>
              </div>
              <CardDescription>
                Authoritative actor-to-organization membership relationship. Attribution is never deleted.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={membershipAction} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={LABEL}>
                      Principal ID (Actor UUID) (<span className="text-rose-500">*</span>)
                    </label>
                    <input
                      name="principal_id"
                      type="text"
                      required
                      value={memberPrincipal}
                      onChange={(e) => setMemberPrincipal(e.target.value)}
                      className={`${FIELD} font-mono text-xs`}
                    />
                  </div>

                  <div>
                    <label className={LABEL}>
                      Organization ID (<span className="text-rose-500">*</span>)
                    </label>
                    <input
                      name="organization_id"
                      type="text"
                      required
                      value={orgId}
                      onChange={(e) => setOrgId(e.target.value)}
                      className={`${FIELD} font-mono text-xs`}
                    />
                  </div>

                  <div>
                    <label className={LABEL}>Workspace ID (Optional Narrow Scope)</label>
                    <input
                      name="workspace_id"
                      type="text"
                      value={memberWorkspace}
                      onChange={(e) => setMemberWorkspace(e.target.value)}
                      placeholder="Leave blank for org-wide"
                      className={`${FIELD} font-mono text-xs`}
                    />
                  </div>

                  <div>
                    <label className={LABEL}>Legal Entity ID (Optional Narrow Scope)</label>
                    <input
                      name="legal_entity_id"
                      type="text"
                      value={memberEntity}
                      onChange={(e) => setMemberEntity(e.target.value)}
                      placeholder="Leave blank for org-wide"
                      className={`${FIELD} font-mono text-xs`}
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={listMemberPending}
                    onClick={() => {
                      startTransition(() => {
                        const form = new FormData();
                        form.append("organization_id", orgId);
                        listMemberAction(form);
                      });
                    }}
                    className="flex items-center gap-1 text-xs"
                  >
                    <RefreshCw className={`h-3 w-3 ${listMemberPending ? "animate-spin" : ""}`} />
                    <span>Refresh Roster</span>
                  </Button>

                  <Button type="submit" disabled={membershipPending} className="flex items-center gap-2">
                    {membershipPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                    <span>{membershipPending ? "Enrolling..." : "Enroll Member"}</span>
                  </Button>
                </div>
              </form>

              {/* Memberships Table */}
              {activeMemberships.length > 0 && (
                <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Enrolled Members ({activeMemberships.length})
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {activeMemberships.map((m) => (
                      <div
                        key={m.membership_id}
                        className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-2.5 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div className="space-y-0.5 truncate pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-indigo-600 font-medium">{m.principal_id}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              m.status === "ACTIVE"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                            }`}>
                              {m.status}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Membership ID: {m.membership_id}
                          </div>
                        </div>

                        {m.status === "ACTIVE" ? (
                          <form action={deactivateAction}>
                            <input type="hidden" name="membership_id" value={m.membership_id} />
                            <input type="hidden" name="organization_id" value={m.organization_id} />
                            <Button
                              type="submit"
                              variant="secondary"
                              size="sm"
                              disabled={deactivatePending}
                              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 h-7 text-xs"
                            >
                              {deactivatePending ? (
                                <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <UserX className="h-3 w-3 mr-1" />
                              )}
                              Deactivate
                            </Button>
                          </form>
                        ) : (
                          <div className="flex items-center gap-1.5 rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            <Lock className="h-3 w-3 text-slate-400" />
                            <span>Deactivated (Preserved §A6)</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Statutory Rule (doc7 §A6):</span> Historical attribution rows are permanently retained and memberships are deactivate-only. A deactivated membership cannot be re-activated directly; to restore access for an actor, enroll them as a new membership above.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Card 3: Catalogs, Subscriptions & Dunning ── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white">
                    3
                  </span>
                  <CardTitle className="text-base">Plans, Subscriptions & Dunning Control</CardTitle>
                </div>
                <span className="text-xs font-medium text-slate-500">Chunk 6 & 8</span>
              </div>
              <CardDescription>
                Manage immutable pricing catalogs, subscriptions, canonical dunning state transitions, and contract overlays.
              </CardDescription>

              {/* Sub-tab Switcher */}
              <div className="mt-3 flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setSubTab("provision")}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                    subTab === "provision"
                      ? "bg-white text-amber-700 shadow-sm dark:bg-slate-800 dark:text-amber-400"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  }`}
                >
                  3A. Catalog & Sub
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab("dunning")}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                    subTab === "dunning"
                      ? "bg-white text-amber-700 shadow-sm dark:bg-slate-800 dark:text-amber-400"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  }`}
                >
                  3B. Dunning State Machine
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab("change_plan")}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                    subTab === "change_plan"
                      ? "bg-white text-amber-700 shadow-sm dark:bg-slate-800 dark:text-amber-400"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  }`}
                >
                  3C. Plan Change
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab("overlay")}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                    subTab === "overlay"
                      ? "bg-white text-amber-700 shadow-sm dark:bg-slate-800 dark:text-amber-400"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  }`}
                >
                  3D. Entitlement & Overlay
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab("transfer")}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                    subTab === "transfer"
                      ? "bg-white text-amber-700 shadow-sm dark:bg-slate-800 dark:text-amber-400"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  }`}
                >
                  3E. Transfer
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab("pricebook")}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                    subTab === "pricebook"
                      ? "bg-white text-amber-700 shadow-sm dark:bg-slate-800 dark:text-amber-400"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  }`}
                >
                  3F. Price Book
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab("billing")}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                    subTab === "billing"
                      ? "bg-white text-amber-700 shadow-sm dark:bg-slate-800 dark:text-amber-400"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  }`}
                >
                  3G. Billing
                </button>
              </div>
            </CardHeader>

            <CardContent>
              {/* ── Sub-Tab 3A: Catalog & Subscription Provisioning ── */}
              {subTab === "provision" && (
                <div className="space-y-6">
                  {/* Step A1: Catalog & Plan */}
                  <form action={catalogPlanAction} className="space-y-3 rounded-lg border border-slate-200 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Step A1: Publish Catalog & Plan (doc7 §U1 Immutable)
                    </h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <label className={LABEL}>Catalog Code</label>
                          <button
                            type="button"
                            onClick={() => {
                              const suffix = Math.floor(100 + Math.random() * 900);
                              setCatCode(`CAT-2026-V${suffix}`);
                              setPlanCode(`PLAN-V${suffix}`);
                            }}
                            className="text-[10px] text-indigo-600 hover:underline font-semibold"
                          >
                            + New Unique Code
                          </button>
                        </div>
                        <input name="catalog_code" value={catCode} onChange={(e) => setCatCode(e.target.value)} className={FIELD} />
                        <div className="flex gap-1 pt-1">
                          {["CAT-2026-Q1", "CAT-2026-Q2", "CAT-2026-Q3"].map((code) => (
                            <button
                              key={code}
                              type="button"
                              onClick={() => {
                                setCatCode(code);
                                setPlanCode(`PLAN-${code.replace("CAT-", "")}`);
                              }}
                              className={`text-[9px] px-1 py-0.5 rounded border ${
                                catCode === code
                                  ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-bold"
                                  : "border-slate-200 text-slate-500"
                              }`}
                            >
                              {code}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className={LABEL}>Plan Code</label>
                        <input name="plan_code" value={planCode} onChange={(e) => setPlanCode(e.target.value)} className={FIELD} />
                      </div>
                      <div>
                        <label className={LABEL}>Display Name</label>
                        <input name="display_name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={FIELD} />
                      </div>
                      <div>
                        <label className={LABEL}>Base Price Amount</label>
                        <input name="base_price_amount" value={planPrice} onChange={(e) => setPlanPrice(e.target.value)} className={FIELD} />
                      </div>
                      <div>
                        <label className={LABEL}>Billing Interval</label>
                        <select
                          name="billing_interval"
                          value={planBillingInterval}
                          onChange={(e) => setPlanBillingInterval(e.target.value as "MONTH" | "QUARTER" | "YEAR")}
                          className={FIELD}
                        >
                          <option value="MONTH">Monthly</option>
                          <option value="QUARTER">Quarterly</option>
                          <option value="YEAR">Yearly</option>
                        </select>
                      </div>
                      <div>
                        <label className={LABEL}>Metric Type</label>
                        <input name="metric_type" value={planMetric} onChange={(e) => setPlanMetric(e.target.value)} className={FIELD} />
                      </div>
                      <div>
                        <label className={LABEL}>Entitlement Limit</label>
                        <input name="limit_value" value={planLimit} onChange={(e) => setPlanLimit(e.target.value)} className={FIELD} />
                      </div>
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button type="submit" variant="secondary" disabled={catalogPlanPending} className="text-xs">
                        {catalogPlanPending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                        Submit Catalog & Plan for Review
                      </Button>
                    </div>
                    {catalogPlanState.status !== "idle" && (
                      <ResultBanner
                        tone={catalogPlanState.status === "success" ? "success" : "error"}
                        message={catalogPlanState.message || "Catalog & Plan processed."}
                      />
                    )}
                  </form>

                  {/* Step A1b: Approve & Publish — must be performed by a different
                      logged-in operator than the one who submitted above. The
                      backend blocks self-approval (decider != proposer); this
                      action always uses the current session's own real identity,
                      never a fabricated one. */}
                  <form action={approvePublishAction} className="space-y-3 rounded-lg border border-amber-200 p-3 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Step A1b: Approve & Publish Price Version (requires a different operator)
                    </h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Log in as a different user than the one who submitted the version above, then approve and publish it here. The backend rejects this step with 403 if performed by the same principal who proposed it — that is Segregation of Duties working as intended, not a bug.
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 items-end">
                      <div className="sm:col-span-2">
                        <label className={LABEL}>Price Version ID</label>
                        <input
                          name="price_version_id"
                          defaultValue={activeCatalog?.catalog_version_id ?? ""}
                          placeholder="pv_..."
                          className={FIELD}
                        />
                      </div>
                      <Button type="submit" variant="secondary" disabled={approvePublishPending} className="text-xs">
                        {approvePublishPending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <UserCheck className="h-3 w-3 mr-1" />}
                        Approve & Publish (as current user)
                      </Button>
                    </div>
                    {approvePublishState.status !== "idle" && (
                      <ResultBanner
                        tone={approvePublishState.status === "success" ? "success" : "error"}
                        message={approvePublishState.message || "Approval processed."}
                      />
                    )}
                  </form>

                  {/* Step A2: Subscription Creation */}
                  <form action={subAction} className="space-y-3 rounded-lg border border-slate-200 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30">
                    <input type="hidden" name="organization_id" value={activeAccount?.organization_id ?? ""} />
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Step A2: Provision Subscription (§P3 Double-Billing Protected)
                      </h4>
                      {activeSubscription && activeSubscription.status !== "TERMINATED" && activeSubscription.status !== "CANCELED" && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.5 rounded font-medium">
                          Active Sub: {activeSubscription.subscription_id.slice(0, 8)}... ({activeSubscription.status})
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className={LABEL}>Commercial Account ID (<span className="text-rose-500">*</span>)</label>
                        <input
                          name="commercial_account_id"
                          required
                          value={subAccountId}
                          onChange={(e) => setSubAccountId(e.target.value)}
                          placeholder="Intake account above first"
                          className={`${FIELD} font-mono text-xs`}
                        />
                      </div>
                      <div>
                        <label className={LABEL}>Plan ID (<span className="text-rose-500">*</span>)</label>
                        <input
                          name="plan_id"
                          required
                          value={subPlanId}
                          onChange={(e) => setSubPlanId(e.target.value)}
                          placeholder="Publish plan above first"
                          className={`${FIELD} font-mono text-xs`}
                        />
                      </div>
                      <div>
                        <label className={LABEL}>Billing Source</label>
                        <select name="billing_source" className={FIELD}>
                          <option value="DIRECT">DIRECT (Standard billing)</option>
                          <option value="ZOIKO_ONE_BUNDLE">ZOIKO_ONE_BUNDLE (Bundled)</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2 pt-6">
                        <input type="checkbox" id="eval_check" name="start_as_evaluation" value="true" className="rounded" />
                        <label htmlFor="eval_check" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Start as EVALUATION (Trial)
                        </label>
                      </div>
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button type="submit" disabled={subPending} className="text-xs flex items-center gap-1">
                        {subPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CreditCard className="h-3 w-3" />}
                        Provision Commercial Subscription
                      </Button>
                    </div>
                    {subState.status !== "idle" && (
                      <ResultBanner
                        tone={subState.status === "success" ? "success" : "error"}
                        message={subState.message || "Subscription processed."}
                      />
                    )}
                  </form>

                  {/* Step A3: Evaluation Program (doc7 §B3 trial terms) */}
                  <form action={evalProgramAction} className="space-y-3 rounded-lg border border-slate-200 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Step A3: Register Evaluation Program (required for a real EVALUATION trial, doc7 §B3)
                    </h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className={LABEL}>Subscription ID (<span className="text-rose-500">*</span>)</label>
                        <input
                          name="subscription_id"
                          required
                          value={evalProgramSubId}
                          onChange={(e) => setEvalProgramSubId(e.target.value)}
                          placeholder="Provision an EVALUATION subscription above first"
                          className={`${FIELD} font-mono text-xs`}
                        />
                      </div>
                      <div>
                        <label className={LABEL}>Duration (Days) (<span className="text-rose-500">*</span>)</label>
                        <input
                          name="duration_days"
                          type="number"
                          min="1"
                          required
                          value={evalDurationDays}
                          onChange={(e) => setEvalDurationDays(e.target.value)}
                          className={FIELD}
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-6">
                        <input type="checkbox" id="eval_payment_required" name="payment_required" value="true" className="rounded" />
                        <label htmlFor="eval_payment_required" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Payment method required during trial
                        </label>
                      </div>
                      <div>
                        <label className={LABEL}>Conversion Policy (<span className="text-rose-500">*</span>)</label>
                        <select name="conversion_policy" value={evalConversionPolicy} onChange={(e) => setEvalConversionPolicy(e.target.value)} className={FIELD}>
                          <option value="AUTO_CONVERT">AUTO_CONVERT</option>
                          <option value="MANUAL">MANUAL</option>
                          <option value="EXPIRE">EXPIRE</option>
                        </select>
                      </div>
                      <div>
                        <label className={LABEL}>Expiry Action (<span className="text-rose-500">*</span>)</label>
                        <select name="expiry_action" value={evalExpiryAction} onChange={(e) => setEvalExpiryAction(e.target.value)} className={FIELD}>
                          <option value="SUSPEND">SUSPEND</option>
                          <option value="CANCEL">CANCEL</option>
                          <option value="CONVERT">CONVERT</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button type="submit" variant="secondary" disabled={evalProgramPending} className="text-xs">
                        {evalProgramPending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
                        Register Evaluation Program
                      </Button>
                    </div>
                    {evalProgramState.status !== "idle" && (
                      <ResultBanner
                        tone={evalProgramState.status === "success" ? "success" : "error"}
                        message={evalProgramState.message || "Evaluation program processed."}
                      />
                    )}
                  </form>

                  {/* Step A4: Record Usage Event (doc7 §L1 metering) */}
                  <form action={usageEventAction} className="space-y-3 rounded-lg border border-slate-200 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Step A4: Record Usage Event (metering, idempotent per doc7 §L1)
                    </h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className={LABEL}>Subscription ID (<span className="text-rose-500">*</span>)</label>
                        <input
                          name="subscription_id"
                          required
                          value={usageEventSubId}
                          onChange={(e) => setUsageEventSubId(e.target.value)}
                          placeholder="Provision subscription above first"
                          className={`${FIELD} font-mono text-xs`}
                        />
                      </div>
                      <div>
                        <label className={LABEL}>Usage Event ID (idempotency key) (<span className="text-rose-500">*</span>)</label>
                        <div className="flex gap-2">
                          <input
                            name="usage_event_id"
                            required
                            value={usageEventId}
                            onChange={(e) => setUsageEventId(e.target.value)}
                            className={`${FIELD} font-mono text-xs`}
                          />
                          <button
                            type="button"
                            onClick={() => setUsageEventId(`use-${Date.now()}-${Math.floor(Math.random() * 1000)}`)}
                            className="shrink-0 text-[10px] text-indigo-600 hover:underline font-semibold"
                          >
                            New ID
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className={LABEL}>Metric Type (<span className="text-rose-500">*</span>)</label>
                        <input name="metric_type" required value={usageMetricType} onChange={(e) => setUsageMetricType(e.target.value)} className={FIELD} />
                      </div>
                      <div>
                        <label className={LABEL}>Quantity</label>
                        <input name="quantity" type="number" step="0.01" min="0" value={usageQuantity} onChange={(e) => setUsageQuantity(e.target.value)} className={FIELD} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={LABEL}>Source Service (<span className="text-rose-500">*</span>)</label>
                        <input name="source_service" required value={usageSourceService} onChange={(e) => setUsageSourceService(e.target.value)} className={FIELD} />
                      </div>
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button type="submit" variant="secondary" disabled={usageEventPending} className="text-xs">
                        {usageEventPending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Database className="h-3 w-3 mr-1" />}
                        Record Usage Event
                      </Button>
                    </div>
                    {usageEventState.status !== "idle" && (
                      <ResultBanner
                        tone={usageEventState.status === "success" ? "success" : "error"}
                        message={usageEventState.message || "Usage event processed."}
                      />
                    )}
                  </form>
                </div>
              )}

              {/* ── Sub-Tab 3B: Dunning State Machine ── */}
              {subTab === "dunning" && (
                <form action={statusAction} className="space-y-4">
                  <input type="hidden" name="organization_id" value={activeAccount?.organization_id ?? ""} />
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                    <span className="font-bold">Dunning Rules (§O1-O3):</span> Only legal state transitions are permitted. For example, from <span className="font-mono">ACTIVE</span> you may transition to <span className="font-mono">PAST_DUE</span> or <span className="font-mono">CANCELED</span>. Attempting an illegal direct jump like <span className="font-mono">ACTIVE &rarr; RESTRICTED</span> will trigger a 409 Refusal!
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={LABEL}>Subscription ID (<span className="text-rose-500">*</span>)</label>
                      <input
                        name="subscription_id"
                        required
                        value={dunningSubId}
                        onChange={(e) => setDunningSubId(e.target.value)}
                        placeholder="Provision subscription first"
                        className={`${FIELD} font-mono text-xs`}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Target Status (<span className="text-rose-500">*</span>)</label>
                      <select
                        name="new_status"
                        value={targetStatus}
                        onChange={(e) => setTargetStatus(e.target.value)}
                        className={FIELD}
                      >
                        <option value="PAST_DUE">PAST_DUE (Payment failed - legal transition from ACTIVE)</option>
                        <option value="RESTRICTED">RESTRICTED (Illegal directly from ACTIVE - negative test)</option>
                        <option value="SUSPENDED">SUSPENDED (Access revoked)</option>
                        <option value="ACTIVE">ACTIVE (Recovered / payment retry succeeded)</option>
                        <option value="CANCELED">CANCELED (Customer canceled)</option>
                        <option value="TERMINATED">TERMINATED (Final terminal state)</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={LABEL}>Dunning Reason / Audit Note</label>
                      <input
                        name="reason"
                        value={dunningReason}
                        onChange={(e) => setDunningReason(e.target.value)}
                        className={FIELD}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={statusPending} className="text-xs flex items-center gap-1">
                      {statusPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <TrendingUp className="h-3 w-3" />}
                      Execute Status Transition
                    </Button>
                  </div>
                  {statusState.status !== "idle" && (
                    <ResultBanner
                      tone={statusState.status === "success" ? "success" : "error"}
                      message={statusState.message || "Status transition processed."}
                    />
                  )}
                </form>
              )}

              {/* ── Sub-Tab 3C: Direct Lookup & Governed Plan Change ── */}
              {subTab === "change_plan" && (
                <div className="space-y-6">
                  {/* Direct Subscription Lookup */}
                  <form action={getSubAction} className="space-y-3 rounded-lg border border-slate-200 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Direct Subscription Lookup (GET /v1/subscriptions/&#123;id&#125;)
                    </h4>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        name="subscription_id"
                        required
                        value={lookupSubId}
                        onChange={(e) => setLookupSubId(e.target.value)}
                        placeholder="Paste Subscription UUID"
                        className={`${FIELD} font-mono text-xs`}
                      />
                      <Button type="submit" variant="secondary" disabled={getSubPending} className="shrink-0 text-xs">
                        {getSubPending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                        Look Up Subscription
                      </Button>
                    </div>
                    {getSubState.status !== "idle" && (
                      <ResultBanner
                        tone={getSubState.status === "success" ? "success" : "error"}
                        message={getSubState.message || "Subscription lookup processed."}
                      />
                    )}
                  </form>

                  {/* Preview Subscription Change */}
                  <form action={previewChangeAction} className="space-y-3 rounded-lg border border-slate-200 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Step B1: Preview Subscription Change (POST /v1/subscription-change-requests)
                    </h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className={LABEL}>Subscription ID (<span className="text-rose-500">*</span>)</label>
                        <input
                          name="subscription_id"
                          required
                          value={changeSubId}
                          onChange={(e) => setChangeSubId(e.target.value)}
                          placeholder="Provision subscription first"
                          className={`${FIELD} font-mono text-xs`}
                        />
                      </div>
                      <div>
                        <label className={LABEL}>Target Plan ID (<span className="text-rose-500">*</span>)</label>
                        <input
                          name="target_plan_id"
                          required
                          value={changeTargetPlanId}
                          onChange={(e) => setChangeTargetPlanId(e.target.value)}
                          placeholder="Publish a new plan above first"
                          className={`${FIELD} font-mono text-xs`}
                        />
                      </div>
                      <div>
                        <label className={LABEL}>Effective At <span className="text-slate-400">(optional)</span></label>
                        <input
                          name="effective_at"
                          type="datetime-local"
                          className={FIELD}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button type="submit" variant="secondary" disabled={previewChangePending} className="text-xs">
                        {previewChangePending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <ArrowRight className="h-3 w-3 mr-1" />}
                        Preview Change
                      </Button>
                    </div>
                    {previewChangeState.status !== "idle" && (
                      <ResultBanner
                        tone={previewChangeState.status === "success" ? "success" : "error"}
                        message={previewChangeState.message || "Change preview processed."}
                      />
                    )}
                  </form>

                  {/* Confirm Subscription Change */}
                  <form action={confirmChangeAction} className="space-y-3 rounded-lg border border-slate-200 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Step B2: Confirm & Apply Change (POST /v1/subscription-change-requests/&#123;id&#125;/confirm)
                    </h4>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        name="change_request_id"
                        required
                        value={changeRequestIdInput}
                        onChange={(e) => setChangeRequestIdInput(e.target.value)}
                        placeholder="Preview a change above first"
                        className={`${FIELD} font-mono text-xs`}
                      />
                      <Button type="submit" disabled={confirmChangePending} className="shrink-0 text-xs">
                        {confirmChangePending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                        Confirm Change
                      </Button>
                    </div>
                    {activeChangeRequest && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Latest change request: {activeChangeRequest.change_request_id.slice(0, 8)}… → plan {activeChangeRequest.target_plan_id.slice(0, 8)}… ({activeChangeRequest.status})
                      </p>
                    )}
                    {confirmChangeState.status !== "idle" && (
                      <ResultBanner
                        tone={confirmChangeState.status === "success" ? "success" : "error"}
                        message={confirmChangeState.message || "Change confirmation processed."}
                      />
                    )}
                  </form>
                </div>
              )}

              {/* ── Sub-Tab 3D: Entitlement & Contract Overlay ── */}
              {subTab === "overlay" && (
                <div className="space-y-6">
                  {/* Resolve Entitlement */}
                  <form action={entitlementAction} className="space-y-3 rounded-lg border border-slate-200 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30">
                    <input type="hidden" name="organization_id" value={activeAccount?.organization_id ?? ""} />
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Query Live Entitlement (Resolves Plan Limit vs Contract Overlay)
                    </h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className={LABEL}>Subscription ID</label>
                        <input
                          name="subscription_id"
                          value={entitlementSubId}
                          onChange={(e) => setEntitlementSubId(e.target.value)}
                          className={`${FIELD} font-mono text-xs`}
                        />
                      </div>
                      <div>
                        <label className={LABEL}>Metric Type</label>
                        <input name="metric_type" value={planMetric} onChange={(e) => setPlanMetric(e.target.value)} className={FIELD} />
                      </div>
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button type="submit" variant="secondary" disabled={entitlementPending} className="text-xs">
                        {entitlementPending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                        Resolve Entitlement
                      </Button>
                    </div>
                    {entitlementState.status !== "idle" && (
                      <ResultBanner
                        tone={entitlementState.status === "success" ? "success" : "error"}
                        message={entitlementState.message || "Entitlement resolved."}
                      />
                    )}
                  </form>

                  {/* COM-03: Evaluate Commercial Entitlement (dry-run capability check) */}
                  <form action={evalCommercialEntitlementFormAction} className="space-y-3 rounded-lg border border-slate-200 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30">
                    <input type="hidden" name="organization_id" value={activeAccount?.organization_id ?? ""} />
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      COM-03: Evaluate Commercial Entitlement (Capability Decision)
                    </h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className={LABEL}>Capability Key</label>
                        <input name="capability_key" defaultValue="api_access" className={FIELD} />
                      </div>
                      <div>
                        <label className={LABEL}>Requested Quantity (optional)</label>
                        <input name="requested_quantity" type="number" className={FIELD} />
                      </div>
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button type="submit" variant="secondary" disabled={evalCommercialEntitlementPending} className="text-xs">
                        {evalCommercialEntitlementPending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                        Evaluate Entitlement
                      </Button>
                    </div>
                    {evalCommercialEntitlementState.status !== "idle" && (
                      <ResultBanner
                        tone={evalCommercialEntitlementState.status === "success" ? "success" : "error"}
                        message={evalCommercialEntitlementState.message || "Entitlement evaluated."}
                      />
                    )}
                  </form>

                  {/* Create Contract Overlay */}
                  <form action={overlayAction} className="space-y-3 rounded-lg border border-slate-200 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30">
                    <input type="hidden" name="organization_id" value={activeAccount?.organization_id ?? ""} />
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Create Contract Entitlement Overlay (Bespoke Enterprise Terms per doc7 §B6)
                    </h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className={LABEL}>Commercial Account ID</label>
                        <input
                          name="commercial_account_id"
                          value={overlayAccountId}
                          onChange={(e) => setOverlayAccountId(e.target.value)}
                          className={`${FIELD} font-mono text-xs`}
                        />
                      </div>
                      <div>
                        <label className={LABEL}>Metric Type</label>
                        <input name="metric_type" value={overlayMetric} onChange={(e) => setOverlayMetric(e.target.value)} className={FIELD} />
                      </div>
                      <div>
                        <label className={LABEL}>Override Limit Value</label>
                        <input name="override_limit_value" value={overlayLimit} onChange={(e) => setOverlayLimit(e.target.value)} className={FIELD} />
                      </div>
                      <div className="sm:col-span-3">
                        <label className={LABEL}>Legal Contract Reference</label>
                        <input name="legal_reference" value={overlayLegalRef} onChange={(e) => setOverlayLegalRef(e.target.value)} className={FIELD} />
                      </div>
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button type="submit" disabled={overlayPending} className="text-xs">
                        {overlayPending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
                        Apply Contract Overlay
                      </Button>
                    </div>
                    {overlayState.status !== "idle" && (
                      <ResultBanner
                        tone={overlayState.status === "success" ? "success" : "error"}
                        message={overlayState.message || "Overlay processed."}
                      />
                    )}
                  </form>
                </div>
              )}

              {/* ── Sub-Tab 3E: Billing Source Transfer ── */}
              {subTab === "transfer" && (
                <form action={transferAction} className="space-y-4">
                  <input type="hidden" name="organization_id" value={activeAccount?.organization_id ?? ""} />
                  <input type="hidden" name="target_plan_id" value={activePlan?.plan_id ?? subPlanId} />
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    <span className="font-bold">Billing Source Transfer (doc7 §P3):</span> Atomically cancels the existing subscription and provisions a new one on the target billing source (e.g. migrating Standalone Direct to Zoiko One Bundle), guaranteeing zero double-billing.
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={LABEL}>Commercial Account ID</label>
                      <input
                        name="commercial_account_id"
                        value={transferAccountId}
                        onChange={(e) => setTransferAccountId(e.target.value)}
                        className={`${FIELD} font-mono text-xs`}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Existing Subscription ID (Optional)</label>
                      <input
                        name="old_subscription_id"
                        value={transferOldSubId}
                        onChange={(e) => setTransferOldSubId(e.target.value)}
                        className={`${FIELD} font-mono text-xs`}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>New Billing Source</label>
                      <select
                        name="new_billing_source"
                        value={transferSource}
                        onChange={(e) => setTransferSource(e.target.value)}
                        className={FIELD}
                      >
                        <option value="ZOIKO_ONE_BUNDLE">ZOIKO_ONE_BUNDLE</option>
                        <option value="DIRECT">DIRECT</option>
                      </select>
                    </div>
                    <div>
                      <label className={LABEL}>Credit / Adjustment Amount</label>
                      <input name="credit_amount" defaultValue="0.00" className={FIELD} />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={transferPending} className="text-xs">
                      {transferPending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Layers className="h-3 w-3 mr-1" />}
                      Execute Billing Source Transfer
                    </Button>
                  </div>
                  {transferState.status !== "idle" && (
                    <ResultBanner
                      tone={transferState.status === "success" ? "success" : "error"}
                      message={transferState.message || "Transfer processed."}
                    />
                  )}
                </form>
              )}

              {/* ── Sub-Tab 3F: COM-01 Price Book Architecture & Lifecycles ── */}
              {subTab === "pricebook" && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <Layers className="h-4 w-4 text-amber-600" />
                          COM-01 Price Book Specification (ZS-SVC-Q-001 §4.1)
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Multi-currency immutable price versions, price components, and maker-checker segregation of duties.
                        </p>
                      </div>
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        COM-CTRL-001..006 Enforced
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 text-xs">
                      <div className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Price Version Lifecycle Invariants</div>
                        <div className="flex items-center gap-1.5 py-1 text-[11px] text-slate-600 dark:text-slate-400">
                          <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">DRAFT</span> → 
                          <span className="font-mono bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-1 py-0.5 rounded">REVIEW</span> → 
                          <span className="font-mono bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 px-1 py-0.5 rounded">APPROVED</span> → 
                          <span className="font-mono bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-1 py-0.5 rounded">PUBLISHED</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                          Published versions are strictly immutable. Deletions or component mutations return HTTP 409.
                        </p>
                      </div>

                      <div className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Segregation of Duties (SoD)</div>
                        <div className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span>Maker-Checker Enforced: Proposer != Approver</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                          Self-approval attempts return HTTP 403 Forbidden fail-closed per COM-CTRL-004.
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                        Active Price Book Endpoints
                      </div>
                      <div className="space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        <div><span className="text-emerald-600 font-bold">POST</span> /v1/commercial/products <span className="text-slate-400 font-sans">(Create catalog product)</span></div>
                        <div><span className="text-emerald-600 font-bold">POST</span> /v1/commercial/price-versions <span className="text-slate-400 font-sans">(Create draft version)</span></div>
                        <div><span className="text-blue-600 font-bold">PUT</span>  /v1/commercial/price-versions/&#123;id&#125;/components/&#123;key&#125; <span className="text-slate-400 font-sans">(Configure price component)</span></div>
                        <div><span className="text-purple-600 font-bold">POST</span> /v1/commercial/price-versions/&#123;id&#125;:publish <span className="text-slate-400 font-sans">(Checker publication)</span></div>
                        <div><span className="text-amber-600 font-bold">GET</span>  /v1/commercial/sellable-offers <span className="text-slate-400 font-sans">(Query active checkout pricing)</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Sub-Tab 3G: COM-05 Billing & Invoicing Engine ── */}
              {subTab === "billing" && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-emerald-600" />
                          COM-05 Billing & Platform Invoicing (ZS-SVC-Q-001 §4.5)
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Commercial billing accounts, certified invoice candidates, credit notes, and automated dunning.
                        </p>
                      </div>
                      <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                        COM-CTRL-026..030 Enforced
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 text-xs">
                      <div className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Billing Candidate Invariants</div>
                        <div className="flex items-center gap-1.5 py-1 text-[11px] text-slate-600 dark:text-slate-400">
                          <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">DRAFT</span> → 
                          <span className="font-mono bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 px-1 py-0.5 rounded">APPROVED</span> → 
                          <span className="font-mono bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-1 py-0.5 rounded">ISSUED</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                          Generator cannot approve invoice candidate (HTTP 403 CodeSoDViolation). Candidate must have certified usage basis.
                        </p>
                      </div>

                      <div className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Active Billing Account</div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400">
                          {activeAccount ? (
                            <div>
                              <span>Organization: </span>
                              <span className="font-mono font-semibold">{activeAccount.organization_id}</span>
                              <div className="mt-1">Currency: <span className="font-bold text-emerald-600">{activeAccount.billing_currency_code}</span></div>
                            </div>
                          ) : (
                            <span className="text-slate-400">Select or intake an account above</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                        Active COM-05 Billing Surface
                      </div>
                      <div className="space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        <div><span className="text-emerald-600 font-bold">POST</span> /v1/commercial/billing-accounts <span className="text-slate-400 font-sans">(Open commercial billing account)</span></div>
                        <div><span className="text-emerald-600 font-bold">POST</span> /v1/commercial/invoice-candidates:generate <span className="text-slate-400 font-sans">(Generate candidate)</span></div>
                        <div><span className="text-blue-600 font-bold">POST</span> /v1/commercial/invoice-candidates/&#123;id&#125;:approve <span className="text-slate-400 font-sans">(SoD checker approval)</span></div>
                        <div><span className="text-purple-600 font-bold">POST</span> /v1/commercial/invoices/&#123;id&#125;:collect <span className="text-slate-400 font-sans">(Initiate payment collection)</span></div>
                        <div><span className="text-amber-600 font-bold">POST</span> /v1/commercial/invoices/&#123;id&#125;:credit <span className="text-slate-400 font-sans">(Issue credit note with balance reduction)</span></div>
                      </div>
                    </div>
                  </div>

                  {/* Open Billing Account */}
                  <form action={openBillingAccountFormAction} className="space-y-3 rounded-lg border border-slate-200 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30">
                    <input type="hidden" name="organization_id" value={activeAccount?.organization_id ?? ""} />
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Open Platform Billing Account (Seller Authority)
                    </h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className={LABEL}>Selling Entity</label>
                        <input name="selling_entity" defaultValue="Zoiko Suite Inc." className={FIELD} />
                      </div>
                      <div>
                        <label className={LABEL}>Billing Currency Code</label>
                        <input name="billing_currency_code" defaultValue="USD" className={FIELD} />
                      </div>
                      <div>
                        <label className={LABEL}>Invoice Numbering Profile</label>
                        <input name="invoice_numbering_profile" defaultValue="DEFAULT" className={FIELD} />
                      </div>
                      <div>
                        <label className={LABEL}>Payment Provider Ref</label>
                        <input name="payment_provider_ref" defaultValue="stripe-default" className={FIELD} />
                      </div>
                      <div>
                        <label className={LABEL}>Accounting Mapping Key</label>
                        <input name="accounting_mapping_key" defaultValue="GL-COMMERCIAL-DEFAULT" className={FIELD} />
                      </div>
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button type="submit" variant="secondary" disabled={openBillingAccountPending} className="text-xs">
                        {openBillingAccountPending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <DollarSign className="h-3 w-3 mr-1" />}
                        Open Billing Account
                      </Button>
                    </div>
                    {openBillingAccountState.status !== "idle" && (
                      <ResultBanner
                        tone={openBillingAccountState.status === "success" ? "success" : "error"}
                        message={openBillingAccountState.message || "Billing account processed."}
                      />
                    )}
                  </form>

                  {/* Get Invoice */}
                  <form action={getInvoiceFormAction} className="space-y-3 rounded-lg border border-slate-200 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30">
                    <input type="hidden" name="organization_id" value={activeAccount?.organization_id ?? ""} />
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Retrieve Platform Invoice
                    </h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className={LABEL}>Invoice ID</label>
                        <input name="invoice_id" placeholder="inv_..." className={`${FIELD} font-mono text-xs`} />
                      </div>
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button type="submit" variant="secondary" disabled={getInvoicePending} className="text-xs">
                        {getInvoicePending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                        Get Invoice
                      </Button>
                    </div>
                    {getInvoiceState.status !== "idle" && (
                      <ResultBanner
                        tone={getInvoiceState.status === "success" ? "success" : "error"}
                        message={getInvoiceState.message || "Invoice retrieved."}
                      />
                    )}
                  </form>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Active Commercial Inspector & Lookups */}
        <div className="space-y-6 lg:col-span-5">
          {/* Active Account & Subscription Inspector */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4 text-amber-600" />
                Commercial Ledger Inspector
              </CardTitle>
              <CardDescription>
                Live Plane-1 state from <code className="text-xs">commercial_account</code> database.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeAccount || activeSubscription ? (
                <div className="space-y-4">
                  {/* Account Overview */}
                  {activeAccount && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs space-y-2 dark:border-slate-800 dark:bg-slate-900/40">
                      <div className="font-bold text-slate-800 dark:text-slate-200 border-b border-slate-200 pb-1 dark:border-slate-800">
                        Customer Account
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Account ID:</span>
                        <CopyableId value={activeAccount.commercial_account_id} />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Legal Name:</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{activeAccount.legal_customer_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Currency:</span>
                        <span className="font-bold text-amber-600">{activeAccount.billing_currency_code}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Account Status:</span>
                        <span className="font-bold text-emerald-600">{activeAccount.status}</span>
                      </div>
                    </div>
                  )}

                  {/* Subscription Overview */}
                  {activeSubscription && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs space-y-2 dark:border-slate-800 dark:bg-slate-900/40">
                      <div className="font-bold text-slate-800 dark:text-slate-200 border-b border-slate-200 pb-1 dark:border-slate-800">
                        Commercial Subscription
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Subscription ID:</span>
                        <CopyableId value={activeSubscription.subscription_id} />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Status:</span>
                        {getSubStatusBadge(activeSubscription.status)}
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Billing Source:</span>
                        <span className="font-mono text-indigo-600 font-semibold">{activeSubscription.billing_source}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Plan ID:</span>
                        <CopyableId value={activeSubscription.plan_id} />
                      </div>
                    </div>
                  )}

                  {/* Entitlement Resolution Result */}
                  {activeEntitlement && (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 text-xs space-y-1.5 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                      <div className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center justify-between">
                        <span>Resolved Entitlement: {activeEntitlement.metric_type}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          activeEntitlement.source === "OVERLAY"
                            ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                        }`}>
                          Source: {activeEntitlement.source}
                        </span>
                      </div>
                      <div className="text-base font-bold text-indigo-700 dark:text-indigo-300">
                        Limit: {activeEntitlement.limit_value ?? "UNLIMITED"}
                      </div>
                      {activeEntitlement.overlay_id && (
                        <div className="text-[10px] font-mono text-slate-500 truncate">
                          Contract Overlay: {activeEntitlement.overlay_id}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dunning Audit History */}
                  {activeStatusEvents.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1">
                        <History className="h-3 w-3" /> Dunning Transition Audit Log ({activeStatusEvents.length})
                      </h4>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {activeStatusEvents.map((evt) => (
                          <div
                            key={evt.status_event_id}
                            className="rounded border border-slate-200 bg-white p-2 text-[11px] shadow-sm dark:border-slate-800 dark:bg-slate-900"
                          >
                            <div className="flex items-center justify-between font-semibold">
                              <span>
                                <span className="text-slate-500">{evt.previous_status}</span> &rarr;{" "}
                                <span className="text-amber-700 dark:text-amber-400 font-bold">{evt.new_status}</span>
                              </span>
                              <span className="text-slate-400 text-[10px]">{new Date(evt.created_at).toLocaleTimeString()}</span>
                            </div>
                            {evt.reason && <p className="text-[10px] text-slate-500 mt-0.5">{evt.reason}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Raw JSON */}
                  <JsonBlock
                    value={{
                      account: activeAccount,
                      subscription: activeSubscription,
                      catalog: activeCatalog,
                      plan: activePlan,
                      entitlement: activeEntitlement,
                    }}
                  />
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  <CreditCard className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                  No account or subscription loaded yet. Create an account on the left.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Account Direct Lookup */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-4 w-4 text-amber-600" />
                Direct Account Lookup
              </CardTitle>
              <CardDescription>
                Fetch verified customer record from <code className="text-xs">commercial-account-svc</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={getAccountAction} className="space-y-2">
                <label className={LABEL}>Commercial Account ID (UUID)</label>
                <div className="flex gap-2">
                  <input
                    name="commercial_account_id"
                    type="text"
                    required
                    placeholder="Enter account UUID..."
                    className={FIELD}
                  />
                  <Button type="submit" variant="secondary" disabled={getAccountPending} className="shrink-0">
                    {getAccountPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
