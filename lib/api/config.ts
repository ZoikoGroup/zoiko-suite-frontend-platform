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
  purchaseOrder: "http://localhost:8129",
  evidence: "http://localhost:8130",
  accountsReceivable: "http://localhost:8101",
  auditEventStore: "http://localhost:8084",
  tenantRegistry: "http://localhost:8081",
  schemaRegistry: "http://localhost:8093",
  financialClose: "http://localhost:8104",
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
  auditEventStore: "/audit-event-store-svc",
  tenantRegistry: "/tenant-entity-registry-svc",
  schemaRegistry: "/schema-registry-svc",
  financialClose: "/financial-close-svc",
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
