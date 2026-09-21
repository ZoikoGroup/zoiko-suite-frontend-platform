// Backend service registry for the ZoikoSuite admin console.
//
// Every service in the backend listens on its own port and, in a real
// deployment, is reachable only through the Traefik gateway on :80 — the
// service ports are not published. Locally the ports ARE published, so we talk
// to services directly and keep the gateway out of the loop.
//
// Switching to the gateway later is a two-line change: point GATEWAY_URL at it
// and set ZOIKO_USE_GATEWAY=true. Everything downstream reads serviceUrl().

const DEFAULTS = {
  // ── Core / Legacy Services (kept for typing and client compatibility) ────
  governance: "http://localhost:8083",
  policy: "http://localhost:8085",
  configuration: "http://localhost:8086",
  secretVault: "http://localhost:8087",
  obligations: "http://localhost:8088",
  identityContext: "http://localhost:8080",
  jurisdictionRules: "http://localhost:8082",
  accountsReceivable: "http://localhost:8101",
  generalLedger: "http://localhost:8098",
  bankReconciliation: "http://localhost:8102",
  accountsPayable: "http://localhost:8099",
  auditEventStore: "http://localhost:8084",
  tenantRegistry: "http://localhost:8081",
  schemaRegistry: "http://localhost:8093",
  financialClose: "http://localhost:8104",
  treasury: "http://localhost:8103",
  intercompanyAccounting: "http://localhost:8105",
  consolidation: "http://localhost:8106",
  invoiceApproval: "http://localhost:8107",
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
  aiGovernance: "http://localhost:8146",
  authorization: "http://localhost:8089",
  accessControl: "http://localhost:8137",
  workflow: "http://localhost:8090",
  workflowHistory: "http://localhost:8097",
  privacyConsent: "http://localhost:8152",
  privacyPurposeRegistry: "http://localhost:8151",
  privacyTransfer: "http://localhost:8155",
  payeeBankingIdentity: "http://localhost:8173",
  gatewayAuth: "http://localhost:8092",
  searchIndexer: "http://localhost:8096",
  opensearch: "http://localhost:9200",
  notification: "http://localhost:8133",
  delegatedAuthority: "http://localhost:8136",
  documentVault: "http://localhost:8094",
  sourceAuthority: "http://localhost:8150",
  retentionRegistry: "http://localhost:8148",

  // ── Canonical Spec: Group 6 · Legal, Corporate & Commercial ───────────────
  contracts: "http://localhost:8119",
  clauseTemplate: "http://localhost:8120",
  obligationTracking: "http://localhost:8121",
  boardResolutions: "http://localhost:8122",
  corporateActions: "http://localhost:8123",
  counterpartyManagement: "http://localhost:8124",
  purchaseRequest: "http://localhost:8100",
  // Port conflict resolved: spec said 8129, but withholding-tax-svc holds 8129.
  purchaseOrder: "http://localhost:8150",
  spendControls: "http://localhost:8131",
  // Spec port 8132
  vendorDueDiligence: "http://localhost:8132",
  procurementWorkflow: "http://localhost:8134",

  // ── Canonical Spec: Group 7 · Tax & Compliance ─────────────────────────────
  taxRules: "http://localhost:8125",
  taxDetermination: "http://localhost:8126",
  vatGst: "http://localhost:8127",
  corporateTax: "http://localhost:8128",
  withholdingTax: "http://localhost:8129",
  filingPreparation: "http://localhost:8130",
  evidence: "http://localhost:8130",
  // Port conflict resolved: spec said 8131, but spend-controls-svc holds 8131.
  filingTracker: "http://localhost:8151",
  // Port conflict resolved: spec said 8132, but vendor-due-diligence holds 8132.
  complianceStatus: "http://localhost:8152",
  exceptionEscalation: "http://localhost:8133",
  taxAuthorityInterface: "http://localhost:8147",

  // ── Canonical Spec: Group 8 · Intelligence & Reporting ─────────────────────
  // Port conflict resolved: spec said 8134, but procurement-workflow holds 8134.
  anomalyDetection: "http://localhost:8153",
  forecasting: "http://localhost:8135",
  complianceRiskScoring: "http://localhost:8136",
  reconciliationIntelligence: "http://localhost:8137",
  reportingOrchestration: "http://localhost:8138",
  // Port conflict resolved: spec said 8138, but reporting-orchestration holds 8138.
  decisionSupport: "http://localhost:8154",
  migrationIntegrity: "http://localhost:8139",

  // ── Canonical Spec: Group 9 · Security & Trust ─────────────────────────────
  mtlsManagement: "http://localhost:8140",
  siemIntegration: "http://localhost:8141",
  carta: "http://localhost:8142",
  keyManagement: "http://localhost:8143",

  // ── Canonical Spec: Group 10 · Integration & Extensibility ─────────────────
  connectivityApiBridge: "http://localhost:8144",
  bankingConnector: "http://localhost:8145",
  hrisConnector: "http://localhost:8146",
  esignatureIntegration: "http://localhost:8148",
  externalDataFeed: "http://localhost:8149",

  // ── Gateway fallback ───────────────────────────────────────────────────────
  gateway: "http://localhost:8000",
} as const;

export type ServiceName = keyof Omit<typeof DEFAULTS, "gateway">;

const GATEWAY_PREFIX: Record<ServiceName, string> = {
  governance: "/governance-decision-log-svc",
  policy: "/policy-svc",
  configuration: "/configuration-feature-flag-svc",
  secretVault: "/secret-vault-integration-svc",
  obligations: "/obligations-svc",
  identityContext: "/identity-context-svc",
  jurisdictionRules: "/jurisdiction-rules-svc",
  accountsReceivable: "/accounts-receivable-svc",
  generalLedger: "/general-ledger-svc",
  bankReconciliation: "/bank-reconciliation-svc",
  accountsPayable: "/accounts-payable-svc",
  auditEventStore: "/audit-event-store-svc",
  tenantRegistry: "/tenant-entity-registry-svc",
  schemaRegistry: "/schema-registry-svc",
  financialClose: "/financial-close-svc",
  treasury: "/treasury-svc",
  intercompanyAccounting: "/intercompany-accounting-svc",
  consolidation: "/consolidation-svc",
  invoiceApproval: "/invoice-approval-svc",
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
  aiGovernance: "/ai-governance-svc",
  authorization: "/authorization-svc",
  accessControl: "/access-control-svc",
  workflow: "/workflow-svc",
  workflowHistory: "/workflow-history-svc",
  privacyConsent: "/privacy-consent-svc",
  privacyPurposeRegistry: "/privacy-purpose-registry-svc",
  privacyTransfer: "/privacy-transfer-svc",
  payeeBankingIdentity: "/payee-banking-identity-svc",
  gatewayAuth: "/gateway-auth-svc",
  searchIndexer: "/search-indexer-svc",
  opensearch: "/opensearch",
  notification: "/notification-svc",
  delegatedAuthority: "/delegated-authority-svc",
  documentVault: "/document-vault-svc",
  sourceAuthority: "/source-authority-svc",
  retentionRegistry: "/retention-registry-svc",

  // Group 6
  contracts: "/contract-lifecycle-svc",
  clauseTemplate: "/clause-template-svc",
  obligationTracking: "/obligation-tracking-svc",
  boardResolutions: "/board-resolutions-svc",
  corporateActions: "/corporate-actions-svc",
  counterpartyManagement: "/counterparty-management-svc",
  purchaseRequest: "/purchase-request-svc",
  purchaseOrder: "/purchase-order-svc",
  spendControls: "/spend-controls-svc",
  vendorDueDiligence: "/vendor-due-diligence-svc",
  procurementWorkflow: "/procurement-workflow-svc",

  // Group 7
  taxRules: "/tax-rules-svc",
  taxDetermination: "/tax-determination-svc",
  vatGst: "/vat-gst-svc",
  corporateTax: "/corporate-tax-svc",
  withholdingTax: "/withholding-tax-svc",
  filingPreparation: "/filing-preparation-svc",
  evidence: "/filing-preparation-svc",
  filingTracker: "/filing-tracker-svc",
  complianceStatus: "/compliance-status-svc",
  exceptionEscalation: "/exception-escalation-svc",
  taxAuthorityInterface: "/tax-authority-svc",

  // Group 8
  anomalyDetection: "/anomaly-detection-svc",
  forecasting: "/forecasting-svc",
  complianceRiskScoring: "/compliance-risk-scoring-svc",
  reconciliationIntelligence: "/reconciliation-intelligence-svc",
  reportingOrchestration: "/reporting-orchestration-svc",
  decisionSupport: "/decision-support-svc",
  migrationIntegrity: "/migration-integrity-svc",

  // Group 9
  mtlsManagement: "/mtls-management-svc",
  siemIntegration: "/siem-integration-svc",
  carta: "/carta-svc",
  keyManagement: "/key-management-svc",

  // Group 10
  connectivityApiBridge: "/connectivity-api-bridge-svc",
  bankingConnector: "/banking-connector-svc",
  hrisConnector: "/hris-connector-svc",
  esignatureIntegration: "/esignature-integration-svc",
  externalDataFeed: "/external-data-feed-svc",
};

const useGateway = process.env.ZOIKO_USE_GATEWAY === "true";

export function serviceLabel(service: ServiceName): string {
  const prefix = GATEWAY_PREFIX[service];
  if (prefix && prefix.startsWith("/")) {
    return prefix.slice(1);
  }
  return String(service);
}

export function serviceUrl(service: ServiceName): string {
  if (useGateway) {
    const gateway = process.env.ZOIKO_GATEWAY_URL ?? DEFAULTS.gateway;
    return stripTrailingSlash(gateway) + GATEWAY_PREFIX[service];
  }

  return stripTrailingSlash(process.env[envKeyFor(service)] ?? DEFAULTS[service]);
}

function envKeyFor(service: ServiceName): string {
  const snake = service.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
  return `ZOIKO_${snake}_URL`;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export const REQUEST_TIMEOUT_MS = Number(process.env.ZOIKO_API_TIMEOUT_MS ?? 10000);
