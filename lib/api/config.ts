// Backend service registry — ZoikoSuite admin console.
// Comprehensive microservices registry: Blocks 1–10 + Identity, Gateways & Integrations.
//
// Every service listens on its own port and, in a real deployment, is reachable
// only through the Traefik gateway on :80. Locally the ports ARE published, so
// we talk to services directly.
//
// Switching to the gateway later is a two-line change: point GATEWAY_URL at it
// and set ZOIKO_USE_GATEWAY=true. Everything downstream reads serviceUrl().
//
// IMPORTANT: ServiceName is derived as `keyof Omit<typeof DEFAULTS, "gateway">`.
// Adding a service to DEFAULTS automatically widens the type — no manual union
// maintenance required. Never cast a string literal to ServiceName; add it here.

const DEFAULTS = {
  // ── BLOCK 1 · Platform Identity & Core Governance ────────────────────────
  governance:                 "http://127.0.0.1:8083",  // governance-decision-log-svc
  policy:                     "http://127.0.0.1:8085",  // policy-svc
  configuration:              "http://127.0.0.1:8086",  // configuration-feature-flag-svc
  secretVault:                "http://127.0.0.1:8087",  // secret-vault-svc
  obligations:                "http://127.0.0.1:8088",  // obligations-svc
  authorization:              "http://127.0.0.1:8089",  // authorization-svc
  accessControl:              "http://127.0.0.1:8137",  // access-control-svc
  delegatedAuthority:         "http://127.0.0.1:8136",  // delegated-authority-svc
  documentVault:              "http://127.0.0.1:8094",  // document-vault-svc
  auditEventStore:            "http://127.0.0.1:8084",  // audit-event-store-svc
  tenantRegistry:             "http://127.0.0.1:8081",  // tenant-entity-registry-svc
  identityContext:            "http://127.0.0.1:8080",  // identity-context-svc
  gatewayAuth:                "http://127.0.0.1:8080",  // gateway-auth-svc
  schemaRegistry:             "http://127.0.0.1:8093",  // schema-registry-svc

  // ── BLOCK 2 · General Ledger & Finance Hub ───────────────────────────────
  generalLedger:              "http://127.0.0.1:8098",  // general-ledger-svc
  accountsPayable:            "http://127.0.0.1:8099",  // accounts-payable-svc
  accountsReceivable:         "http://127.0.0.1:8101",  // accounts-receivable-svc
  bankReconciliation:         "http://127.0.0.1:8102",  // bank-reconciliation-svc
  financialClose:             "http://127.0.0.1:8104",  // financial-close-svc
  treasury:                   "http://127.0.0.1:8103",  // treasury-svc
  intercompanyAccounting:     "http://127.0.0.1:8105",  // intercompany-accounting-svc
  consolidation:              "http://127.0.0.1:8106",  // consolidation-svc
  invoiceApproval:            "http://127.0.0.1:8107",  // invoice-approval-svc

  // ── BLOCK 3 · HR & Workforce Management ──────────────────────────────────
  employeeMaster:             "http://127.0.0.1:8108",  // employee-master-svc
  employmentContracts:        "http://127.0.0.1:8109",  // employment-contracts-svc
  payrollRun:                 "http://127.0.0.1:8110",  // payroll-run-svc
  compensation:               "http://127.0.0.1:8111",  // compensation-svc
  benefits:                   "http://127.0.0.1:8112",  // benefits-svc
  payrollTax:                 "http://127.0.0.1:8113",  // payroll-tax-svc
  payrollExceptions:          "http://127.0.0.1:8114",  // payroll-exceptions-svc
  leaveAbsence:               "http://127.0.0.1:8115",  // leave-absence-svc
  orgStructure:               "http://127.0.0.1:8116",  // org-structure-svc
  offboardingSeverance:       "http://127.0.0.1:8117",  // offboarding-severance-svc
  workforceCompliance:        "http://127.0.0.1:8118",  // workforce-compliance-svc
  performanceReview:          "http://127.0.0.1:8139",  // performance-review-svc

  // ── BLOCK 6 · Legal, Corporate & Commercial ─────────────────────────────
  contracts:                  "http://127.0.0.1:8119",  // contract-lifecycle-svc
  clauseTemplate:             "http://127.0.0.1:8120",  // clause-template-svc
  obligationTracking:         "http://127.0.0.1:8121",  // obligation-tracking-svc
  boardResolutions:           "http://127.0.0.1:8122",  // board-resolutions-svc
  corporateActions:           "http://127.0.0.1:8123",  // corporate-actions-svc
  counterparty:               "http://127.0.0.1:8124",  // counterparty-management-svc
  purchaseRequest:            "http://127.0.0.1:8100",  // purchase-request-svc
  purchaseOrder:              "http://127.0.0.1:8150",  // purchase-order-svc
  spendControls:              "http://127.0.0.1:8131",  // spend-controls-svc
  vendorDueDiligence:         "http://127.0.0.1:8132",  // vendor-due-diligence-svc
  procurementWorkflow:        "http://127.0.0.1:8134",  // procurement-workflow-svc

  // ── BLOCK 7 · Tax & Compliance ──────────────────────────────────────────
  taxRules:                   "http://127.0.0.1:8125",  // tax-rules-svc
  taxDetermination:           "http://127.0.0.1:8126",  // tax-determination-svc
  vatGst:                     "http://127.0.0.1:8127",  // vat-gst-svc
  corporateTax:               "http://127.0.0.1:8128",  // corporate-tax-svc
  withholdingTax:             "http://127.0.0.1:8129",  // withholding-tax-svc
  filingPreparation:          "http://127.0.0.1:8130",  // filing-preparation-svc
  evidence:                   "http://127.0.0.1:8130",  // evidence-requirements-svc (same host)
  filingTracker:              "http://127.0.0.1:8151",  // filing-tracker-svc
  complianceStatus:           "http://127.0.0.1:8152",  // compliance-status-svc
  exceptionEscalation:        "http://127.0.0.1:8133",  // exception-escalation-svc

  // ── BLOCK 8 · Intelligence & Reporting ──────────────────────────────────
  anomalyDetection:           "http://127.0.0.1:8153",  // anomaly-detection-svc
  forecasting:                "http://127.0.0.1:8135",  // forecasting-svc
  complianceRiskScoring:      "http://127.0.0.1:8136",  // compliance-risk-scoring-svc
  reconciliationIntel:        "http://127.0.0.1:8137",  // reconciliation-intelligence-svc
  reportingOrchestration:     "http://127.0.0.1:8138",  // reporting-orchestration-svc
  decisionSupport:            "http://127.0.0.1:8154",  // decision-support-svc
  migrationIntegrity:         "http://127.0.0.1:8139",  // migration-integrity-svc

  // ── BLOCK 9 · Security & Trust ──────────────────────────────────────────
  mtlsManagement:             "http://127.0.0.1:8140",  // mtls-management-svc
  siemIntegration:            "http://127.0.0.1:8141",  // siem-integration-svc
  carta:                      "http://127.0.0.1:8142",  // carta-svc
  keyManagement:              "http://127.0.0.1:8143",  // key-management-svc
  aiGovernance:               "http://127.0.0.1:8146",  // ai-governance-svc

  // ── BLOCK 10 · Integration & Extensibility ──────────────────────────────
  connectivityBridge:         "http://127.0.0.1:8144",  // connectivity-api-bridge-svc
  bankingConnector:           "http://127.0.0.1:8145",  // banking-connector-svc
  hrisConnector:              "http://127.0.0.1:8146",  // hris-connector-svc
  taxAuthorityInterface:      "http://127.0.0.1:8147",  // tax-authority-interface-svc
  esignature:                 "http://127.0.0.1:8148",  // esignature-integration-svc
  externalDataFeed:           "http://127.0.0.1:8149",  // external-data-feed-svc

  // ── Integration & Intelligence Aliases ──────────────────────────────────
  connectivityApiBridge:      "http://127.0.0.1:8144",  // connectivity-api-bridge-svc
  esignatureIntegration:      "http://127.0.0.1:8148",  // esignature-integration-svc
  reconciliationIntelligence: "http://127.0.0.1:8137",  // reconciliation-intelligence-svc

  // ── Additional Domain Services ──────────────────────────────────────────
  jurisdictionRules:          "http://127.0.0.1:8161",  // jurisdiction-rules-svc
  notification:               "http://127.0.0.1:8162",  // notification-svc
  payeeBankingIdentity:       "http://127.0.0.1:8163",  // payee-banking-identity-svc
  privacyConsent:             "http://127.0.0.1:8165",  // privacy-consent-svc
  privacyTransfer:            "http://127.0.0.1:8166",  // privacy-transfer-svc
  retentionRegistry:          "http://127.0.0.1:8167",  // retention-registry-svc
  searchIndexer:              "http://127.0.0.1:8169",  // search-indexer-svc
  opensearch:                 "http://127.0.0.1:9200",  // opensearch (direct)
  sourceAuthority:            "http://127.0.0.1:8171",  // source-authority-svc

  // ── Workflow Services ────────────────────────────────────────────────────
  workflow:                   "http://127.0.0.1:8172",  // workflow-svc
  workflowHistory:            "http://127.0.0.1:8173",  // workflow-history-svc

  // ── Gateway ──────────────────────────────────────────────────────────────
  gateway:                    "http://127.0.0.1:8000",
} as const;

/** All valid service names — derived from the runtime map so they can never diverge. */
export type ServiceName = keyof Omit<typeof DEFAULTS, "gateway">;

/** Backward-compatibility alias for ServiceName */
export type ApiService = ServiceName;

/**
 * Gateway routing prefix per service, used when ZOIKO_USE_GATEWAY is on.
 * These MUST match the container_name values in docker-compose.services.yml.
 */
const GATEWAY_PREFIX: Record<ServiceName, string> = {
  // Platform & Core
  governance:                 "/governance-decision-log-svc",
  policy:                     "/policy-svc",
  configuration:              "/configuration-feature-flag-svc",
  secretVault:                "/secret-vault-svc",
  obligations:                "/obligation-tracking-svc",
  authorization:              "/authorization-svc",
  accessControl:              "/access-control-svc",
  delegatedAuthority:         "/delegated-authority-svc",
  documentVault:              "/document-vault-svc",
  auditEventStore:            "/audit-event-store-svc",
  tenantRegistry:             "/tenant-entity-registry-svc",
  identityContext:            "/identity-context-svc",
  gatewayAuth:                "/gateway-auth-svc",
  schemaRegistry:             "/schema-registry-svc",

  // Finance
  generalLedger:              "/general-ledger-svc",
  accountsPayable:            "/accounts-payable-svc",
  accountsReceivable:         "/accounts-receivable-svc",
  bankReconciliation:         "/bank-reconciliation-svc",
  financialClose:             "/financial-close-svc",
  treasury:                   "/treasury-svc",
  intercompanyAccounting:     "/intercompany-accounting-svc",
  consolidation:              "/consolidation-svc",
  invoiceApproval:            "/invoice-approval-svc",

  // HR & Workforce
  employeeMaster:             "/employee-master-svc",
  employmentContracts:        "/employment-contracts-svc",
  payrollRun:                 "/payroll-run-svc",
  compensation:               "/compensation-svc",
  benefits:                   "/benefits-svc",
  payrollTax:                 "/payroll-tax-svc",
  payrollExceptions:          "/payroll-exceptions-svc",
  leaveAbsence:               "/leave-absence-svc",
  orgStructure:               "/org-structure-svc",
  offboardingSeverance:       "/offboarding-severance-svc",
  workforceCompliance:        "/workforce-compliance-svc",
  performanceReview:          "/performance-review-svc",

  // Block 6
  contracts:                  "/contract-lifecycle-svc",
  clauseTemplate:             "/clause-template-svc",
  obligationTracking:         "/obligation-tracking-svc",
  boardResolutions:           "/board-resolutions-svc",
  corporateActions:           "/corporate-actions-svc",
  counterparty:               "/counterparty-management-svc",
  purchaseRequest:            "/purchase-request-svc",
  purchaseOrder:              "/purchase-order-svc",
  spendControls:              "/spend-controls-svc",
  vendorDueDiligence:         "/vendor-due-diligence-svc",
  procurementWorkflow:        "/procurement-workflow-svc",

  // Block 7
  taxRules:                   "/tax-rules-svc",
  taxDetermination:           "/tax-determination-svc",
  vatGst:                     "/vat-gst-svc",
  corporateTax:               "/corporate-tax-svc",
  withholdingTax:             "/withholding-tax-svc",
  filingPreparation:          "/filing-preparation-svc",
  evidence:                   "/evidence-requirements-svc",
  filingTracker:              "/filing-tracker-svc",
  complianceStatus:           "/compliance-status-svc",
  exceptionEscalation:        "/exception-escalation-svc",

  // Block 8
  anomalyDetection:           "/anomaly-detection-svc",
  forecasting:                "/forecasting-svc",
  complianceRiskScoring:      "/compliance-risk-scoring-svc",
  reconciliationIntel:        "/reconciliation-intelligence-svc",
  reportingOrchestration:     "/reporting-orchestration-svc",
  decisionSupport:            "/decision-support-svc",
  migrationIntegrity:         "/migration-integrity-svc",

  // Block 9
  mtlsManagement:             "/mtls-management-svc",
  siemIntegration:            "/siem-integration-svc",
  carta:                      "/carta-svc",
  keyManagement:              "/key-management-svc",
  aiGovernance:               "/ai-governance-svc",

  // Block 10
  connectivityBridge:         "/connectivity-api-bridge-svc",
  bankingConnector:           "/banking-connector-svc",
  hrisConnector:              "/hris-connector-svc",
  taxAuthorityInterface:      "/tax-authority-interface-svc",
  esignature:                 "/esignature-integration-svc",
  externalDataFeed:           "/external-data-feed-svc",

  // Additional services & Aliases
  connectivityApiBridge:      "/connectivity-api-bridge-svc",
  esignatureIntegration:      "/esignature-integration-svc",
  reconciliationIntelligence: "/reconciliation-intelligence-svc",
  jurisdictionRules:          "/jurisdiction-rules-svc",
  notification:               "/notification-svc",
  payeeBankingIdentity:       "/payee-banking-identity-svc",
  privacyConsent:             "/privacy-consent-svc",
  privacyTransfer:            "/privacy-transfer-svc",
  retentionRegistry:          "/retention-registry-svc",
  searchIndexer:              "/search-indexer-svc",
  opensearch:                 "/opensearch",
  sourceAuthority:            "/source-authority-svc",
  workflow:                   "/workflow-svc",
  workflowHistory:            "/workflow-history-svc",
};

const useGateway = process.env.ZOIKO_USE_GATEWAY === "true";

/**
 * The backend's own name for a service, for error messages.
 * Derived from the gateway prefix so there is only one place a name can be wrong.
 */
export function serviceLabel(service: ServiceName): string {
  return GATEWAY_PREFIX[service].slice(1);
}

/**
 * Resolve the base URL for a backend service.
 * Reads env first so deployments can override without a rebuild.
 * NOT NEXT_PUBLIC_* — the browser must never hold backend URLs.
 */
export function serviceUrl(service: ServiceName): string {
  if (useGateway) {
    const gateway = process.env.ZOIKO_GATEWAY_URL ?? DEFAULTS.gateway;
    return stripTrailingSlash(gateway) + GATEWAY_PREFIX[service];
  }
  return stripTrailingSlash(process.env[envKeyFor(service)] ?? DEFAULTS[service]);
}

/** `purchaseOrder` → `ZOIKO_PURCHASE_ORDER_URL` */
function envKeyFor(service: ServiceName): string {
  const snake = service.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
  return `ZOIKO_${snake}_URL`;
}

function stripTrailingSlash(url?: string): string {
  if (!url) return "";
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** Per-request timeout. Dashboard panels degrade to an empty state on timeout. */
export const REQUEST_TIMEOUT_MS = Number(process.env.ZOIKO_API_TIMEOUT_MS ?? 1500);
