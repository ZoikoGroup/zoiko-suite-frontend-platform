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
  configuration: "http://localhost:8086",
  obligations: "http://localhost:8088",
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
  configuration: "/configuration-feature-flag-svc",
  obligations: "/obligations-svc",
};

const useGateway = process.env.ZOIKO_USE_GATEWAY === "true";

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

  const envKey = `ZOIKO_${service.toUpperCase()}_URL`;
  return stripTrailingSlash(process.env[envKey] ?? DEFAULTS[service]);
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** Per-request timeout. Dashboard panels degrade to an empty state on timeout. */
export const REQUEST_TIMEOUT_MS = Number(process.env.ZOIKO_API_TIMEOUT_MS ?? 5000);
