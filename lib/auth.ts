// Mock authentication for the ZoikoSuite admin console demo.
// There is no backend/identity provider yet — this validates a single
// demo credential and issues an opaque session cookie the middleware checks.

export const SESSION_COOKIE = "zoiko_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

export const DEMO_CREDENTIALS = {
  email: "admin@zoikosuite.com",
  password: "Zoiko@Governance1",
};

/**
 * Governed identity for the demo session.
 *
 * In a real deployment these come from the signed IdentityContextEnvelope that
 * gateway-auth-svc verifies, and Traefik forwards them to every backend as
 * X-Principal-Id / X-Tenant-Id / X-Legal-Entity-Id. The local single-port
 * gateway routes carry no ForwardAuth middleware, so the console has to supply
 * them itself — see lib/api/client.ts.
 *
 * They are UUIDs because the backend stores them in uuid columns: a
 * human-readable id like "demo-tenant" fails at the driver with
 * `invalid input syntax for type uuid` and surfaces as a 503, not a 400.
 *
 * This principal is granted PO_ISSUE / PO_AMEND / PO_CLOSE on this legal entity
 * by deployments/scripts/seed-demo-rbac.ps1 in the backend repo. Without that
 * seed authorization-svc answers DENIED / no_grant and every write is refused.
 */
export const DEMO_IDENTITY = {
  principalId: "33333333-3333-3333-3333-333333333333",
  tenantId: "11111111-1111-1111-1111-111111111111",
  legalEntityId: "22222222-2222-2222-2222-222222222222",
} as const;

export type SessionIdentity = {
  principalId: string;
  tenantId: string;
  legalEntityId: string;
};

export type SessionPayload = {
  email: string;
  name: string;
  role: string;
  iat: number;
} & SessionIdentity;

export function verifyCredentials(email: string, password: string) {
  return (
    email.trim().toLowerCase() === DEMO_CREDENTIALS.email &&
    password === DEMO_CREDENTIALS.password
  );
}

export function encodeSession(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
}

export function decodeSession(value: string | undefined | null): SessionPayload | null {
  if (!value) return null;
  try {
    const json = Buffer.from(value, "base64url").toString("utf-8");
    const parsed = JSON.parse(json) as Partial<SessionPayload>;
    if (!parsed?.email) return null;
    // Backfill the identity claims: cookies issued before they existed are
    // still valid sessions, and expiring everyone's session over an added
    // field would be a worse trade than defaulting to the demo identity.
    return {
      ...DEMO_IDENTITY,
      ...parsed,
    } as SessionPayload;
  } catch {
    return null;
  }
}

export function createDemoSession(): SessionPayload {
  return {
    email: DEMO_CREDENTIALS.email,
    name: "Lingaraj",
    role: "Platform Administrator",
    iat: Date.now(),
    ...DEMO_IDENTITY,
  };
}
