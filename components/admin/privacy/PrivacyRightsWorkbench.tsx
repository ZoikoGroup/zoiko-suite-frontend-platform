"use client";

import { useState, useActionState, useEffect } from "react";
import {
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Zap,
  ShieldCheck,
  Lock,
  ArrowRight,
  Database,
  History,
  UserCheck,
  FolderSearch,
  CheckSquare,
  Sparkles,
  Info,
  Scale,
  RefreshCw,
  Clock,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from "@/components/ui";
import { FIELD, LABEL, HINT } from "@/components/admin/shared/form";
import { ResultBanner, CopyableId, JsonBlock, type BannerTone } from "@/components/admin/shared";
import {
  createRightsRequestAction,
  recordIdentityVerificationAction,
  attachDiscoveryManifestAction,
  closeRightsRequestAction,
  lookupRightsRequestAction,
  listSubjectRequestsAction,
  attachWFCProcessRefAction,
} from "@/app/admin/privacy/rights-actions";
import { IDLE_RIGHTS_STATE, type RightsActionState } from "@/app/admin/privacy/rights-state";
import type { RightFamily, Outcome, RightsRequest, DiscoveryManifest } from "@/lib/api/privacy-rights";

const RIGHT_FAMILIES: { value: RightFamily; label: string; description: string }[] = [
  { value: "ACCESS", label: "ACCESS (GDPR Art. 15)", description: "Right of access & personal data disclosure" },
  { value: "ERASURE", label: "ERASURE (GDPR Art. 17)", description: "Right to be forgotten / permanent erasure" },
  { value: "RECTIFICATION", label: "RECTIFICATION (GDPR Art. 16)", description: "Correction of inaccurate personal data" },
  { value: "RESTRICTION", label: "RESTRICTION (GDPR Art. 18)", description: "Limitation of processing activities" },
  { value: "PORTABILITY", label: "PORTABILITY (GDPR Art. 20)", description: "Structured, machine-readable export" },
  { value: "OBJECTION_WITHDRAWAL", label: "OBJECTION (GDPR Art. 21)", description: "Opt-out / objection to direct marketing or legitimate interest" },
  { value: "AUTOMATED_DECISION_CHALLENGE", label: "DECISION CHALLENGE (GDPR Art. 22)", description: "Human review of algorithmic profiling" },
  { value: "COMPLAINT", label: "COMPLAINT", description: "Formal privacy dispute or supervisory referral" },
];

export function PrivacyRightsWorkbench() {
  // Server action states
  const [createState, createAction, createPending] = useActionState(
    createRightsRequestAction,
    IDLE_RIGHTS_STATE
  );
  const [verifyState, verifyAction, verifyPending] = useActionState(
    recordIdentityVerificationAction,
    IDLE_RIGHTS_STATE
  );
  const [manifestState, manifestAction, manifestPending] = useActionState(
    attachDiscoveryManifestAction,
    IDLE_RIGHTS_STATE
  );
  const [closeState, closeAction, closePending] = useActionState(
    closeRightsRequestAction,
    IDLE_RIGHTS_STATE
  );
  const [lookupState, lookupAction, lookupPending] = useActionState(
    lookupRightsRequestAction,
    IDLE_RIGHTS_STATE
  );
  const [searchState, searchAction, searchPending] = useActionState(
    listSubjectRequestsAction,
    IDLE_RIGHTS_STATE
  );
  const [wfcRefState, wfcRefAction, wfcRefPending] = useActionState(
    attachWFCProcessRefAction,
    IDLE_RIGHTS_STATE
  );

  // Active loaded request and manifests
  const [activeRequest, setActiveRequest] = useState<RightsRequest | null>(null);
  const [activeManifests, setActiveManifests] = useState<DiscoveryManifest[]>([]);

  // Sync state whenever an action completes
  useEffect(() => {
    if (createState.status === "success" && createState.request) {
      setActiveRequest(createState.request);
      setActiveManifests(Array.isArray(createState.manifests) ? createState.manifests : []);
    }
  }, [createState]);

  useEffect(() => {
    if (verifyState.status === "success" && verifyState.request) {
      setActiveRequest(verifyState.request);
      setActiveManifests(Array.isArray(verifyState.manifests) ? verifyState.manifests : []);
    }
  }, [verifyState]);

  useEffect(() => {
    if (manifestState.status === "success" && manifestState.request) {
      setActiveRequest(manifestState.request);
      setActiveManifests(Array.isArray(manifestState.manifests) ? manifestState.manifests : []);
    }
  }, [manifestState]);

  useEffect(() => {
    if (closeState.status === "success" && closeState.request) {
      setActiveRequest(closeState.request);
      setActiveManifests(Array.isArray(closeState.manifests) ? closeState.manifests : []);
    }
  }, [closeState]);

  useEffect(() => {
    if (lookupState.status === "success" && lookupState.request) {
      setActiveRequest(lookupState.request);
      setActiveManifests(Array.isArray(lookupState.manifests) ? lookupState.manifests : []);
    }
  }, [lookupState]);

  useEffect(() => {
    if (wfcRefState.status === "success" && wfcRefState.request) {
      setActiveRequest(wfcRefState.request);
      setActiveManifests(Array.isArray(wfcRefState.manifests) ? wfcRefState.manifests : []);
    }
  }, [wfcRefState]);

  // Intake Form Controlled Inputs
  const [intakeSubject, setIntakeSubject] = useState("subject-alice-access@zoikosuite.com");
  const [intakeFamily, setIntakeFamily] = useState<RightFamily>("ACCESS");
  const [intakeJurisdiction, setIntakeJurisdiction] = useState("GDPR");
  const [intakeRequester, setIntakeRequester] = useState("subject-alice-access@zoikosuite.com");
  const [intakeSubmittedVia, setIntakeSubmittedVia] = useState("PRIVACY_PORTAL");

  // Lifecycle Tab
  const [activeTab, setActiveTab] = useState<"verify" | "manifest" | "close" | "wfc">("verify");

  // Verification Form Inputs
  const [verifyVerified, setVerifyVerified] = useState("true");
  const [verifyMethod, setVerifyMethod] = useState("MFA_AUTHENTICATOR_TOKEN");
  const [verifyNote, setVerifyNote] = useState("Subject authenticated with hardware passkey and live biometric confirm.");

  // Manifest Form Inputs
  const [manifestDomain, setManifestDomain] = useState("CRM_HUBSPOT");
  const [manifestHash, setManifestHash] = useState("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  const [manifestCount, setManifestCount] = useState("14");
  const [manifestRef, setManifestRef] = useState("s3://zoiko-evidence/sar/crm-export-2026.json");

  // Close Form Inputs
  const [closeOutcome, setCloseOutcome] = useState<Outcome>("FULFILLED");
  const [closeHash, setCloseHash] = useState("a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0");
  const [closeReason, setCloseReason] = useState("All discovery manifests validated and exported package delivered securely to verified subject.");

  // WFC Process Ref Inputs
  const [wfcProcessRef, setWFCProcessRef] = useState("wf-instance-2026-001");

  // Fast Presets
  const applyPreset = (preset: "access_happy" | "erasure_strict" | "objection_fast" | "complaint") => {
    switch (preset) {
      case "access_happy":
        setIntakeSubject("subject-alice-access@zoikosuite.com");
        setIntakeFamily("ACCESS");
        setIntakeJurisdiction("GDPR");
        setIntakeRequester("subject-alice-access@zoikosuite.com");
        setIntakeSubmittedVia("PRIVACY_PORTAL");
        break;
      case "erasure_strict":
        setIntakeSubject("subject-david-erasure@zoikosuite.com");
        setIntakeFamily("ERASURE");
        setIntakeJurisdiction("UK_GDPR");
        setIntakeRequester("legal-dpo@firm.co.uk");
        setIntakeSubmittedVia("FORMAL_WRITTEN_NOTICE");
        break;
      case "objection_fast":
        setIntakeSubject("subject-emma-optout@zoikosuite.com");
        setIntakeFamily("OBJECTION_WITHDRAWAL");
        setIntakeJurisdiction("CCPA");
        setIntakeRequester("subject-emma-optout@zoikosuite.com");
        setIntakeSubmittedVia("EMAIL");
        break;
      case "complaint":
        setIntakeSubject("subject-marcus-complaint@zoikosuite.com");
        setIntakeFamily("COMPLAINT");
        setIntakeJurisdiction("GDPR");
        setIntakeRequester("subject-marcus-complaint@zoikosuite.com");
        setIntakeSubmittedVia("SUPERVISORY_AUTHORITY_REFERRAL");
        break;
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "RECEIVED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <Clock className="h-3 w-3" />
            RECEIVED
          </span>
        );
      case "IDENTITY_VERIFIED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            <UserCheck className="h-3 w-3" />
            IDENTITY VERIFIED
          </span>
        );
      case "IN_DISCOVERY":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
            <FolderSearch className="h-3 w-3" />
            IN DISCOVERY
          </span>
        );
      case "CLOSED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-300">
            <Lock className="h-3 w-3" />
            CLOSED (IMMUTABLE)
          </span>
        );
      default:
        return null;
    }
  };

  const getOutcomeBadge = (outcome?: Outcome | null) => {
    switch (outcome) {
      case "FULFILLED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            FULFILLED
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
            <XCircle className="h-3 w-3" />
            REJECTED
          </span>
        );
      case "WITHDRAWN":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <History className="h-3 w-3" />
            WITHDRAWN
          </span>
        );
      default:
        return null;
    }
  };

  // Determine latest banner to show
  const activeFeedback = closeState.status !== "idle"
    ? closeState
    : wfcRefState.status !== "idle"
    ? wfcRefState
    : manifestState.status !== "idle"
    ? manifestState
    : verifyState.status !== "idle"
    ? verifyState
    : createState.status !== "idle"
    ? createState
    : lookupState.status !== "idle"
    ? lookupState
    : searchState.status !== "idle"
    ? searchState
    : null;

  return (
    <div className="space-y-6">
      {/* ── Header & Presets ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 ring-1 ring-inset ring-indigo-700/10 dark:bg-indigo-950/60 dark:text-indigo-400">
              PRV-04
            </span>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Data Rights, Complaint & Disclosure Control Service (:8154)
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Case intake, identity-assurance verification, discovery-manifest evidence, and §15.2 Disclosure Gate enforcement.
          </p>
        </div>

        {/* Quick Scenario Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
            <Zap className="h-3 w-3 text-amber-500" /> Fast Presets:
          </span>
          <button
            type="button"
            onClick={() => applyPreset("access_happy")}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Art. 15 Access (SAR)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("erasure_strict")}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Art. 17 Erasure (Strict)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("objection_fast")}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Art. 21 Objection
          </button>
          <button
            type="button"
            onClick={() => applyPreset("complaint")}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Regulatory Complaint
          </button>
        </div>
      </div>

      {/* ── Operational Result Banner ── */}
      {activeFeedback && activeFeedback.status !== "idle" && (
        <ResultBanner
          tone={activeFeedback.status === "success" ? "success" : "error"}
          message={activeFeedback.message || (activeFeedback.status === "success" ? "Operation completed." : "Operation failed.")}
        />
      )}

      {/* ── Invariant Alert: §15.2 Disclosure Gate ── */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
          <div className="text-xs text-indigo-900 dark:text-indigo-200">
            <span className="font-bold text-indigo-950 dark:text-indigo-100">
              §15.2 Architectural Disclosure Gate & Immutability Invariant:
            </span>{" "}
            A case cannot be closed as <span className="font-mono font-bold bg-indigo-100 px-1 py-0.5 rounded dark:bg-indigo-900">FULFILLED</span> unless identity is verified (<span className="font-mono">identity_verified = true</span>) AND at least one discovery manifest is attached. Any attempt to bypass returns HTTP 422. Once closed, the record is permanently locked by database trigger <span className="font-mono">rights_requests_closed_immutable</span>.
          </div>
        </div>
      </div>

      {/* ── Main Two-Column Interactive Grid ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ── Left Column: Step 1 (Intake) & Step 2 (Lifecycle Execution) ── */}
        <div className="space-y-6 lg:col-span-7">
          {/* ── Step 1: Case Intake Form ── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                    1
                  </span>
                  <CardTitle className="text-base">Intake New Rights Request</CardTitle>
                </div>
                <span className="text-xs font-medium text-slate-500">POST /privacy/rights-requests</span>
              </div>
              <CardDescription>
                Submit a new privacy data rights request or complaint into the audit ledger.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createAction} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={LABEL}>
                      Data Subject Reference (<span className="text-rose-500">*</span>)
                    </label>
                    <input
                      name="subject_ref"
                      type="text"
                      required
                      value={intakeSubject}
                      onChange={(e) => setIntakeSubject(e.target.value)}
                      placeholder="e.g. subject-alice@zoikosuite.com"
                      className={FIELD}
                    />
                    <p className={HINT}>The stable pseudonym or identifier of the natural person exercising the right.</p>
                  </div>

                  <div>
                    <label className={LABEL}>
                      Right Family (<span className="text-rose-500">*</span>)
                    </label>
                    <select
                      name="right_family"
                      value={intakeFamily}
                      onChange={(e) => setIntakeFamily(e.target.value as RightFamily)}
                      className={FIELD}
                    >
                      {RIGHT_FAMILIES.map((rf) => (
                        <option key={rf.value} value={rf.value}>
                          {rf.label}
                        </option>
                      ))}
                    </select>
                    <p className={HINT}>GDPR / CCPA statutory right category.</p>
                  </div>

                  <div>
                    <label className={LABEL}>Jurisdiction</label>
                    <input
                      name="jurisdiction"
                      type="text"
                      value={intakeJurisdiction}
                      onChange={(e) => setIntakeJurisdiction(e.target.value)}
                      placeholder="e.g. GDPR, UK_GDPR, CCPA"
                      className={FIELD}
                    />
                    <p className={HINT}>Applicable legal framework.</p>
                  </div>

                  <div>
                    <label className={LABEL}>Requester Reference</label>
                    <input
                      name="requester_ref"
                      type="text"
                      value={intakeRequester}
                      onChange={(e) => setIntakeRequester(e.target.value)}
                      placeholder="Same as subject, or legal counsel"
                      className={FIELD}
                    />
                    <p className={HINT}>Direct subject or authorized legal representative.</p>
                  </div>

                  <div>
                    <label className={LABEL}>Submitted Via</label>
                    <input
                      name="submitted_via"
                      type="text"
                      value={intakeSubmittedVia}
                      onChange={(e) => setIntakeSubmittedVia(e.target.value)}
                      placeholder="e.g. PRIVACY_PORTAL, EMAIL, DPO_DESK"
                      className={FIELD}
                    />
                    <p className={HINT}>Channel through which request was received.</p>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={createPending} className="flex items-center gap-2">
                    {createPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    <span>{createPending ? "Intaking Case..." : "Intake Rights Case"}</span>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* ── Step 2: Lifecycle Management for Active Case ── */}
          <Card className={!activeRequest ? "opacity-60 pointer-events-none" : ""}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                    2
                  </span>
                  <CardTitle className="text-base">Case Lifecycle & Disclosure Gate</CardTitle>
                </div>
                {activeRequest && (
                  <div className="flex items-center gap-2">
                    {getStatusBadge(activeRequest.status)}
                    {activeRequest.identity_verified ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Identity Assured
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" /> Identity Unverified
                      </span>
                    )}
                  </div>
                )}
              </div>
              <CardDescription>
                {activeRequest
                  ? `Advancing Case ${activeRequest.request_id} through identity assurance, discovery manifests, and closure.`
                  : "Intake a new case above or look up an existing case to unlock lifecycle actions."}
              </CardDescription>

              {/* Lifecycle Stage Switcher Tabs */}
              {activeRequest && (
                <div className="mt-3 flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setActiveTab("verify")}
                    className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                      activeTab === "verify"
                        ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-400"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                    }`}
                  >
                    2A. Identity Verification
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("manifest")}
                    className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                      activeTab === "manifest"
                        ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-400"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                    }`}
                  >
                    2B. Discovery Manifest
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("close")}
                    className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                      activeTab === "close"
                        ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-400"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                    }`}
                  >
                    2C. Close Request (§15.2)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("wfc")}
                    className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                      activeTab === "wfc"
                        ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-400"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                    }`}
                  >
                    2D. WFC Process Ref
                  </button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {activeRequest?.status === "CLOSED" ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-800 dark:bg-slate-900/50">
                  <Lock className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    This case is CLOSED and permanently immutable
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Outcome: <span className="font-bold">{activeRequest.outcome}</span> at {activeRequest.closed_at}. Database triggers block any further identity events, manifests, or closure updates.
                  </p>
                </div>
              ) : (
                <>
                  {/* ── Sub-Form 2A: Record Identity Verification ── */}
                  {activeTab === "verify" && (
                    <form action={verifyAction} className="space-y-4">
                      <input type="hidden" name="request_id" value={activeRequest?.request_id || ""} />

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className={LABEL}>Verification Outcome (<span className="text-rose-500">*</span>)</label>
                          <select
                            name="verified"
                            value={verifyVerified}
                            onChange={(e) => setVerifyVerified(e.target.value)}
                            className={FIELD}
                          >
                            <option value="true">VERIFIED (Identity confirmed)</option>
                            <option value="false">UNVERIFIED (Verification failed / rejected)</option>
                          </select>
                          <p className={HINT}>Setting to VERIFIED advances status to IDENTITY_VERIFIED.</p>
                        </div>

                        <div>
                          <label className={LABEL}>Verification Method (<span className="text-rose-500">*</span>)</label>
                          <input
                            name="method"
                            type="text"
                            required
                            value={verifyMethod}
                            onChange={(e) => setVerifyMethod(e.target.value)}
                            placeholder="e.g. MFA_TOKEN, PASSPORT_SCAN, OIDC_IDP"
                            className={FIELD}
                          />
                          <p className={HINT}>Audit trail mechanism used to assure subject identity.</p>
                        </div>

                        <div className="sm:col-span-2">
                          <label className={LABEL}>Verification Note</label>
                          <textarea
                            name="note"
                            rows={2}
                            value={verifyNote}
                            onChange={(e) => setVerifyNote(e.target.value)}
                            placeholder="Notes on identity assurance verification"
                            className={FIELD}
                          />
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button type="submit" disabled={verifyPending} className="flex items-center gap-2">
                          {verifyPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                          <span>{verifyPending ? "Recording..." : "Record Identity Verification"}</span>
                        </Button>
                      </div>
                    </form>
                  )}

                  {/* ── Sub-Form 2B: Attach Discovery Manifest ── */}
                  {activeTab === "manifest" && (
                    <form action={manifestAction} className="space-y-4">
                      <input type="hidden" name="request_id" value={activeRequest?.request_id || ""} />

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className={LABEL}>Data Domain (<span className="text-rose-500">*</span>)</label>
                          <input
                            name="domain"
                            type="text"
                            required
                            value={manifestDomain}
                            onChange={(e) => setManifestDomain(e.target.value)}
                            placeholder="e.g. CRM_HUBSPOT, BILLING_ERP, WAREHOUSE"
                            className={FIELD}
                          />
                          <p className={HINT}>Domain / system adapter that executed discovery.</p>
                        </div>

                        <div>
                          <label className={LABEL}>Candidate Count (<span className="text-rose-500">*</span>)</label>
                          <input
                            name="candidate_count"
                            type="number"
                            min="0"
                            required
                            value={manifestCount}
                            onChange={(e) => setManifestCount(e.target.value)}
                            placeholder="e.g. 14"
                            className={FIELD}
                          />
                          <p className={HINT}>Number of matching records found for this subject.</p>
                        </div>

                        <div className="sm:col-span-2">
                          <label className={LABEL}>Content Hash (SHA-256) (<span className="text-rose-500">*</span>)</label>
                          <input
                            name="content_hash"
                            type="text"
                            required
                            value={manifestHash}
                            onChange={(e) => setManifestHash(e.target.value)}
                            placeholder="e.g. e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
                            className={`${FIELD} font-mono text-xs`}
                          />
                          <p className={HINT}>Cryptographic digest of discovered payload data.</p>
                        </div>

                        <div className="sm:col-span-2">
                          <label className={LABEL}>Evidence Reference / URI</label>
                          <input
                            name="evidence_ref"
                            type="text"
                            value={manifestRef}
                            onChange={(e) => setManifestRef(e.target.value)}
                            placeholder="s3://zoiko-evidence-vault/manifests/export.json"
                            className={FIELD}
                          />
                          <p className={HINT}>Immutable object store URI or vault reference.</p>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button type="submit" disabled={manifestPending} className="flex items-center gap-2">
                          {manifestPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
                          <span>{manifestPending ? "Attaching..." : "Attach Discovery Manifest"}</span>
                        </Button>
                      </div>
                    </form>
                  )}

                  {/* ── Sub-Form 2C: Close Request ── */}
                  {activeTab === "close" && (
                    <form action={closeAction} className="space-y-4">
                      <input type="hidden" name="request_id" value={activeRequest?.request_id || ""} />

                      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                        <div className="flex items-center gap-2 font-bold mb-1">
                          <AlertTriangle className="h-4 w-4 text-amber-600" /> §15.2 Disclosure Gate Requirement:
                        </div>
                        If outcome is <span className="font-bold">FULFILLED</span>, the case MUST have identity verified (<span className="font-mono">true</span>) AND at least one discovery manifest attached. Selecting FULFILLED prematurely will trigger an HTTP 422 refusal.
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className={LABEL}>Closure Outcome (<span className="text-rose-500">*</span>)</label>
                          <select
                            name="outcome"
                            value={closeOutcome}
                            onChange={(e) => setCloseOutcome(e.target.value as Outcome)}
                            className={FIELD}
                          >
                            <option value="FULFILLED">FULFILLED (Enforces §15.2 Disclosure Gate)</option>
                            <option value="REJECTED">REJECTED (Exempt from verification/manifest gate)</option>
                            <option value="WITHDRAWN">WITHDRAWN (Requester retracted request)</option>
                          </select>
                        </div>

                        <div>
                          <label className={LABEL}>Response Evidence Hash</label>
                          <input
                            name="response_evidence_hash"
                            type="text"
                            value={closeHash}
                            onChange={(e) => setCloseHash(e.target.value)}
                            placeholder="SHA-256 of delivered package"
                            className={`${FIELD} font-mono text-xs`}
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className={LABEL}>Closure Reason / Notes</label>
                          <textarea
                            name="reason"
                            rows={2}
                            value={closeReason}
                            onChange={(e) => setCloseReason(e.target.value)}
                            placeholder="Reason for closing or fulfilment notes"
                            className={FIELD}
                          />
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button type="submit" disabled={closePending} className="flex items-center gap-2">
                          {closePending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                          <span>{closePending ? "Closing Case..." : "Close Rights Request"}</span>
                        </Button>
                      </div>
                    </form>
                  )}

                  {/* ── Sub-Form 2D: Attach WFC Process Ref ── */}
                  {activeTab === "wfc" && (
                    <form action={wfcRefAction} className="space-y-4">
                      <input type="hidden" name="request_id" value={activeRequest?.request_id || ""} />

                      <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-xs text-indigo-800 dark:border-indigo-900/40 dark:bg-indigo-950/20 dark:text-indigo-300">
                        <div className="flex items-center gap-2 font-bold mb-1">
                          <Zap className="h-4 w-4 text-indigo-600" /> §14.1 Workflow Orchestration Linkage:
                        </div>
                        PRV-04 owns case meaning and evidence. WFC (workflow-svc) owns task orchestration, approvals, and deadlines. Attach a workflow process reference to bind this case to its long-running execution.
                      </div>

                      <div>
                        <label className={LABEL}>Workflow Process Reference (<span className="text-rose-500">*</span>)</label>
                        <input
                          name="wfc_process_ref"
                          type="text"
                          required
                          value={wfcProcessRef}
                          onChange={(e) => setWFCProcessRef(e.target.value)}
                          placeholder="e.g. wfc-proc-2026-08154"
                          className={FIELD}
                        />
                        <p className={HINT}>Identifier of the workflow execution coordinating multi-domain discovery and fulfilment.</p>
                      </div>

                      <div className="flex justify-end">
                        <Button type="submit" disabled={wfcRefPending} className="flex items-center gap-2">
                          {wfcRefPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                          <span>{wfcRefPending ? "Attaching..." : "Attach WFC Process Ref"}</span>
                        </Button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right Column: Case Inspector, Evidence Manifests & Search ── */}
        <div className="space-y-6 lg:col-span-5">
          {/* ── Active Case Inspector ── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-4 w-4 text-indigo-600" />
                  Active Case Inspector
                </CardTitle>
                {activeRequest && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const form = new FormData();
                      form.append("request_id", activeRequest.request_id);
                      lookupAction(form);
                    }}
                    disabled={lookupPending}
                    className="h-7 text-xs"
                  >
                    <RefreshCw className={`h-3 w-3 ${lookupPending ? "animate-spin" : ""}`} />
                  </Button>
                )}
              </div>
              <CardDescription>
                Live snapshot of case state from <code className="text-xs">privacy_rights</code> database.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeRequest ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/40 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Request ID:</span>
                      <CopyableId value={activeRequest.request_id} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Subject:</span>
                      <span className="font-mono text-slate-900 dark:text-slate-100">{activeRequest.subject_ref}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Right Family:</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">{activeRequest.right_family}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Status:</span>
                      {getStatusBadge(activeRequest.status)}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Identity Verified:</span>
                      <span className={`font-bold ${activeRequest.identity_verified ? "text-emerald-600" : "text-amber-600"}`}>
                        {activeRequest.identity_verified ? "YES" : "NO"}
                      </span>
                    </div>
                    {activeRequest.outcome && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">Outcome:</span>
                        {getOutcomeBadge(activeRequest.outcome)}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Created:</span>
                      <span className="text-slate-700 dark:text-slate-300">{new Date(activeRequest.created_at).toLocaleString()}</span>
                    </div>
                    {activeRequest.closed_at && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">Closed:</span>
                        <span className="text-slate-700 dark:text-slate-300">{new Date(activeRequest.closed_at).toLocaleString()}</span>
                      </div>
                    )}
                    {activeRequest.wfc_process_ref && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">WFC Process Ref:</span>
                        <span className="font-mono text-indigo-600 dark:text-indigo-400">{activeRequest.wfc_process_ref}</span>
                      </div>
                    )}
                    {typeof activeRequest.response_package_version === "number" && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">Response Version (I21):</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">v{activeRequest.response_package_version}</span>
                      </div>
                    )}
                  </div>

                  {/* ── Manifests Sub-Section ── */}
                  {(() => {
                    const manifestList = Array.isArray(activeManifests) ? activeManifests : [];
                    return (
                      <div>
                        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center justify-between">
                          <span>Attached Discovery Manifests ({manifestList.length})</span>
                          {manifestList.length > 0 && (
                            <span className="text-emerald-600 font-semibold text-[11px] flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Ready for §15.2 Gate
                            </span>
                          )}
                        </h4>

                        {manifestList.length === 0 ? (
                          <div className="rounded-md border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400 dark:border-slate-800">
                            No discovery manifests attached yet.
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {manifestList.map((m) => (
                              <div
                                key={m.manifest_id}
                                className="rounded-md border border-slate-200 bg-white p-2.5 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900"
                              >
                                <div className="flex items-center justify-between font-semibold">
                                  <span className="text-indigo-600 dark:text-indigo-400">{m.domain}</span>
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    {m.candidate_count} records
                                  </span>
                                </div>
                                <div className="mt-1 font-mono text-[10px] text-slate-500 truncate" title={m.content_hash}>
                                  Hash: {m.content_hash}
                                </div>
                                {m.evidence_ref && (
                                  <div className="mt-0.5 text-[10px] text-slate-400 truncate" title={m.evidence_ref}>
                                    URI: {m.evidence_ref}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── JSON Payload Details ── */}
                  <JsonBlock value={{ request: activeRequest, manifests: Array.isArray(activeManifests) ? activeManifests : [] }} />
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  <FileText className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                  No case selected. Intake a case or search below.
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Lookup By ID or Search By Subject ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-4 w-4 text-indigo-600" />
                Case Lookup & Subject Ledger
              </CardTitle>
              <CardDescription>
                Query existing cases directly from <code className="text-xs">privacy-rights-svc (:8154)</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Lookup by Request ID */}
              <form action={lookupAction} className="space-y-2">
                <label className={LABEL}>Lookup by Request ID (UUID)</label>
                <div className="flex gap-2">
                  <input
                    name="request_id"
                    type="text"
                    required
                    placeholder="Enter UUID..."
                    className={FIELD}
                  />
                  <Button type="submit" variant="secondary" disabled={lookupPending} className="shrink-0">
                    {lookupPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </form>

              <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                {/* Search by Subject Ref */}
                <form action={searchAction} className="space-y-2">
                  <label className={LABEL}>Search by Subject Reference</label>
                  <div className="flex gap-2">
                    <input
                      name="subject_ref"
                      type="text"
                      required
                      placeholder="e.g. subject-alice-access@zoikosuite.com"
                      className={FIELD}
                    />
                    <Button type="submit" variant="secondary" disabled={searchPending} className="shrink-0">
                      {searchPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </form>

                {searchState.subjectRequests && searchState.subjectRequests.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Found {searchState.subjectRequests.length} Cases:
                    </span>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {searchState.subjectRequests.map((req) => (
                        <div
                          key={req.request_id}
                          onClick={() => {
                            setActiveRequest(req);
                            const form = new FormData();
                            form.append("request_id", req.request_id);
                            lookupAction(form);
                          }}
                          className="cursor-pointer rounded border border-slate-200 p-2 text-xs hover:bg-indigo-50/50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-indigo-600">{req.right_family}</span>
                            {getStatusBadge(req.status)}
                          </div>
                          <div className="font-mono text-[10px] text-slate-500 truncate">{req.request_id}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
