// Every lifecycle action the Blocks 6-10 pages can send after a record exists.
//
// Each entry is the service's own route, method, body and the statuses it
// accepts the transition from, read from the service source (handlers and
// state machines in zoiko-suite-backend). The Server Action sends nothing that
// is not listed here. Identity never appears: it is the session's, added by
// the Server Action. Pure data, imported by the client buttons too.

import { opts } from "@/components/admin/intelligence/create-state";
import type { LifecycleActionSpec } from "./types";

const reason = (label = "Reason", required = true) => ({ name: "reason", label, kind: "textarea" as const, required });

// ── Legal (Block 6) ──────────────────────────────────────────────────────────

const CLAUSES = {
  "clause.submit-review": {
    service: "clauseTemplate", serviceLabel: "clause-template-svc", method: "POST",
    path: "/v1/clauses/{id}/submit-legal-review", label: "Submit for legal review", from: ["DRAFT"],
  },
  "clause.approve": {
    service: "clauseTemplate", serviceLabel: "clause-template-svc", method: "POST",
    path: "/v1/clauses/{id}/approve", label: "Approve", from: ["LEGAL_REVIEW"],
    note: "The service refuses approval by the person who submitted the clause.",
  },
  "clause.activate": {
    service: "clauseTemplate", serviceLabel: "clause-template-svc", method: "POST",
    path: "/v1/clauses/{id}/activate", label: "Activate", from: ["APPROVED"],
  },
  "clause.retire": {
    service: "clauseTemplate", serviceLabel: "clause-template-svc", method: "POST",
    path: "/v1/clauses/{id}/retire", label: "Retire", from: ["ACTIVE"], confirm: true, danger: true,
  },
  "clause.supersede": {
    service: "clauseTemplate", serviceLabel: "clause-template-svc", method: "POST",
    path: "/v1/clauses/{id}/supersede", label: "Supersede", from: ["ACTIVE"], danger: true,
    dynamicFields: ["superseded_by"],
    fields: [{ name: "superseded_by", label: "Replacing clause", kind: "select", required: true }],
  },
  "template.approve": {
    service: "clauseTemplate", serviceLabel: "clause-template-svc", method: "POST",
    path: "/v1/templates/{id}/approve", label: "Approve", from: ["DRAFT"],
  },
} satisfies Record<string, LifecycleActionSpec>;

const OBLIGATION_OPEN = ["ACTIVE", "DUE", "IN_PROGRESS"] as const;
const OBLIGATIONS = {
  "obligation.validate": {
    service: "obligationTracking", serviceLabel: "obligation-tracking-svc", method: "POST",
    path: "/v1/obligations/{id}/validate", label: "Validate", from: ["CANDIDATE"],
  },
  "obligation.schedule": {
    service: "obligationTracking", serviceLabel: "obligation-tracking-svc", method: "POST",
    path: "/v1/obligations/{id}/schedule", label: "Schedule", from: ["PLANNED"], actorFields: ["scheduled_by"],
    dynamicFields: ["source_clause_id"],
    fields: [
      { name: "trigger_description", label: "Trigger", kind: "text", required: true },
      { name: "calculation_method", label: "How the due date is calculated", kind: "text", required: true },
      { name: "source_clause_id", label: "Source clause", kind: "select" },
    ],
  },
  "obligation.mark-due": {
    service: "obligationTracking", serviceLabel: "obligation-tracking-svc", method: "POST",
    path: "/v1/obligations/{id}/mark-due", label: "Mark due", from: ["ACTIVE"],
  },
  "obligation.mark-in-progress": {
    service: "obligationTracking", serviceLabel: "obligation-tracking-svc", method: "POST",
    path: "/v1/obligations/{id}/mark-in-progress", label: "Start work", from: ["DUE"],
  },
  "obligation.complete": {
    service: "obligationTracking", serviceLabel: "obligation-tracking-svc", method: "POST",
    path: "/v1/obligations/{id}/complete", label: "Mark satisfied", from: OBLIGATION_OPEN, confirm: true,
  },
  "obligation.waive": {
    service: "obligationTracking", serviceLabel: "obligation-tracking-svc", method: "POST",
    path: "/v1/obligations/{id}/waive", label: "Waive", from: OBLIGATION_OPEN, actorFields: ["waived_by"], danger: true,
    fields: [{ name: "waiver_authority_reference", label: "Waiver authority reference", kind: "text", required: true }],
  },
  "obligation.dispute": {
    service: "obligationTracking", serviceLabel: "obligation-tracking-svc", method: "POST",
    path: "/v1/obligations/{id}/dispute", label: "Dispute", from: OBLIGATION_OPEN, actorFields: ["disputed_by"], danger: true,
    fields: [{ name: "dispute_reason", label: "Dispute reason", kind: "textarea", required: true }],
  },
  "obligation.record-breach": {
    service: "obligationTracking", serviceLabel: "obligation-tracking-svc", method: "POST",
    path: "/v1/obligations/{id}/record-breach", label: "Record breach", from: OBLIGATION_OPEN, actorFields: ["breached_by"], danger: true,
    fields: [{ name: "breach_note", label: "Breach note", kind: "textarea" }],
  },
  "obligation.supersede": {
    service: "obligationTracking", serviceLabel: "obligation-tracking-svc", method: "POST",
    path: "/v1/obligations/{id}/supersede", label: "Supersede", from: ["CANDIDATE", "PLANNED", ...OBLIGATION_OPEN], danger: true,
    dynamicFields: ["superseded_by"],
    fields: [{ name: "superseded_by", label: "Replacing obligation", kind: "select", required: true }],
  },
} satisfies Record<string, LifecycleActionSpec>;

const CORPORATE = {
  "corporate-action.execute": {
    service: "corporateActions", serviceLabel: "corporate-actions-svc", method: "POST",
    path: "/v1/corporate-actions/{id}/execute", label: "Record execution", from: ["PROPOSED", "BOARD_APPROVED"],
    actorFields: ["executed_by"], dynamicFields: ["document_vault_id"],
    note: "The service refuses execution by the person who proposed the action, and checks the required evidence.",
    fields: [{ name: "document_vault_id", label: "Evidence document", kind: "select" }],
  },
  "counterparty.compliance": {
    service: "counterparty", serviceLabel: "counterparty-management-svc", method: "POST",
    path: "/v1/counterparties/{id}/compliance", label: "Set compliance status", purposeContext: "legal.counterparty.compliance",
    fields: [{ name: "compliance_status", label: "Compliance status", kind: "select", required: true, options: opts("VERIFIED", "PENDING", "REJECTED") }],
  },
} satisfies Record<string, LifecycleActionSpec>;

// ── Tax and compliance (Block 7) ─────────────────────────────────────────────

const EXCEPTION_OPEN = ["OPEN", "UNDER_INVESTIGATION", "ESCALATED"] as const;

const TAX = {
  "tax-determination.override": {
    service: "taxDetermination", serviceLabel: "tax-determination-svc", method: "POST",
    path: "/v1/tax-determinations/{id}/override", label: "Override amount", from: ["CALCULATED", "APPLIED", "REVERSED"],
    purposeContext: "tax.determination.override", danger: true,
    note: "tax-determination-svc requires a reason but does not store it; record it in your own evidence too.",
    fields: [
      { name: "overridden_tax_amount", label: "Tax amount", kind: "number", step: "0.01", required: true },
      reason(),
    ],
  },
  "corporate-tax.submit": {
    service: "corporateTax", serviceLabel: "corporate-tax-svc", method: "POST",
    path: "/v1/corporate-tax-returns/{id}/submit", label: "Submit return", from: ["DRAFT", "DISPUTED"],
    purposeContext: "tax.corporate.submit", evidenceRefsField: "evidence_refs",
    note: "Records the return as submitted in corporate-tax-svc; it does not file with a tax authority. The service checks the evidence the return requires.",
    fields: [{ name: "evidence_refs", label: "Evidence references", kind: "text", hint: "Comma-separated evidence ids supporting the return." }],
  },
  "corporate-tax.assess": {
    service: "corporateTax", serviceLabel: "corporate-tax-svc", method: "POST",
    path: "/v1/corporate-tax-returns/{id}/assess", label: "Record assessment", from: ["SUBMITTED"],
    purposeContext: "tax.corporate.assess",
    fields: [
      { name: "assessed_tax_amount", label: "Assessed tax", kind: "number", step: "0.01", required: true },
      { name: "assessment_reference", label: "Assessment reference", kind: "text", required: true },
      { name: "notes", label: "Notes", kind: "textarea" },
    ],
  },
  "withholding.remit": {
    service: "withholdingTax", serviceLabel: "withholding-tax-svc", method: "POST",
    path: "/v1/withholding-tax/{id}/remit", label: "Record remittance", from: ["DRAFT", "CALCULATED", "PENDING_REMITTANCE"],
    purposeContext: "tax.withholding.remit", actorFields: ["remitted_by"],
    note: "Records a remittance already made; no payment is sent.",
    fields: [
      { name: "remittance_reference", label: "Remittance reference", kind: "text", required: true },
      { name: "notes", label: "Notes", kind: "textarea" },
    ],
  },
  "withholding.cancel": {
    service: "withholdingTax", serviceLabel: "withholding-tax-svc", method: "POST",
    path: "/v1/withholding-tax/{id}/cancel", label: "Cancel", from: ["DRAFT", "CALCULATED", "PENDING_REMITTANCE"],
    purposeContext: "tax.withholding.cancel", danger: true,
    fields: [reason("Reason", false)],
  },
  "tax-filing.validate": {
    service: "taxAuthorityInterface", serviceLabel: "tax-authority-interface-svc", method: "POST",
    path: "/v1/tax-authority/filings/{id}/validate", label: "Validate", from: ["PREPARED"],
    purposeContext: "tax.authority.filing.validate",
  },
  "tax-filing.submit": {
    service: "taxAuthorityInterface", serviceLabel: "tax-authority-interface-svc", method: "POST",
    path: "/v1/tax-authority/filings/{id}/submit", label: "Submit to authority", from: ["PREPARED", "VALIDATED", "PENDING_UNKNOWN"],
    purposeContext: "tax.authority.filing.submit", confirm: true, danger: true,
    note: "Sends the filing to the tax authority through its configured connector. Where no adapter is configured the service refuses it.",
  },
  "tax-filing.poll": {
    service: "taxAuthorityInterface", serviceLabel: "tax-authority-interface-svc", method: "POST",
    path: "/v1/tax-authority/filings/{id}/poll", label: "Check status", from: ["SUBMITTED", "PENDING_UNKNOWN", "ACCEPTED"],
    purposeContext: "tax.authority.filing.poll",
  },
  "exception.escalate": {
    service: "exceptionEscalation", serviceLabel: "exception-escalation-svc", method: "POST",
    path: "/v1/exception-escalation/exceptions/{id}/escalate", label: "Escalate", from: EXCEPTION_OPEN,
    actorFields: ["escalated_by"],
    fields: [
      { name: "escalated_to_role", label: "Escalate to role", kind: "text", required: true },
      { name: "escalated_to_user", label: "Escalate to user (principal id)", kind: "text" },
      { name: "escalation_reason", label: "Escalation reason", kind: "textarea", required: true },
    ],
  },
  "exception.resolve": {
    service: "exceptionEscalation", serviceLabel: "exception-escalation-svc", method: "POST",
    path: "/v1/exception-escalation/exceptions/{id}/resolve", label: "Resolve", from: EXCEPTION_OPEN,
    actorFields: ["closed_by"],
    note: "The person who raised the exception cannot resolve it.",
    fields: [{ name: "closure_reason", label: "Closure reason", kind: "textarea", required: true }],
  },
  "compliance-gap.resolve": {
    service: "complianceStatus", serviceLabel: "compliance-status-svc", method: "POST",
    path: "/v1/compliance-status/gaps/{id}/resolve", label: "Resolve", from: ["OPEN", "IN_REMEDIATION", "DISMISSED"],
    fields: [{ name: "remediation_notes", label: "Remediation notes", kind: "textarea" }],
  },
} satisfies Record<string, LifecycleActionSpec>;

// ── Commercial operations ────────────────────────────────────────────────────

const COMMERCIAL = {
  "purchase-request.cancel": {
    service: "purchaseRequest", serviceLabel: "purchase-request-svc", method: "POST",
    path: "/v1/purchase-requests/{id}/cancel", label: "Cancel", from: ["DRAFT", "PENDING_APPROVAL", "APPROVED"],
    version: "expected-version", danger: true, fields: [reason()],
  },
  "purchase-request.convert": {
    service: "purchaseRequest", serviceLabel: "purchase-request-svc", method: "POST",
    path: "/v1/purchase-requests/{id}/convert-to-purchase-order", label: "Convert to purchase order", from: ["APPROVED"],
    version: "expected-version", dynamicFields: ["vendor_profile_id"],
    note: "purchase-request-svc raises the order in purchase-order-svc. The supplier is checked for eligibility (AP-01); without a supplier reference the vendor profile is used.",
    fields: [
      { name: "supplier_ref", label: "Supplier reference", kind: "text", hint: "As registered in supplier financial profiles." },
      { name: "vendor_profile_id", label: "Vendor profile", kind: "select" },
    ],
  },
} satisfies Record<string, LifecycleActionSpec>;

// ── Intelligence and reporting (Block 8) ─────────────────────────────────────

const notes = (label = "Resolution notes") => ({ name: "resolution_notes", label, kind: "textarea" as const, required: true });

const INTELLIGENCE = {
  "anomaly.investigate": {
    service: "anomalyDetection", serviceLabel: "anomaly-detection-svc", method: "POST",
    path: "/v1/anomalies/{id}/status", label: "Investigate", from: ["OPEN"], version: "if-match",
    fixed: { status: "UNDER_INVESTIGATION" },
  },
  "anomaly.confirm": {
    service: "anomalyDetection", serviceLabel: "anomaly-detection-svc", method: "POST",
    path: "/v1/anomalies/{id}/status", label: "Confirm anomaly", from: ["UNDER_INVESTIGATION"], version: "if-match",
    fixed: { status: "CONFIRMED_ANOMALY" }, fields: [notes()],
    note: "The person the detection is attributed to cannot record a disposition.",
  },
  "anomaly.false-positive": {
    service: "anomalyDetection", serviceLabel: "anomaly-detection-svc", method: "POST",
    path: "/v1/anomalies/{id}/status", label: "False positive", from: ["OPEN", "UNDER_INVESTIGATION"], version: "if-match",
    fixed: { status: "FALSE_POSITIVE" }, fields: [notes()],
  },
  "anomaly.resolve": {
    service: "anomalyDetection", serviceLabel: "anomaly-detection-svc", method: "POST",
    path: "/v1/anomalies/{id}/status", label: "Resolve", from: ["CONFIRMED_ANOMALY"], version: "if-match",
    fixed: { status: "RESOLVED" }, fields: [notes()],
  },

  "forecast.submit": {
    service: "forecasting", serviceLabel: "forecasting-svc", method: "POST",
    path: "/v1/forecasts/{id}/submit", label: "Submit for review", from: ["CALCULATED"], version: "if-match-v",
  },
  "forecast.approve": {
    service: "forecasting", serviceLabel: "forecasting-svc", method: "POST",
    path: "/v1/forecasts/{id}/approve", label: "Approve", from: ["REVIEWED"], version: "if-match-v",
    note: "The approver must be neither the creator nor the submitter.",
  },
  "forecast.publish": {
    service: "forecasting", serviceLabel: "forecasting-svc", method: "POST",
    path: "/v1/forecasts/{id}/publish", label: "Publish", from: ["APPROVED"], version: "if-match-v", confirm: true,
  },
  "forecast.recalculate": {
    service: "forecasting", serviceLabel: "forecasting-svc", method: "POST",
    path: "/v1/forecasts/{id}/recalculate", label: "Recalculate", from: ["CALCULATED"], version: "if-match-v",
    note: "Give a growth adjustment, a scenario, or both.",
    fields: [
      { name: "growth_rate_adjustment", label: "Growth rate adjustment (-0.99 to 10)", kind: "number", step: "0.01" },
      { name: "scenario_type", label: "Scenario", kind: "select", options: opts("BASELINE", "OPTIMISTIC", "PESSIMISTIC") },
    ],
  },
  "forecast.reforecast": {
    service: "forecasting", serviceLabel: "forecasting-svc", method: "POST",
    path: "/v1/forecasts/{id}/reforecast", label: "Reforecast", from: ["APPROVED", "PUBLISHED"], version: "if-match-v",
    note: "Creates a new forecast from this one; this forecast is not changed.",
    fields: [
      { name: "scenario_type", label: "Scenario", kind: "select", options: opts("BASELINE", "OPTIMISTIC", "PESSIMISTIC") },
      { name: "growth_rate_adjustment", label: "Growth rate adjustment (-0.99 to 10)", kind: "number", step: "0.01" },
    ],
  },
  "forecast.archive": {
    service: "forecasting", serviceLabel: "forecasting-svc", method: "DELETE",
    path: "/v1/forecasts/{id}", label: "Archive", from: ["CALCULATED", "REVIEWED"], version: "if-match-v", confirm: true, danger: true,
  },

  // review is offered by review_status, archive by status: the panel passes each.
  "risk-score.review": {
    service: "complianceRiskScoring", serviceLabel: "compliance-risk-scoring-svc", method: "POST",
    path: "/v1/risk-scores/{id}/review", label: "Review", from: ["PENDING_REVIEW"], version: "if-match",
    note: "The person who calculated the score cannot review it.",
    fields: [
      { name: "disposition", label: "Disposition", kind: "select", required: true, options: opts("CONFIRMED", "DISMISSED", "ESCALATED") },
      { name: "note", label: "Note", kind: "textarea", required: true },
    ],
  },
  // An escalated score can only be confirmed or dismissed; escalating again is refused.
  "risk-score.review-escalated": {
    service: "complianceRiskScoring", serviceLabel: "compliance-risk-scoring-svc", method: "POST",
    path: "/v1/risk-scores/{id}/review", label: "Decide escalation", from: ["ESCALATED"], version: "if-match",
    note: "The person who calculated the score cannot review it.",
    fields: [
      { name: "disposition", label: "Disposition", kind: "select", required: true, options: opts("CONFIRMED", "DISMISSED") },
      { name: "note", label: "Note", kind: "textarea", required: true },
    ],
  },
  "risk-score.archive": {
    service: "complianceRiskScoring", serviceLabel: "compliance-risk-scoring-svc", method: "POST",
    path: "/v1/risk-scores/{id}/archive", label: "Archive", from: ["ACTIVE", "SUPERSEDED"], version: "if-match", danger: true,
    fields: [reason("Reason", false)],
  },

  "reconciliation.decide": {
    service: "reconciliationIntel", serviceLabel: "reconciliation-intelligence-svc", method: "POST",
    path: "/v1/reconciliations/{id}/resolutions/{sub}/apply", label: "Decide", version: "if-match", from: ["RECOMMENDED"],
    note: "The person who requested the analysis cannot approve its suggestions.",
    fields: [
      { name: "suggestion_status", label: "Decision", kind: "select", required: true, options: opts("APPROVED", "REJECTED") },
      notes(),
    ],
  },
  "reconciliation.execute": {
    service: "reconciliationIntel", serviceLabel: "reconciliation-intelligence-svc", method: "POST",
    path: "/v1/reconciliations/{id}/resolutions/{sub}/apply", label: "Record execution", version: "if-match", from: ["APPROVED"],
    fixed: { suggestion_status: "EXECUTED" },
    uuidFields: ["journal_id"],
    note: "A write-off or timing adjustment needs the posted general-ledger journal; an auto-match or duplicate confirmation must not have one.",
    fields: [
      notes(),
      { name: "journal_id", label: "Posted GL journal id", kind: "text" },
    ],
    // reconciliation-intelligence-svc takes the journal as authoritative_ref {kind, journal_id}.
    shape: ({ journal_id, ...rest }) => (journal_id ? { ...rest, authoritative_ref: { kind: "GL_JOURNAL", journal_id } } : rest),
  },
  "reconciliation.archive": {
    service: "reconciliationIntel", serviceLabel: "reconciliation-intelligence-svc", method: "DELETE",
    path: "/v1/reconciliations/{id}", label: "Archive", from: ["ANALYZING", "COMPLETED"], version: "if-match", confirm: true, danger: true,
  },

  "report-definition.validate": {
    service: "reportingOrchestration", serviceLabel: "reporting-orchestration-svc", method: "PATCH",
    path: "/v1/reports/definitions/{id}/status", label: "Mark validated", from: ["DRAFT"], version: "if-match",
    fixed: { status: "VALIDATED" },
  },
  "report-definition.activate": {
    service: "reportingOrchestration", serviceLabel: "reporting-orchestration-svc", method: "PATCH",
    path: "/v1/reports/definitions/{id}/status", label: "Activate", from: ["VALIDATED", "PAUSED"], version: "if-match",
    fixed: { status: "ACTIVE" },
  },
  "report-definition.pause": {
    service: "reportingOrchestration", serviceLabel: "reporting-orchestration-svc", method: "PATCH",
    path: "/v1/reports/definitions/{id}/status", label: "Pause", from: ["ACTIVE"], version: "if-match",
    fixed: { status: "PAUSED" },
  },
  "report-definition.deprecate": {
    service: "reportingOrchestration", serviceLabel: "reporting-orchestration-svc", method: "PATCH",
    path: "/v1/reports/definitions/{id}/status", label: "Deprecate", from: ["DRAFT", "VALIDATED", "ACTIVE", "PAUSED"], version: "if-match",
    fixed: { status: "DEPRECATED" }, confirm: true, danger: true,
  },
  "report-definition.run": {
    service: "reportingOrchestration", serviceLabel: "reporting-orchestration-svc", method: "POST",
    path: "/v1/reports/definitions/{id}/runs", label: "Request run", from: ["ACTIVE"],
    note: "reporting-orchestration-svc records the run but does not produce report data yet; it answers NOT_IMPLEMENTED.",
    pairedDates: [["period_start", "period_end"]],
    fields: [
      { name: "period_start", label: "Period start", kind: "date" },
      { name: "period_end", label: "Period end", kind: "date" },
    ],
  },

  "recommendation.accept": {
    service: "decisionSupport", serviceLabel: "decision-support-svc", method: "POST",
    path: "/v1/recommendations/{id}/accept", label: "Accept", from: ["REVIEW_REQUIRED"], version: "if-match",
    note: "An O3 recommendation needs an approval reference. The requester cannot accept an O2 or O3 recommendation.",
    fields: [
      { name: "approval_reference", label: "Approval reference", kind: "text" },
      { name: "downstream_action_ref", label: "Downstream action reference", kind: "text" },
      reason("Reason", false),
    ],
  },
  "recommendation.reject": {
    service: "decisionSupport", serviceLabel: "decision-support-svc", method: "POST",
    path: "/v1/recommendations/{id}/reject", label: "Reject", from: ["REVIEW_REQUIRED"], version: "if-match", danger: true,
    fields: [reason()],
  },
  "recommendation.expire": {
    service: "decisionSupport", serviceLabel: "decision-support-svc", method: "POST",
    path: "/v1/recommendations/{id}/expire", label: "Expire", from: ["REVIEW_REQUIRED"], version: "if-match",
    note: "A reason is required before the review deadline.",
    fields: [reason("Reason", false)],
  },
  "recommendation.supersede": {
    service: "decisionSupport", serviceLabel: "decision-support-svc", method: "POST",
    path: "/v1/recommendations/{id}/supersede", label: "Supersede", from: ["REVIEW_REQUIRED"], version: "if-match",
    dynamicFields: ["replacement_recommendation_id"],
    fields: [
      { name: "replacement_recommendation_id", label: "Replacing recommendation", kind: "select", required: true, hint: "Another recommendation still under review, for the same entity, subject and action." },
      reason("Reason", false),
    ],
  },

} satisfies Record<string, LifecycleActionSpec>;

// ── Security (Block 9) ───────────────────────────────────────────────────────

// The exporter lifecycle routes (pause, resume, disable) are served by backend main.
const siem = (path: string, label: string, from: readonly string[], extra: Partial<LifecycleActionSpec> = {}): LifecycleActionSpec => ({
  service: "siemIntegration", serviceLabel: "siem-integration-svc", method: "POST",
  path: `/v1/siem/exporters/{id}/${path}`, label, from, ...extra,
});

const SECURITY: Record<string, LifecycleActionSpec> = {
  "siem.pause": siem("pause", "Pause", ["ACTIVE"], { note: "A paused exporter accepts no events until it is resumed." }),
  "siem.resume": siem("resume", "Resume", ["PAUSED"]),
  "siem.disable": siem("disable", "Disable", ["ACTIVE", "PAUSED"], { confirm: true, danger: true, note: "Disabling is final." }),
  "carta.reevaluate": {
    service: "carta", serviceLabel: "carta-svc", method: "POST",
    path: "/v1/carta/assessments/{id}/reevaluate", label: "Re-evaluate", purposeContext: "security.access.evaluate",
    note: "Scores the recorded context again with the current model and records a new assessment; this one is kept as it was.",
  },
};

// ── Commercial: vendor profiles ──────────────────────────────────────────────

const VENDOR: Record<string, LifecycleActionSpec> = {
  "vendor-profile.approve": {
    service: "vendorDueDiligence", serviceLabel: "vendor-due-diligence-svc", method: "POST",
    path: "/v1/vendor-profiles/{id}/approve", label: "Approve vendor", from: ["PENDING"],
    purposeContext: "vendor_due_diligence", confirm: true,
    note: "Refused unless the counterparty's latest screening completed CLEAR.",
  },
};

// ── Integration (Block 10) ───────────────────────────────────────────────────

const bridge = (path: string, label: string, from: readonly string[], extra: Partial<LifecycleActionSpec> = {}): LifecycleActionSpec => ({
  service: "connectivityBridge", serviceLabel: "connectivity-api-bridge-svc", method: "POST",
  path: `/v1/bridges/{id}/${path}`, label, from, version: "expected-version", ...extra,
});
const bank = (path: string, label: string, from: readonly string[], extra: Partial<LifecycleActionSpec> = {}): LifecycleActionSpec => ({
  service: "bankingConnector", serviceLabel: "banking-connector-svc", method: "POST",
  path: `/v1/banking/connections/{id}/${path}`, label, from, purposeContext: "integration.banking.connection", ...extra,
});

const INTEGRATION: Record<string, LifecycleActionSpec> = {
  // Submit refuses a bridge whose configuration is incomplete; this sets it.
  "bridge.configure": {
    service: "connectivityBridge", serviceLabel: "connectivity-api-bridge-svc", method: "PATCH",
    path: "/v1/bridges/{id}", label: "Configure", from: ["DRAFT", "PENDING_APPROVAL", "ACTIVE", "DEGRADED", "SUSPENDED"],
    version: "expected-version", listFields: ["scopes"], dynamicFields: ["provider_profile", "credential_ref"],
    note: "Changing protected settings on an active, degraded, suspended or pending bridge returns it to DRAFT. Leave a field blank to keep it.",
    fields: [
      { name: "purpose", label: "Purpose", kind: "text", hint: "Lower-case identifier, 3 to 64 characters: letters, digits, . _ -" },
      { name: "provider_profile", label: "Provider profile", kind: "select", hint: "CERTIFIED external provider profiles." },
      { name: "destination_region", label: "Destination region", kind: "text", hint: "One of the profile's allowed regions." },
      { name: "sync_mode", label: "Sync mode", kind: "select", options: opts("PULL", "PUSH", "NONE") },
      { name: "scopes", label: "Scopes", kind: "text", hint: "Comma-separated, 1 to 32, within the profile's supported scopes." },
      { name: "credential_ref", label: "Credential policy", kind: "select", hint: "From secret-vault-integration-svc. Leave blank for auth type NONE." },
    ],
    // A profile is offered as key@version; anything else is refused before sending.
    validate: ({ provider_profile }) =>
      provider_profile === undefined || /^[a-z0-9][a-z0-9._-]{2,79}@[1-9][0-9]{0,5}$/.test(String(provider_profile))
        ? null
        : "Provider profile: choose one from the list.",
    // The service takes the profile as provider_key and provider_profile_version.
    shape: ({ provider_profile, ...rest }) => {
      if (!provider_profile) return rest;
      const [key, version] = String(provider_profile).split("@");
      return { ...rest, provider_key: key, provider_profile_version: Number(version) };
    },
  },
  "bridge.submit": bridge("submit", "Submit for approval", ["DRAFT"]),
  "bridge.approve": bridge("approve", "Approve", ["PENDING_APPROVAL"], {
    fields: [reason("Reason", false)],
    note: "Records the approval; the bridge stays PENDING_APPROVAL until it is activated. The last person to change it cannot approve.",
  }),
  "bridge.reject": bridge("reject", "Reject", ["PENDING_APPROVAL"], { fields: [reason()], danger: true }),
  "bridge.activate": bridge("activate", "Activate", ["PENDING_APPROVAL", "SUSPENDED"]),
  "bridge.suspend": bridge("suspend", "Suspend", ["ACTIVE", "DEGRADED"], { fields: [reason()], danger: true }),
  "bridge.revoke": bridge("revoke", "Revoke", ["DRAFT", "PENDING_APPROVAL", "ACTIVE", "DEGRADED", "SUSPENDED", "INACTIVE"], {
    fields: [reason()], danger: true,
  }),
  "bridge.archive": bridge("archive", "Archive", ["REVOKED"], { confirm: true, danger: true }),

  "bank-connection.complete-authorization": bank("complete-authorization", "Record authorization", ["REQUESTED", "AUTHORIZING"], {
    listFields: ["granted_scope"],
    note: "Records the token lease the bank's consent produced. The token stays in the vault; only its lease reference is sent.",
    fields: [
      { name: "token_lease_ref", label: "Token lease reference", kind: "text", required: true },
      { name: "token_expires_at", label: "Token expires at", kind: "datetime-local", required: true },
      { name: "granted_scope", label: "Granted scope", kind: "text", hint: "Comma-separated; within the requested scope." },
    ],
  }),
  "bank-connection.activate": bank("activate", "Activate", ["AUTHORIZING"], {
    note: "Needs an unexpired token from the bank's authorization; without one the service refuses.",
  }),
  "bank-connection.suspend": bank("suspend", "Suspend", ["ACTIVE", "DEGRADED"], { fields: [reason("Reason", false)], danger: true }),
  "bank-connection.reconsent": bank("trigger-reconsent", "Require re-consent", ["ACTIVE", "DEGRADED", "SUSPENDED"], {
    fields: [reason("Reason", false)],
  }),
  "bank-connection.reconnect": bank("reconnect", "Reconnect", ["DEGRADED", "SUSPENDED", "RECONSENT_REQUIRED"]),
  "bank-connection.revoke": bank("revoke", "Revoke", ["REQUESTED", "AUTHORIZING", "ACTIVE", "DEGRADED", "SUSPENDED", "RECONSENT_REQUIRED"], {
    fields: [reason("Reason", false)], danger: true,
    note: "Revokes the token lease in the vault first; if the vault cannot be reached nothing changes.",
  }),

  "feed.ingest-event": {
    service: "externalDataFeed", serviceLabel: "external-data-feed-svc", method: "POST",
    path: "/v1/external-data-feeds/events/ingest", label: "Record event", from: ["ACTIVE"], idField: "feed_id",
    jsonFields: ["payload"],
    note: "Records an event the provider delivered against this subscription. It does not fetch anything from the provider.",
    fields: [
      { name: "event_type", label: "Event type", kind: "text", required: true },
      { name: "payload", label: "Payload (JSON object)", kind: "textarea", placeholder: "{}" },
    ],
  },
};

export const LIFECYCLE_ACTIONS: Record<string, LifecycleActionSpec> = {
  ...CLAUSES,
  ...OBLIGATIONS,
  ...CORPORATE,
  ...TAX,
  ...COMMERCIAL,
  ...INTELLIGENCE,
  ...SECURITY,
  ...VENDOR,
  ...INTEGRATION,
};
