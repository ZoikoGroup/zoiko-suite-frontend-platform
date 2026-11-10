// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoSession, decodeSession, type SessionPayload } from "@/lib/auth";
import {
  authorizeUrl,
  codeChallenge,
  decodeLoginTransaction,
  encodeLoginTransaction,
  envelopeExpired,
  envelopeNeedsRenewal,
  newLoginTransaction,
  oidcConfig,
  readIdToken,
  renewSession,
  resetRenewalStateForTests,
  safeRedirect,
} from "@/lib/oidc";

const ISSUER = "http://localhost:8080";

function jwt(payload: Record<string, unknown>): string {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${b64({ alg: "RS256", typ: "JWT" })}.${b64(payload)}.c2ln`;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function oidcSession(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    ...createDemoSession(),
    envelopeJwt: jwt({ exp: nowSeconds() - 10 }),
    envelopeExpiresAt: nowSeconds() - 10,
    refreshToken: "refresh-1",
    ...overrides,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A fake identity-context-svc: token endpoint + resolve, with call counts. */
function fakeIdentity(opts: { token?: () => Response | Promise<Response>; resolve?: () => Response } = {}) {
  const calls = { token: [] as URLSearchParams[], resolve: 0 };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/oauth2/token")) {
      calls.token.push(new URLSearchParams(String(init?.body)));
      // Let concurrent callers pile up before the first answer arrives.
      await new Promise((r) => setTimeout(r, 20));
      return opts.token
        ? opts.token()
        : json({ access_token: "access-2", token_type: "Bearer", expires_in: 300, refresh_token: "refresh-2" });
    }
    if (url.endsWith("/v1/context/resolve")) {
      calls.resolve++;
      if (opts.resolve) return opts.resolve();
      const exp = nowSeconds() + 300;
      return json({
        envelope_jwt: jwt({ exp, session_trust_posture: { session_context_id: "ctx-2" } }),
        session_context_id: "ctx-2",
        expires_at: exp,
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

beforeEach(() => {
  vi.stubEnv("IDENTITY_CONSOLE_CLIENT_ID", "zoiko-console");
  vi.stubEnv("IDENTITY_CONSOLE_CLIENT_SECRET", "local-dev-console-client-secret");
  vi.stubEnv("ZOIKO_OIDC_ISSUER", ISSUER);
  resetRenewalStateForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("PKCE and the login transaction", () => {
  it("derives the S256 challenge exactly as RFC 7636 Appendix B does", () => {
    expect(codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("round-trips a signed transaction and rejects an edited or stale one", () => {
    const tx = newLoginTransaction("/admin/authorization", "http://localhost:3000/api/auth/callback");
    const value = encodeLoginTransaction(tx);

    expect(decodeLoginTransaction(value)).toEqual(tx);

    const [body, sig] = value.split(".");
    const edited = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), redirect: "/admin/x" }),
    ).toString("base64url");
    expect(decodeLoginTransaction(`${edited}.${sig}`)).toBeNull();

    expect(decodeLoginTransaction(value, tx.createdAt + 11 * 60_000)).toBeNull();
  });

  it("keeps the post-login redirect inside the console", () => {
    expect(safeRedirect("/admin/legal")).toBe("/admin/legal");
    expect(safeRedirect("https://evil.example/admin")).toBe("/admin");
    expect(safeRedirect("//evil.example")).toBe("/admin");
    expect(safeRedirect(null)).toBe("/admin");
  });

  it("asks for offline_access with PKCE S256 and the tenant hint", () => {
    const cfg = oidcConfig()!;
    const tx = newLoginTransaction("/admin", "http://localhost:3000/api/auth/callback");
    const url = new URL(authorizeUrl(cfg, tx, "admin@zoikosuite.com"));

    expect(url.origin + url.pathname).toBe(`${ISSUER}/oauth2/authorize`);
    expect(url.searchParams.get("client_id")).toBe("zoiko-console");
    expect(url.searchParams.get("scope")?.split(" ")).toContain("offline_access");
    expect(url.searchParams.get("code_challenge")).toBe(codeChallenge(tx.verifier));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(tx.state);
    expect(url.searchParams.get("nonce")).toBe(tx.nonce);
    expect(url.searchParams.get("tenant")).toBe("11111111-1111-1111-1111-111111111111");
    expect(url.searchParams.get("login_hint")).toBe("admin@zoikosuite.com");
  });

  it("is off without the confidential client", () => {
    vi.stubEnv("IDENTITY_CONSOLE_CLIENT_SECRET", "");
    expect(oidcConfig()).toBeNull();
  });
});

describe("ID token checks", () => {
  const claims = () => ({
    iss: ISSUER,
    aud: "zoiko-console",
    sub: "33333333-3333-3333-3333-333333333333",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    nonce: "n-1",
    exp: nowSeconds() + 300,
  });

  it("accepts the token minted for this client and login", () => {
    expect(readIdToken(jwt(claims()), oidcConfig()!, "n-1")?.sub).toBe(claims().sub);
  });

  it.each([
    ["another nonce", { nonce: "n-2" }],
    ["another audience", { aud: "local-dev-cli" }],
    ["another issuer", { iss: "http://evil.example" }],
    ["an expired token", { exp: nowSeconds() - 3600 }],
  ])("refuses %s", (_label, change) => {
    expect(readIdToken(jwt({ ...claims(), ...change }), oidcConfig()!, "n-1")).toBeNull();
  });
});

describe("when an envelope needs renewing", () => {
  it("renews inside the last minute and treats a lapsed envelope as expired", () => {
    const at = (exp: number) => oidcSession({ envelopeExpiresAt: exp, envelopeJwt: jwt({ exp }) });

    expect(envelopeNeedsRenewal(at(nowSeconds() + 240))).toBe(false);
    expect(envelopeNeedsRenewal(at(nowSeconds() + 30))).toBe(true);
    expect(envelopeExpired(at(nowSeconds() + 30))).toBe(false);
    expect(envelopeExpired(at(nowSeconds() - 1))).toBe(true);
  });

  it("never touches a session that has no envelope", () => {
    const session = createDemoSession();
    expect(envelopeNeedsRenewal(session)).toBe(false);
    expect(envelopeExpired(session)).toBe(false);
  });
});

describe("renewSession", () => {
  it("spends the refresh token once however many requests ask at the same moment", async () => {
    const calls = fakeIdentity();
    const session = oidcSession();

    const outcomes = await Promise.all(Array.from({ length: 8 }, () => renewSession(session)));

    expect(calls.token).toHaveLength(1);
    expect(calls.token[0].get("grant_type")).toBe("refresh_token");
    expect(calls.token[0].get("refresh_token")).toBe("refresh-1");
    expect(new Set(outcomes.map((o) => (o.ok ? o.cookie : "")))).toHaveProperty("size", 1);

    const first = outcomes[0];
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const decoded = decodeSession(first.cookie)!;
    expect(decoded.refreshToken).toBe("refresh-2");
    expect(decoded.sessionContextId).toBe("ctx-2");
    expect(envelopeNeedsRenewal(decoded)).toBe(false);
    expect(decoded.iat).toBe(session.iat);
  });

  it("replays the result to a late request still carrying the spent token", async () => {
    const calls = fakeIdentity();
    const session = oidcSession();

    const first = await renewSession(session);
    const late = await renewSession(session);

    expect(calls.token).toHaveLength(1);
    expect(late).toEqual(first);
  });

  it("ends the session when the provider refuses the refresh token", async () => {
    fakeIdentity({ token: () => json({ error: "invalid_grant", error_description: "the login session has ended" }, 400) });

    expect(await renewSession(oidcSession())).toEqual({ ok: false, reason: "ended" });
  });

  it("reports an outage without ending the session, and retries soon after", async () => {
    const calls = fakeIdentity({ token: () => json({ error: "temporarily_unavailable" }, 503) });

    expect(await renewSession(oidcSession())).toEqual({ ok: false, reason: "unavailable" });
    await renewSession(oidcSession(), Date.now() + 10_000);
    expect(calls.token).toHaveLength(2);
  });

  it("keeps the rotated refresh token when the envelope cannot be resolved yet", async () => {
    fakeIdentity({ resolve: () => json({ error: "upstream_unavailable" }, 503) });
    const session = oidcSession();

    const outcome = await renewSession(session);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const decoded = decodeSession(outcome.cookie)!;
    expect(decoded.refreshToken).toBe("refresh-2");
    expect(decoded.envelopeJwt).toBe(session.envelopeJwt);
  });

  it("ends a session with no refresh token without calling anything", async () => {
    const calls = fakeIdentity();

    expect(await renewSession(oidcSession({ refreshToken: undefined }))).toEqual({ ok: false, reason: "ended" });
    expect(calls.token).toHaveLength(0);
  });
});
