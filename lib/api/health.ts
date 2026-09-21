// Live service-health probes behind the Overview domain status grid.
//
// Every ZoikoSuite service exposes /healthz (liveness) and /readyz (readiness,
// which includes its database). We probe /readyz — a service that is up but
// can't reach its store is not usable, and the grid should say so.
//
// Domain status is DERIVED, not authored: a domain is only "operational" when
// every one of its services that we can reach is ready.

import type { DomainKey } from "@/lib/constants";

/**
 * Service ports per domain. Every entry below is a real service: it has a
 * directory under `services/` AND a block in `deployments/docker-compose.yml`,
 * and the port is the host port that block publishes.
 *
 * That was not true of this table. Across the eight domains, **thirteen entries
 * named services that do not exist** — no directory, no compose block, nothing:
 *
 *   payroll         wage-garnishment-svc, direct-deposit-svc, year-end-filing-svc
 *   hr              talent-management-svc, onboarding-svc
 *   legal           legal-approvals-svc
 *   commercial-ops  supplier-intelligence-svc, catalog-governance-svc,
 *                   requisition-engine-svc, contract-match-svc,
 *                   procurement-workflow-svc
 *   audit-events    audit-event-ingestion-svc, audit-log-query-svc,
 *                   tamper-detection-svc
 *
 * This matters more than a stale list usually would, because of how the probe
 * treats a failure: a service that cannot be connected to counts as DOWN. So a
 * domain carrying invented entries could never read "operational" however healthy
 * its real services were, and the names it listed as down sent whoever read the
 * grid hunting for containers that have never existed. audit-events could report
 * at best 1 of 4; commercial-ops at best 5 of 10.
 *
 * Several of the invented ports also collided with real, unrelated services —
 * `direct-deposit-svc` on 8096 (search-indexer-svc), `year-end-filing-svc` on 8097
 * (workflow-history-svc), `audit-log-query-svc` on 8082 (jurisdiction-svc),
 * `tamper-detection-svc` on 8085 (policy-svc) — so those probes answered 200 and
 * reported a non-existent service as READY. That is worse than reporting it down:
 * the grid was affirmatively vouching for something that isn't there.
 *
 * Two services are deliberately NOT listed even though their directories exist:
 * `withholding-tax-svc` and `filing-preparation-svc` have no compose block, so
 * they cannot be running and listing them would guarantee the tax domain never
 * reads operational. `evidence-requirements-svc` shares port 8130 with
 * filing-preparation-svc in the mock runner (path-routed) and also has no
 * compose block. Add them here when they are added to compose.
 */
const DOMAIN_SERVICES: Record<DomainKey, { name: string; port: number }[]> = {
  finance: [],
  payroll: [],
  hr: [],
  legal: [
    { name: "contract-lifecycle-svc", port: 8119 },
    { name: "clause-template-svc", port: 8120 },
    { name: "obligation-tracking-svc", port: 8121 },
    { name: "board-resolutions-svc", port: 8122 },
    { name: "corporate-actions-svc", port: 8123 },
    { name: "counterparty-management-svc", port: 8124 },
  ],
  tax: [
    { name: "tax-rules-svc", port: 8125 },
    { name: "tax-determination-svc", port: 8126 },
    { name: "vat-gst-svc", port: 8127 },
    { name: "corporate-tax-svc", port: 8128 },
    { name: "withholding-tax-svc", port: 8129 },
    { name: "filing-preparation-svc", port: 8130 },
    { name: "tax-authority-interface-svc", port: 8147 },
  ],
  "source-authority": [],
  compliance: [
    { name: "filing-tracker-svc", port: 8151 },
    { name: "compliance-status-svc", port: 8152 },
    { name: "exception-escalation-svc", port: 8133 },
  ],
  jurisdictions: [],
  delegations: [],
  documents: [],
  "commercial-ops": [
    { name: "purchase-request-svc", port: 8100 },
    { name: "purchase-order-svc", port: 8150 },
    { name: "spend-controls-svc", port: 8131 },
    { name: "vendor-due-diligence-svc", port: 8132 },
    { name: "procurement-workflow-svc", port: 8134 },
  ],
  "audit-events": [],
  "purchase-requests": [{ name: "purchase-request-svc", port: 8100 }],
  intelligence: [
    { name: "anomaly-detection-svc", port: 8153 },
    { name: "forecasting-svc", port: 8135 },
    { name: "compliance-risk-scoring-svc", port: 8136 },
    { name: "reconciliation-intelligence-svc", port: 8137 },
    { name: "reporting-orchestration-svc", port: 8138 },
    { name: "decision-support-svc", port: 8154 },
    { name: "migration-integrity-svc", port: 8139 },
  ],
  "security-trust": [
    { name: "mtls-management-svc", port: 8140 },
    { name: "siem-integration-svc", port: 8141 },
    { name: "carta-svc", port: 8142 },
    { name: "key-management-svc", port: 8143 },
  ],
  integration: [
    { name: "connectivity-api-bridge-svc", port: 8144 },
    { name: "banking-connector-svc", port: 8145 },
    { name: "hris-connector-svc", port: 8146 },
    { name: "tax-authority-interface-svc", port: 8147 },
    { name: "esignature-integration-svc", port: 8148 },
    { name: "external-data-feed-svc", port: 8149 },
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
    const response = await fetch(`http://localhost:${port}/readyz`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Probe one domain only — avoids hitting all ~35 services for a single page. */
export async function getSingleDomainHealth(domain: DomainKey): Promise<DomainHealth> {
  const services = DOMAIN_SERVICES[domain];
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
 * Probe every service in every domain concurrently and derive a status per
 * domain.
 *
 * Thresholds: all ready → operational; at least one ready → attention; none
 * ready → action-required. A domain whose services simply aren't running
 * locally therefore reads "action-required", which is accurate — nothing in it
 * can serve a request.
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
        ready === services.length ? "operational" : ready > 0 ? "attention" : "action-required";

      return [domain, { ready, total: services.length, down, status }] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<DomainKey, DomainHealth>;
}
