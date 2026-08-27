// The console's login endpoint.
//
// Until now this validated the password against GOVERNED_USER_ACCOUNTS — a list
// of seven email/password pairs compiled into the app — and issued a cookie.
// lib/auth.ts opened by admitting it: "There is no backend/identity provider
// yet." There is one now, so this exchanges the password with
// identity-context-svc and stores the signed IdentityContextEnvelope it returns.
//
// THE TWO HOPS ARE NOT INTERCHANGEABLE. /v1/authenticate returns a short-lived
// (5 minute) bearer token that grants NOTHING; it exists only to be exchanged at
// /v1/context/resolve for the envelope, which is what carries tenant, legal
// entity, role profile, delegations and trust posture and what every other
// service trusts. A login that stopped after the first hop would look like it
// worked and produce a session with no authority in it.
//
// FALLING BACK IS DELIBERATE AND NARROW. If identity-context-svc is unreachable
// the local list still authenticates, because this console is routinely run
// against a subset of services and making every page unreachable when :8080 is
// down would be worse than the demo login it replaces. The fallback does NOT
// apply to a rejected password: a 401 from the service is a 401 here. It applies
// only when no decision could be obtained at all, and it is logged.

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
 * is, and it checks the signature against identity-svc's JWKS. All this extracts
 * is the expiry and session id, so the cookie can carry them.
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

  // The local record still supplies the display name, role label and the tenant
  // to authenticate against — none of which /v1/authenticate takes or returns in
  // a form the console shows. It is no longer what decides whether the password
  // is correct.
  const known = findUserByCredentials(email, password);

  // An email the local list does not carry may still be a real principal in the
  // tenant, so the service is asked either way — ZOIKO_DEMO_TENANT_ID names the
  // tenant to search when the console has no record of its own.
  const tenantId = known?.tenantId ?? process.env.ZOIKO_DEMO_TENANT_ID;
  if (!tenantId) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  let session: SessionPayload | null = null;
  let identityProvider: "identity-context-svc" | "local-fallback" = "identity-context-svc";

  const auth = await authenticate({ tenant_id: tenantId, email, password });

  if (auth.ok) {
    // principal_id and tenant_id come from the SERVICE, not the compiled list —
    // so a principal whose id was changed in the registry is followed here
    // instead of the console asserting a stale one.
    const legalEntityId = known?.legalEntityId ?? "";
    const resolved = await resolveIdentity({
      request: {
        bearer_token: auth.data.access_token,
        legal_entity_id: legalEntityId,
        correlation_id: crypto.randomUUID(),
      },
      callerIdentity: {
        principalId: auth.data.principal_id,
        tenantId: auth.data.tenant_id,
      },
    });

    if (!resolved.ok) {
      // The password was right and the envelope still could not be built —
      // an inactive tenant, an entity this principal may not act as, a blocked
      // trust posture, or an upstream that is down. None of those are "wrong
      // password", and reporting them as one sends the user to reset a
      // credential that is fine.
      console.error("[login] authenticated but context resolution failed", {
        email,
        status: resolved.error.status,
        error: resolved.error,
      });
      return NextResponse.json(
        {
          error:
            "Your credentials were accepted, but a session could not be established. " +
            "This is a platform state, not a password problem — see the identity service logs.",
          detail: resolved.error,
        },
        { status: 503 },
      );
    }

    const claims = readEnvelopeClaims(resolved.data.envelope_jwt);
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
  } else if (auth.error.status === 401) {
    // A decision was obtained and it was "no". One message for every rejection
    // reason, matching what the service itself returns — the reason lives in its
    // access decision log, not on the wire, so this cannot enumerate accounts.
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  } else {
    // No decision could be obtained. Fall back to the compiled list.
    if (!known) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    console.warn("[login] identity-context-svc unreachable — using the local account list", {
      status: auth.error.status,
      error: auth.error,
    });
    identityProvider = "local-fallback";
    session = createSessionForUser(known);
  }

  if (!session) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
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
