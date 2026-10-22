// gateway-auth-svc (:8092) — Traefik's ForwardAuth target.
//
// Not a REST API. Every gated request is described to /verify (method and URI
// in X-Forwarded-*) together with the caller's bearer envelope; a 2xx lets the
// request through with identity headers set from the VERIFIED claims, and
// anything else goes back to the client verbatim. Application code never calls
// it — this console does so only to show what the gateway would decide for the
// signed-in session.
//
// The only credential sent is the session's own envelope, issued by
// identity-context-svc at sign-in. Nothing here mints, signs or alters a token:
// an earlier version of this file carried identity-context-svc's dev signing
// key and forged envelopes with it, which made the console a token mint for
// any identity anyone typed in.

import { REQUEST_TIMEOUT_MS, serviceUrl } from "./config";

/** Headers /verify sets on success, in the order Doc 05 lists them. */
export const INJECTED_HEADERS = [
  { header: "X-Principal-Id", label: "Who is acting" },
  { header: "X-Tenant-Id", label: "Tenant" },
  { header: "X-Legal-Entity-Id", label: "Legal entity" },
  { header: "X-Jurisdiction-Context", label: "Jurisdiction (resolved by the registry)" },
  { header: "X-Timezone", label: "Timezone (resolved by the registry)" },
  { header: "X-Residency-Policy-Id", label: "Data residency policy" },
  { header: "X-Assurance-Level", label: "Sign-in assurance level" },
  { header: "X-Authn-Age-Seconds", label: "Seconds since sign-in" },
  { header: "X-Source-Channel", label: "Source channel" },
  { header: "X-Source-Channel-Basis", label: "How the channel was established" },
  { header: "X-Support-Context-Id", label: "Support context" },
  { header: "X-Tenant-Context-Stale", label: "Tenant context served from cache" },
  { header: "X-Correlation-Id", label: "Correlation ID" },
] as const;

export type VerifyOutcome = {
  /** 0 when the gateway could not be reached at all. */
  status: number;
  allowed: boolean;
  /** X-Auth-Denial-Reason, when refused. */
  denialReason?: string;
  /** X-Tenant-Context on a GOV-01 refusal: denied | unresolved. */
  tenantContext?: string;
  /** X-Carta-Decision on a risk refusal. */
  cartaDecision?: string;
  retryAfter?: string;
  /** X-Gateway-Decision-Id — the gateway's own record of this refusal. */
  decisionId?: string;
  /** The refusal's RFC 9457 `detail`, or the raw body when it is not JSON. */
  body: string;
  /** Only the documented identity/context headers — never the whole set. */
  injected: { header: string; label: string; value: string }[];
  latencyMs: number;
  unreachable?: string;
};

/**
 * Ask the gateway to decide one described request for this envelope.
 *
 * GET is used whatever `forwardedMethod` says: ForwardAuth replays the original
 * method onto /verify, but the decision reads X-Forwarded-Method, and a GET
 * keeps this diagnostic from looking like a write in any log that keys on the
 * outer method.
 */
export async function verifyThroughGateway(input: {
  envelopeJwt?: string;
  forwardedMethod: string;
  forwardedUri: string;
}): Promise<VerifyOutcome> {
  const headers: Record<string, string> = {
    "X-Forwarded-Method": input.forwardedMethod,
    "X-Forwarded-Uri": input.forwardedUri,
    "X-Forwarded-Proto": "http",
    "X-Correlation-Id": crypto.randomUUID(),
  };
  if (input.envelopeJwt) headers.Authorization = `Bearer ${input.envelopeJwt}`;

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(`${serviceUrl("gatewayAuth")}/verify`, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(Math.max(REQUEST_TIMEOUT_MS, 5000)),
    });
  } catch (cause) {
    return {
      status: 0,
      allowed: false,
      body: "",
      injected: [],
      latencyMs: Date.now() - started,
      unreachable:
        cause instanceof DOMException && cause.name === "TimeoutError"
          ? "gateway-auth-svc did not answer in time."
          : `gateway-auth-svc is not reachable at ${serviceUrl("gatewayAuth")}.`,
    };
  }

  const latencyMs = Date.now() - started;
  // Refusals are RFC 9457 problem documents now (the openapi still says
  // text/plain); read `detail` when the body parses, the raw text otherwise.
  const raw = (await response.text().catch(() => "")).trim();
  let body = raw.slice(0, 500);
  try {
    const problem = JSON.parse(raw) as { detail?: string; title?: string };
    body = problem.detail ?? problem.title ?? body;
  } catch {
    // not JSON — keep the text
  }
  const injected = response.ok
    ? INJECTED_HEADERS.flatMap(({ header, label }) => {
        const value = response.headers.get(header);
        return value ? [{ header, label, value }] : [];
      })
    : [];

  return {
    status: response.status,
    allowed: response.ok,
    denialReason: response.headers.get("X-Auth-Denial-Reason") ?? undefined,
    tenantContext: response.headers.get("X-Tenant-Context") ?? undefined,
    cartaDecision: response.headers.get("X-Carta-Decision") ?? undefined,
    retryAfter: response.headers.get("Retry-After") ?? undefined,
    decisionId: response.headers.get("X-Gateway-Decision-Id") ?? undefined,
    body,
    injected,
    latencyMs,
  };
}

export type ProbeResult = { reachable: boolean; status: number; latencyMs: number; detail?: string };

async function probe(url: string): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(Math.max(REQUEST_TIMEOUT_MS, 3000)) });
    return { reachable: true, status: res.status, latencyMs: Date.now() - started, detail: (await res.text().catch(() => "")).trim().slice(0, 200) };
  } catch (cause) {
    return {
      reachable: false,
      status: 0,
      latencyMs: Date.now() - started,
      detail:
        cause instanceof DOMException && cause.name === "TimeoutError"
          ? `No answer from ${url} in time.`
          : `Nothing answered at ${url}.`,
    };
  }
}

export type GatewayHealth = {
  liveness: ProbeResult;
  /** /readyz pings identity-context-svc's JWKS from INSIDE the gateway — the
   *  only probe that says whether the gateway can verify anything. */
  readiness: ProbeResult;
  /** The JWKS as this console sees it, for comparison with the gateway's view. */
  jwks: { reachable: boolean; keys: { kid: string; alg?: string; use?: string }[]; detail?: string };
};

export async function readGatewayHealth(): Promise<GatewayHealth> {
  const base = serviceUrl("gatewayAuth");
  const [liveness, readiness, jwks] = await Promise.all([
    probe(`${base}/healthz`),
    probe(`${base}/readyz`),
    readJwks(),
  ]);
  return { liveness, readiness, jwks };
}

async function readJwks(): Promise<GatewayHealth["jwks"]> {
  try {
    const res = await fetch(`${serviceUrl("identityContext")}/.well-known/jwks.json`, {
      cache: "no-store",
      signal: AbortSignal.timeout(Math.max(REQUEST_TIMEOUT_MS, 3000)),
    });
    if (!res.ok) return { reachable: true, keys: [], detail: `identity-context-svc answered ${res.status}` };
    const doc = (await res.json()) as { keys?: { kid?: string; alg?: string; use?: string }[] };
    return {
      reachable: true,
      keys: (doc.keys ?? []).map((k) => ({ kid: k.kid ?? "(no kid)", alg: k.alg, use: k.use })),
    };
  } catch {
    return {
      reachable: false,
      keys: [],
      detail: `identity-context-svc did not answer at ${serviceUrl("identityContext")}.`,
    };
  }
}

/**
 * Each refusal the gateway can give, roughly in pipeline order, and what to do
 * about it. Taken from the handler's outcome constants rather than the openapi,
 * which still lists only seven — session revocation, step-up, CARTA outage,
 * rate limiting and request admission were added after it was written.
 */
export const DENIAL_REASONS: { code: string; status: number; meaning: string; fix: string }[] = [
  {
    code: "rate_limited",
    status: 429,
    meaning: "Too many requests from this client or tenant.",
    fix: "Wait for the interval the gateway gives, then retry.",
  },
  {
    code: "overloaded",
    status: 503,
    meaning: "The gateway is shedding load.",
    fix: "Retry shortly. Nothing was decided.",
  },
  {
    code: "version_unsupported",
    status: 400,
    meaning: "The route asked for an API version the gateway does not serve.",
    fix: "Use a supported version of the route.",
  },
  {
    code: "malformed_request",
    status: 400,
    meaning: "The request was refused at admission, before identity was checked (also request_too_large, request_encoding_refused).",
    fix: "Fix the request itself; identity is not the problem.",
  },
  {
    code: "no_token",
    status: 401,
    meaning: "The request carried no bearer envelope.",
    fix: "Sign in through the identity provider. A session from the offline fallback has no envelope.",
  },
  {
    code: "invalid_token",
    status: 401,
    meaning: "The envelope failed signature, expiry, issuer, audience or key checks — or the gateway could not fetch identity-context-svc's keys.",
    fix: "Envelopes last minutes: sign in again. If a fresh one also fails, check the gateway's readiness above (a JWKS outage lands here too).",
  },
  {
    code: "incomplete_claims",
    status: 401,
    meaning: "The envelope verified but names no principal or no tenant.",
    fix: "identity-context-svc minted a malformed envelope. Not a caller problem — report it.",
  },
  {
    code: "session_revoked",
    status: 401,
    meaning: "The envelope is valid but its session was ended — signed out, or revoked by an administrator.",
    fix: "Sign in again.",
  },
  {
    code: "session_status_unavailable",
    status: 503,
    meaning: "identity-context-svc could not say whether the session is still live, so the gateway refused rather than assumed.",
    fix: "Retry. If it persists, check identity-context-svc.",
  },
  {
    code: "tenant_hostname_mismatch",
    status: 403,
    meaning: "The envelope's tenant disagrees with the tenant resolved from the hostname. This is the spoofing shape, and it is streamed to SIEM.",
    fix: "Use the hostname of the tenant you signed in to.",
  },
  {
    code: "step_up_required",
    status: 401,
    meaning: "Continuous risk assessment (carta-svc) wants a second factor before this request.",
    fix: "Complete identity-context-svc's TOTP step-up, then retry. This console has no step-up screen yet, so it cannot do that for you.",
  },
  {
    code: "carta_blocked",
    status: 403,
    meaning: "Continuous risk assessment (carta-svc) refused this session.",
    fix: "Re-authenticating does not change it. A security reviewer has to clear the risk.",
  },
  {
    code: "carta_unavailable",
    status: 503,
    meaning: "carta-svc is configured but did not answer, and this was a write — writes fail closed, reads fail open.",
    fix: "Retry. If it persists, check carta-svc.",
  },
  {
    code: "tenant_context_denied",
    status: 403,
    meaning: "The tenant registry refused: unknown or suspended tenant, or a legal entity that belongs to another tenant.",
    fix: "Re-authenticating does not change it. Check the tenant's status on Tenants & Entities.",
  },
  {
    code: "tenant_context_unresolved",
    status: 503,
    meaning: "The tenant registry could not be reached, so no decision exists. Nothing was refused and nothing was allowed.",
    fix: "Retry after the interval the gateway gives. Check tenant-entity-registry-svc.",
  },
];
