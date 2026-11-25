// Starts an authorization-code sign-in at identity-context-svc (lib/oidc.ts).
//
// Generates state, nonce and the PKCE verifier, keeps them in a signed,
// short-lived cookie scoped to /api/auth, and sends the browser to the hosted
// login page. The callback (/api/auth/callback) finishes the exchange.

import { NextResponse, type NextRequest } from "next/server";
import {
  LOGIN_TX_COOKIE,
  LOGIN_TX_COOKIE_PATH,
  LOGIN_TX_MAX_AGE_SECONDS,
  authorizeUrl,
  encodeLoginTransaction,
  identityReachable,
  newLoginTransaction,
  oidcConfig,
  publicOrigin,
  safeRedirect,
} from "@/lib/oidc";

export async function GET(request: NextRequest) {
  const origin = publicOrigin(request);
  const redirect = safeRedirect(request.nextUrl.searchParams.get("redirect"));
  const back = (error: string) =>
    NextResponse.redirect(new URL(`/login?error=${error}&redirect=${encodeURIComponent(redirect)}`, origin));

  const cfg = oidcConfig();
  if (!cfg) return back("oidc_not_configured");

  // Sending the browser to a host that is down strands it on a connection
  // error with no way back. Checked first so the login page can offer the
  // local-account fallback instead.
  if (!(await identityReachable())) return back("identity_unavailable");

  const tx = newLoginTransaction(redirect, `${origin}/api/auth/callback`);
  const loginHint = request.nextUrl.searchParams.get("login_hint")?.trim() || undefined;

  const response = NextResponse.redirect(authorizeUrl(cfg, tx, loginHint));
  response.cookies.set(LOGIN_TX_COOKIE, encodeLoginTransaction(tx), {
    httpOnly: true,
    // Lax, not Strict: the callback arrives as a top-level navigation from the
    // identity service's origin, and Strict would withhold the cookie there.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: LOGIN_TX_COOKIE_PATH,
    maxAge: LOGIN_TX_MAX_AGE_SECONDS,
  });
  return response;
}
