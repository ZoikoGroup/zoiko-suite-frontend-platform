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
    fields: [{ name: "superseded_by", label: "Replacing clause id", kind: "text", required: true }],
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
    fields: [
      { name: "trigger_description", label: "Trigger", kind: "text", required: true },
      { name: "calculation_method", label: "How the due date is calculated", kind: "text", required: true },
      { name: "source_clause_id", label: "Source clause id", kind: "text" },
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
    fields: [{ name: "superseded_by", label: "Replacing obligation id", kind: "text", required: true }],
  },
} satisfies Record<string, LifecycleActionSpec>;

const CORPORATE = {
  "corporate-action.execute": {
    service: "corporateActions", serviceLabel: "corporate-actions-svc", method: "POST",
    path: "/v1/corporate-actions/{id}/execute", label: "Record execution", from: ["PROPOSED", "BOARD_APPROVED"],
    actorFields: ["executed_by"],
    note: "The service refuses execution by the person who proposed the action, and checks the required evidence.",
    fields: [{ name: "document_vault_id", label: "Evidence document id (document vault)", kind: "text" }],
  },
  "counterparty.compliance": {
    service: "counterparty", serviceLabel: "counterparty-management-svc", method: "POST",
    path: "/v1/counterparties/{id}/compliance", label: "Set compliance status", purposeContext: "legal.counterparty.compliance",
    fields: [{ name: "compliance_status", label: "Compliance status", kind: "select", required: true, options: opts("VERIFIED", "PENDING", "REJECTED") }],
  },
} satisfies Record<string, LifecycleActionSpec>;

// ── Tax and compliance (Block 7) ─────────────────────────────────────────────

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
    purposeContext: "tax.corporate.submit", confirm: true,
    note: "Records the return as submitted in corporate-tax-svc; it does not file with a tax authority.",
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
    version: "expected-version",
    note: "purchase-request-svc raises the order in purchase-order-svc.",
    fields: [
      { name: "supplier_ref", label: "Supplier reference", kind: "text" },
      { name: "vendor_profile_id", label: "Vendor profile id", kind: "text" },
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
    path: "/v1/risk-scores/{id}/review", label: "Review", from: ["PENDING_REVIEW", "ESCALATED"], version: "if-match",
    note: "The person who calculated the score cannot review it.",
    fields: [
      { name: "disposition", label: "Disposition", kind: "select", required: true, options: opts("CONFIRMED", "DISMISSED", "ESCALATED") },
      { name: "note", label: "Note", kind: "textarea", required: true },
    ],
  },
  "risk-score.archive": {
    service: "complianceRiskScoring", serviceLabel: "compliance-risk-scoring-svc", method: "POST",
    path: "/v1/risk-scores/{id}/archive", label: "Archive", from: ["ACTIVE", "SUPERSEDED"], version: "if-match", danger: true,
    fields: [reason("Reason", false)],
  },

  "reconciliation.apply": {
    service: "reconciliationIntel", serviceLabel: "reconciliation-intelligence-svc", method: "POST",
    path: "/v1/reconciliations/{id}/resolutions/{sub}/apply", label: "Decide", version: "if-match",
    from: ["RECOMMENDED", "APPROVED"],
    note: "Executing a write-off or timing adjustment needs a posted journal reference, which this form does not send; the service will say so.",
    fields: [
      { name: "suggestion_status", label: "Decision", kind: "select", required: true, options: opts("APPROVED", "REJECTED", "EXECUTED") },
      notes(),
    ],
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
    fields: [
      { name: "replacement_recommendation_id", label: "Replacing recommendation id", kind: "text", required: true },
      reason("Reason", false),
    ],
  },

} satisfies Record<string, LifecycleActionSpec>;

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
  ...INTEGRATION,
};
