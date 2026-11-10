import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { endOidcSession, oidcConfig } from "@/lib/oidc";

// Dropping the cookie alone would leave the login session alive at
// identity-context-svc: its refresh token could still mint envelopes. For a
// session signed in through it, the login session is ended there too
// (POST /v1/logout, then the refresh family is revoked) — see endOidcSession.
export async function POST(request: NextRequest) {
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  const cfg = oidcConfig();
  if (cfg && session?.refreshToken) {
    await endOidcSession(cfg, session);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
