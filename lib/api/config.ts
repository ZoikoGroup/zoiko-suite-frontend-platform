// Backend service registry — ZoikoSuite admin console.
// Active services: Blocks 6–10 (37 microservices).
// All block 1–3 and non-selected services have been permanently removed.
//
// Every service listens on its own port and, in a real deployment, is reachable
// only through the Traefik gateway on :80. Locally the ports ARE published, so
// we talk to services directly.
//
// Switching to the gateway later is a two-line change: point GATEWAY_URL at it
// and set ZOIKO_USE_GATEWAY=true. Everything downstream reads serviceUrl().

const DEFAULTS = {
  // ── BLOCK 6 · Legal, Corporate & Commercial ─────────────────────────────
  contracts:             "http://127.0.0.1:8119",  // contract-lifecycle-svc
  clauseTemplate:        "http://127.0.0.1:8120",  // clause-template-svc
  obligationTracking:    "http://127.0.0.1:8121",  // obligation-tracking-svc
  boardResolutions:      "http://127.0.0.1:8122",  // board-resolutions-svc
  corporateActions:      "http://127.0.0.1:8123",  // corporate-actions-svc
  counterparty:          "http://127.0.0.1:8124",  // counterparty-management-svc
  purchaseRequest:       "http://127.0.0.1:8100",  // purchase-request-svc
  purchaseOrder:         "http://127.0.0.1:8150",  // purchase-order-svc
  spendControls:         "http://127.0.0.1:8131",  // spend-controls-svc
  vendorDueDiligence:    "http://127.0.0.1:8132",  // vendor-due-diligence-svc
  procurementWorkflow:   "http://127.0.0.1:8134",  // procurement-workflow-svc

  // ── BLOCK 7 · Tax & Compliance ──────────────────────────────────────────
  taxRules:              "http://127.0.0.1:8125",  // tax-rules-svc
  taxDetermination:      "http://127.0.0.1:8126",  // tax-determination-svc
  vatGst:                "http://127.0.0.1:8127",  // vat-gst-svc
  corporateTax:          "http://127.0.0.1:8128",  // corporate-tax-svc
  withholdingTax:        "http://127.0.0.1:8129",  // withholding-tax-svc
  filingPreparation:     "http://127.0.0.1:8130",  // filing-preparation-svc
  evidence:              "http://127.0.0.1:8130",  // filing-preparation-svc (evidence)
  filingTracker:         "http://127.0.0.1:8151",  // filing-tracker-svc
  complianceStatus:      "http://127.0.0.1:8152",  // compliance-status-svc
  exceptionEscalation:   "http://127.0.0.1:8133",  // exception-escalation-svc

  // ── BLOCK 8 · Intelligence & Reporting ──────────────────────────────────
  anomalyDetection:      "http://127.0.0.1:8153",  // anomaly-detection-svc
  forecasting:           "http://127.0.0.1:8135",  // forecasting-svc
  complianceRiskScoring: "http://127.0.0.1:8136",  // compliance-risk-scoring-svc
  reconciliationIntel:   "http://127.0.0.1:8137",  // reconciliation-intelligence-svc
  reportingOrchestration:"http://127.0.0.1:8138",  // reporting-orchestration-svc
  decisionSupport:       "http://127.0.0.1:8154",  // decision-support-svc
  migrationIntegrity:    "http://127.0.0.1:8139",  // migration-integrity-svc

  // ── BLOCK 9 · Security & Trust ──────────────────────────────────────────
  mtlsManagement:        "http://127.0.0.1:8140",  // mtls-management-svc
  siemIntegration:       "http://127.0.0.1:8141",  // siem-integration-svc
  carta:                 "http://127.0.0.1:8142",  // carta-svc
  keyManagement:         "http://127.0.0.1:8143",  // key-management-svc

  // ── BLOCK 10 · Integration & Extensibility ──────────────────────────────
  connectivityBridge:    "http://127.0.0.1:8144",  // connectivity-api-bridge-svc
  bankingConnector:      "http://127.0.0.1:8145",  // banking-connector-svc
  hrisConnector:         "http://127.0.0.1:8146",  // hris-connector-svc
  taxAuthorityInterface: "http://127.0.0.1:8147",  // tax-authority-interface-svc
  esignature:            "http://127.0.0.1:8148",  // esignature-integration-svc
  externalDataFeed:      "http://127.0.0.1:8149",  // external-data-feed-svc

  // ── Gateway ──────────────────────────────────────────────────────────────
  gateway:               "http://127.0.0.1:8000",
} as const;

export type ServiceName = keyof Omit<typeof DEFAULTS, "gateway">;

/**
 * Gateway routing prefix per service, used when ZOIKO_USE_GATEWAY is on.
 * These MUST match the container_name values in docker-compose.services.yml.
 */
const GATEWAY_PREFIX: Record<ServiceName, string> = {
  // Block 6
  contracts:              "/contract-lifecycle-svc",
  clauseTemplate:         "/clause-template-svc",
  obligationTracking:     "/obligation-tracking-svc",
  boardResolutions:       "/board-resolutions-svc",
  corporateActions:       "/corporate-actions-svc",
  counterparty:           "/counterparty-management-svc",
  purchaseRequest:        "/purchase-request-svc",
  purchaseOrder:          "/purchase-order-svc",
  spendControls:          "/spend-controls-svc",
  vendorDueDiligence:     "/vendor-due-diligence-svc",
  procurementWorkflow:    "/procurement-workflow-svc",

  // Block 7
  taxRules:               "/tax-rules-svc",
  taxDetermination:       "/tax-determination-svc",
  vatGst:                 "/vat-gst-svc",
  corporateTax:           "/corporate-tax-svc",
  withholdingTax:         "/withholding-tax-svc",
  filingPreparation:      "/filing-preparation-svc",
  evidence:               "/evidence-requirements-svc",
  filingTracker:          "/filing-tracker-svc",
  complianceStatus:       "/compliance-status-svc",
  exceptionEscalation:    "/exception-escalation-svc",

  // Block 8
  anomalyDetection:       "/anomaly-detection-svc",
  forecasting:            "/forecasting-svc",
  complianceRiskScoring:  "/compliance-risk-scoring-svc",
  reconciliationIntel:    "/reconciliation-intelligence-svc",
  reportingOrchestration: "/reporting-orchestration-svc",
  decisionSupport:        "/decision-support-svc",
  migrationIntegrity:     "/migration-integrity-svc",

  // Block 9
  mtlsManagement:         "/mtls-management-svc",
  siemIntegration:        "/siem-integration-svc",
  carta:                  "/carta-svc",
  keyManagement:          "/key-management-svc",

  // Block 10
  connectivityBridge:     "/connectivity-api-bridge-svc",
  bankingConnector:       "/banking-connector-svc",
  hrisConnector:          "/hris-connector-svc",
  taxAuthorityInterface:  "/tax-authority-interface-svc",
  esignature:             "/esignature-integration-svc",
  externalDataFeed:       "/external-data-feed-svc",
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
