// Backend service registry for the ZoikoSuite admin console.
//
// Every service in the backend listens on its own port (8080–8130) and, in a
// real deployment, is reachable only through the Traefik gateway on :80 — the
// service ports are not published. Locally the ports ARE published, so we talk
// to services directly and keep the gateway out of the loop.
//
// Switching to the gateway later is a two-line change: point GATEWAY_URL at it
// and set ZOIKO_USE_GATEWAY=true. Everything downstream reads serviceUrl().

const DEFAULTS = {
  governance: "http://localhost:8083",
  policy: "http://localhost:8085",
  configuration: "http://localhost:8086",
  secretVault: "http://localhost:8087",
  obligations: "http://localhost:8088",
  jurisdictionRules: "http://localhost:8082",
  purchaseRequest: "http://localhost:8100",
  contracts: "http://localhost:8119",
  purchaseOrder: "http://localhost:8139",
  evidence: "http://localhost:8130",
  accountsReceivable: "http://localhost:8101",
  accountsPayable: "http://localhost:8099",
  spendControls: "http://localhost:8131",
  vendorDueDiligence: "http://localhost:8135",
  auditEventStore: "http://localhost:8084",
  tenantRegistry: "http://localhost:8081",
  schemaRegistry: "http://localhost:8093",
  financialClose: "http://localhost:8104",

  // ── Finance Domain ───────────────────────────────────────────────────────
  generalLedger: "http://localhost:8098",
  bankReconciliation: "http://localhost:8102",
  treasury: "http://localhost:8103",
  intercompanyAccounting: "http://localhost:8105",
  consolidation: "http://localhost:8106",
  invoiceApproval: "http://localhost:8107",

  // ── HR & Workforce Domain ────────────────────────────────────────────────
  employeeMaster: "http://localhost:8108",
  employmentContracts: "http://localhost:8109",
  payrollRun: "http://localhost:8110",
  compensation: "http://localhost:8111",
  benefits: "http://localhost:8112",
  payrollTax: "http://localhost:8113",
  payrollExceptions: "http://localhost:8114",
  leaveAbsence: "http://localhost:8115",
  orgStructure: "http://localhost:8116",
  offboardingSeverance: "http://localhost:8117",
  workforceCompliance: "http://localhost:8118",
  performanceReview: "http://localhost:8139",

  // ── Legal & Corporate Governance ─────────────────────────────────────────
  clauseTemplate: "http://localhost:8120",
  obligationTracking: "http://localhost:8121",
  boardResolutions: "http://localhost:8122",
  corporateActions: "http://localhost:8123",
  counterpartyManagement: "http://localhost:8124",
  carta: "http://localhost:8142",

  // ── Compliance & Risk Domain ─────────────────────────────────────────────
  complianceStatus: "http://localhost:8132",
  exceptionEscalation: "http://localhost:8133",
  anomalyDetection: "http://localhost:8134",
  complianceRiskScoring: "http://localhost:8136",
  decisionSupport: "http://localhost:8138",

  // ── Tax Domain (ports 8125–8130 + 8147) ──────────────────────────────────
  taxRules: "http://localhost:8125",
  taxDetermination: "http://localhost:8126",
  vatGst: "http://localhost:8127",
  corporateTax: "http://localhost:8128",
  withholdingTax: "http://localhost:8129",
  filingPreparation: "http://localhost:8130",
  filingTracker: "http://localhost:8131",
  taxAuthorityInterface: "http://localhost:8147",

  // ── AI Governance, Security & Access ─────────────────────────────────────
  aiGovernance: "http://localhost:8146",
  documentVault: "http://localhost:8094",
  authorization: "http://localhost:8089",
  accessControl: "http://localhost:8137",
  procurementWorkflow: "http://localhost:8134",
  notification: "http://localhost:8133",

  // The gateway's host port is GATEWAY_PORT in the backend compose, which
  // defaults to 8000 because port 80 is usually already taken on a dev machine.
  gateway: "http://localhost:8000",
} as const;

export type ServiceName = keyof Omit<typeof DEFAULTS, "gateway">;

/**
 * Gateway routing prefix per service, used when ZOIKO_USE_GATEWAY is on.
 *
 * These MUST match the prefixes in the backend's
 * deployments/traefik-dynamic/all-services.yml, which are generated from each
 * service's container_name — so they are the full service name, not a short
 * alias. Getting this wrong produces a 404 from Traefik that looks like the
 * service is down.
 */
const GATEWAY_PREFIX: Record<ServiceName, string> = {
  governance: "/governance-decision-log-svc",
  policy: "/policy-svc",
  configuration: "/configuration-feature-flag-svc",
  secretVault: "/secret-vault-integration-svc",
  obligations: "/obligations-svc",
  jurisdictionRules: "/jurisdiction-rules-svc",
  purchaseRequest: "/purchase-request-svc",
  contracts: "/contract-lifecycle-svc",
  purchaseOrder: "/purchase-order-svc",
  evidence: "/evidence-requirements-svc",
  accountsReceivable: "/accounts-receivable-svc",
  accountsPayable: "/accounts-payable-svc",
  spendControls: "/spend-controls-svc",
  vendorDueDiligence: "/vendor-due-diligence-svc",
  auditEventStore: "/audit-event-store-svc",
  tenantRegistry: "/tenant-entity-registry-svc",
  schemaRegistry: "/schema-registry-svc",
  financialClose: "/financial-close-svc",

  // Finance Domain
  generalLedger: "/general-ledger-svc",
  bankReconciliation: "/bank-reconciliation-svc",
  treasury: "/treasury-svc",
  intercompanyAccounting: "/intercompany-accounting-svc",
  consolidation: "/consolidation-svc",
  invoiceApproval: "/invoice-approval-svc",

  // HR & Workforce Domain
  employeeMaster: "/employee-master-svc",
  employmentContracts: "/employment-contracts-svc",
  payrollRun: "/payroll-run-svc",
  compensation: "/compensation-svc",
  benefits: "/benefits-svc",
  payrollTax: "/payroll-tax-svc",
  payrollExceptions: "/payroll-exceptions-svc",
  leaveAbsence: "/leave-absence-svc",
  orgStructure: "/org-structure-svc",
  offboardingSeverance: "/offboarding-severance-svc",
  workforceCompliance: "/workforce-compliance-svc",
  performanceReview: "/performance-review-svc",

  // Legal Domain
  clauseTemplate: "/clause-template-svc",
  obligationTracking: "/obligation-tracking-svc",
  boardResolutions: "/board-resolutions-svc",
  corporateActions: "/corporate-actions-svc",
  counterpartyManagement: "/counterparty-management-svc",
  carta: "/carta-svc",

  // Compliance Domain
  complianceStatus: "/compliance-status-svc",
  exceptionEscalation: "/exception-escalation-svc",
  anomalyDetection: "/anomaly-detection-svc",
  complianceRiskScoring: "/compliance-risk-scoring-svc",
  decisionSupport: "/decision-support-svc",

  // Tax Domain
  taxRules: "/tax-rules-svc",
  taxDetermination: "/tax-determination-svc",
  vatGst: "/vat-gst-svc",
  corporateTax: "/corporate-tax-svc",
  withholdingTax: "/withholding-tax-svc",
  filingPreparation: "/filing-preparation-svc",
  filingTracker: "/filing-tracker-svc",
  taxAuthorityInterface: "/tax-authority-interface-svc",

  // AI Governance, Security & Access
  aiGovernance: "/ai-governance-svc",
  documentVault: "/document-vault-svc",
  authorization: "/authorization-svc",
  accessControl: "/access-control-svc",
  procurementWorkflow: "/procurement-workflow-svc",
  notification: "/notification-svc",
};

const useGateway = process.env.ZOIKO_USE_GATEWAY === "true";

/**
 * The backend's own name for a service, for error messages.
 *
 * The keys of this registry are short console-side aliases — `contracts`,
 * `purchaseOrder` — and putting one in front of a user reads as a bug: nothing
 * in the backend, its logs, or its compose file is called "contracts". Derived
 * from the gateway prefix rather than listed separately so there is only one
 * place a service name can be wrong.
 */
export function serviceLabel(service: ServiceName): string {
  return GATEWAY_PREFIX[service].slice(1);
}

/**
 * Resolve the base URL for a backend service.
 *
 * Reads env first so deployments can override without a rebuild. These are
 * deliberately NOT NEXT_PUBLIC_* — the browser must never hold backend URLs,
 * because all calls go through the server (see client.ts).
 */
export function serviceUrl(service: ServiceName): string {
  if (useGateway) {
    const gateway = process.env.ZOIKO_GATEWAY_URL ?? DEFAULTS.gateway;
    return stripTrailingSlash(gateway) + GATEWAY_PREFIX[service];
  }

  return stripTrailingSlash(process.env[envKeyFor(service)] ?? DEFAULTS[service]);
}

/** `purchaseOrder` → `ZOIKO_PURCHASE_ORDER_URL`. Plain uppercasing would give
 *  ZOIKO_PURCHASEORDER_URL, which nobody would guess when writing a .env. */
function envKeyFor(service: ServiceName): string {
  const snake = service.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
  return `ZOIKO_${snake}_URL`;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** Per-request timeout. Dashboard panels degrade to an empty state on timeout. */
export const REQUEST_TIMEOUT_MS = Number(process.env.ZOIKO_API_TIMEOUT_MS ?? 1500);
