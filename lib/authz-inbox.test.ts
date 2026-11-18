// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SESSION_MAX_AGE_SECONDS, createDemoSession } from "@/lib/auth";
import { sessionTrust } from "@/lib/authz-inbox";

function jwt(payload: Record<string, unknown>): string {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${b64({ alg: "RS256" })}.${b64(payload)}.c2ln`;
}

describe("sessionTrust", () => {
  const now = Date.UTC(2026, 10, 10, 10, 0, 0);
  const iat = now - 60 * 60_000; // signed in an hour ago
  const envelopeExp = Math.floor(now / 1000) + 240; // five-minute envelope, four left

  it("reports the session's 8 h deadline, not the envelope's, when the envelope renews", () => {
    const trust = sessionTrust(
      { ...createDemoSession(), iat, envelopeJwt: jwt({ exp: envelopeExp }), refreshToken: "r" },
      now,
    );

    expect(trust.renews).toBe(true);
    expect(trust.envelopeExpiresAt).toBe(envelopeExp);
    expect(trust.expiresAt).toBe(Math.floor((iat + SESSION_MAX_AGE_SECONDS * 1000) / 1000));
  });

  it("reports the envelope's expiry for a session that cannot renew", () => {
    const trust = sessionTrust({ ...createDemoSession(), iat, envelopeJwt: jwt({ exp: envelopeExp }) }, now);

    expect(trust.renews).toBe(false);
    expect(trust.expiresAt).toBe(envelopeExp);
  });
});
