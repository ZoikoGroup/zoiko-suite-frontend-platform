// The console's login endpoint.
//
// Exchanges the password with identity-context-svc and stores the signed
// IdentityContextEnvelope it returns. That envelope is what gateway-auth-svc
// verifies and what Domain 1/2 services accept as identity in require mode;
// the Identity Context and Gateway Authentication pages both read it.
//
// THE TWO HOPS ARE NOT INTERCHANGEABLE. /v1/authenticate returns a short-lived
// bearer token that grants NOTHING; it exists only to be exchanged at
// /v1/context/resolve for the envelope, which carries tenant, legal entity,
// role profile, delegations and trust posture. A login that stopped after the
// first hop would look like it worked and produce a session with no authority.
//
// THE LOCAL ACCOUNT LIST STILL SIGNS IN WHENEVER IDENTITY DOES NOT. main had
// reduced this route to the local list alone, which left every session without
// an envelope. Restoring the identity hop must not lock anybody out who can sign
// in today — the console is routinely run against stacks where
// identity-context-svc is down, or up without these demo accounts provisioned —
// so a known local account with the right password always gets a session. It
// gets an envelope only when identity-context-svc accepted it too, and the
// response says which (`identityProvider`).

import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionForUser,
  encodeSession,
  findUserByCredentials,
  type SessionPayload,
} from "@/lib/auth";
import { authenticate, resolveIdentity } from "@/lib/api/identity";

/** Claims the console reads back out of the envelope it was just handed. */
type EnvelopeClaims = {
  exp?: number;
  session_trust_posture?: { session_context_id?: string };
};

/**
 * Read the payload of a JWT this process just received over a trusted channel.
 *
 * NOT verification — there is no signature check here and there must not appear
 * to be one. The console is not a relying party for this token; gateway-auth-svc
 * is. All this extracts is the expiry and session id, so the cookie can carry
 * them.
 */
function readEnvelopeClaims(jwt: string): EnvelopeClaims {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return {};
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as EnvelopeClaims;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const known = findUserByCredentials(email, password);
  const tenantId = known?.tenantId ?? process.env.ZOIKO_DEMO_TENANT_ID;

  let session: SessionPayload | null = null;
  let identityProvider: "identity-context-svc" | "local-credentials" = "local-credentials";

  if (tenantId) {
    const auth = await authenticate({ tenant_id: tenantId, email, password });
    if (auth.ok) {
      const legalEntityId = known?.legalEntityId ?? "";
      const resolved = await resolveIdentity({
        request: {
          bearer_token: auth.data.access_token,
          legal_entity_id: legalEntityId,
          correlation_id: crypto.randomUUID(),
        },
        callerIdentity: { principalId: auth.data.principal_id, tenantId: auth.data.tenant_id },
      });

      if (resolved.ok) {
        const claims = readEnvelopeClaims(resolved.data.envelope_jwt);
        identityProvider = "identity-context-svc";
        session = {
          email,
          name: known?.name ?? email,
          role: known?.role ?? "Principal",
          principalId: auth.data.principal_id,
          tenantId: auth.data.tenant_id,
          legalEntityId,
          iat: Date.now(),
          envelopeJwt: resolved.data.envelope_jwt,
          sessionContextId: claims.session_trust_posture?.session_context_id,
          envelopeExpiresAt: claims.exp,
        };
      } else {
        console.warn("[login] identity-context-svc authenticated but could not resolve a context", {
          email,
          status: resolved.error.status,
        });
      }
    } else if (auth.error.status !== 401 || !known) {
      // Unreachable, or refused an account the local list does not know either.
      console.warn("[login] identity-context-svc did not authenticate", { email, status: auth.error.status });
    }
  }

  if (!session) {
    if (!known) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    session = createSessionForUser(known);
  }

  const response = NextResponse.json({
    success: true,
    identityProvider,
    user: {
      email: session.email,
      name: session.name,
      role: session.role,
      domain: known?.domain,
    },
  });

  response.cookies.set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  return response;
}
