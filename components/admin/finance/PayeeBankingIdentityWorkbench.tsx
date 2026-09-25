"use client";

import { useState, useActionState, useEffect } from "react";
import {
  Building2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Search,
  Lock,
  Unlock,
  FileCheck2,
  UserCheck,
  RefreshCw,
  Fingerprint,
  Layers,
  Activity,
  ArrowRight,
  Send,
  Ban,
  BadgeCheck,
  History,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from "@/components/ui";
import { FIELD, LABEL, HINT, BANNER_SUCCESS, BANNER_ERROR } from "@/components/admin/shared/form";
import { JsonBlock } from "@/components/admin/shared/JsonBlock";
import { ResultBanner } from "@/components/admin/shared/ResultBanner";
import {
  proposePayeeAction,
  verifyPayeeAction,
  approvePayeeAction,
  activatePayeeAction,
  suspendPayeeAction,
  lookupPayeeDestinationAction,
  lookupActivePayeeAction,
  type PayeeActionState,
} from "@/app/admin/finance/payee-actions";
import type { PayeeDestination, ChangeEvent, SourceType } from "@/lib/api/payee-banking";

const IDLE_ACTION: PayeeActionState = { status: "idle" };

const STATUS_BADGES: Record<string, string> = {
  CANDIDATE: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/50",
  VERIFICATION_PENDING: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/50",
  VERIFIED: "bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-700/50",
  APPROVAL_PENDING: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700/50",
  ACTIVE: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700/50",
  SUSPENDED: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700/50",
  SUPERSEDED: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

export function PayeeBankingIdentityWorkbench() {
  const [activeTab, setActiveTab] = useState<"propose" | "verify" | "approve" | "activate" | "register">("propose");
  const [activeActor, setActiveActor] = useState<string>("44444444-4444-4444-4444-444444444444");
  const [lastDestinationId, setLastDestinationId] = useState<string>("");

  // Server Action hooks
  const [proposeState, proposeSubmit, proposePending] = useActionState(proposePayeeAction, IDLE_ACTION);
  const [verifyState, verifySubmit, verifyPending] = useActionState(verifyPayeeAction, IDLE_ACTION);
  const [approveState, approveSubmit, approvePending] = useActionState(approvePayeeAction, IDLE_ACTION);
  const [activateState, activateSubmit, activatePending] = useActionState(activatePayeeAction, IDLE_ACTION);
  const [suspendState, suspendSubmit, suspendPending] = useActionState(suspendPayeeAction, IDLE_ACTION);
  const [lookupState, lookupSubmit, lookupPending] = useActionState(lookupPayeeDestinationAction, IDLE_ACTION);
  const [registerState, registerSubmit, registerPending] = useActionState(lookupActivePayeeAction, IDLE_ACTION);

  // Sync latest destination ID across tabs
  useEffect(() => {
    if (proposeState.destinationId) setLastDestinationId(proposeState.destinationId);
  }, [proposeState.destinationId]);

  useEffect(() => {
    if (verifyState.destinationId) setLastDestinationId(verifyState.destinationId);
  }, [verifyState.destinationId]);

  useEffect(() => {
    if (approveState.destinationId) setLastDestinationId(approveState.destinationId);
  }, [approveState.destinationId]);

  useEffect(() => {
    if (activateState.destinationId) setLastDestinationId(activateState.destinationId);
  }, [activateState.destinationId]);

  return (
    <div className="space-y-6">
      {/* ── Domain Architecture Header ───────────────────────────────────── */}
      <Card className="border-navy-200 dark:border-navy-500/30 overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-navy-900 via-navy-800 to-indigo-950 p-6 text-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Service (Port :8166)
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  ORG-10 Master Registry
                </span>
              </div>
              <h2 className="mt-2 text-xl font-bold tracking-tight">
                Payee Banking Identity & Destination Governance
              </h2>
              <p className="mt-1 text-xs text-navy-200 max-w-3xl">
                Authoritative external beneficiary banking master with cryptographic SHA-256 fingerprint duplicate detection,
                independent verification rules, dynamic Maker-Checker Segregation of Duties (SoD), and PII data masking.
              </p>
            </div>

            {/* Quick Metrics */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-lg bg-navy-800/80 border border-navy-700/60 px-3 py-2 text-center">
                <div className="text-[10px] uppercase tracking-wider text-navy-300">Counterparty Gate</div>
                <div className="text-xs font-bold text-emerald-400 flex items-center justify-center gap-1 mt-0.5">
                  <BadgeCheck className="h-3.5 w-3.5" /> :8124 Verified
                </div>
              </div>
              <div className="rounded-lg bg-navy-800/80 border border-navy-700/60 px-3 py-2 text-center">
                <div className="text-[10px] uppercase tracking-wider text-navy-300">SoD Maker-Checker</div>
                <div className="text-xs font-bold text-cyan-400 flex items-center justify-center gap-1 mt-0.5">
                  <ShieldCheck className="h-3.5 w-3.5" /> :8089 Enforced
                </div>
              </div>
              <div className="rounded-lg bg-navy-800/80 border border-navy-700/60 px-3 py-2 text-center">
                <div className="text-[10px] uppercase tracking-wider text-navy-300">PII Masking</div>
                <div className="text-xs font-bold text-purple-300 flex items-center justify-center gap-1 mt-0.5">
                  <Lock className="h-3.5 w-3.5" /> Last4 Only
                </div>
              </div>
            </div>
          </div>

          {/* Active Principal Context Bar */}
          <div className="mt-5 pt-4 border-t border-navy-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-navy-200">
              <UserCheck className="h-4 w-4 text-navy-400" />
              <span>Acting Principal Identity:</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label="Acting Principal Identity"
                value={activeActor}
                onChange={(e) => setActiveActor(e.target.value)}
                className="bg-navy-950 text-white text-xs border border-navy-700 rounded-md px-3 py-1.5 focus:ring-1 focus:ring-blue-400 outline-none"
              >
                <option value="44444444-4444-4444-4444-444444444444">
                  Dr. Alistair Vance (Proposer / Supplier Editor) [4444...4444]
                </option>
                <option value="55555555-5555-5555-5555-555555555555">
                  Elena Rostova (CFO / Authorized Checker) [5555...5555]
                </option>
                <option value="33333333-3333-3333-3333-333333333333">
                  Lingaraj (Platform Super Admin) [3333...3333]
                </option>
              </select>
              <span className="text-[11px] text-navy-300">
                (Switch actors to test Maker-Checker self-approval refusal)
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab("propose")}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === "propose"
                ? "border-navy-900 text-navy-900 dark:border-navy-400 dark:text-navy-300 bg-white dark:bg-slate-900"
                : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Building2 className="h-4 w-4" />
            1. Propose Candidate
          </button>
          <button
            onClick={() => setActiveTab("verify")}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === "verify"
                ? "border-navy-900 text-navy-900 dark:border-navy-400 dark:text-navy-300 bg-white dark:bg-slate-900"
                : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <FileCheck2 className="h-4 w-4" />
            2. Verify Candidate
          </button>
          <button
            onClick={() => setActiveTab("approve")}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === "approve"
                ? "border-navy-900 text-navy-900 dark:border-navy-400 dark:text-navy-300 bg-white dark:bg-slate-900"
                : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            3. Maker-Checker SoD Approval
          </button>
          <button
            onClick={() => setActiveTab("activate")}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === "activate"
                ? "border-navy-900 text-navy-900 dark:border-navy-400 dark:text-navy-300 bg-white dark:bg-slate-900"
                : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            4. Activate & Suspend
          </button>
          <button
            onClick={() => setActiveTab("register")}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === "register"
                ? "border-navy-900 text-navy-900 dark:border-navy-400 dark:text-navy-300 bg-white dark:bg-slate-900"
                : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Layers className="h-4 w-4" />
            5. Active Destination & Audit
          </button>
        </div>
      </Card>

      {/* ── Tab 1: Propose Candidate ────────────────────────────────────── */}
      {activeTab === "propose" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-navy-700 dark:text-navy-300" />
                  Step 1: Propose Payee Banking Destination Candidate
                </CardTitle>
                <CardDescription className="text-xs">
                  Proposes a new banking destination for a counterparty. Requires an existing active party in <code className="font-mono text-xs">counterparty-management-svc (:8124)</code>.
                  Generates an immutable SHA-256 fingerprint <code className="font-mono text-xs">(institution|account|currency)</code> to prevent duplicates.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const form = document.getElementById("propose-form") as HTMLFormElement;
                    if (form) {
                      (form.elements.namedItem("party_ref") as HTMLInputElement).value = "cp-acme-corp-01";
                      (form.elements.namedItem("payee_name") as HTMLInputElement).value = "Acme Global Supplies Ltd";
                      (form.elements.namedItem("financial_institution") as HTMLInputElement).value = "Barclays Bank UK";
                      (form.elements.namedItem("account_identifier") as HTMLInputElement).value = "GB29BARC200000" + Math.floor(10000000 + Math.random() * 90000000);
                      (form.elements.namedItem("source_type") as HTMLSelectElement).value = "MANUAL_ENTRY";
                    }
                  }}
                  className="text-xs"
                >
                  Autofill Valid Candidate
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const form = document.getElementById("propose-form") as HTMLFormElement;
                    if (form) {
                      (form.elements.namedItem("party_ref") as HTMLInputElement).value = "cp-acme-corp-01";
                      (form.elements.namedItem("payee_name") as HTMLInputElement).value = "Acme Global Supplies Ltd";
                      (form.elements.namedItem("financial_institution") as HTMLInputElement).value = "Barclays Bank UK";
                      (form.elements.namedItem("account_identifier") as HTMLInputElement).value = "GB29BARC200000" + Math.floor(10000000 + Math.random() * 90000000);
                      (form.elements.namedItem("source_type") as HTMLSelectElement).value = "INVOICE_OCR";
                    }
                  }}
                  className="text-xs text-amber-700 border-amber-300 dark:text-amber-400"
                >
                  Autofill Invoice OCR (Strict Rule)
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const form = document.getElementById("propose-form") as HTMLFormElement;
                    if (form) {
                      (form.elements.namedItem("party_ref") as HTMLInputElement).value = "cp-non-existent-vendor-99";
                    }
                  }}
                  className="text-xs text-rose-700 border-rose-300 dark:text-rose-400"
                >
                  Autofill Non-existent Party
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {proposeState.status === "error" && (
              <div className="mb-4">
                <ResultBanner tone="error" message={proposeState.message } />
              </div>
            )}
            {proposeState.status === "success" && (
              <div className="mb-4">
                <ResultBanner tone="success" message={proposeState.message } />
                {proposeState.destination && (
                  <div className="mt-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Created Destination ID:</span>
                      <code className="font-mono bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 font-bold">
                        {proposeState.destination.DestinationID}
                      </code>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                      <div>
                        <span className="text-slate-500">Status:</span>{" "}
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${STATUS_BADGES[proposeState.destination.Status]}`}>
                          {proposeState.destination.Status}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Masked Account:</span>{" "}
                        <span className="font-mono font-medium">•••• {proposeState.destination.AccountLast4}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Party Ref:</span>{" "}
                        <span className="font-mono">{proposeState.destination.PartyRef}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Source Type:</span>{" "}
                        <span className="font-medium text-slate-800 dark:text-slate-200">{proposeState.destination.SourceType}</span>
                      </div>
                    </div>
                    <div className="pt-2 flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => setActiveTab("verify")}
                        className="text-xs bg-navy-900 hover:bg-navy-800 text-white flex items-center gap-1.5"
                      >
                        Proceed to Verification <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <form id="propose-form" action={proposeSubmit} className="space-y-4">
              <input type="hidden" name="actor_principal_id" value={activeActor} />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="legal_entity_id" className={LABEL}>
                    Legal Entity ID
                  </label>
                  <select id="legal_entity_id" name="legal_entity_id" defaultValue="11111111-1111-1111-1111-111111111111" className={FIELD}>
                    <option value="11111111-1111-1111-1111-111111111111">UK Operating Entity (11111111-1111-1111-1111-111111111111)</option>
                    <option value="22222222-2222-2222-2222-222222222222">US Operations Corp (22222222-2222-2222-2222-222222222222)</option>
                  </select>
                  <p className={HINT}>The legal entity responsible for paying this beneficiary</p>
                </div>

                <div>
                  <label htmlFor="party_ref" className={LABEL}>
                    Counterparty Party Ref (ORG-07)
                  </label>
                  <input
                    id="party_ref"
                    name="party_ref"
                    defaultValue="cp-acme-corp-01"
                    placeholder="e.g. cp-acme-corp-01"
                    className={FIELD}
                    required
                  />
                  <p className={HINT}>Must exist in counterparty-management-svc (:8124) (e.g. cp-acme-corp-01 or cp-apex-logistics-02)</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="financial_institution" className={LABEL}>
                    Financial Institution / Bank
                  </label>
                  <input
                    id="financial_institution"
                    name="financial_institution"
                    defaultValue="Barclays Bank UK"
                    placeholder="e.g. Barclays Bank UK"
                    className={FIELD}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="account_identifier" className={LABEL}>
                    Account Identifier / IBAN (Full Number)
                  </label>
                  <input
                    id="account_identifier"
                    name="account_identifier"
                    defaultValue="GB29BARC20000087654321"
                    placeholder="Full account number or IBAN"
                    className={FIELD}
                    required
                  />
                  <p className={HINT}>Full number is stored securely; masked to Last 4 digits on reads</p>
                </div>

                <div>
                  <label htmlFor="payee_name" className={LABEL}>
                    Payee / Beneficiary Name
                  </label>
                  <input
                    id="payee_name"
                    name="payee_name"
                    defaultValue="Acme Global Supplies Ltd"
                    placeholder="Beneficiary legal name"
                    className={FIELD}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="country_code" className={LABEL}>
                    Country Code (ISO 3166-1)
                  </label>
                  <input
                    id="country_code"
                    name="country_code"
                    defaultValue="GB"
                    maxLength={2}
                    className={FIELD}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="currency" className={LABEL}>
                    Currency (ISO 4217)
                  </label>
                  <input
                    id="currency"
                    name="currency"
                    defaultValue="GBP"
                    maxLength={3}
                    className={FIELD}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="source_type" className={LABEL}>
                    Source Type (Evidence Channel)
                  </label>
                  <select id="source_type" name="source_type" defaultValue="MANUAL_ENTRY" className={FIELD}>
                    <option value="MANUAL_ENTRY">MANUAL_ENTRY (Admin Console Entry)</option>
                    <option value="SUPPLIER_PORTAL">SUPPLIER_PORTAL (Supplier Authenticated Self-Service)</option>
                    <option value="INVOICE_OCR">INVOICE_OCR (Invoice Scan - Requires Independent Verification)</option>
                    <option value="EMAIL">EMAIL (Email Request - Requires Independent Verification)</option>
                  </select>
                  <p className={HINT}>Invoice OCR and Email require independent verification before approval</p>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  disabled={proposePending}
                  className="bg-navy-900 hover:bg-navy-800 text-white flex items-center gap-2"
                >
                  {proposePending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" /> Proposing Destination...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" /> Propose Candidate (:8166)
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Tab 2: Verify Candidate ─────────────────────────────────────── */}
      {activeTab === "verify" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCheck2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  Step 2: Verify Payee Banking Destination
                </CardTitle>
                <CardDescription className="text-xs">
                  Transitions candidate from <code className="font-mono text-xs">CANDIDATE</code> to <code className="font-mono text-xs">VERIFIED</code>.
                  Negative Rule: If Source Type is <code className="font-mono text-xs">INVOICE_OCR</code> or <code className="font-mono text-xs">EMAIL</code>, verification method CANNOT be the same source (independent proof required).
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const form = document.getElementById("verify-form") as HTMLFormElement;
                    if (form && lastDestinationId) {
                      (form.elements.namedItem("destination_id") as HTMLInputElement).value = lastDestinationId;
                      (form.elements.namedItem("verification_method") as HTMLSelectElement).value = "BANK_STATEMENT";
                      (form.elements.namedItem("verification_evidence_ref") as HTMLInputElement).value = "EVID-BARCLAYS-STMT-2026-09";
                    }
                  }}
                  className="text-xs"
                  disabled={!lastDestinationId}
                >
                  Load Latest Proposed ID
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const form = document.getElementById("verify-form") as HTMLFormElement;
                    if (form) {
                      (form.elements.namedItem("verification_method") as HTMLSelectElement).value = "SAME_AS_SOURCE";
                    }
                  }}
                  className="text-xs text-rose-700 border-rose-300 dark:text-rose-400"
                >
                  Test Negative Method (SAME_AS_SOURCE)
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {verifyState.status === "error" && (
              <div className="mb-4">
                <ResultBanner tone="error" message={verifyState.message } />
              </div>
            )}
            {verifyState.status === "success" && (
              <div className="mb-4">
                <ResultBanner tone="success" message={verifyState.message } />
                {verifyState.destination && (
                  <div className="mt-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Verified Destination:</span>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${STATUS_BADGES[verifyState.destination.Status]}`}>
                        {verifyState.destination.Status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
                      <div>
                        <span className="text-slate-500">Method:</span>{" "}
                        <span className="font-semibold text-cyan-600 dark:text-cyan-400">{verifyState.destination.VerificationMethod}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Evidence Ref:</span>{" "}
                        <span className="font-mono">{verifyState.destination.VerificationEvidenceRef}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Verified By:</span>{" "}
                        <span className="font-mono text-slate-600 dark:text-slate-400">{verifyState.destination.VerifiedByPrincipalID?.slice(0, 8)}...</span>
                      </div>
                    </div>
                    <div className="pt-2 flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => setActiveTab("approve")}
                        className="text-xs bg-navy-900 hover:bg-navy-800 text-white flex items-center gap-1.5"
                      >
                        Proceed to Maker-Checker Approval <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <form id="verify-form" action={verifySubmit} className="space-y-4">
              <input type="hidden" name="actor_principal_id" value={activeActor} />

              <div>
                <label htmlFor="verify_destination_id" className={LABEL}>
                  Destination ID (UUID)
                </label>
                <input
                  id="verify_destination_id"
                  name="destination_id"
                  defaultValue={lastDestinationId}
                  placeholder="e.g. b35cce9f-a2dc-400d-ad10-554b6b01600c"
                  className={FIELD}
                  required
                />
                <p className={HINT}>Candidate destination to verify</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="verification_method" className={LABEL}>
                    Verification Method
                  </label>
                  <select id="verification_method" name="verification_method" defaultValue="BANK_STATEMENT" className={FIELD}>
                    <option value="BANK_STATEMENT">BANK_STATEMENT (Official Bank Statement Review)</option>
                    <option value="MICRO_DEPOSIT">MICRO_DEPOSIT (Penny Test / Micro-deposit Verification)</option>
                    <option value="BANK_API">BANK_API (Open Banking / Direct Verification API)</option>
                    <option value="SAME_AS_SOURCE">SAME_AS_SOURCE (Invalid: Negative Test)</option>
                    <option value="INVOICE_OCR">INVOICE_OCR (Invalid for OCR: Negative Test)</option>
                  </select>
                  <p className={HINT}>Must be genuinely independent of invoice/email source</p>
                </div>

                <div>
                  <label htmlFor="verification_evidence_ref" className={LABEL}>
                    Verification Evidence Reference
                  </label>
                  <input
                    id="verification_evidence_ref"
                    name="verification_evidence_ref"
                    defaultValue="EVID-BARCLAYS-STMT-2026-09"
                    placeholder="e.g. DOC-VAULT-REF-10928 or BANK-STMT-SCAN"
                    className={FIELD}
                    required
                  />
                  <p className={HINT}>Audit evidence document or system reference</p>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  disabled={verifyPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                >
                  {verifyPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" /> Verifying Destination...
                    </>
                  ) : (
                    <>
                      <FileCheck2 className="h-4 w-4" /> Verify Destination Candidate
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Tab 3: Maker-Checker SoD Approval ────────────────────────────── */}
      {activeTab === "approve" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  Step 3: Maker-Checker Segregation of Duties (SoD) Approval
                </CardTitle>
                <CardDescription className="text-xs">
                  Enforces strict Maker-Checker governance via <code className="font-mono text-xs">authorization-svc (:8089)</code>.
                  The proposer of a destination candidate cannot alone approve it (<code className="font-mono text-xs">OWN_OBJECT_FORBIDDEN</code>).
                  Must be approved by a different authorized checker (e.g. CFO Elena Rostova).
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {approveState.status === "error" && (
              <div className="mb-4">
                <ResultBanner tone="error" message={approveState.message } />
                <div className="mt-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300">
                  <p className="font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-rose-600" />
                    SoD Enforcement Verified (Negative Test Pass):
                  </p>
                  <p className="mt-1">
                    The backend refused self-approval with <code className="font-mono font-bold">403 Forbidden</code> because the acting principal matches the candidate proposer.
                    To approve this destination, switch the acting principal to <strong>Elena Rostova (CFO / Checker)</strong> below.
                  </p>
                </div>
              </div>
            )}
            {approveState.status === "success" && (
              <div className="mb-4">
                <ResultBanner tone="success" message={approveState.message } />
                {approveState.destination && (
                  <div className="mt-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Approved Destination:</span>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${STATUS_BADGES[approveState.destination.Status]}`}>
                        {approveState.destination.Status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
                      <div>
                        <span className="text-slate-500">Proposer:</span>{" "}
                        <span className="font-mono text-slate-600 dark:text-slate-400">{approveState.destination.ProposedByPrincipalID?.slice(0, 8)}...</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Checker / Approver:</span>{" "}
                        <span className="font-mono font-semibold text-purple-600 dark:text-purple-400">{approveState.destination.ApprovedByPrincipalID?.slice(0, 8)}...</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Approved At:</span>{" "}
                        <span className="font-medium text-slate-700 dark:text-slate-300">{approveState.destination.ApprovedAt ? new Date(approveState.destination.ApprovedAt).toLocaleTimeString() : "N/A"}</span>
                      </div>
                    </div>
                    <div className="pt-2 flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => setActiveTab("activate")}
                        className="text-xs bg-navy-900 hover:bg-navy-800 text-white flex items-center gap-1.5"
                      >
                        Proceed to Activation <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <form id="approve-form" action={approveSubmit} className="space-y-4">
              <div>
                <label htmlFor="approve_destination_id" className={LABEL}>
                  Destination ID (UUID)
                </label>
                <input
                  id="approve_destination_id"
                  name="destination_id"
                  defaultValue={lastDestinationId}
                  placeholder="e.g. 365983ce-144d-4b36-9359-c21e611d8e7f"
                  className={FIELD}
                  required
                />
                <p className={HINT}>Verified destination awaiting approval</p>
              </div>

              <div>
                <label htmlFor="approve_actor_principal_id" className={LABEL}>
                  Approver Principal Identity (Checker)
                </label>
                <select
                  id="approve_actor_principal_id"
                  name="actor_principal_id"
                  value={activeActor}
                  onChange={(e) => setActiveActor(e.target.value)}
                  className={FIELD}
                >
                  <option value="44444444-4444-4444-4444-444444444444">
                    Dr. Alistair Vance (Proposer) [4444...4444] — WILL FAIL SoD Check!
                  </option>
                  <option value="55555555-5555-5555-5555-555555555555">
                    Elena Rostova (CFO / Checker) [5555...5555] — AUTHORIZED CHECKER
                  </option>
                </select>
                <p className={HINT}>Select Alistair to demonstrate negative SoD block, or Elena to successfully approve</p>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  {activeActor === "44444444-4444-4444-4444-444444444444" ? (
                    <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> Testing SoD Refusal: Proposer attempting self-approval.
                    </span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Independent Checker Selected: Approved cross-officer decision.
                    </span>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={approvePending}
                  className={`flex items-center gap-2 text-white ${
                    activeActor === "44444444-4444-4444-4444-444444444444"
                      ? "bg-amber-600 hover:bg-amber-700"
                      : "bg-purple-600 hover:bg-purple-700"
                  }`}
                >
                  {approvePending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" /> Submitting Approval Decision...
                    </>
                  ) : activeActor === "44444444-4444-4444-4444-444444444444" ? (
                    <>
                      <Ban className="h-4 w-4" /> Test Self-Approval (Expect 403)
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" /> Approve as CFO (Checker)
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Tab 4: Activate & Suspend ────────────────────────────────────── */}
      {activeTab === "activate" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  Step 4: Activate or Suspend Payee Destination
                </CardTitle>
                <CardDescription className="text-xs">
                  Activation enforces the partial unique constraint: only one active version per party and scope.
                  Activating this destination automatically transitions any existing active destination to <code className="font-mono text-xs">SUPERSEDED</code>.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {activateState.status === "error" && (
              <div className="mb-4">
                <ResultBanner tone="error" message={activateState.message } />
              </div>
            )}
            {activateState.status === "success" && (
              <div className="mb-4">
                <ResultBanner tone="success" message={activateState.message } />
                {activateState.destination && (
                  <div className="mt-3 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-emerald-900 dark:text-emerald-200">Active Beneficiary Master Record:</span>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${STATUS_BADGES[activateState.destination.Status]}`}>
                        {activateState.destination.Status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                      <div>
                        <span className="text-slate-500">Destination ID:</span>{" "}
                        <span className="font-mono">{activateState.destination.DestinationID?.slice(0, 8)}...</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Bank:</span>{" "}
                        <span className="font-semibold">{activateState.destination.FinancialInstitution}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Account:</span>{" "}
                        <span className="font-mono font-bold">•••• {activateState.destination.AccountLast4}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Currency:</span>{" "}
                        <span className="font-semibold">{activateState.destination.Currency}</span>
                      </div>
                    </div>
                    <div className="pt-2 flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => setActiveTab("register")}
                        className="text-xs bg-navy-900 hover:bg-navy-800 text-white flex items-center gap-1.5"
                      >
                        Inspect Active Register & Audit Trail <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {suspendState.status === "error" && (
              <div className="mb-4">
                <ResultBanner tone="error" message={suspendState.message } />
              </div>
            )}
            {suspendState.status === "success" && (
              <div className="mb-4">
                <ResultBanner tone="success" message={suspendState.message } />
              </div>
            )}

            <div className="space-y-6">
              {/* Activation Form */}
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Activate Approved Destination
                </h4>
                <form action={activateSubmit} className="space-y-4">
                  <input type="hidden" name="actor_principal_id" value={activeActor} />
                  <div>
                    <label htmlFor="activate_destination_id" className={LABEL}>
                      Destination ID (UUID)
                    </label>
                    <input
                      id="activate_destination_id"
                      name="destination_id"
                      defaultValue={lastDestinationId}
                      placeholder="e.g. 365983ce-144d-4b36-9359-c21e611d8e7f"
                      className={FIELD}
                      required
                    />
                    <p className={HINT}>Must be in APPROVAL_PENDING state</p>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={activatePending}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
                    >
                      {activatePending ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" /> Activating...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4" /> Activate Destination (:8166)
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </div>

              {/* Suspend Form */}
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <Ban className="h-4 w-4 text-rose-600" />
                  Suspend Active Destination
                </h4>
                <form action={suspendSubmit} className="space-y-4">
                  <input type="hidden" name="actor_principal_id" value={activeActor} />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="suspend_destination_id" className={LABEL}>
                        Destination ID (UUID)
                      </label>
                      <input
                        id="suspend_destination_id"
                        name="destination_id"
                        defaultValue={lastDestinationId}
                        placeholder="Destination to suspend"
                        className={FIELD}
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="suspend_reason" className={LABEL}>
                        Suspension Reason
                      </label>
                      <input
                        id="suspend_reason"
                        name="reason"
                        defaultValue="Annual beneficiary compliance review pending"
                        placeholder="Reason for suspension"
                        className={FIELD}
                        required
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={suspendPending}
                      variant="secondary"
                      className="text-rose-700 border-rose-300 dark:text-rose-400 hover:bg-rose-50 flex items-center gap-2"
                    >
                      {suspendPending ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" /> Suspending...
                        </>
                      ) : (
                        <>
                          <Ban className="h-4 w-4" /> Suspend Destination
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tab 5: Active Destination & Audit Trail ─────────────────────── */}
      {activeTab === "register" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-5 w-5 text-navy-700 dark:text-navy-300" />
                Query Active Payee Destination & Version History
              </CardTitle>
              <CardDescription className="text-xs">
                Look up the current active destination and all version iterations for a specific counterparty reference.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {registerState.status === "error" && (
                <div className="mb-4">
                  <ResultBanner tone="error" message={registerState.message } />
                </div>
              )}
              {registerState.status === "success" && (
                <div className="mb-4">
                  <ResultBanner tone="success" message={registerState.message } />
                </div>
              )}

              <form action={registerSubmit} className="flex flex-col sm:flex-row gap-3">
                <input type="hidden" name="actor_principal_id" value={activeActor} />
                <div className="flex-1">
                  <label htmlFor="register_party_ref" className={LABEL}>
                    Counterparty Party Ref
                  </label>
                  <input
                    id="register_party_ref"
                    name="party_ref"
                    defaultValue="cp-acme-corp-01"
                    placeholder="e.g. cp-acme-corp-01"
                    className={FIELD}
                    required
                  />
                </div>
                <div className="w-40">
                  <label htmlFor="register_scope" className={LABEL}>
                    Scope
                  </label>
                  <input
                    id="register_scope"
                    name="scope"
                    defaultValue="DEFAULT"
                    className={FIELD}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="submit"
                    disabled={registerPending}
                    className="bg-navy-900 hover:bg-navy-800 text-white flex items-center gap-2 h-10"
                  >
                    {registerPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Query Master (:8166)
                  </Button>
                </div>
              </form>

              {/* Active Destination Card */}
              {registerState.destination && (
                <div className="mt-6 p-5 rounded-xl border border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800/60">
                  <div className="flex items-center justify-between pb-3 border-b border-emerald-200 dark:border-emerald-900/50">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-emerald-600 text-white">
                        <BadgeCheck className="h-5 w-5" />
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-emerald-950 dark:text-emerald-200">
                          Current Active Destination (ORG-10 Approved Master)
                        </h4>
                        <p className="text-xs text-emerald-700 dark:text-emerald-400">
                          Fingerprinted & ready for AP-10 payment authorization
                        </p>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-sm">
                      ACTIVE VERSION
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 text-xs">
                    <div>
                      <span className="text-slate-500 block">Payee Name:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">{registerState.destination.PayeeName}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Bank Institution:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{registerState.destination.FinancialInstitution}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Masked Account:</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Lock className="h-3 w-3 text-slate-400" />
                        •••• {registerState.destination.AccountLast4}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Currency & Country:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{registerState.destination.Currency} ({registerState.destination.CountryCode})</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-emerald-200/60 dark:border-emerald-900/40 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 block">Destination ID:</span>
                      <code className="font-mono text-slate-700 dark:text-slate-300 select-all">{registerState.destination.DestinationID}</code>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Candidate SHA-256 Fingerprint:</span>
                      <code className="font-mono text-slate-700 dark:text-slate-300 truncate block select-all">
                        {registerState.destination.Fingerprint}
                      </code>
                    </div>
                  </div>
                </div>
              )}

              {/* Version History Table */}
              {registerState.versions && registerState.versions.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Version Lineage for Party ({registerState.versions.length} records)
                  </h4>
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="px-3 py-2.5">Destination ID</th>
                          <th className="px-3 py-2.5">Institution</th>
                          <th className="px-3 py-2.5">Account</th>
                          <th className="px-3 py-2.5">Status</th>
                          <th className="px-3 py-2.5">Source</th>
                          <th className="px-3 py-2.5">Updated At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                        {registerState.versions.map((ver) => (
                          <tr key={ver.DestinationID} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                            <td className="px-3 py-2 text-blue-600 dark:text-blue-400 select-all font-bold">
                              {ver.DestinationID.slice(0, 13)}...
                            </td>
                            <td className="px-3 py-2 font-sans font-medium text-slate-800 dark:text-slate-200">
                              {ver.FinancialInstitution}
                            </td>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                              •••• {ver.AccountLast4}
                            </td>
                            <td className="px-3 py-2 font-sans">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${STATUS_BADGES[ver.Status] || ""}`}>
                                {ver.Status}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-sans text-slate-600 dark:text-slate-400">
                              {ver.SourceType}
                            </td>
                            <td className="px-3 py-2 text-slate-500 font-sans">
                              {new Date(ver.UpdatedAt).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Audit Event Lineage Inspector */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                Inspect Destination Change History & Audit Trail
              </CardTitle>
              <CardDescription className="text-xs">
                Inspect immutable audit events recorded in database table <code className="font-mono text-xs">payee_change_history</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {lookupState.status === "error" && (
                <div className="mb-4">
                  <ResultBanner tone="error" message={lookupState.message } />
                </div>
              )}

              <form action={lookupSubmit} className="flex gap-3">
                <input type="hidden" name="actor_principal_id" value={activeActor} />
                <div className="flex-1">
                  <label htmlFor="audit_destination_id" className={LABEL}>
                    Destination ID (UUID)
                  </label>
                  <input
                    id="audit_destination_id"
                    name="destination_id"
                    defaultValue={lastDestinationId}
                    placeholder="Enter Destination ID to view immutable event log"
                    className={FIELD}
                    required
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="submit"
                    disabled={lookupPending}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 h-10"
                  >
                    {lookupPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
                    Fetch Audit Events
                  </Button>
                </div>
              </form>

              {lookupState.history && lookupState.history.length > 0 && (
                <div className="mt-6 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Immutable Audit Trail ({lookupState.history.length} lifecycle events recorded)
                  </h4>
                  <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                    {lookupState.history.map((ev, i) => (
                      <div key={ev.EventID || i} className="relative text-xs">
                        <span className="absolute -left-6 top-1 h-3 w-3 rounded-full bg-indigo-600 ring-4 ring-white dark:ring-slate-900" />
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-indigo-700 dark:text-indigo-300">
                              {ev.EventType}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {new Date(ev.CreatedAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="mt-1 grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                            <div>Actor: {ev.ActorPrincipalID}</div>
                            <div>Detail: {ev.Detail || "N/A"}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
