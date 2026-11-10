// Mock authentication for the ZoikoSuite admin console demo.
// There is no backend/identity provider yet — this validates a single
// demo credential and issues an opaque session cookie the middleware checks.

export const SESSION_COOKIE = "zoiko_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

export const DEMO_CREDENTIALS = {
  email: "admin@zoikosuite.com",
  password: "Zoiko@Governance1",
};

export type GovernedUserAccount = {
  email: string;
  password: string;
  name: string;
  role: string;
  domain: string;
  principalId: string;
  tenantId: string;
  legalEntityId: string;
};

export const GOVERNED_USER_ACCOUNTS: GovernedUserAccount[] = [
  {
    email: "admin@zoikosuite.com",
    password: "Zoiko@Governance1",
    name: "Lingaraj (Super Admin)",
    role: "Platform Administrator",
    domain: "Global Governance & Core Platform",
    principalId: "33333333-3333-3333-3333-333333333333",
    tenantId: "11111111-1111-1111-1111-111111111111",
    legalEntityId: "22222222-2222-2222-2222-222222222222",
  },
  {
    email: "tax.officer@zoikosuite.com",
    password: "Zoiko@Tax2026!",
    name: "Dr. Alistair Vance",
    role: "Tax Governance Lead & MTD Officer",
    domain: "Tax Engine & Authority Filing",
    principalId: "44444444-4444-4444-4444-444444444444",
    tenantId: "11111111-1111-1111-1111-111111111111",
    legalEntityId: "22222222-2222-2222-2222-222222222222",
  },
  {
    email: "cfo@zoikosuite.com",
    password: "Zoiko@Finance2026!",
    name: "Elena Rostova",
    role: "Chief Financial Officer (CFO)",
    domain: "Treasury, General Ledger & Financial Close",
    principalId: "55555555-5555-5555-5555-555555555555",
    tenantId: "11111111-1111-1111-1111-111111111111",
    legalEntityId: "22222222-2222-2222-2222-222222222222",
  },
  {
    email: "legal.counsel@zoikosuite.com",
    password: "Zoiko@Legal2026!",
    name: "James Okafor, Esq.",
    role: "Head of Legal & Governance Counsel",
    domain: "Contracts, Clauses & Board Resolutions",
    principalId: "66666666-6666-6666-6666-666666666666",
    tenantId: "11111111-1111-1111-1111-111111111111",
    legalEntityId: "22222222-2222-2222-2222-222222222222",
  },
  {
    email: "hr.director@zoikosuite.com",
    password: "Zoiko@People2026!",
    name: "Sophie Laurent",
    role: "Director of People & Remuneration",
    domain: "HR, Payroll Runs & Workforce Governance",
    principalId: "77777777-7777-7777-7777-777777777777",
    tenantId: "11111111-1111-1111-1111-111111111111",
    legalEntityId: "22222222-2222-2222-2222-222222222222",
  },
  {
    email: "procurement@zoikosuite.com",
    password: "Zoiko@Commercial2026!",
    name: "Marcus Sterling",
    role: "Head of Procurement & Commercial Ops",
    domain: "Purchase Orders, Spend Controls & Vendor KYC",
    principalId: "88888888-8888-8888-8888-888888888888",
    tenantId: "11111111-1111-1111-1111-111111111111",
    legalEntityId: "22222222-2222-2222-2222-222222222222",
  },
  {
    email: "security.audit@zoikosuite.com",
    password: "Zoiko@Audit2026!",
    name: "Dr. Maya Lin",
    role: "Chief Information Security & Audit Officer",
    domain: "Cryptographic Audit Log, Vault & Compliance",
    principalId: "99999999-9999-9999-9999-999999999999",
    tenantId: "11111111-1111-1111-1111-111111111111",
    legalEntityId: "22222222-2222-2222-2222-222222222222",
  }
];

export const DEMO_IDENTITY = {
  principalId: "33333333-3333-3333-3333-333333333333",
  tenantId: "11111111-1111-1111-1111-111111111111",
  legalEntityId: "22222222-2222-2222-2222-222222222222",
} as const;

export type SessionIdentity = {
  principalId: string;
  tenantId: string;
  legalEntityId: string;

  /**
   * The signed envelope, when the session has one. Optional so the ~50 places
   * that build this object from three literal fields keep compiling and keep
   * working — they simply do not present a bearer token, which changes nothing
   * while ZOIKO_USE_GATEWAY is false and the console talks to service ports
   * directly. Use toIdentity() below rather than constructing it by hand.
   */
  envelopeJwt?: string;
};

/**
 * The identity to pass to any lib/api call, taken from a decoded session.
 *
 * Prefer this over building the object inline: it is the one place that decides
 * what a request presents about who is making it, so a field added to the
 * session reaches every caller that uses it instead of the fifty that would each
 * need editing.
 */
export function toIdentity(session: SessionPayload): SessionIdentity {
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
    envelopeJwt: session.envelopeJwt,
  };
}

export type SessionPayload = {
  email: string;
  name: string;
  role: string;
  iat: number;

  /**
   * The signed IdentityContextEnvelope from identity-context-svc, when the
   * login went through the real identity provider.
   *
   * Optional on purpose. A session minted before this field existed, or one
   * from the offline fallback below, has no envelope — and every read path
   * still works, because the console sends the §4 identity headers directly and
   * ZOIKO_USE_GATEWAY is false, so nothing is verifying a bearer token today.
   * Once the gateway is in front, an absent envelope is what will start failing,
   * and it fails as a 401 from gateway-auth-svc rather than silently.
   */
  envelopeJwt?: string;

  /**
   * The session this envelope belongs to, for
   * GET/POST /v1/context/session/{id}. Logging out can then invalidate the
   * session server-side instead of only dropping the cookie.
   */
  sessionContextId?: string;

  /** Unix seconds at which envelopeJwt expires. Short — minutes, not hours. */
  envelopeExpiresAt?: number;

  /**
   * The OAuth refresh token from an authorization-code sign-in (lib/oidc.ts).
   *
   * The envelope lives ENVELOPE_JWT_TTL_SECONDS (300 s) and this cookie eight
   * hours; proxy.ts uses this token to renew the envelope before it expires.
   * A session without one (password login) cannot renew, and ends when its
   * envelope does instead of failing every call with 401.
   *
   * It is single-use and rotates on every renewal: presenting a used one is
   * treated by identity-context-svc as theft and ends the login session. It is
   * also bound to the console's confidential client, so it is worthless
   * without IDENTITY_CONSOLE_CLIENT_SECRET.
   */
  refreshToken?: string;
} & SessionIdentity;

export function findUserByCredentials(email: string, password: string): GovernedUserAccount | null {
  const normalizedEmail = email.trim().toLowerCase();

  // In production, hardcoded demo accounts must NOT authenticate unless ALLOW_DEMO_CREDENTIALS is explicitly set
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEMO_CREDENTIALS) {
    const prodAdminEmail = process.env.ZOIKO_ADMIN_EMAIL?.trim().toLowerCase();
    const prodAdminPassword = process.env.ZOIKO_ADMIN_PASSWORD;

    if (
      prodAdminEmail &&
      prodAdminPassword &&
      normalizedEmail === prodAdminEmail &&
      password === prodAdminPassword
    ) {
      return {
        email: prodAdminEmail,
        password: "", // do not leak into memory/objects
        name: process.env.ZOIKO_ADMIN_NAME || "Production Administrator",
        role: "Platform Administrator",
        domain: "Global Governance & Core Platform",
        principalId: process.env.ZOIKO_ADMIN_PRINCIPAL_ID || "33333333-3333-3333-3333-333333333333",
        tenantId: process.env.ZOIKO_ADMIN_TENANT_ID || "11111111-1111-1111-1111-111111111111",
        legalEntityId: process.env.ZOIKO_ADMIN_LEGAL_ENTITY_ID || "22222222-2222-2222-2222-222222222222",
      };
    }
    // No hardcoded passwords in production authentication paths
    return null;
  }

  return GOVERNED_USER_ACCOUNTS.find(
    (u) => u.email.toLowerCase() === normalizedEmail && u.password === password
  ) ?? null;
}

export function verifyCredentials(email: string, password: string): boolean {
  return findUserByCredentials(email, password) !== null;
}

/**
 * The console's display details for an account identity-context-svc has
 * already authenticated (OIDC sign-in), looked up by email alone. Never use
 * this to authenticate anyone — it checks no password.
 */
export function findAccountByEmail(email: string | undefined): Omit<GovernedUserAccount, "password"> | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  const found = GOVERNED_USER_ACCOUNTS.find((u) => u.email.toLowerCase() === normalized);
  if (!found) return null;
  return {
    email: found.email,
    name: found.name,
    role: found.role,
    domain: found.domain,
    principalId: found.principalId,
    tenantId: found.tenantId,
    legalEntityId: found.legalEntityId,
  };
}

/** Attributes for the session cookie, wherever it is (re)issued. */
export function sessionCookieOptions(maxAge: number = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge,
    path: "/",
  };
}

/**
 * Seconds left before a session reaches SESSION_MAX_AGE_SECONDS from sign-in.
 * A renewed cookie keeps the original deadline: renewal refreshes the
 * envelope, it does not extend the session.
 */
export function remainingSessionSeconds(session: Pick<SessionPayload, "iat">, now: number = Date.now()): number {
  const iatMs = session.iat < 1e11 ? session.iat * 1000 : session.iat;
  return Math.max(0, Math.floor((iatMs + SESSION_MAX_AGE_SECONDS * 1000 - now) / 1000));
}

import crypto from "crypto";

export function getSessionSecret(): string {
  const secret = process.env.ZOIKO_SESSION_SECRET || process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    if (!secret) {
      console.error("FATAL: ZOIKO_SESSION_SECRET or SESSION_SECRET must be configured in production.");
      throw new Error("Missing required session secret in production. Set ZOIKO_SESSION_SECRET with >= 32 characters.");
    }
    if (secret.length < 32) {
      throw new Error("ZOIKO_SESSION_SECRET must be at least 32 characters in production.");
    }
  }
  return secret || "zoiko-suite-default-dev-signing-secret-change-in-prod-2026";
}

export function signSessionPayload(payloadBase64: string): string {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(payloadBase64)
    .digest("base64url");
}

/**
 * Separates the claims from the raw envelope inside the signed part of the
 * cookie. Legal in a cookie value and absent from both base64url and a JWT.
 */
const ENVELOPE_SEPARATOR = "~";

/**
 * Cookie value: `<claims>[~<envelopeJwt>].<signature>`, the HMAC covering
 * everything before the last dot.
 *
 * The envelope rides outside the base64url claims on purpose. It is already
 * base64url, and encoding it a second time inside the JSON grew a ~2.7 KB admin
 * envelope to a 4.1 KB cookie — over the 4096-byte limit at which browsers drop
 * a cookie without telling anyone. The login then "succeeded", /admin arrived
 * without a session, and proxy.ts bounced back to /login: a reload loop.
 */
export function encodeSession(payload: SessionPayload): string {
  const { envelopeJwt, ...claims } = payload;
  const safeClaims = {
    ...claims,
    iat: payload.iat || Date.now(),
  };
  const claimsBase64 = Buffer.from(JSON.stringify(safeClaims), "utf-8").toString("base64url");
  const signed = envelopeJwt ? `${claimsBase64}${ENVELOPE_SEPARATOR}${envelopeJwt}` : claimsBase64;
  const signature = signSessionPayload(signed);
  return `${signed}.${signature}`;
}

export function decodeSession(value: string | undefined | null): SessionPayload | null {
  if (!value || typeof value !== "string") return null;

  // The envelope itself contains dots, so the signature is whatever follows the
  // last one. Unsigned or malformed cookies have no signature part.
  const sigAt = value.lastIndexOf(".");
  if (sigAt <= 0) {
    return null;
  }

  const signed = value.slice(0, sigAt);
  const signature = value.slice(sigAt + 1);
  if (!signature) {
    return null;
  }

  // Cryptographically verify signature using constant-time comparison
  const expectedSignature = signSessionPayload(signed);
  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    return null; // Tampered, forged, or invalid signature
  }

  const sepAt = signed.indexOf(ENVELOPE_SEPARATOR);
  const payloadBase64 = sepAt === -1 ? signed : signed.slice(0, sepAt);
  const envelopeJwt = sepAt === -1 ? undefined : signed.slice(sepAt + 1);
  if (!payloadBase64 || envelopeJwt === "") {
    return null;
  }

  try {
    const json = Buffer.from(payloadBase64, "base64url").toString("utf-8");
    const parsed = JSON.parse(json) as Partial<SessionPayload>;
    // Cookies minted before the split carry the envelope inside the claims.
    if (envelopeJwt) {
      parsed.envelopeJwt = envelopeJwt;
    }

    // Validate required claims
    if (
      !parsed?.email ||
      typeof parsed.email !== "string" ||
      !parsed.role ||
      !parsed.tenantId ||
      !parsed.principalId
    ) {
      return null;
    }

    // Validate expiration
    if (typeof parsed.iat === "number") {
      const now = Date.now();
      const iatMs = parsed.iat < 1e11 ? parsed.iat * 1000 : parsed.iat;
      if (now - iatMs > SESSION_MAX_AGE_SECONDS * 1000) {
        return null; // Expired
      }
      if (iatMs > now + 60_000) {
        return null; // Clock skew anomaly (>60s in future)
      }
    } else {
      return null;
    }

    return {
      ...DEMO_IDENTITY,
      ...parsed,
    } as SessionPayload;
  } catch {
    return null;
  }
}

export function isPlatformAdmin(session: SessionPayload | null): boolean {
  return session?.role === "Platform Administrator";
}

export function assertSessionRole(
  session: SessionPayload | null,
  allowedRoles: string[],
): boolean {
  if (!session || !session.role) return false;
  return allowedRoles.includes(session.role);
}

export function assertTenantContext(
  session: SessionPayload | null,
  expectedTenantId: string,
): boolean {
  if (!session || !session.tenantId) return false;
  return session.tenantId === expectedTenantId;
}

export function createSessionForUser(user: GovernedUserAccount): SessionPayload {
  return {
    email: user.email,
    name: user.name,
    role: user.role,
    principalId: user.principalId,
    tenantId: user.tenantId,
    legalEntityId: user.legalEntityId,
    iat: Date.now(),
  };
}

export function createDemoSession(): SessionPayload {
  return createSessionForUser(GOVERNED_USER_ACCOUNTS[0]);
}
