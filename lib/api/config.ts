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
  // Read-only here. obligations-svc validates every jurisdiction_id against this
  // service on the write path and fails closed, so the console reads the same
  // register to offer a picker — a free-text UUID field would produce
  // jurisdiction_not_found for anything but a copy-paste.
  jurisdictionRules: "http://localhost:8082",
  purchaseRequest: "http://localhost:8100",
  contracts: "http://localhost:8119",
  // 8129. This said 8112, which compose also gave to benefits-svc — the two
  // could never both start. Traefik's all-services.yml has always routed this
  // service to :8129 and .env.local has always said 8129, so 8112 was wrong in
  // three places at once; compose now agrees with the other two.
  purchaseOrder: "http://localhost:8129",
  evidence: "http://localhost:8130",
  accountsReceivable: "http://localhost:8101",
  // 8098. The hub of the Finance domain — treasury, financial-close,
  // bank-reconciliation, intercompany and consolidation all read it — and the
  // service behind the journal register on /admin/finance.
  generalLedger: "http://localhost:8098",
  // 8102. Reconciles bank statement lines against general-ledger journals, so
  // it reads the ledger above rather than owning any postings of its own.
  bankReconciliation: "http://localhost:8102",
  // 8099, not the 8102 that lib/api/finance.ts claimed for months. The port is
  // in the compose file and in health.ts; the stale comment was the only place
  // that disagreed, and nothing called it, so nothing caught it.
  accountsPayable: "http://localhost:8099",
  // 8131. CommercialOpsActionHeader had this as 8113 — transposed digits, the
  // same class of error as accounts-payable-svc's 8102, and equally uncaught
  // because the only code path that used a spend-controls URL pointed at a route
  // the service does not have.
  spendControls: "http://localhost:8131",
  // 8135, per compose. The service's own config.Load defaulted PORT to 8132 — a
  // port nothing in this platform uses — so it was reachable only because compose
  // overrides PORT. Fixed there too; this is the number both now agree on.
  vendorDueDiligence: "http://localhost:8135",
  auditEventStore: "http://localhost:8084",
  tenantRegistry: "http://localhost:8081",
  schemaRegistry: "http://localhost:8093",
  financialClose: "http://localhost:8104",
  // 8133, per compose. notification-svc delivers governed notifications via a
  // documented stub adapter (see lib/api/notifications.ts) — no provider is
  // wired up on the platform yet.
  notification: "http://localhost:8133",
  // 8122, per compose. board-resolutions-svc owns board meetings and their
  // resolutions; the write path authorizes MEETING_CREATE / RESOLUTION_CREATE /
  // RESOLUTION_VOTE / RESOLUTION_PASS against the legal entity and enforces
  // segregation of duties on the pass (the drafter may not pass their own
  // resolution).
  boardResolutions: "http://localhost:8122",
  // ── Tax Domain (ports 8125–8130 + 8147) ──────────────────────────────────
  //
  // TWO OF THESE COLLIDE with entries above, and the collision is inherited
  // from the backend rather than introduced here: withholding-tax-svc's config
  // defaults to 8129, which is purchase-order-svc's port, and
  // filing-preparation-svc's defaults to 8130, which is
  // evidence-requirements-svc's. Neither tax service appears in the backend
  // compose file, so neither has ever started and the clash has never bitten —
  // but it means a call made here to withholdingTax or filingPreparation
  // reaches purchase-order-svc or evidence-requirements-svc and gets a
  // confusing answer instead of a connection refused.
  //
  // Left as-is deliberately. Reassigning a service's port is the backend's
  // allocation to make, not a merge resolution's; the values here match what
  // those services actually declare today.
  taxRules: "http://localhost:8125",
  taxDetermination: "http://localhost:8126",
  vatGst: "http://localhost:8127",
  corporateTax: "http://localhost:8128",
  withholdingTax: "http://localhost:8129",
  filingPreparation: "http://localhost:8130",
  taxAuthorityInterface: "http://localhost:8147",
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
  // The compose KEY is `jurisdiction-svc` but container_name — and therefore the
  // generated Traefik prefix — is `jurisdiction-rules-svc`. Using the key here
  // would 404 in a way that looks like a dead service.
  jurisdictionRules: "/jurisdiction-rules-svc",
  purchaseRequest: "/purchase-request-svc",
  contracts: "/contract-lifecycle-svc",
  purchaseOrder: "/purchase-order-svc",
  evidence: "/evidence-requirements-svc",
  accountsReceivable: "/accounts-receivable-svc",
  generalLedger: "/general-ledger-svc",
  bankReconciliation: "/bank-reconciliation-svc",
  accountsPayable: "/accounts-payable-svc",
  spendControls: "/spend-controls-svc",
  vendorDueDiligence: "/vendor-due-diligence-svc",
  auditEventStore: "/audit-event-store-svc",
  tenantRegistry: "/tenant-entity-registry-svc",
  schemaRegistry: "/schema-registry-svc",
  financialClose: "/financial-close-svc",
  notification: "/notification-svc",
  boardResolutions: "/board-resolutions-svc",
  // Tax Domain
  taxRules: "/tax-rules-svc",
  taxDetermination: "/tax-determination-svc",
  vatGst: "/vat-gst-svc",
  corporateTax: "/corporate-tax-svc",
  withholdingTax: "/withholding-tax-svc",
  filingPreparation: "/filing-preparation-svc",
  taxAuthorityInterface: "/tax-authority-interface-svc",
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
