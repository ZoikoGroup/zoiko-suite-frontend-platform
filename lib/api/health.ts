// Live service-health probes behind the Overview domain status grid.
//
// Every ZoikoSuite service exposes /healthz (liveness) and /readyz (readiness).
// We probe /readyz — a service that is up but can't reach its store is not usable.
//
// Active services: Blocks 6–10 (37 microservices).

import type { DomainKey } from "@/lib/constants";
import { serviceUrl, type ServiceName } from "./config";

/**
 * Services per domain — only active Block 6–10 services.
 * Each entry names its registry key, so the probe resolves through serviceUrl()
 * (env overrides and gateway mode) instead of a port that can drift from it.
 */
const DOMAIN_SERVICES: Record<DomainKey, { name: string; key: ServiceName }[]> = {
  legal: [
    { name: "contract-lifecycle-svc",    key: "contracts" },
    { name: "clause-template-svc",       key: "clauseTemplate" },
    { name: "obligation-tracking-svc",   key: "obligationTracking" },
    { name: "board-resolutions-svc",     key: "boardResolutions" },
    { name: "corporate-actions-svc",     key: "corporateActions" },
    { name: "counterparty-management-svc", key: "counterparty" },
  ],
  tax: [
    { name: "tax-rules-svc",             key: "taxRules" },
    { name: "tax-determination-svc",     key: "taxDetermination" },
    { name: "vat-gst-svc",              key: "vatGst" },
    { name: "corporate-tax-svc",         key: "corporateTax" },
    { name: "withholding-tax-svc",       key: "withholdingTax" },
    { name: "filing-preparation-svc",    key: "filingPreparation" },
    { name: "tax-authority-interface-svc", key: "taxAuthorityInterface" },
  ],
  compliance: [
    { name: "filing-tracker-svc",           key: "filingTracker" },
    { name: "compliance-status-svc",        key: "complianceStatus" },
    { name: "exception-escalation-svc",     key: "exceptionEscalation" },
    { name: "anomaly-detection-svc",        key: "anomalyDetection" },
    { name: "forecasting-svc",              key: "forecasting" },
    { name: "compliance-risk-scoring-svc",  key: "complianceRiskScoring" },
    { name: "reconciliation-intelligence-svc", key: "reconciliationIntel" },
    { name: "reporting-orchestration-svc",  key: "reportingOrchestration" },
    { name: "decision-support-svc",         key: "decisionSupport" },
    { name: "migration-integrity-svc",      key: "migrationIntegrity" },
  ],
  "commercial-ops": [
    { name: "purchase-request-svc",      key: "purchaseRequest" },
    { name: "purchase-order-svc",        key: "purchaseOrder" },
    { name: "spend-controls-svc",        key: "spendControls" },
    { name: "vendor-due-diligence-svc",  key: "vendorDueDiligence" },
    { name: "procurement-workflow-svc",  key: "procurementWorkflow" },
  ],
  "purchase-requests": [
    { name: "purchase-request-svc",      key: "purchaseRequest" },
  ],
  security: [
    { name: "mtls-management-svc",       key: "mtlsManagement" },
    { name: "siem-integration-svc",      key: "siemIntegration" },
    { name: "carta-svc",                 key: "carta" },
    { name: "key-management-svc",        key: "keyManagement" },
    { name: "ai-governance-svc",         key: "aiGovernance" },
  ],
  integrations: [
    { name: "connectivity-api-bridge-svc", key: "connectivityBridge" },
    { name: "banking-connector-svc",       key: "bankingConnector" },
    { name: "hris-connector-svc",          key: "hrisConnector" },
    { name: "tax-authority-interface-svc", key: "taxAuthorityInterface" },
    { name: "esignature-integration-svc",  key: "esignature" },
    { name: "external-data-feed-svc",      key: "externalDataFeed" },
  ],
  delegations: [
    { name: "compliance-risk-scoring-svc", key: "complianceRiskScoring" },
  ],
  evidence: [
    { name: "filing-preparation-svc",    key: "filingPreparation" },
  ],
  integration: [
    { name: "connectivity-api-bridge-svc", key: "connectivityBridge" },
    { name: "banking-connector-svc",       key: "bankingConnector" },
    { name: "hris-connector-svc",          key: "hrisConnector" },
    { name: "tax-authority-interface-svc", key: "taxAuthorityInterface" },
    { name: "esignature-integration-svc",  key: "esignature" },
    { name: "external-data-feed-svc",      key: "externalDataFeed" },
  ],
  intelligence: [
    { name: "anomaly-detection-svc",        key: "anomalyDetection" },
    { name: "forecasting-svc",              key: "forecasting" },
    { name: "compliance-risk-scoring-svc",  key: "complianceRiskScoring" },
    { name: "reconciliation-intelligence-svc", key: "reconciliationIntel" },
    { name: "reporting-orchestration-svc",  key: "reportingOrchestration" },
    { name: "decision-support-svc",         key: "decisionSupport" },
    { name: "migration-integrity-svc",      key: "migrationIntegrity" },
  ],
};

export type DomainHealth = {
  ready: number;
  total: number;
  /** Services that answered but are not ready, or did not answer at all. */
  down: string[];
  status: "operational" | "attention" | "action-required";
};

/** Short timeout — this is a status widget, not a data read. */
const PROBE_TIMEOUT_MS = 1500;

async function isReady(service: ServiceName): Promise<boolean> {
  try {
    const response = await fetch(`${serviceUrl(service)}/readyz`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Probe one domain only — avoids hitting all services for a single page. */
export async function getSingleDomainHealth(domain: DomainKey): Promise<DomainHealth> {
  const services = DOMAIN_SERVICES[domain] ?? [];
  const results = await Promise.all(services.map((s) => isReady(s.key)));

  const down = services.filter((_, i) => !results[i]).map((s) => s.name);
  const ready = results.filter(Boolean).length;

  return {
    ready,
    total: services.length,
    down,
    status: ready === services.length ? "operational" : ready > 0 ? "attention" : "action-required",
  };
}

/**
 * Probe every service in every domain concurrently and derive a status per domain.
 *
 * Thresholds: all ready → operational; at least one ready → attention; none
 * ready → action-required.
 */
export async function getDomainHealth(): Promise<Record<DomainKey, DomainHealth>> {
  const domains = Object.keys(DOMAIN_SERVICES) as DomainKey[];

  const entries = await Promise.all(
    domains.map(async (domain) => {
      const services = DOMAIN_SERVICES[domain];
      const results = await Promise.all(services.map((s) => isReady(s.key)));

      const down = services.filter((_, i) => !results[i]).map((s) => s.name);
      const ready = results.filter(Boolean).length;

      const status: DomainHealth["status"] =
        services.length === 0
          ? "attention"
          : ready === services.length
            ? "operational"
            : ready > 0
              ? "attention"
              : "action-required";

      return [domain, { ready, total: services.length, down, status }] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<DomainKey, DomainHealth>;
}
