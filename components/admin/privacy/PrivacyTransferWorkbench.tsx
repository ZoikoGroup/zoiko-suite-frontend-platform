"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  createMechanismAction,
  createRelationshipAction,
  toggleRelationshipStatusAction,
  attachSubprocessorAction,
  recordAssessmentAction,
  evaluateTransferAction,
  fetchTransferDashboardData,
  runAutomatedQASuiteAction,
  type QAScenarioResult,
} from "@/app/admin/privacy/transfer-actions";
import type {
  ProcessorRelationship,
  Subprocessor,
  TransferAssessment,
  TransferMechanism,
  TransferDecision,
  MechanismType,
  AssessmentOutcome,
} from "@/lib/api/privacy-transfer";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Play,
  RotateCw,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Globe,
  FileText,
  Server,
  Database,
  Building,
  Layers,
  Sparkles,
  ClipboardCopy,
  Info,
} from "lucide-react";

// Realistic Presets for QA manual testing
const REALISTIC_PRESETS = [
  {
    id: "preset-aws",
    title: "1. AWS Cloud Hosting (EU-GDPR to US-East-1)",
    badge: "SCC + Compliant TIA (AUTHORIZED)",
    mechanism: {
      type: "STANDARD_CONTRACTUAL_CLAUSES" as MechanismType,
      evidenceRef: "EUR-LEX-L-2021-199-SCC-V1",
      conditions: "Module 2: Controller-to-Processor. Mandates Schrems II supplementary HSM encryption.",
      validUntil: "2027-12-31",
    },
    relationship: {
      controller: "ZOIKO-HOLDINGS-EU",
      processor: "AWS-EMEA-SOCIETE",
      service: "Multi-Tenant Kubernetes Cloud Hosting & Dedicated VPC",
      instructions: "Store and process personal data solely on documented instructions; zero access without explicit authorization.",
      contractRef: "DPA-2026-AWS-EMEA-0091",
      categories: "Customer_PII, Financial_Transactions, Auth_Telemetry",
      subjects: "Platform_Users, Corporate_Employees",
      jurisdictions: "EU-GDPR, UK-GDPR",
    },
    subprocessor: {
      identity: "Snowflake Inc.",
      service: "Analytics Cloud Data Warehouse",
      purpose: "Telemetry and pseudonymized aggregation",
      scope: "Pseudonymized billing logs and audit records",
      locations: "US-East-1, EU-Central-1",
      onward: "AWS S3, Azure Blob",
      notification: "PRIOR_WRITTEN_NOTICE_30_DAYS",
      contractRef: "SUB-DPA-2026-SNOWFLAKE-04",
    },
    assessment: {
      outcome: "APPROVE" as AssessmentOutcome,
      risk: "LOW - FISA 702 foreign surveillance risk mitigated by customer-held HSM envelope encryption.",
      evidenceRef: "TIA-2026-AWS-EU-01",
      reviewTrigger: "2027-09-11",
    },
    destination: "US",
    expectDecision: "AUTHORIZED",
  },
  {
    id: "preset-stripe",
    title: "2. Stripe International Payments (UK to Global)",
    badge: "BCR + Tokenized Data (AUTHORIZED)",
    mechanism: {
      type: "BINDING_CORPORATE_RULES" as MechanismType,
      evidenceRef: "BCR-C-STRIPE-GLOBAL-2025",
      conditions: "PCI-DSS Level 1 certified tokenization; direct bank settlement across global entities.",
      validUntil: "2028-06-30",
    },
    relationship: {
      controller: "ZOIKO-PAYMENTS-UK",
      processor: "STRIPE-PAYMENTS-EUROPE",
      service: "Card Acquiring & Merchant Cross-Border Settlement",
      instructions: "Tokenize cardholder data at edge; execute cross-border settlement under approved Stripe BCR.",
      contractRef: "DPA-2026-STRIPE-0882",
      categories: "Payment_Card_Tokens, Billing_Address, Transaction_Amounts",
      subjects: "Billing_Contacts, Cardholders",
      jurisdictions: "UK-GDPR, EU-GDPR, PCI-DSS",
    },
    subprocessor: {
      identity: "Visa Direct Europe",
      service: "Card Network Clearing Engine",
      purpose: "Interbank clearing and fraud prevention",
      scope: "Card transaction payloads and auth tokens",
      locations: "EU-West-1, US-East-2",
      onward: "VisaNet",
      notification: "IMMEDIATE_NOTIFICATION_48_HOURS",
      contractRef: "SUB-DPA-VISA-2026-09",
    },
    assessment: {
      outcome: "APPROVE" as AssessmentOutcome,
      risk: "NEGLIGIBLE - Tokenized payloads with zero raw PAN exposure.",
      evidenceRef: "TIA-2026-STRIPE-BCR-02",
      reviewTrigger: "2027-06-30",
    },
    destination: "US",
    expectDecision: "AUTHORIZED",
  },
  {
    id: "preset-salesforce",
    title: "3. Salesforce CRM Suite (Remediate Assessment)",
    badge: "SCC + Pending Audit (REVIEW_REQUIRED)",
    mechanism: {
      type: "STANDARD_CONTRACTUAL_CLAUSES" as MechanismType,
      evidenceRef: "SFDC-SCC-2024-V2",
      conditions: "Requires Schrems II technical audit and dedicated tenant key.",
      validUntil: "2027-03-31",
    },
    relationship: {
      controller: "ZOIKO-ENTERPRISE-DE",
      processor: "SALESFORCE-EMEA-LTD",
      service: "Customer Relationship Management & Pipeline Tracking",
      instructions: "Process sales leads, opportunity records, and executive contact details.",
      contractRef: "DPA-2026-SFDC-DE-0144",
      categories: "Contact_PII, Contract_Values, Executive_Phone_Numbers",
      subjects: "Enterprise_Clients, Sales_Leads",
      jurisdictions: "EU-GDPR",
    },
    subprocessor: {
      identity: "Twilio SendGrid",
      service: "Transactional Email Delivery",
      purpose: "Lead notification dispatch",
      scope: "Recipient email addresses and delivery timestamps",
      locations: "US-West-2",
      onward: "AWS EC2",
      notification: "PRIOR_NOTICE_60_DAYS",
      contractRef: "SUB-DPA-SENDGRID-2026",
    },
    assessment: {
      outcome: "REMEDIATE" as AssessmentOutcome,
      risk: "MEDIUM - Additional encryption required for unmasked mobile phone fields.",
      evidenceRef: "TIA-2026-SFDC-AUDIT-03",
      reviewTrigger: "2026-12-31",
    },
    destination: "US",
    expectDecision: "REVIEW_REQUIRED",
  },
  {
    id: "preset-unvetted",
    title: "4. Unvetted Offshore Pipeline (Schrems II Rejection)",
    badge: "Derogation + REJECT (BLOCKED)",
    mechanism: {
      type: "DEROGATION" as MechanismType,
      evidenceRef: "DEROG-ART-49-1-B",
      conditions: "Temporary raw export without adequacy or SCCs.",
      validUntil: "2026-12-31",
    },
    relationship: {
      controller: "ZOIKO-ANALYTICS-FR",
      processor: "DATA-HARVEST-OVERSEAS-INC",
      service: "Raw Telemetry Log Parsing & Model Training",
      instructions: "Export unfiltered server logs for exploratory machine learning.",
      contractRef: "DPA-2026-RAW-LOGS",
      categories: "Raw_IP_Addresses, Session_Cookies, User_Agent_Headers",
      subjects: "Website_Visitors",
      jurisdictions: "EU-GDPR",
    },
    subprocessor: {
      identity: "CloudScrape Ltd",
      service: "Edge Scraping Cache",
      purpose: "Raw log caching",
      scope: "Unsanitized web traffic dumps",
      locations: "CN-Beijing",
      onward: "None",
      notification: "NO_COMMITMENT",
      contractRef: "NONE",
    },
    assessment: {
      outcome: "REJECT" as AssessmentOutcome,
      risk: "CRITICAL - Unbounded destination surveillance laws permit warrantless mass interception with no judicial redress.",
      evidenceRef: "TIA-REJECT-2026-OVERSEAS",
      reviewTrigger: "2026-10-01",
    },
    destination: "CN",
    expectDecision: "BLOCKED",
  },
];

export function PrivacyTransferWorkbench() {
  const [activeTab, setActiveTab] = useState<"mechanisms" | "relationships" | "assessments" | "gate" | "qa">("mechanisms");
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  // Dashboard Data State
  const [relationships, setRelationships] = useState<ProcessorRelationship[]>([]);
  const [subprocessors, setSubprocessors] = useState<Record<string, Subprocessor[]>>({});
  const [assessments, setAssessments] = useState<Record<string, TransferAssessment | null>>({});
  const [createdMechanisms, setCreatedMechanisms] = useState<TransferMechanism[]>([]);
  const [lastDecision, setLastDecision] = useState<TransferDecision | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form states - Mechanism
  const [mechType, setMechType] = useState<MechanismType>("STANDARD_CONTRACTUAL_CLAUSES");
  const [mechEvidenceRef, setMechEvidenceRef] = useState("");
  const [mechConditions, setMechConditions] = useState("");
  const [mechValidUntil, setMechValidUntil] = useState("");

  // Form states - Relationship
  const [relController, setRelController] = useState("");
  const [relProcessor, setRelProcessor] = useState("");
  const [relService, setRelService] = useState("");
  const [relInstructions, setRelInstructions] = useState("");
  const [relContractRef, setRelContractRef] = useState("");
  const [relCategories, setRelCategories] = useState("");
  const [relSubjects, setRelSubjects] = useState("");
  const [relJurisdictions, setRelJurisdictions] = useState("");

  // Form states - Subprocessor
  const [selectedRelForSub, setSelectedRelForSub] = useState("");
  const [subIdentity, setSubIdentity] = useState("");
  const [subService, setSubService] = useState("");
  const [subPurpose, setSubPurpose] = useState("");
  const [subScope, setSubScope] = useState("");
  const [subLocations, setSubLocations] = useState("");
  const [subOnward, setSubOnward] = useState("");
  const [subNotification, setSubNotification] = useState("");
  const [subContractRef, setSubContractRef] = useState("");

  // Form states - Assessment
  const [assessmentRelId, setAssessmentRelId] = useState("");
  const [assessmentOutcome, setAssessmentOutcome] = useState<AssessmentOutcome>("APPROVE");
  const [residualRisk, setResidualRisk] = useState("");
  const [assessmentEvidenceRef, setAssessmentEvidenceRef] = useState("");
  const [reviewTriggerAt, setReviewTriggerAt] = useState("");

  // Form states - Decision Gate
  const [gateRelId, setGateRelId] = useState("");
  const [gateMechId, setGateMechId] = useState("");
  const [gateDestination, setGateDestination] = useState("US");
  const [gateAssessmentReq, setGateAssessmentReq] = useState(true);

  // QA Suite state
  const [qaResults, setQaResults] = useState<QAScenarioResult[]>([]);
  const [qaRunning, setQaRunning] = useState(false);

  // Load Initial Data
  const loadDashboard = async () => {
    setLoading(true);
    try {
      const data = await fetchTransferDashboardData();
      if (data.relationships) {
        setRelationships(data.relationships);
        setSubprocessors(data.subprocessors);
        setAssessments(data.assessments);
        if (data.relationships.length > 0) {
          const firstId = data.relationships[0].relationship_id;
          if (!selectedRelForSub) setSelectedRelForSub(firstId);
          if (!assessmentRelId) setAssessmentRelId(firstId);
          if (!gateRelId) setGateRelId(firstId);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  // Quick-Fill Preset Function
  const applyPreset = (presetId: string) => {
    const p = REALISTIC_PRESETS.find((x) => x.id === presetId);
    if (!p) return;

    // Mechanism fields
    setMechType(p.mechanism.type);
    setMechEvidenceRef(p.mechanism.evidenceRef);
    setMechConditions(p.mechanism.conditions);
    setMechValidUntil(p.mechanism.validUntil);

    // Relationship fields
    setRelController(p.relationship.controller);
    setRelProcessor(p.relationship.processor);
    setRelService(p.relationship.service);
    setRelInstructions(p.relationship.instructions);
    setRelContractRef(p.relationship.contractRef);
    setRelCategories(p.relationship.categories);
    setRelSubjects(p.relationship.subjects);
    setRelJurisdictions(p.relationship.jurisdictions);

    // Subprocessor fields
    setSubIdentity(p.subprocessor.identity);
    setSubService(p.subprocessor.service);
    setSubPurpose(p.subprocessor.purpose);
    setSubScope(p.subprocessor.scope);
    setSubLocations(p.subprocessor.locations);
    setSubOnward(p.subprocessor.onward);
    setSubNotification(p.subprocessor.notification);
    setSubContractRef(p.subprocessor.contractRef);

    // Assessment fields
    setAssessmentOutcome(p.assessment.outcome);
    setResidualRisk(p.assessment.risk);
    setAssessmentEvidenceRef(p.assessment.evidenceRef);
    setReviewTriggerAt(p.assessment.reviewTrigger);

    // Decision gate fields
    setGateDestination(p.destination);

    setFeedbackMessage({
      type: "success",
      text: `Loaded preset: "${p.title}" with realistic governance inputs for all fields!`,
    });
  };

  // Handlers
  const handleCreateMechanism = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("mechanism_type", mechType);
    fd.append("evidence_ref", mechEvidenceRef);
    fd.append("conditions", mechConditions);
    fd.append("valid_until", mechValidUntil);

    setPendingAction("create_mechanism");
    startTransition(async () => {
      try {
        const res = await createMechanismAction({ status: "idle" }, fd);
        if (res.status === "success" && res.data?.mechanism) {
          const m = res.data.mechanism as TransferMechanism;
          setCreatedMechanisms((prev) => [m, ...prev]);
          setGateMechId(m.mechanism_id);
          // Clear inputs after successful submission
          setMechEvidenceRef("");
          setMechConditions("");
          setMechValidUntil("");
          setFeedbackMessage({ type: "success", text: res.message || "Mechanism registered successfully!" });
        } else {
          setFeedbackMessage({ type: "error", text: res.message || "Failed to create mechanism." });
        }
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleCreateRelationship = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("controller_ref", relController);
    fd.append("processor_ref", relProcessor);
    fd.append("service", relService);
    fd.append("processing_instructions", relInstructions);
    fd.append("contract_evidence_ref", relContractRef);
    fd.append("data_categories", relCategories);
    fd.append("subject_classes", relSubjects);
    fd.append("jurisdictions", relJurisdictions);

    setPendingAction("create_relationship");
    startTransition(async () => {
      try {
        const res = await createRelationshipAction({ status: "idle" }, fd);
        if (res.status === "success" && res.data?.relationship) {
          const r = res.data.relationship as ProcessorRelationship;
          setRelationships((prev) => [r, ...prev]);
          setSelectedRelForSub(r.relationship_id);
          setAssessmentRelId(r.relationship_id);
          setGateRelId(r.relationship_id);
          // Clear inputs after successful submission
          setRelController("");
          setRelProcessor("");
          setRelService("");
          setRelInstructions("");
          setRelContractRef("");
          setRelCategories("");
          setRelSubjects("");
          setRelJurisdictions("");
          setFeedbackMessage({ type: "success", text: res.message || "Processor relationship established!" });
        } else {
          setFeedbackMessage({ type: "error", text: res.message || "Failed to create relationship." });
        }
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleToggleStatus = (relationshipId: string, currentStatus: "ACTIVE" | "INACTIVE") => {
    const nextStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setPendingAction(`toggle_${relationshipId}`);
    startTransition(async () => {
      try {
        const res = await toggleRelationshipStatusAction(relationshipId, nextStatus);
        if (res.status === "success") {
          setRelationships((prev) =>
            prev.map((r) => (r.relationship_id === relationshipId ? { ...r, status: nextStatus } : r))
          );
          setFeedbackMessage({ type: "success", text: res.message || `Status updated to ${nextStatus}` });
        } else {
          setFeedbackMessage({ type: "error", text: res.message || "Status update failed." });
        }
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleAttachSubprocessor = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("relationship_id", selectedRelForSub);
    fd.append("provider_identity", subIdentity);
    fd.append("service", subService);
    fd.append("purpose", subPurpose);
    fd.append("data_scope", subScope);
    fd.append("processing_locations", subLocations);
    fd.append("onward_subprocessors", subOnward);
    fd.append("notification_approval_model", subNotification);
    fd.append("contract_evidence_ref", subContractRef);

    setPendingAction("attach_subprocessor");
    startTransition(async () => {
      try {
        const res = await attachSubprocessorAction({ status: "idle" }, fd);
        if (res.status === "success" && res.data?.subprocessor) {
          const sp = res.data.subprocessor as Subprocessor;
          setSubprocessors((prev) => ({
            ...prev,
            [selectedRelForSub]: [sp, ...(prev[selectedRelForSub] || [])],
          }));
          // Clear inputs after successful submission
          setSubIdentity("");
          setSubService("");
          setSubPurpose("");
          setSubScope("");
          setSubLocations("");
          setSubOnward("");
          setSubNotification("");
          setSubContractRef("");
          setFeedbackMessage({ type: "success", text: res.message || "Subprocessor attached!" });
        } else {
          setFeedbackMessage({ type: "error", text: res.message || "Failed to attach subprocessor." });
        }
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleRecordAssessment = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("relationship_id", assessmentRelId);
    fd.append("outcome", assessmentOutcome);
    fd.append("residual_risk", residualRisk);
    fd.append("evidence_ref", assessmentEvidenceRef);
    fd.append("review_trigger_at", reviewTriggerAt);

    setPendingAction("record_assessment");
    startTransition(async () => {
      try {
        const res = await recordAssessmentAction({ status: "idle" }, fd);
        if (res.status === "success" && res.data?.assessment) {
          const ass = res.data.assessment as TransferAssessment;
          setAssessments((prev) => ({ ...prev, [assessmentRelId]: ass }));
          // Clear inputs after successful submission
          setResidualRisk("");
          setAssessmentEvidenceRef("");
          setReviewTriggerAt("");
          setFeedbackMessage({ type: "success", text: res.message || "Transfer assessment registered!" });
        } else {
          setFeedbackMessage({ type: "error", text: res.message || "Assessment recording failed." });
        }
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleEvaluateDecision = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("relationship_id", gateRelId);
    fd.append("transfer_mechanism_id", gateMechId);
    fd.append("destination_jurisdiction", gateDestination);
    fd.append("assessment_required", String(gateAssessmentReq));

    setPendingAction("evaluate_decision");
    startTransition(async () => {
      try {
        const res = await evaluateTransferAction({ status: "idle" }, fd);
        if (res.status === "success" && res.data?.decision) {
          const dec = res.data.decision as TransferDecision;
          setLastDecision(dec);
          setFeedbackMessage({ type: "success", text: res.message || "Transfer evaluated!" });
        } else {
          setFeedbackMessage({ type: "error", text: res.message || "Evaluation failed." });
        }
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleRunQASuite = async () => {
    setQaRunning(true);
    try {
      const results = await runAutomatedQASuiteAction();
      setQaResults(results);
      loadDashboard();
    } catch (e) {
      console.error(e);
    } finally {
      setQaRunning(false);
    }
  };

  const passCount = qaResults.filter((r) => r.passed).length;
  const totalCount = qaResults.length;

  return (
    <div className="space-y-6">
      {/* ── Live System Verification Banner ── */}
      <div className="rounded-xl border border-indigo-200/60 bg-gradient-to-r from-indigo-50/70 via-purple-50/50 to-blue-50/60 p-4 shadow-sm backdrop-blur dark:border-indigo-900/50 dark:from-slate-900 dark:via-indigo-950/20 dark:to-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 font-semibold text-slate-800 shadow-sm dark:bg-slate-800 dark:text-slate-100">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
              <Server className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>privacy-transfer-svc (:8155) — LIVE</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <Database className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>PostgreSQL: privacy_transfer</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <Layers className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
              <span>Kafka: zoiko.privacy-transfer.events</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span>PRV-01 Prerequisite: privacy-purpose-registry-svc (:8151) Verified</span>
            </div>
          </div>
          <button
            onClick={loadDashboard}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh State
          </button>
        </div>
      </div>

      {/* ── Realistic Scenario Quick-Fill Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-200/70 bg-purple-50/40 p-3 text-xs dark:border-purple-900/40 dark:bg-purple-950/20">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-600" />
          <span className="font-bold text-slate-800 dark:text-slate-200">
            Quick-Fill Realistic Enterprise Test Scenarios:
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {REALISTIC_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className="rounded-lg border border-purple-300 bg-white px-3 py-1 text-xs font-semibold text-purple-900 shadow-xs hover:bg-purple-100 dark:border-purple-800 dark:bg-slate-800 dark:text-purple-300 dark:hover:bg-purple-950/60"
            >
              {p.title.split(". ")[1]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Feedback Message ── */}
      {feedbackMessage && (
        <div
          className={`flex items-center justify-between rounded-lg p-3 text-xs font-medium ${
            feedbackMessage.type === "success"
              ? "border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "border border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-xs font-bold hover:opacity-75"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Tabs Navigation ── */}
      <div className="flex border-b border-slate-200 text-sm font-medium dark:border-slate-800">
        {[
          { id: "mechanisms", label: "1. Transfer Safeguards (SCC/BCR)", icon: Globe },
          { id: "relationships", label: "2. Processor Contracts & Subprocessors", icon: Building },
          { id: "assessments", label: "3. Impact Assessments (TIA/DPIA)", icon: FileText },
          { id: "gate", label: "4. Runtime Transfer Decision Gate", icon: Shield },
          { id: "qa", label: "5. Senior QA Test Suite", icon: Play },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-semibold transition-colors ${
                isActive
                  ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── TAB 1: Transfer Safeguards (Mechanisms) ── */}
      {activeTab === "mechanisms" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Plus className="h-4 w-4 text-indigo-600" />
              Register Transfer Mechanism
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              PRV-05.1: Governs cross-border legal basis (EU GDPR Chapter V).
            </p>

            <form onSubmit={handleCreateMechanism} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Mechanism Type</label>
                <select
                  value={mechType}
                  onChange={(e) => setMechType(e.target.value as MechanismType)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="STANDARD_CONTRACTUAL_CLAUSES">Standard Contractual Clauses (SCC)</option>
                  <option value="BINDING_CORPORATE_RULES">Binding Corporate Rules (BCR)</option>
                  <option value="ADEQUACY_DECISION">Adequacy Decision (e.g. EU-US DPF)</option>
                  <option value="DEROGATION">Derogation (Art. 49 Specific Exemption)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Evidence Reference / Legal Instrument</label>
                <input
                  type="text"
                  value={mechEvidenceRef}
                  onChange={(e) => setMechEvidenceRef(e.target.value)}
                  placeholder="e.g. EUR-LEX-L-2021-199-SCC-V1"
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Conditions & Safeguards Summary</label>
                <textarea
                  rows={3}
                  value={mechConditions}
                  onChange={(e) => setMechConditions(e.target.value)}
                  placeholder="e.g. Module 2: Controller-to-Processor with Customer-held HSM Keys"
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Valid Until (Expiry Date)</label>
                <input
                  type="date"
                  value={mechValidUntil}
                  onChange={(e) => setMechValidUntil(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
              </div>

              <button
                type="submit"
                disabled={pendingAction === "create_mechanism"}
                className="w-full rounded-lg bg-indigo-600 py-2.5 font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
              >
                {pendingAction === "create_mechanism" ? "Registering..." : "Create Mechanism (POST :8155)"}
              </button>
            </form>
          </div>

          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Globe className="h-4 w-4 text-emerald-600" />
                Active Legal Safeguard Mechanisms
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Live mechanisms verified against PostgreSQL table <code>transfer_mechanisms</code>.
              </p>

              {createdMechanisms.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400 dark:border-slate-800">
                  No mechanisms registered in this session yet. Create one on the left or run the QA suite!
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {createdMechanisms.map((m) => (
                    <div
                      key={m.mechanism_id}
                      className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded bg-indigo-100 px-2 py-0.5 font-mono font-bold text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300">
                          {m.mechanism_type}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(m.mechanism_id);
                              setGateMechId(m.mechanism_id);
                              setFeedbackMessage({ type: "success", text: `Copied mechanism UUID ${m.mechanism_id}` });
                            }}
                            className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            <ClipboardCopy className="h-3 w-3" />
                            Copy UUID
                          </button>
                          <span className="text-slate-400 font-mono text-[11px]">ID: {m.mechanism_id}</span>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-300">
                        <div>
                          <strong>Evidence Ref:</strong> {m.evidence_ref || "None specified"}
                        </div>
                        <div>
                          <strong>Valid From:</strong> {new Date(m.valid_from).toLocaleDateString()}
                        </div>
                        <div className="col-span-2">
                          <strong>Conditions:</strong> {m.conditions || "Standard statutory safeguards apply"}
                        </div>
                        {m.valid_until && (
                          <div>
                            <strong>Valid Until:</strong> {new Date(m.valid_until).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: Processor Contracts & Subprocessors ── */}
      {activeTab === "relationships" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Create Relationship Form */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Plus className="h-4 w-4 text-indigo-600" />
                Register Processor Relationship (Controller → Processor)
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                PRV-05.2: Enforces DPA binding, service scope, and legal transfer safeguards.
              </p>

              <form onSubmit={handleCreateRelationship} className="mt-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Data Controller Ref</label>
                    <input
                      type="text"
                      value={relController}
                      onChange={(e) => setRelController(e.target.value)}
                      placeholder="e.g. ZOIKO-HOLDINGS-EU"
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Data Processor Ref</label>
                    <input
                      type="text"
                      value={relProcessor}
                      onChange={(e) => setRelProcessor(e.target.value)}
                      placeholder="e.g. AWS-EMEA-SOCIETE"
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300">Service Scope</label>
                  <input
                    type="text"
                    value={relService}
                    onChange={(e) => setRelService(e.target.value)}
                    placeholder="e.g. Cloud Infrastructure Hosting"
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    required
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300">Processing Instructions</label>
                  <textarea
                    rows={2}
                    value={relInstructions}
                    onChange={(e) => setRelInstructions(e.target.value)}
                    placeholder="Documented instructions governing data handling..."
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300">DPA Contract Reference</label>
                    <input
                      type="text"
                      value={relContractRef}
                      onChange={(e) => setRelContractRef(e.target.value)}
                      placeholder="DPA-2026-AWS-0091"
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Governing Jurisdictions</label>
                    <input
                      type="text"
                      value={relJurisdictions}
                      onChange={(e) => setRelJurisdictions(e.target.value)}
                      placeholder="EU-GDPR, UK-GDPR"
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Data Categories</label>
                    <input
                      type="text"
                      value={relCategories}
                      onChange={(e) => setRelCategories(e.target.value)}
                      placeholder="Customer_PII, Telemetry"
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Data Subject Classes</label>
                    <input
                      type="text"
                      value={relSubjects}
                      onChange={(e) => setRelSubjects(e.target.value)}
                      placeholder="Platform_Users, Corporate_Employees"
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={pendingAction === "create_relationship"}
                  className="w-full rounded-lg bg-indigo-600 py-2.5 font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
                >
                  {pendingAction === "create_relationship" ? "Saving..." : "Create Processor Relationship"}
                </button>
              </form>
            </div>

            {/* Attach Subprocessor Form */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Layers className="h-4 w-4 text-purple-600" />
                Attach Downstream Subprocessor
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                PRV-05.3: Discloses fourth-party supply chain sub-delegations and geographic storage.
              </p>

              <form onSubmit={handleAttachSubprocessor} className="mt-4 space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300">Target Relationship</label>
                  <select
                    value={selectedRelForSub}
                    onChange={(e) => setSelectedRelForSub(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {relationships.map((r) => (
                      <option key={r.relationship_id} value={r.relationship_id}>
                        {r.controller_ref} → {r.processor_ref} ({r.service})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Subprocessor Identity</label>
                    <input
                      type="text"
                      value={subIdentity}
                      onChange={(e) => setSubIdentity(e.target.value)}
                      placeholder="e.g. Snowflake Inc."
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Sub-Delegated Service</label>
                    <input
                      type="text"
                      value={subService}
                      onChange={(e) => setSubService(e.target.value)}
                      placeholder="Analytics Cloud Warehouse"
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300">Specific Processing Purpose</label>
                  <input
                    type="text"
                    value={subPurpose}
                    onChange={(e) => setSubPurpose(e.target.value)}
                    placeholder="Telemetry and pseudonymized aggregation"
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Processing Locations</label>
                    <input
                      type="text"
                      value={subLocations}
                      onChange={(e) => setSubLocations(e.target.value)}
                      placeholder="US-East-1, EU-Central-1"
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Onward Subprocessors</label>
                    <input
                      type="text"
                      value={subOnward}
                      onChange={(e) => setSubOnward(e.target.value)}
                      placeholder="AWS S3, Azure Blob"
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Notification Model</label>
                    <input
                      type="text"
                      value={subNotification}
                      onChange={(e) => setSubNotification(e.target.value)}
                      placeholder="PRIOR_WRITTEN_NOTICE_30_DAYS"
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Sub-DPA Contract Ref</label>
                    <input
                      type="text"
                      value={subContractRef}
                      onChange={(e) => setSubContractRef(e.target.value)}
                      placeholder="SUB-DPA-2026-SNOWFLAKE-04"
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={pendingAction === "attach_subprocessor" || !selectedRelForSub}
                  className="w-full rounded-lg bg-purple-600 py-2.5 font-semibold text-white shadow hover:bg-purple-700 disabled:opacity-50"
                >
                  {pendingAction === "attach_subprocessor" ? "Attaching..." : "Attach Subprocessor (POST :8155)"}
                </button>
              </form>
            </div>
          </div>

          {/* Relationships & Subprocessors Table */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Building className="h-4 w-4 text-indigo-600" />
              Live Processor Agreements & Subprocessor Chains
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Direct and onward processing vendors registered in table <span className="font-mono">processor_relationships</span>.
            </p>

            <div className="mt-4 space-y-4">
              {relationships.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No processor relationships created yet. Fill out the form above to register your first DPA.
                </div>
              ) : (
                relationships.map((rel) => {
                  const isActive = rel.status === "ACTIVE";
                  const subs = subprocessors[rel.relationship_id] || [];
                  const ass = assessments[rel.relationship_id];

                  return (
                    <div
                      key={rel.relationship_id}
                      className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 text-xs dark:border-slate-800 dark:bg-slate-800/30"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-700">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              isActive
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                            }`}
                          >
                            {rel.status}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {rel.controller_ref} → {rel.processor_ref}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">({rel.service})</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(rel.relationship_id);
                              setGateRelId(rel.relationship_id);
                              setAssessmentRelId(rel.relationship_id);
                              setFeedbackMessage({ type: "success", text: `Copied relationship ID ${rel.relationship_id}` });
                            }}
                            className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                          >
                            <ClipboardCopy className="h-3 w-3" />
                            Select
                          </button>
                          <button
                            onClick={() => handleToggleStatus(rel.relationship_id, rel.status)}
                            disabled={pendingAction === `toggle_${rel.relationship_id}`}
                            className={`rounded px-2.5 py-1 font-semibold text-white shadow-xs ${
                              isActive
                                ? "bg-rose-600 hover:bg-rose-700"
                                : "bg-emerald-600 hover:bg-emerald-700"
                            }`}
                          >
                            {pendingAction === `toggle_${rel.relationship_id}`
                              ? "Updating..."
                              : isActive
                              ? "Deactivate (Set INACTIVE)"
                              : "Activate (Set ACTIVE)"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-300 sm:grid-cols-4">
                        <div>
                          <strong>ID:</strong> <span className="font-mono">{rel.relationship_id.slice(0, 8)}...</span>
                        </div>
                        <div>
                          <strong>Contract Ref:</strong> {rel.contract_evidence_ref || "None"}
                        </div>
                        <div>
                          <strong>Jurisdictions:</strong> {(rel.jurisdictions || []).join(", ") || "Global"}
                        </div>
                        <div>
                          <strong>Assessment:</strong>{" "}
                          {ass ? (
                            <span className="font-bold text-indigo-600">{ass.outcome}</span>
                          ) : (
                            <span className="text-amber-600">Pending Review</span>
                          )}
                        </div>
                      </div>

                      {/* Subprocessors list */}
                      <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                        <div className="font-semibold text-slate-700 dark:text-slate-300">
                          Attached Subprocessors ({subs.length}):
                        </div>
                        {subs.length === 0 ? (
                          <div className="mt-1 text-slate-400">No subprocessors attached yet.</div>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {subs.map((sp) => (
                              <div
                                key={sp.subprocessor_id}
                                className="rounded border border-purple-200 bg-purple-50 px-2 py-1 text-purple-900 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300"
                              >
                                <span className="font-bold">{sp.provider_identity}</span> — {sp.service}{" "}
                                {sp.processing_locations?.length > 0 && `(${(sp.processing_locations || []).join(", ")})`}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: Transfer Impact Assessment (TIA/DPIA) ── */}
      {activeTab === "assessments" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-600" />
              Record Transfer Risk Assessment
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              PRV-05.3: Evaluates Schrems II third-country surveillance risks & supplementary safeguards.
            </p>

            <form onSubmit={handleRecordAssessment} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Target Relationship</label>
                <select
                  value={assessmentRelId}
                  onChange={(e) => setAssessmentRelId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  required
                >
                  {relationships.map((r) => (
                    <option key={r.relationship_id} value={r.relationship_id}>
                      {r.controller_ref} → {r.processor_ref}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Evaluation Outcome</label>
                <select
                  value={assessmentOutcome}
                  onChange={(e) => setAssessmentOutcome(e.target.value as AssessmentOutcome)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="APPROVE">APPROVE (Transfer Legally Authorized)</option>
                  <option value="REMEDIATE">REMEDIATE (Review Required / Human Intervention)</option>
                  <option value="REJECT">REJECT (Transfer Blocked / Prohibited)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Residual Risk Analysis</label>
                <textarea
                  rows={3}
                  value={residualRisk}
                  onChange={(e) => setResidualRisk(e.target.value)}
                  placeholder="Residual risk assessment and analysis..."
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Assessment Evidence Reference</label>
                <input
                  type="text"
                  value={assessmentEvidenceRef}
                  onChange={(e) => setAssessmentEvidenceRef(e.target.value)}
                  placeholder="e.g. TIA-2026-AWS-EU-01"
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Review Trigger / Expiry Date</label>
                <input
                  type="date"
                  value={reviewTriggerAt}
                  onChange={(e) => setReviewTriggerAt(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
              </div>

              <button
                type="submit"
                disabled={pendingAction === "record_assessment" || !assessmentRelId}
                className="w-full rounded-lg bg-indigo-600 py-2.5 font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
              >
                {pendingAction === "record_assessment" ? "Recording..." : "Record Assessment (POST :8155)"}
              </button>
            </form>
          </div>

          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Latest Transfer Risk Assessments
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Live assessments stored in <code>transfer_assessments</code> table.
              </p>

              {Object.keys(assessments).length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400 dark:border-slate-800">
                  No assessments recorded yet. Submit one on the left.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {Object.entries(assessments).map(([relId, ass]) => {
                    if (!ass) return null;
                    const isApprove = ass.outcome === "APPROVE";
                    const isReject = ass.outcome === "REJECT";

                    return (
                      <div
                        key={ass.assessment_id}
                        className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={`rounded px-2.5 py-0.5 font-bold ${
                              isApprove
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                                : isReject
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                            }`}
                          >
                            OUTCOME: {ass.outcome}
                          </span>
                          <span className="text-slate-400 font-mono text-[11px]">ID: {ass.assessment_id}</span>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-300">
                          <div>
                            <strong>Evidence Ref:</strong> {ass.evidence_ref || "None specified"}
                          </div>
                          <div>
                            <strong>Reviewer:</strong> {ass.reviewer_principal_id}
                          </div>
                          <div>
                            <strong>Relationship:</strong> {relId.slice(0, 8)}...
                          </div>
                          <div>
                            <strong>Recorded At:</strong> {new Date(ass.created_at).toLocaleString()}
                          </div>
                        </div>

                        <div className="mt-2">
                          <strong className="text-slate-700 dark:text-slate-200">Residual Risk Analysis:</strong>
                          <p className="mt-1 text-slate-600 dark:text-slate-300">
                            {ass.residual_risk || "Standard Schrems II evaluation complete."}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: Runtime Transfer Decision Gate ── */}
      {activeTab === "gate" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Decision Evaluation Form */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Shield className="h-4 w-4 text-indigo-600" />
              Simulate Runtime Transfer Evaluation Gate
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              PRV-05.4: Automated runtime policy decision gate. Authorizes or blocks data egress at runtime.
            </p>

            <form onSubmit={handleEvaluateDecision} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Processor Relationship</label>
                <select
                  value={gateRelId}
                  onChange={(e) => setGateRelId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  required
                >
                  {relationships.map((r) => (
                    <option key={r.relationship_id} value={r.relationship_id}>
                      {r.controller_ref} → {r.processor_ref} ({r.status})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">Transfer Mechanism UUID</label>
                  {createdMechanisms.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setGateMechId(createdMechanisms[0].mechanism_id)}
                      className="text-[11px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      Use Latest Mechanism
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={gateMechId}
                  onChange={(e) => setGateMechId(e.target.value)}
                  placeholder="Paste Transfer Mechanism UUID"
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Destination Jurisdiction</label>
                <input
                  type="text"
                  value={gateDestination}
                  onChange={(e) => setGateDestination(e.target.value)}
                  placeholder="US"
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="gateAssessment"
                  checked={gateAssessmentReq}
                  onChange={(e) => setGateAssessmentReq(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <label htmlFor="gateAssessment" className="text-slate-700 dark:text-slate-300">
                  Enforce Assessment Requirement (Fails closed if missing/rejected)
                </label>
              </div>

              <button
                type="submit"
                disabled={pendingAction === "evaluate_decision" || !gateRelId || !gateMechId}
                className="w-full rounded-lg bg-indigo-600 py-3 font-bold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
              >
                {pendingAction === "evaluate_decision" ? "Evaluating Invariants..." : "Evaluate Transfer Decision (POST :8155)"}
              </button>
            </form>
          </div>

          {/* Decision Outcome Display */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-600" />
              Runtime Transfer Decision Receipt
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Evaluates relationship status, safeguard validity, and DPIA/TIA outcome.
            </p>

            {!lastDecision ? (
              <div className="mt-6 rounded-lg border border-dashed border-slate-200 p-12 text-center text-xs text-slate-400 dark:border-slate-800">
                Click &quot;Evaluate Transfer Decision&quot; to execute live evaluation.
              </div>
            ) : (
              <div className="mt-4 space-y-4 text-xs">
                {/* Visual Status Result Banner */}
                <div
                  className={`rounded-xl border p-5 text-center shadow-sm ${
                    lastDecision.result === "AUTHORIZED"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                      : lastDecision.result === "BLOCKED"
                      ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                      : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    {lastDecision.result === "AUTHORIZED" && (
                      <ShieldCheck className="h-8 w-8 text-emerald-600" />
                    )}
                    {lastDecision.result === "BLOCKED" && (
                      <ShieldX className="h-8 w-8 text-rose-600" />
                    )}
                    {lastDecision.result === "REVIEW_REQUIRED" && (
                      <ShieldAlert className="h-8 w-8 text-amber-600" />
                    )}
                    <span className="text-2xl font-extrabold tracking-tight">
                      {lastDecision.result}
                    </span>
                  </div>
                  <p className="mt-1 text-xs opacity-80">
                    {lastDecision.result === "AUTHORIZED"
                      ? "Cross-border data egress legally permitted under verified safeguards."
                      : lastDecision.result === "BLOCKED"
                      ? "Data egress prohibited. Mandatory safeguards missing or rejected."
                      : "Human intervention required. Assessment review in progress."}
                  </p>
                </div>

                {/* Details Breakdown */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/50 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Decision ID:</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{lastDecision.decision_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Destination:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{lastDecision.destination_jurisdiction || "Global"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Actor Principal:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">{lastDecision.actor_principal_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Evaluated At:</span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {lastDecision.decided_at ? new Date(lastDecision.decided_at).toLocaleString() : "Just now"}
                    </span>
                  </div>

                  <div className="pt-2">
                    <span className="text-slate-500">Reason Codes:</span>
                    {(lastDecision.reason_codes || []).length === 0 ? (
                      <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                        None (Fully Compliant)
                      </span>
                    ) : (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(lastDecision.reason_codes || []).map((rc, idx) => (
                          <span
                            key={idx}
                            className="rounded bg-rose-100 px-2 py-0.5 font-mono font-bold text-rose-800 dark:bg-rose-900/50 dark:text-rose-300"
                          >
                            {rc}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 5: Senior QA Test Suite ── */}
      {activeTab === "qa" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Play className="h-4 w-4 text-emerald-600" />
                  Automated QA Validation Test Matrix
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Executes 10 comprehensive QA scenarios against <code>privacy-transfer-svc (:8155)</code> covering positive, negative, and fail-closed edge cases.
                </p>
              </div>

              <div className="flex items-center gap-3">
                {qaResults.length > 0 && (
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                      Passed: {passCount} / {totalCount}
                    </span>
                    {passCount === totalCount ? (
                      <span className="rounded-full bg-indigo-100 px-3 py-1 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300">
                        100% PASS RATE
                      </span>
                    ) : (
                      <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300">
                        {totalCount - passCount} FAILED
                      </span>
                    )}
                  </div>
                )}

                <button
                  onClick={handleRunQASuite}
                  disabled={qaRunning}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Play className={`h-3.5 w-3.5 ${qaRunning ? "animate-spin" : ""}`} />
                  {qaRunning ? "Running 10 Scenarios..." : "Run All QA Scenarios"}
                </button>
              </div>
            </div>

            {/* Results Table */}
            {qaResults.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed border-slate-200 p-12 text-center text-xs text-slate-400 dark:border-slate-800">
                Click &quot;Run All QA Scenarios&quot; to execute the comprehensive Senior QA test matrix.
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                    <tr>
                      <th className="py-2.5 px-3">Test Case ID</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Scenario Name</th>
                      <th className="py-2.5 px-3">Expected Outcome</th>
                      <th className="py-2.5 px-3">Actual Result</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {qaResults.map((tc) => (
                      <tr key={tc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/50">
                        <td className="py-3 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                          {tc.id}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`rounded px-1.5 py-0.5 font-semibold uppercase ${
                              tc.type === "positive"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300"
                                : "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300"
                            }`}
                          >
                            {tc.type}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{tc.name}</div>
                          <div className="text-[11px] text-slate-500">{tc.description}</div>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300">
                          {tc.expectedStatus}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300">
                          {tc.actualResult}
                        </td>
                        <td className="py-3 px-3">
                          {tc.passed ? (
                            <span className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-4 w-4" />
                              PASS
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400">
                              <XCircle className="h-4 w-4" />
                              FAIL
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
