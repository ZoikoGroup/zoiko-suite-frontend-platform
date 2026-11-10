import crypto from "crypto";
import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE,
  createDemoSession,
  decodeSession,
  encodeSession,
  signSessionPayload,
  type SessionPayload,
} from "@/lib/auth";

// Browsers (and curl) silently drop a cookie whose name + value exceeds 4096
// bytes. When that happens to the session cookie the login request succeeds,
// the redirect to /admin carries no cookie, and proxy.ts sends the user straight
// back to /login — which looks like the login page reloading.
const BROWSER_COOKIE_LIMIT = 4096;

function segment(bytes: number): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

// Same shape and size as the admin envelope identity-context-svc issues
// (~2.7 KB: header.payload.signature, all base64url).
function realisticEnvelope(): string {
  return `${segment(80)}.${segment(1880)}.${segment(64)}`;
}

function sessionWithEnvelope(envelopeJwt: string): SessionPayload {
  return {
    ...createDemoSession(),
    envelopeJwt,
    sessionContextId: "ctx_01JABCDEFGHJKMNPQRSTVWXY",
    envelopeExpiresAt: Math.floor(Date.now() / 1000) + 900,
  };
}

describe("session cookie encoding", () => {
  it("fits a session carrying a signed envelope inside the browser cookie limit", () => {
    const envelopeJwt = realisticEnvelope();
    expect(envelopeJwt.length).toBeGreaterThan(2600);

    const value = encodeSession(sessionWithEnvelope(envelopeJwt));

    expect(SESSION_COOKIE.length + 1 + value.length).toBeLessThanOrEqual(BROWSER_COOKIE_LIMIT);
  });

  it("still fits once the session also carries its refresh token", () => {
    const session = { ...sessionWithEnvelope(realisticEnvelope()), refreshToken: segment(32) };

    const value = encodeSession(session);

    expect(SESSION_COOKIE.length + 1 + value.length).toBeLessThanOrEqual(BROWSER_COOKIE_LIMIT);
    expect(decodeSession(value)).toEqual(session);
  });

  it("round-trips the envelope and every claim", () => {
    const session = sessionWithEnvelope(realisticEnvelope());

    const decoded = decodeSession(encodeSession(session));

    expect(decoded).toEqual(session);
  });

  it("round-trips a session without an envelope", () => {
    const session = createDemoSession();

    expect(decodeSession(encodeSession(session))).toEqual(session);
  });

  it("rejects a cookie whose envelope was swapped", () => {
    const value = encodeSession(sessionWithEnvelope(realisticEnvelope()));
    const original = decodeSession(value)!.envelopeJwt!;

    const forged = value.replace(original, realisticEnvelope());

    expect(forged).not.toEqual(value);
    expect(decodeSession(forged)).toBeNull();
  });

  it("rejects a cookie whose claims were edited", () => {
    const value = encodeSession(createDemoSession());
    const [payload, signature] = value.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    const edited = Buffer.from(JSON.stringify({ ...claims, role: "Root" }), "utf-8").toString("base64url");

    expect(decodeSession(`${edited}.${signature}`)).toBeNull();
  });

  it("still accepts a cookie minted in the previous format", () => {
    // Previous format: base64url(JSON including envelopeJwt) + "." + HMAC.
    const session = sessionWithEnvelope(`${segment(20)}.${segment(60)}.${segment(20)}`);
    const payload = Buffer.from(JSON.stringify(session), "utf-8").toString("base64url");
    const legacy = `${payload}.${signSessionPayload(payload)}`;

    expect(decodeSession(legacy)).toEqual(session);
  });
});
