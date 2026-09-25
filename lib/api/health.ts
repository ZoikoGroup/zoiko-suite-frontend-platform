// Live service-health probes behind the Overview domain status grid.
//
// Every ZoikoSuite service exposes /healthz (liveness) and /readyz (readiness).
// We probe /readyz — a service that is up but can't reach its store is not usable.
//
// Active services: Blocks 6–10 (37 microservices).

import type { DomainKey } from "@/lib/constants";

/**
 * Service ports per domain — only active Block 6–10 services.
 * Every entry has a running Docker container in docker-compose.services.yml.
 */
const DOMAIN_SERVICES: Record<DomainKey, { name: string; port: number }[]> = {
  legal: [
    { name: "contract-lifecycle-svc",    port: 8119 },
    { name: "clause-template-svc",       port: 8120 },
    { name: "obligation-tracking-svc",   port: 8121 },
    { name: "board-resolutions-svc",     port: 8122 },
    { name: "corporate-actions-svc",     port: 8123 },
    { name: "counterparty-management-svc", port: 8124 },
  ],
  tax: [
    { name: "tax-rules-svc",             port: 8125 },
    { name: "tax-determination-svc",     port: 8126 },
    { name: "vat-gst-svc",              port: 8127 },
    { name: "corporate-tax-svc",         port: 8128 },
    { name: "withholding-tax-svc",       port: 8129 },
    { name: "filing-preparation-svc",    port: 8130 },
    { name: "tax-authority-interface-svc", port: 8147 },
  ],
  compliance: [
    { name: "filing-tracker-svc",           port: 8151 },
    { name: "compliance-status-svc",        port: 8152 },
    { name: "exception-escalation-svc",     port: 8133 },
    { name: "anomaly-detection-svc",        port: 8153 },
    { name: "forecasting-svc",              port: 8135 },
    { name: "compliance-risk-scoring-svc",  port: 8136 },
    { name: "reconciliation-intelligence-svc", port: 8137 },
    { name: "reporting-orchestration-svc",  port: 8138 },
    { name: "decision-support-svc",         port: 8154 },
    { name: "migration-integrity-svc",      port: 8139 },
  ],
  "commercial-ops": [
    { name: "purchase-request-svc",      port: 8100 },
    { name: "purchase-order-svc",        port: 8150 },
    { name: "spend-controls-svc",        port: 8131 },
    { name: "vendor-due-diligence-svc",  port: 8132 },
    { name: "procurement-workflow-svc",  port: 8134 },
  ],
  "purchase-requests": [
    { name: "purchase-request-svc",      port: 8100 },
  ],
  security: [
    { name: "mtls-management-svc",       port: 8140 },
    { name: "siem-integration-svc",      port: 8141 },
    { name: "carta-svc",                 port: 8142 },
    { name: "key-management-svc",        port: 8143 },
  ],
  integrations: [
    { name: "connectivity-api-bridge-svc", port: 8144 },
    { name: "banking-connector-svc",       port: 8145 },
    { name: "hris-connector-svc",          port: 8146 },
    { name: "tax-authority-interface-svc", port: 8147 },
    { name: "esignature-integration-svc",  port: 8148 },
    { name: "external-data-feed-svc",      port: 8149 },
  ],
  delegations: [
    { name: "compliance-risk-scoring-svc", port: 8136 },
  ],
  evidence: [
    { name: "filing-preparation-svc",    port: 8130 },
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

async function isReady(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/readyz`, {
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
  const results = await Promise.all(services.map((s) => isReady(s.port)));

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
      const results = await Promise.all(services.map((s) => isReady(s.port)));

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
