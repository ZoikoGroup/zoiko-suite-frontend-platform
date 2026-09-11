import crypto from "crypto";
import { serviceUrl } from "./config";

export type ForwardAuthVerifyRequest = {
  authorization?: string;
  forwardedUri?: string;
  forwardedMethod?: string;
  resolvedTenantId?: string;
  edgeHost?: string;
};

export type ForwardAuthVerifyResult = {
  statusCode: number;
  statusText: string;
  isAllowed: boolean;
  latencyMs: number;
  headers: Record<string, string>;
  injectedHeaders: {
    principalId?: string;
    tenantId?: string;
    legalEntityId?: string;
    jurisdictionContext?: string;
    timezone?: string;
    residencyPolicyId?: string;
    correlationId?: string;
    tenantContext?: string;
  };
  body: string;
  scenarioDescription?: string;
};

export type GatewayHealthStatus = {
  healthz: { ok: boolean; status: number; body: string };
  readyz: { ok: boolean; status: number; body: string };
  jwksAvailable: boolean;
  jwksKeysCount: number;
};

// Key generated for identity-context-svc local dev
const DEV_SIGNING_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCjFFUV2GvjXUaY
jyJZlZTX1riaQJVBeurHRfjRCAwtODmz+NU7/1hg6tTK+XiFZ5oy1pBeqsnDbdb3
1ImbYKmOCKTtuIAcGwSUOtmNY9POYgKkiBlQ+h2W8hyqVoPbt66fGxkOw09l20ot
B2ZQdusqd5xK/Htn2OwHiQG8A0P/PubRbkxEyhKZIJch9QU/4h+Mt/yUdJM7jfvZ
2GcGfTW7r0ROhwcyL60uk4TDD4XnZSzuV/cLSsDQtcQS60WSiOxBHmbwb4pqELkY
gVAjFf3JstfsAKXcr/iXAJbdCY1hVWdRFNnjmmVxpWFmN1Op6m2PqtBObC01WsBy
4jG+ADuxAgMBAAECggEABHG3Z+L//bA7DklITFyxM7icS0fbSW+KGmgjwb6QZmMT
3322ge4RgIKlzepCiJAsOZpzUMEiwnqp0xMttNhLhp1hsUDH7PwngcqgxyOjUAqH
u+ghmH1YdRagBVxaN5Cn55obcrWL4mC5gsSi2yqCeiPMVJbQ3iGhPQtUysTkA36u
NKYeor3r8JWShbpB/H41BNzFWrnJrLtaY/vM1wn51FNGK+TpwABmBUAhB8fuVB0n
/KY2SPzrE3xz5Q2N2XJXCJ65E0m/7iV/+TnoITe30KwXvcx7ynC82lWkSWrqFL0b
R6d9AQQ5zRSMlFWnIPRzWQAlrLw91tRObOkd/4HISQKBgQDNOu0uJZEa2KVOJCRS
wlsy6PmHAez1VXm151ETEAvqVNgw81hC0O5fOFF8oZpGEASgEZCX/3XhhFXivaR8
qLSdHsA1rS10bzev6pEY6XRkm7YNcmf2WYMi6jI0SODg/Jds93fpjinyohIUZhzo
pR2pnaRnsZ895gMEx+8vBZt8EwKBgQDLbAernZDhCDhU2G+OQwSOvm9OXsPCziNO
WyMpIMDdj/aJ3y8a0wsetgWA1Vn/6BP+actAMzhWyJJscOBQFIRCGKfpTlH3CLCY
/FxiWgwX1WsZ5jazrhm6ku9Dd1G9W2X3X89MkgmzstuXaLS5xFvFvn8AbF1WEowD
vDcb26+ZqwKBgAwzTJZJtW6bIniavW4OD83e+7aC7stG4Y1myvMPKSYtFQ0T6lNO
iF0ww+dc1AcGPMAnSyk+DovxigmIrJackOAmS9blDKa3VeAnWajZeAnjF9eEzZlf
iOQyd/mTu4qkeXwI2iAQS34ZFGoSB/Xsmu7SaEuhy42qdtN570YkVzHxAoGBAJbk
7dOpr9ydYlvdqPKYV/si3CIAPap1is8G39AUUbyIm9Kt0Z1OS4NedjqZCIfBuYMR
KwnWdMY7RhJWsK32ah01eOihhj9/HLB/EnCKZ0oOr8GoeY9TaBZ0BDPBgMq7z6lu
UrFz6up3lFh9/QGH3KOUqVTBDYNZgq8KoL5zeZC9AoGBAMm1/uY5/4vsuQhr+/Tl
9uhTUyOOJr9PX3cOxk8NsoZwK4rcT6nPjI8fiWVsbxDC1vpnNoGXbRWyF4Us3TAi
ExsG7S9u4iLQVz0FJ0qJlaXrPMZazaqUGUfKhdZcyZzTDvxJYCBTCyO931aP3tyA
jhGjHm2EEskqttM7z0LEzCSF
-----END PRIVATE KEY-----`;

export function generateRS256Token(
  claims: Record<string, unknown>,
  kid = "local-dev-key-1"
): string {
  const header = { alg: "RS256", typ: "JWT", kid };
  const h64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const p64 = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(h64 + "." + p64);
  const sig64 = signer.sign(DEV_SIGNING_KEY_PEM, "base64url");
  return `${h64}.${p64}.${sig64}`;
}

export type ScenarioPreset =
  | "valid"
  | "missing_auth"
  | "invalid_signature"
  | "expired_token"
  | "hostname_mismatch"
  | "entity_not_in_tenant"
  | "unknown_tenant";

export function createPresetRequest(preset: ScenarioPreset): {
  request: ForwardAuthVerifyRequest;
  description: string;
  expectedStatus: number;
} {
  const now = Math.floor(Date.now() / 1000);
  const validClaims = {
    iss: "identity-context-svc",
    aud: "zoiko-internal",
    exp: now + 3600,
    principal: { principal_id: "33333333-3333-3333-3333-333333333333" },
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    correlation_id: `corr-preset-${Date.now()}`,
  };

  switch (preset) {
    case "valid":
      return {
        request: {
          authorization: `Bearer ${generateRS256Token(validClaims)}`,
          forwardedUri: "/admin/finance",
          forwardedMethod: "GET",
        },
        description: "Valid RS256 JWT with registered ZOIKO-DEMO tenant & legal entity",
        expectedStatus: 200,
      };

    case "missing_auth":
      return {
        request: {
          authorization: undefined,
          forwardedUri: "/admin/finance",
          forwardedMethod: "GET",
        },
        description: "Missing Authorization header at edge gateway boundary",
        expectedStatus: 401,
      };

    case "invalid_signature":
      return {
        request: {
          authorization: "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ1bnRydXN0ZWQifQ.invalidsignaturebytes",
          forwardedUri: "/admin/finance",
          forwardedMethod: "GET",
        },
        description: "Malformed or untrusted token signature / non-matching JWKS",
        expectedStatus: 401,
      };

    case "expired_token":
      return {
        request: {
          authorization: `Bearer ${generateRS256Token({ ...validClaims, exp: now - 3600 })}`,
          forwardedUri: "/admin/finance",
          forwardedMethod: "GET",
        },
        description: "Expired JWT envelope past exp timestamp",
        expectedStatus: 401,
      };

    case "hostname_mismatch":
      return {
        request: {
          authorization: `Bearer ${generateRS256Token(validClaims)}`,
          forwardedUri: "/admin/finance",
          forwardedMethod: "GET",
          resolvedTenantId: "88888888-8888-8888-8888-888888888888",
        },
        description: "GTRM Hostname Resolution Mismatch (Token tenant != Hostname-resolved tenant)",
        expectedStatus: 403,
      };

    case "entity_not_in_tenant":
      return {
        request: {
          authorization: `Bearer ${generateRS256Token({
            ...validClaims,
            legal_entity_id: "99999999-9999-9999-9999-999999999999",
          })}`,
          forwardedUri: "/admin/finance",
          forwardedMethod: "GET",
        },
        description: "GOV-01 Cross-Tenant Isolation: Legal entity does not belong to active tenant",
        expectedStatus: 403,
      };

    case "unknown_tenant":
      return {
        request: {
          authorization: `Bearer ${generateRS256Token({
            ...validClaims,
            tenant_id: "00000000-0000-0000-0000-000000000000",
            legal_entity_id: "00000000-0000-0000-0000-000000000000",
          })}`,
          forwardedUri: "/admin/finance",
          forwardedMethod: "GET",
        },
        description: "Unknown or inactive tenant ID in token claims",
        expectedStatus: 403,
      };
  }
}

/**
 * Execute a verification check against gateway-auth-svc :8092/verify
 */
export async function verifyGatewayAuth(
  req: ForwardAuthVerifyRequest
): Promise<ForwardAuthVerifyResult> {
  const baseUrl = serviceUrl("gatewayAuth");
  const url = `${baseUrl}/verify`;

  const headers: Record<string, string> = {};
  if (req.authorization) headers["Authorization"] = req.authorization;
  if (req.forwardedUri) headers["X-Forwarded-Uri"] = req.forwardedUri;
  if (req.forwardedMethod) headers["X-Forwarded-Method"] = req.forwardedMethod;
  if (req.resolvedTenantId) headers["X-Zoiko-Resolved-Tenant-Id"] = req.resolvedTenantId;
  if (req.edgeHost) headers["Host"] = req.edgeHost;

  const startTime = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });
    const latencyMs = Date.now() - startTime;
    const text = await res.text();

    const resHeaders: Record<string, string> = {};
    res.headers.forEach((val, key) => {
      resHeaders[key.toLowerCase()] = val;
    });

    return {
      statusCode: res.status,
      statusText: res.statusText,
      isAllowed: res.status === 200,
      latencyMs,
      headers: resHeaders,
      injectedHeaders: {
        principalId: resHeaders["x-principal-id"],
        tenantId: resHeaders["x-tenant-id"],
        legalEntityId: resHeaders["x-legal-entity-id"],
        jurisdictionContext: resHeaders["x-jurisdiction-context"],
        timezone: resHeaders["x-timezone"],
        residencyPolicyId: resHeaders["x-residency-policy-id"],
        correlationId: resHeaders["x-correlation-id"],
        tenantContext: resHeaders["x-tenant-context"],
      },
      body: text,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    return {
      statusCode: 503,
      statusText: "Service Unavailable",
      isAllowed: false,
      latencyMs,
      headers: {},
      injectedHeaders: {},
      body: err instanceof Error ? err.message : "Network error contacting gateway-auth-svc",
    };
  }
}

/**
 * Check gateway health and upstream JWKS status
 */
export async function checkGatewayHealth(): Promise<GatewayHealthStatus> {
  const gatewayUrl = serviceUrl("gatewayAuth");
  const identityUrl = serviceUrl("identityContext");

  let healthz = { ok: false, status: 0, body: "" };
  let readyz = { ok: false, status: 0, body: "" };
  let jwksAvailable = false;
  let jwksKeysCount = 0;

  try {
    const hRes = await fetch(`${gatewayUrl}/healthz`, { cache: "no-store" });
    healthz = { ok: hRes.ok, status: hRes.status, body: (await hRes.text()).trim() };
  } catch (e: unknown) {
    healthz = { ok: false, status: 0, body: e instanceof Error ? e.message : "failed" };
  }

  try {
    const rRes = await fetch(`${gatewayUrl}/readyz`, { cache: "no-store" });
    readyz = { ok: rRes.ok, status: rRes.status, body: (await rRes.text()).trim() };
  } catch (e: unknown) {
    readyz = { ok: false, status: 0, body: e instanceof Error ? e.message : "failed" };
  }

  try {
    const jwksRes = await fetch(`${identityUrl}/.well-known/jwks.json`, { cache: "no-store" });
    if (jwksRes.ok) {
      const json = await jwksRes.json();
      jwksAvailable = true;
      jwksKeysCount = Array.isArray(json?.keys) ? json.keys.length : 0;
    }
  } catch {
    jwksAvailable = false;
  }

  return {
    healthz,
    readyz,
    jwksAvailable,
    jwksKeysCount,
  };
}
