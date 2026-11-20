// Finishes a browser-driven authorization-code sign-in (lib/oidc.ts) — the
// identity service's own page, reached through /api/auth/oidc/start. The
// console form's sign-in finishes server-side instead (lib/oidc-password.ts);
// this route serves the accounts that form cannot (passkey-only, enterprise
// SSO).
//
// identity-context-svc redirects here with ?code&state&iss. The code is
// exchanged on the back channel (client secret + PKCE verifier) for an access
// token, a refresh token and an ID token; the access token is resolved into the
// identity envelope; and the session cookie carries the envelope plus the
// refresh token proxy.ts renews it with.

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, encodeSession, sessionCookieOptions } from "@/lib/auth";
import {
  LOGIN_TX_COOKIE,
  LOGIN_TX_COOKIE_PATH,
  decodeLoginTransaction,
  exchangeCode,
  oidcConfig,
  publicOrigin,
  sessionFromTokens,
  timingSafeEqualString,
} from "@/lib/oidc";

export async function GET(request: NextRequest) {
  const origin = publicOrigin(request);
  const params = request.nextUrl.searchParams;
  const tx = decodeLoginTransaction(request.cookies.get(LOGIN_TX_COOKIE)?.value);

  const finish = (target: string) => {
    const response = NextResponse.redirect(new URL(target, origin));
    response.cookies.set(LOGIN_TX_COOKIE, "", { path: LOGIN_TX_COOKIE_PATH, maxAge: 0 });
    return response;
  };
  const fail = (error: string) =>
    finish(`/login?error=${error}${tx ? `&redirect=${encodeURIComponent(tx.redirect)}` : ""}`);

  const cfg = oidcConfig();
  if (!cfg) return fail("oidc_not_configured");

  // CSRF on the login itself: the state must be the one this browser was sent
  // off with, held in its own signed cookie.
  const state = params.get("state");
  if (!tx || !state || !timingSafeEqualString(state, tx.state)) return fail("state_mismatch");

  // RFC 9207 mix-up defence: the response must come from the issuer we used.
  const iss = params.get("iss");
  if (iss && iss !== cfg.issuer) return fail("signin_failed");

  const providerError = params.get("error");
  if (providerError) return fail(providerError === "access_denied" ? "access_denied" : "signin_failed");

  const code = params.get("code");
  if (!code) return fail("signin_failed");

  const tokens = await exchangeCode(cfg, code, tx);
  if (!tokens.ok) {
    console.warn("[login] authorization code exchange failed", { error: tokens.error });
    return fail(tokens.kind === "unavailable" ? "identity_unavailable" : "signin_failed");
  }

  const signed = await sessionFromTokens(cfg, tokens.data, tx.nonce);
  if (!signed.ok) return fail(signed.error);

  const response = finish(tx.redirect);
  response.cookies.set(SESSION_COOKIE, encodeSession(signed.session), sessionCookieOptions());
  return response;
}
