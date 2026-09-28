"use client";

import { useState, useActionState, useEffect } from "react";
import {
  Layers,
  Sparkles,
  RefreshCw,
  Search,
  ShieldCheck,
  Building2,
  Globe,
  PlugZap,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileCheck2,
  Sliders,
  Radio,
  Clock,
  Database,
  Tag,
  ArrowRight,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from "@/components/ui";
import { FIELD, LABEL, HINT } from "@/components/admin/shared/form";
import { ResultBanner, CopyableId, JsonBlock } from "@/components/admin/shared";
import {
  createCapabilityAction,
  getCapabilityAction,
  createMarketReleaseAction,
  createIntegrationCapabilityAction,
  updateIntegrationHealthAction,
  setReleaseStateAction,
  createCapabilityClaimAction,
  resolveCapabilityAction,
} from "@/app/admin/capabilities/capability-actions";
import { IDLE_CAPABILITY_STATE, type CapabilityActionState } from "@/app/admin/capabilities/capability-state";
import type {
  Capability,
  MarketRelease,
  IntegrationCapability,
  Release,
  CapabilityClaim,
  CapabilityResolution,
} from "@/lib/api/capability-registry";

export function CapabilityWorkbench({ initialPrincipalId }: { initialPrincipalId: string }) {
  // Action States
  const [capState, capAction, capPending] = useActionState(createCapabilityAction, IDLE_CAPABILITY_STATE);
  const [getCapState, getCapAction, getCapPending] = useActionState(getCapabilityAction, IDLE_CAPABILITY_STATE);
  const [marketState, marketAction, marketPending] = useActionState(createMarketReleaseAction, IDLE_CAPABILITY_STATE);
  const [integrationState, integrationAction, integrationPending] = useActionState(createIntegrationCapabilityAction, IDLE_CAPABILITY_STATE);
  const [healthState, healthAction, healthPending] = useActionState(updateIntegrationHealthAction, IDLE_CAPABILITY_STATE);
  const [releaseState, releaseAction, releasePending] = useActionState(setReleaseStateAction, IDLE_CAPABILITY_STATE);
  const [claimState, claimAction, claimPending] = useActionState(createCapabilityClaimAction, IDLE_CAPABILITY_STATE);
  const [resolveState, resolveAction, resolvePending] = useActionState(resolveCapabilityAction, IDLE_CAPABILITY_STATE);

  // Active Selected Objects
  const [activeCapability, setActiveCapability] = useState<Capability | null>(null);
  const [activeMarketRelease, setActiveMarketRelease] = useState<MarketRelease | null>(null);
  const [activeIntegration, setActiveIntegration] = useState<IntegrationCapability | null>(null);
  const [activeIntegrations, setActiveIntegrations] = useState<IntegrationCapability[]>([]);
  const [activeRelease, setActiveRelease] = useState<Release | null>(null);
  const [activeClaims, setActiveClaims] = useState<CapabilityClaim[]>([]);
  const [activeResolution, setActiveResolution] = useState<CapabilityResolution | null>(null);

  // Sub-Tab Navigation for Card 2
  const [registryTab, setRegistryTab] = useState<"market" | "integration" | "operational" | "claims">("market");

  // Reactive feedback tracking latest triggered operation
  const [latestFeedback, setLatestFeedback] = useState<CapabilityActionState | null>(null);

  useEffect(() => { if (capState.status !== "idle") setLatestFeedback(capState); }, [capState]);
  useEffect(() => { if (getCapState.status !== "idle") setLatestFeedback(getCapState); }, [getCapState]);
  useEffect(() => { if (marketState.status !== "idle") setLatestFeedback(marketState); }, [marketState]);
  useEffect(() => { if (integrationState.status !== "idle") setLatestFeedback(integrationState); }, [integrationState]);
  useEffect(() => { if (healthState.status !== "idle") setLatestFeedback(healthState); }, [healthState]);
  useEffect(() => { if (releaseState.status !== "idle") setLatestFeedback(releaseState); }, [releaseState]);
  useEffect(() => { if (claimState.status !== "idle") setLatestFeedback(claimState); }, [claimState]);
  useEffect(() => { if (resolveState.status !== "idle") setLatestFeedback(resolveState); }, [resolveState]);

  // Sync active objects from action states
  useEffect(() => {
    if (capState.status === "success" && capState.capability) {
      setActiveCapability(capState.capability);
      setCapCodeInput(capState.capability.capability_code);
    }
  }, [capState]);

  useEffect(() => {
    if (getCapState.status === "success" && getCapState.capability) {
      setActiveCapability(getCapState.capability);
      setCapCodeInput(getCapState.capability.capability_code);
    }
  }, [getCapState]);

  useEffect(() => {
    if (marketState.status === "success" && marketState.marketRelease) {
      setActiveMarketRelease(marketState.marketRelease);
    }
  }, [marketState]);

  useEffect(() => {
    if (integrationState.status === "success") {
      if (integrationState.integration) setActiveIntegration(integrationState.integration);
      if (integrationState.integrations) setActiveIntegrations(integrationState.integrations);
    }
  }, [integrationState]);

  useEffect(() => {
    if (healthState.status === "success") {
      if (healthState.integration) {
        setActiveIntegration(healthState.integration);
      }
      if (healthState.integrations && healthState.integrations.length > 0) {
        setActiveIntegrations(healthState.integrations);
      }
    }
  }, [healthState]);

  useEffect(() => {
    if (releaseState.status === "success" && releaseState.release) {
      setActiveRelease(releaseState.release);
    }
  }, [releaseState]);

  useEffect(() => {
    if (claimState.status === "success") {
      if (claimState.claims) setActiveClaims(claimState.claims);
    }
  }, [claimState]);

  useEffect(() => {
    if (resolveState.status === "success" && resolveState.resolution) {
      setActiveResolution(resolveState.resolution);
    }
  }, [resolveState]);

  // Form Fields State
  const [capCode, setCapCode] = useState("PAYMENT_ROUTING_SEPA");
  const [moduleDomain, setModuleDomain] = useState("PAYMENTS");
  const [capVersion, setCapVersion] = useState("1");
  const [dependencies, setDependencies] = useState("BANKING_GATEWAY,LEDGER_POSTING");
  const [riskClass, setRiskClass] = useState("MEDIUM");

  // Market Release Form Fields
  const [marketCode, setMarketCode] = useState("GB");
  const [languageCode, setLanguageCode] = useState("en");
  const [legalApproval, setLegalApproval] = useState("APPROVED");
  const [marketReleaseState, setMarketReleaseState] = useState("GA");

  // Integration Form Fields
  const [providerCode, setProviderCode] = useState("STRIPE");
  const [certified, setCertified] = useState(true);
  const [integrationHealth, setIntegrationHealth] = useState("HEALTHY");

  // Operational State Form Fields
  const [opState, setOpState] = useState("GA");
  const [opReason, setOpReason] = useState("Platform production release baseline");

  // Claims Form Fields
  const [claimText, setClaimText] = useState("Real-time GBP & EUR settlement within 5 seconds under SEPA Instant.");
  const [claimScope, setClaimScope] = useState("UK_EEA");
  const [wordingOwner, setWordingOwner] = useState(initialPrincipalId);
  const [claimApprover, setClaimApprover] = useState(initialPrincipalId);

  // Resolution Form Fields
  const [capCodeInput, setCapCodeInput] = useState("PAYMENT_ROUTING_SEPA");
  const [resolveMarket, setResolveMarket] = useState("GB");
  const [resolveProvider, setResolveProvider] = useState("STRIPE");

  // Preset Applicator
  const applyPreset = (type: "sepa" | "ledger" | "ai") => {
    switch (type) {
      case "sepa":
        setCapCode("PAYMENT_ROUTING_SEPA");
        setModuleDomain("PAYMENTS");
        setCapVersion("1");
        setDependencies("BANKING_GATEWAY,LEDGER_POSTING");
        setRiskClass("MEDIUM");
        setMarketCode("GB");
        setLanguageCode("en");
        setProviderCode("STRIPE");
        setCapCodeInput("PAYMENT_ROUTING_SEPA");
        setResolveMarket("GB");
        setResolveProvider("STRIPE");
        setClaimText("Real-time GBP & EUR settlement within 5 seconds under SEPA Instant.");
        break;
      case "ledger":
        setCapCode("MULTI_CURRENCY_LEDGER");
        setModuleDomain("FINANCE");
        setCapVersion("1");
        setDependencies("GENERAL_LEDGER,EXCHANGE_RATE_FEED");
        setRiskClass("HIGH");
        setMarketCode("US");
        setLanguageCode("en");
        setProviderCode("MODULR");
        setCapCodeInput("MULTI_CURRENCY_LEDGER");
        setResolveMarket("US");
        setResolveProvider("MODULR");
        setClaimText("Auditable multi-currency balance consolidation compliant with IFRS 9.");
        break;
      case "ai":
        setCapCode("AI_AGENT_DECISION_ENGINE");
        setModuleDomain("AI_GOVERNANCE");
        setCapVersion("1");
        setDependencies("POLICY_ENGINE,AUDIT_EVENT_STORE");
        setRiskClass("CRITICAL");
        setMarketCode("GLOBAL");
        setLanguageCode("en");
        setProviderCode("OPENAI");
        setCapCodeInput("AI_AGENT_DECISION_ENGINE");
        setResolveMarket("GLOBAL");
        setResolveProvider("OPENAI");
        setClaimText("Deterministic maker-checker validated autonomous workflow automation.");
        break;
    }
  };

  const getRiskBadge = (risk?: string) => {
    switch (risk) {
      case "LOW":
        return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">LOW RISK</span>;
      case "MEDIUM":
        return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">MEDIUM RISK</span>;
      case "HIGH":
        return <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800 dark:bg-orange-950 dark:text-orange-300">HIGH RISK</span>;
      case "CRITICAL":
        return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300">CRITICAL RISK</span>;
      default:
        return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-300">{risk ?? "UNKNOWN"}</span>;
    }
  };

  const getReasonBadge = (reasonCode?: string) => {
    switch (reasonCode) {
      case "ENABLED":
        return <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> ENABLED</span>;
      case "MARKET_BLOCKED":
        return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> MARKET_BLOCKED</span>;
      case "PROVIDER_UNAVAILABLE":
        return <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-800 dark:bg-orange-950 dark:text-orange-300 flex items-center gap-1"><PlugZap className="h-3 w-3" /> PROVIDER_UNAVAILABLE</span>;
      case "INCIDENT_RESTRICTED":
        return <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300 flex items-center gap-1"><XCircle className="h-3 w-3" /> INCIDENT_RESTRICTED</span>;
      case "DISABLED":
        return <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-300">DISABLED</span>;
      default:
        return <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">{reasonCode ?? "CAPABILITY_UNKNOWN"}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Fast Presets Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Quick Architecture Scenarios:
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => applyPreset("sepa")}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            SEPA Payment Routing (Payments)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("ledger")}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            Multi-Currency Ledger (Finance)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("ai")}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            Autonomous AI Engine (High Risk)
          </button>
        </div>
      </div>

      {/* ── Active Top Feedback Banner ── */}
      {latestFeedback && latestFeedback.status !== "idle" && (
        <ResultBanner
          tone={latestFeedback.status === "success" ? "success" : "error"}
          message={latestFeedback.message || "Operation completed."}
        />
      )}

      {/* ── Statutory Invariants Alert ── */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
          <div className="text-xs text-indigo-950 dark:text-indigo-200">
            <span className="font-bold text-indigo-950 dark:text-indigo-100">
              Five-Dimension Capability Registry Doctrine (doc7 §7 & §C1-C2):
            </span>{" "}
            A capability is controlled across five independent dimensions: (1) <span className="font-semibold">Existence</span> (this service), (2) <span className="font-semibold">Market Release</span> (jurisdiction & legal approval), (3) <span className="font-semibold">Integration Health</span> (provider certification), (4) <span className="font-semibold">Operational Release</span> (GA/Beta vs Incident Restricted), and (5) <span className="font-semibold">Marketing Claims</span> (named wording owner). <span className="font-bold">A feature can be technically implemented but commercially unavailable, or market-approved but disabled by incident state. These dimensions must never be collapsed into one feature flag!</span>
          </div>
        </div>
      </div>

      {/* ── Two-Column Main Layout ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Actions & Registries */}
        <div className="space-y-6 lg:col-span-7">
          {/* Card 1: Capability Definition */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                    1
                  </span>
                  <CardTitle className="text-base">Capability Definition</CardTitle>
                </div>
                <span className="text-xs font-medium text-slate-500">POST /v1/capabilities</span>
              </div>
              <CardDescription>
                Register authoritative capability identity, domain categorization, and execution risk classification.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <form action={capAction} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={LABEL}>
                      Capability Code (<span className="text-rose-500">*</span>)
                    </label>
                    <input
                      name="capability_code"
                      required
                      value={capCode}
                      onChange={(e) => setCapCode(e.target.value)}
                      placeholder="e.g. PAYMENT_ROUTING_SEPA"
                      className={`${FIELD} font-mono text-xs`}
                    />
                    <p className={HINT}>Unique upper-snake-case capability identifier.</p>
                  </div>

                  <div>
                    <label className={LABEL}>
                      Module Domain (<span className="text-rose-500">*</span>)
                    </label>
                    <select
                      name="module_domain"
                      value={moduleDomain}
                      onChange={(e) => setModuleDomain(e.target.value)}
                      className={FIELD}
                    >
                      <option value="PAYMENTS">PAYMENTS</option>
                      <option value="FINANCE">FINANCE</option>
                      <option value="COMPLIANCE">COMPLIANCE</option>
                      <option value="WORKFORCE">WORKFORCE</option>
                      <option value="LEGAL">LEGAL</option>
                      <option value="AI_GOVERNANCE">AI_GOVERNANCE</option>
                      <option value="COMMERCIAL">COMMERCIAL</option>
                    </select>
                  </div>

                  <div>
                    <label className={LABEL}>Version</label>
                    <input
                      name="version"
                      type="number"
                      min="1"
                      value={capVersion}
                      onChange={(e) => setCapVersion(e.target.value)}
                      className={FIELD}
                    />
                  </div>

                  <div>
                    <label className={LABEL}>Execution Risk Class</label>
                    <select
                      name="execution_risk_class"
                      value={riskClass}
                      onChange={(e) => setRiskClass(e.target.value)}
                      className={FIELD}
                    >
                      <option value="LOW">LOW (Standard read or reversible non-financial)</option>
                      <option value="MEDIUM">MEDIUM (Standard financial or operational transaction)</option>
                      <option value="HIGH">HIGH (Irreversible fund movement or tax filing)</option>
                      <option value="CRITICAL">CRITICAL (System root authority or key rotation)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className={LABEL}>Dependencies (Comma-separated Codes)</label>
                    <input
                      name="dependencies"
                      value={dependencies}
                      onChange={(e) => setDependencies(e.target.value)}
                      placeholder="e.g. BANKING_GATEWAY,LEDGER_POSTING"
                      className={`${FIELD} font-mono text-xs`}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={capPending} className="flex items-center gap-2">
                    {capPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                    <span>{capPending ? "Registering..." : "Register Capability"}</span>
                  </Button>
                </div>

                {capState.status !== "idle" && (
                  <ResultBanner
                    tone={capState.status === "success" ? "success" : "error"}
                    message={capState.message || "Capability processed."}
                  />
                )}
              </form>
            </CardContent>
          </Card>

          {/* Card 2: Multi-Registry Management Workbench */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                    2
                  </span>
                  <CardTitle className="text-base">Independent Registry Controls</CardTitle>
                </div>
                <span className="text-xs font-medium text-slate-500">doc7 §7 Pillars</span>
              </div>
              <CardDescription>
                Configure Market Gating, Integration Health, Operational Release State, and Public Marketing Claims.
              </CardDescription>

              {/* Sub-Tab Navigation Bar */}
              <div className="flex flex-wrap gap-1 border-b border-slate-200 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setRegistryTab("market")}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                    registryTab === "market"
                      ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  <Globe className="h-3.5 w-3.5" />
                  Market Releases
                </button>

                <button
                  type="button"
                  onClick={() => setRegistryTab("integration")}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                    registryTab === "integration"
                      ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  <PlugZap className="h-3.5 w-3.5" />
                  Integration Health
                </button>

                <button
                  type="button"
                  onClick={() => setRegistryTab("operational")}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                    registryTab === "operational"
                      ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  <Radio className="h-3.5 w-3.5" />
                  Release & Incident State
                </button>

                <button
                  type="button"
                  onClick={() => setRegistryTab("claims")}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                    registryTab === "claims"
                      ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  <FileCheck2 className="h-3.5 w-3.5" />
                  Marketing Claims
                </button>
              </div>
            </CardHeader>

            <CardContent>
              {/* Subtab 1: Market Releases */}
              {registryTab === "market" && (
                <form action={marketAction} className="space-y-4">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    <span className="font-bold">Market Release Gate (doc7 §Q1):</span> Controls whether this capability is approved in a specific jurisdiction/entity and language code.
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={LABEL}>Capability ID (<span className="text-rose-500">*</span>)</label>
                      <input
                        name="capability_id"
                        required
                        value={activeCapability?.capability_id ?? ""}
                        readOnly
                        placeholder="Register capability above first"
                        className={`${FIELD} font-mono text-xs bg-slate-100 dark:bg-slate-800`}
                      />
                    </div>

                    <div>
                      <label className={LABEL}>Market Code (ISO / Jurisdiction)</label>
                      <input
                        name="market_code"
                        required
                        value={marketCode}
                        onChange={(e) => setMarketCode(e.target.value)}
                        placeholder="e.g. GB, DE, US, EU"
                        className={`${FIELD} font-mono text-xs`}
                      />
                    </div>

                    <div>
                      <label className={LABEL}>Language Code (Optional)</label>
                      <input
                        name="language_code"
                        value={languageCode}
                        onChange={(e) => setLanguageCode(e.target.value)}
                        placeholder="e.g. en, de, fr"
                        className={`${FIELD} font-mono text-xs`}
                      />
                    </div>

                    <div>
                      <label className={LABEL}>Legal Approval Status</label>
                      <select
                        name="legal_approval_status"
                        value={legalApproval}
                        onChange={(e) => setLegalApproval(e.target.value)}
                        className={FIELD}
                      >
                        <option value="APPROVED">APPROVED (Legal compliance clearance granted)</option>
                        <option value="PENDING">PENDING (Review underway)</option>
                        <option value="REJECTED">REJECTED (Statutory refusal)</option>
                      </select>
                    </div>

                    <div>
                      <label className={LABEL}>Market Release State</label>
                      <select
                        name="state"
                        value={marketReleaseState}
                        onChange={(e) => setMarketReleaseState(e.target.value)}
                        className={FIELD}
                      >
                        <option value="GA">GA (General Availability)</option>
                        <option value="BETA">BETA (Controlled customer cohort)</option>
                        <option value="PILOT">PILOT (Enterprise trial)</option>
                        <option value="INTERNAL">INTERNAL (Zoiko Staff only)</option>
                        <option value="RESTRICTED">RESTRICTED (Jurisdictional block)</option>
                        <option value="SUSPENDED">SUSPENDED (Temporary regulatory freeze)</option>
                        <option value="RETIRED">RETIRED (Sunset / legacy)</option>
                      </select>
                    </div>

                    <div>
                      <label className={LABEL}>Effective From</label>
                      <input
                        name="effective_from"
                        defaultValue={new Date().toISOString()}
                        className={`${FIELD} font-mono text-xs`}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button type="submit" disabled={marketPending || !activeCapability} className="text-xs">
                      {marketPending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Globe className="h-3 w-3 mr-1" />}
                      Register Market Release
                    </Button>
                  </div>

                  {marketState.status !== "idle" && (
                    <ResultBanner
                      tone={marketState.status === "success" ? "success" : "error"}
                      message={marketState.message || "Market release processed."}
                    />
                  )}
                </form>
              )}

              {/* Subtab 2: Integration & Connector Health */}
              {registryTab === "integration" && (
                <div className="space-y-6">
                  <form action={integrationAction} className="space-y-4">
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                      <span className="font-bold">Integration Readiness (doc7 §29):</span> Links required external providers/connectors (e.g. Stripe, Plaid, Modulr) and asserts certified operational readiness.
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <label className={LABEL}>Capability ID (<span className="text-rose-500">*</span>)</label>
                        <input
                          name="capability_id"
                          required
                          value={activeCapability?.capability_id ?? ""}
                          readOnly
                          placeholder="Register capability above first"
                          className={`${FIELD} font-mono text-xs bg-slate-100 dark:bg-slate-800`}
                        />
                      </div>

                      <div>
                        <label className={LABEL}>Provider Code</label>
                        <input
                          name="provider_code"
                          required
                          value={providerCode}
                          onChange={(e) => setProviderCode(e.target.value)}
                          placeholder="e.g. STRIPE, PLAID, MODULR"
                          className={`${FIELD} font-mono text-xs`}
                        />
                      </div>

                      <div>
                        <label className={LABEL}>Health Status</label>
                        <select
                          name="health_status"
                          value={integrationHealth}
                          onChange={(e) => setIntegrationHealth(e.target.value)}
                          className={FIELD}
                        >
                          <option value="HEALTHY">HEALTHY (Operational & connected)</option>
                          <option value="DEGRADED">DEGRADED (Elevated latency / partial drop)</option>
                          <option value="FAILED">FAILED (Provider outage / offline)</option>
                          <option value="UNKNOWN">UNKNOWN (Pending initial probe)</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2 pt-2 sm:col-span-3">
                        <input
                          type="checkbox"
                          id="cert_check"
                          name="certified"
                          value="true"
                          checked={certified}
                          onChange={(e) => setCertified(e.target.checked)}
                          className="rounded text-indigo-600"
                        />
                        <label htmlFor="cert_check" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Certified Connector (Complies with ZS integration standard)
                        </label>
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button type="submit" disabled={integrationPending || !activeCapability} className="text-xs">
                        {integrationPending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <PlugZap className="h-3 w-3 mr-1" />}
                        Attach Integration Provider
                      </Button>
                    </div>

                    {integrationState.status !== "idle" && (
                      <ResultBanner
                        tone={integrationState.status === "success" ? "success" : "error"}
                        message={integrationState.message || "Integration processed."}
                      />
                    )}
                  </form>

                  {/* Active Integration Health Quick-Switch */}
                  {activeIntegration && (
                    <form action={healthAction} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/30">
                      <input type="hidden" name="integration_capability_id" value={activeIntegration.integration_capability_id} />
                      <input type="hidden" name="capability_id" value={activeCapability?.capability_id ?? ""} />
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Update Health: {activeIntegration.provider_code ?? "Provider"} ({activeIntegration.integration_capability_id?.slice(0, 8) ?? ""}...)
                        </h5>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          activeIntegration.health_status === "HEALTHY"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                        }`}>
                          Current: {activeIntegration.health_status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <select name="health_status" defaultValue={activeIntegration.health_status} className={FIELD}>
                          <option value="HEALTHY">HEALTHY</option>
                          <option value="DEGRADED">DEGRADED</option>
                          <option value="FAILED">FAILED</option>
                          <option value="UNKNOWN">UNKNOWN</option>
                        </select>
                        <Button type="submit" variant="secondary" disabled={healthPending} className="text-xs shrink-0">
                          {healthPending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Activity className="h-3 w-3 mr-1" />}
                          Update Health Status
                        </Button>
                      </div>

                      {healthState.status !== "idle" && (
                        <ResultBanner
                          tone={healthState.status === "success" ? "success" : "error"}
                          message={healthState.message || "Health updated."}
                        />
                      )}
                    </form>
                  )}
                </div>
              )}

              {/* Subtab 3: Operational Release & Incident State */}
              {registryTab === "operational" && (
                <form action={releaseAction} className="space-y-4">
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                    <span className="font-bold">Operational Kill-Switch & Release State (doc7 §32.1):</span> Controls active system runtime execution. Flipped to <span className="font-mono">INCIDENT_RESTRICTED</span> during an incident without modifying market approval or commercial entitlement! Append-only: committed history is never erased.
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={LABEL}>Capability ID (<span className="text-rose-500">*</span>)</label>
                      <input
                        name="capability_id"
                        required
                        value={activeCapability?.capability_id ?? ""}
                        readOnly
                        placeholder="Register capability above first"
                        className={`${FIELD} font-mono text-xs bg-slate-100 dark:bg-slate-800`}
                      />
                    </div>

                    <div>
                      <label className={LABEL}>Operational State</label>
                      <select
                        name="state"
                        value={opState}
                        onChange={(e) => setOpState(e.target.value)}
                        className={FIELD}
                      >
                        <option value="GA">GA (General Availability)</option>
                        <option value="BETA">BETA (Controlled pilot)</option>
                        <option value="PILOT">PILOT (Enterprise preview)</option>
                        <option value="INTERNAL">INTERNAL (Internal testing only)</option>
                        <option value="DISABLED">DISABLED (Operationally shut down)</option>
                        <option value="INCIDENT_RESTRICTED">INCIDENT_RESTRICTED (Kill-switch / emergency safety stop)</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className={LABEL}>Audit Note / Trigger Reason</label>
                      <input
                        name="reason"
                        value={opReason}
                        onChange={(e) => setOpReason(e.target.value)}
                        placeholder="e.g. Third-party payment gateway latency incident remediation"
                        className={FIELD}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button type="submit" disabled={releasePending || !activeCapability} className="text-xs">
                      {releasePending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Radio className="h-3 w-3 mr-1" />}
                      Set Operational Release State
                    </Button>
                  </div>

                  {releaseState.status !== "idle" && (
                    <ResultBanner
                      tone={releaseState.status === "success" ? "success" : "error"}
                      message={releaseState.message || "Release state processed."}
                    />
                  )}
                </form>
              )}

              {/* Subtab 4: Public Marketing Claims */}
              {registryTab === "claims" && (
                <form action={claimAction} className="space-y-4">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    <span className="font-bold">Public Claim Governance (doc7 §C2):</span> Authoritative statements sales and marketing may make. Never auto-generated from roadmap state; requires a named wording owner and legal approver.
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={LABEL}>Capability ID (<span className="text-rose-500">*</span>)</label>
                      <input
                        name="capability_id"
                        required
                        value={activeCapability?.capability_id ?? ""}
                        readOnly
                        placeholder="Register capability above first"
                        className={`${FIELD} font-mono text-xs bg-slate-100 dark:bg-slate-800`}
                      />
                    </div>

                    <div>
                      <label className={LABEL}>Market Scope</label>
                      <input
                        name="market_scope"
                        value={claimScope}
                        onChange={(e) => setClaimScope(e.target.value)}
                        placeholder="e.g. UK_EEA, GLOBAL, US"
                        className={`${FIELD} font-mono text-xs`}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className={LABEL}>Authoritative Claim Text</label>
                      <input
                        name="claim_text"
                        required
                        value={claimText}
                        onChange={(e) => setClaimText(e.target.value)}
                        placeholder="e.g. Real-time GBP & EUR settlement within 5 seconds under SEPA Instant."
                        className={FIELD}
                      />
                    </div>

                    <div>
                      <label className={LABEL}>Wording Owner Principal ID</label>
                      <input
                        name="wording_owner_principal_id"
                        required
                        value={wordingOwner}
                        onChange={(e) => setWordingOwner(e.target.value)}
                        className={`${FIELD} font-mono text-xs`}
                      />
                    </div>

                    <div>
                      <label className={LABEL}>Approved By Principal ID</label>
                      <input
                        name="approved_by_principal_id"
                        required
                        value={claimApprover}
                        onChange={(e) => setClaimApprover(e.target.value)}
                        className={`${FIELD} font-mono text-xs`}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button type="submit" disabled={claimPending || !activeCapability} className="text-xs">
                      {claimPending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <FileCheck2 className="h-3 w-3 mr-1" />}
                      Record Authorized Marketing Claim
                    </Button>
                  </div>

                  {claimState.status !== "idle" && (
                    <ResultBanner
                      tone={claimState.status === "success" ? "success" : "error"}
                      message={claimState.message || "Marketing claim processed."}
                    />
                  )}
                </form>
              )}
            </CardContent>
          </Card>

          {/* Card 3: Canonical Capability Resolver */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                    3
                  </span>
                  <CardTitle className="text-base">Canonical Capability Resolver</CardTitle>
                </div>
                <span className="text-xs font-medium text-slate-500">GET /v1/capability-resolution/{`{code}`}</span>
              </div>
              <CardDescription>
                Evaluates existence, operational release, market clearance, and provider health in priority order (doc7 §C1).
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <form action={resolveAction} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className={LABEL}>Capability Code (<span className="text-rose-500">*</span>)</label>
                    <input
                      name="capability_code"
                      required
                      value={capCodeInput}
                      onChange={(e) => setCapCodeInput(e.target.value)}
                      placeholder="e.g. PAYMENT_ROUTING_SEPA"
                      className={`${FIELD} font-mono text-xs`}
                    />
                  </div>

                  <div>
                    <label className={LABEL}>Market Filter (Optional)</label>
                    <input
                      name="market_code"
                      value={resolveMarket}
                      onChange={(e) => setResolveMarket(e.target.value)}
                      placeholder="e.g. GB, DE, US"
                      className={`${FIELD} font-mono text-xs`}
                    />
                  </div>

                  <div>
                    <label className={LABEL}>Reference Provider (Not Filtered)</label>
                    <input
                      name="provider_code"
                      value={resolveProvider}
                      onChange={(e) => setResolveProvider(e.target.value)}
                      placeholder="e.g. STRIPE, PLAID"
                      disabled
                      className={`${FIELD} font-mono text-xs bg-slate-100 dark:bg-slate-800 cursor-not-allowed`}
                    />
                    <p className={HINT}>
                      capability-registry-svc resolves integration readiness across ALL
                      attached providers for this capability (doc7 §C1) — it has no
                      per-provider scoping. Any uncertified/FAILED provider blocks
                      resolution regardless of the code typed here.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <Button type="submit" variant="secondary" disabled={resolvePending} className="text-xs">
                    {resolvePending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                    Resolve Live Capability
                  </Button>
                </div>

                {resolveState.status !== "idle" && (
                  <ResultBanner
                    tone={resolveState.status === "success" ? "success" : "error"}
                    message={resolveState.message || "Resolution executed."}
                  />
                )}
              </form>

              {activeResolution && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Resolution Evaluation for:
                      </span>
                      <code className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                        {activeResolution.capability_code}
                      </code>
                    </div>
                    {getReasonBadge(activeResolution.reason_code)}
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-semibold">Enabled Status:</span> {activeResolution.enabled ? "TRUE (Live & Consumable)" : "FALSE (Access Blocked)"}
                    {activeResolution.detail && (
                      <span className="block mt-1 font-mono text-[11px] text-slate-500">
                        Detail: {activeResolution.detail}
                      </span>
                    )}
                  </div>

                  <JsonBlock value={activeResolution} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Authoritative Capability Ledger Inspector */}
        <div className="space-y-6 lg:col-span-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4 text-indigo-600" />
                Capability Registry Ledger
              </CardTitle>
              <CardDescription>
                Authoritative Plane-1 multi-registry state from <code className="text-xs">capability-registry-svc</code> (:8145).
              </CardDescription>
            </CardHeader>

            <CardContent>
              {activeCapability ? (
                <div className="space-y-4">
                  {/* Capability Card Header */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {activeCapability.capability_code}
                      </span>
                      {getRiskBadge(activeCapability.execution_risk_class)}
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                      <div>
                        <span className="font-semibold">Domain:</span> {activeCapability.module_domain} | <span className="font-semibold">Version:</span> v{activeCapability.version}
                      </div>
                      <div className="flex items-center gap-1 font-mono text-[11px]">
                        <span className="font-sans font-semibold">ID:</span>
                        <CopyableId value={activeCapability.capability_id} />
                      </div>
                      {activeCapability.dependencies && (
                        <div>
                          <span className="font-semibold">Dependencies:</span>{" "}
                          <span className="font-mono text-[11px]">{activeCapability.dependencies}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Registered Market Release */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/30 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-1 text-slate-800 dark:text-slate-200">
                        <Globe className="h-3 w-3 text-indigo-500" /> Market Release Gate
                      </span>
                      {activeMarketRelease ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                          {activeMarketRelease.market_code} ({activeMarketRelease.state})
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">None registered</span>
                      )}
                    </div>
                    {activeMarketRelease && (
                      <div className="text-slate-600 dark:text-slate-400 space-y-0.5 pt-1 text-[11px]">
                        <div>Legal Clearance: <span className="font-semibold">{activeMarketRelease.legal_approval_status}</span></div>
                        <div className="font-mono text-[10px]">Release ID: {activeMarketRelease.market_release_id?.slice(0, 12) ?? ""}...</div>
                      </div>
                    )}
                  </div>

                  {/* Registered Integration Providers */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/30 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-1 text-slate-800 dark:text-slate-200">
                        <PlugZap className="h-3 w-3 text-indigo-500" /> Integration Connectors ({activeIntegrations.length})
                      </span>
                    </div>
                    {activeIntegrations.length > 0 ? (
                      <div className="space-y-1.5 pt-1">
                        {activeIntegrations.map((it) => (
                          <div key={it.integration_capability_id} className="flex items-center justify-between rounded border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900 text-[11px]">
                            <div>
                              <span className="font-bold font-mono">{it.provider_code}</span>
                              <span className="ml-1 text-[10px] text-slate-500">{it.certified ? "Certified" : "Uncertified"}</span>
                            </div>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              it.health_status === "HEALTHY"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                            }`}>
                              {it.health_status}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400">No external providers attached.</p>
                    )}
                  </div>

                  {/* Active Operational State */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/30 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-1 text-slate-800 dark:text-slate-200">
                        <Radio className="h-3 w-3 text-indigo-500" /> Operational Release State
                      </span>
                      {activeRelease ? (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          activeRelease.state === "GA" || activeRelease.state === "BETA"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                        }`}>
                          {activeRelease.state}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">GA (Default)</span>
                      )}
                    </div>
                    {activeRelease?.reason && (
                      <p className="text-[11px] text-slate-500 italic pt-1">
                        &ldquo;{activeRelease.reason}&rdquo;
                      </p>
                    )}
                  </div>

                  {/* Authorized Marketing Claims */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/30 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-1 text-slate-800 dark:text-slate-200">
                        <FileCheck2 className="h-3 w-3 text-indigo-500" /> Public Claims ({activeClaims.length})
                      </span>
                    </div>
                    {activeClaims.length > 0 ? (
                      <div className="space-y-1.5 pt-1">
                        {activeClaims.map((cl) => (
                          <div key={cl.claim_id} className="rounded border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900 text-[11px]">
                            <p className="font-medium text-slate-800 dark:text-slate-200">&ldquo;{cl.claim_text}&rdquo;</p>
                            <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500">
                              <span>Scope: {cl.market_scope ?? "GLOBAL"}</span>
                              <span className="font-mono">Owner: {cl.wording_owner_principal_id?.slice(0, 8) ?? ""}...</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400">No marketing claims recorded.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
                  <Database className="h-10 w-10 stroke-[1.2] mb-2 text-slate-300 dark:text-slate-700" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    No Capability Loaded
                  </p>
                  <p className="text-[11px] max-w-xs text-slate-400 dark:text-slate-500 mt-1">
                    Select a scenario above or register a new capability in Step 1 to inspect live multi-registry state.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
