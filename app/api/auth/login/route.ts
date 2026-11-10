// The console's login endpoint, behind the console's own /login form.
//
// WITH THE OIDC CLIENT CONFIGURED (lib/oidc.ts) the form's email and password
// go through identity-context-svc's authorization-code login, driven from this
// server (lib/oidc-password.ts), so the reader signs in on one page and the
// session gets a refresh token. That token is what lets proxy.ts renew the
// 300-second identity envelope; without it every session failed with "The
// service no longer accepts this session" five minutes after sign-in. An
// account with two-step answers `{ step: "code" }` first, and the form posts
// `{ code }` next. The login state between the two travels in the signed
// zoiko_oidc_tx cookie.
//
// WITHOUT IT, the password is exchanged at POST /v1/authenticate as before:
//
// THE TWO HOPS ARE NOT INTERCHANGEABLE. /v1/authenticate returns a short-lived
// bearer token that grants NOTHING; it exists only to be exchanged at
// /v1/context/resolve for the envelope, which carries tenant, legal entity,
// role profile, delegations and trust posture. A login that stopped after the
// first hop would look like it worked and produce a session with no authority.
// Such a session cannot renew its envelope, and proxy.ts ends it when the
// envelope expires.
//
// THE LOCAL ACCOUNT LIST STILL SIGNS IN WHENEVER IDENTITY DOES NOT. The
// console is routinely run against stacks where identity-context-svc is down,
// or up without these demo accounts provisioned — so a known local account with
// the right password always gets a session when the identity service cannot be
// reached. It gets an envelope only when identity-context-svc accepted it too,
// and the response says which (`identityProvider`).

import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionForUser,
  encodeSession,
  findUserByCredentials,
  sessionCookieOptions,
  type SessionPayload,
} from "@/lib/auth";
import { authenticate, resolveIdentity } from "@/lib/api/identity";
import {
  LOGIN_TX_COOKIE,
  LOGIN_TX_COOKIE_PATH,
  LOGIN_TX_MAX_AGE_SECONDS,
  decodeLoginTransaction,
  encodeLoginTransaction,
  oidcConfig,
  publicOrigin,
  type LoginTransaction,
  type OidcConfig,
} from "@/lib/oidc";
import { beginPasswordSignIn, continueWithCode, type PasswordSignInOutcome } from "@/lib/oidc-password";

type LoginBody = { email?: unknown; password?: unknown; code?: unknown };

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

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as LoginBody | null;
  const cfg = oidcConfig();
  if (cfg) return oidcLogin(request, cfg, body);

  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  return passwordExchangeLogin(email, password);
}

// ─── Through the identity service's authorization-code login ────────────────

const REFUSALS: Record<string, { status: number; error: string }> = {
  invalid_credentials: { status: 401, error: "Invalid email or password." },
  invalid_code: { status: 401, error: "That code wasn't accepted. Enter the current code from your authenticator app." },
  throttled: { status: 429, error: "Too many sign-in attempts. Wait a few minutes and try again." },
  passkey_required: {
    status: 409,
    error: "This account signs in with a passkey, which this form can't use. Continue on the identity sign-in page.",
  },
  mfa_not_enrolled: {
    status: 403,
    error: "Your organisation requires two-step verification and none is set up for this account. Contact your administrator.",
  },
  not_interactive: { status: 403, error: "This account can't sign in interactively." },
  expired: { status: 400, error: "That sign-in took too long. Enter your email and password again." },
};

async function oidcLogin(request: NextRequest, cfg: OidcConfig, body: LoginBody | null): Promise<NextResponse> {
  const code = typeof body?.code === "string" ? body.code.replace(/\s+/g, "") : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  let outcome: PasswordSignInOutcome;
  if (code) {
    const tx = decodeLoginTransaction(request.cookies.get(LOGIN_TX_COOKIE)?.value);
    if (!tx) return withTx(NextResponse.json({ ...REFUSALS.expired, restart: true }, { status: 400 }), null);
    outcome = await continueWithCode(cfg, tx, code);
  } else {
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }
    outcome = await beginPasswordSignIn(cfg, publicOrigin(request), email, password);
  }

  switch (outcome.kind) {
    case "signed_in": {
      const response = NextResponse.json({
        success: true,
        identityProvider: "identity-context-svc",
        user: { email: outcome.session.email, name: outcome.session.name, role: outcome.session.role },
      });
      response.cookies.set(SESSION_COOKIE, encodeSession(outcome.session), sessionCookieOptions());
      return withTx(response, null);
    }
    case "second_factor":
      return withTx(NextResponse.json({ success: false, step: "code" }), outcome.tx);
    case "refused": {
      // As before the identity hop existed: a stack whose identity service
      // has no such account still lets a known local account in, without an
      // envelope.
      if (outcome.reason === "invalid_credentials" && !code) {
        const known = findUserByCredentials(email, password);
        if (known) {
          console.warn("[login] identity-context-svc refused a known local account; signing in locally", { email });
          return withTx(localSession(known), null);
        }
      }
      const refusal = REFUSALS[outcome.reason] ?? REFUSALS.invalid_credentials;
      const extra =
        outcome.reason === "passkey_required"
          ? { identityPage: "/api/auth/oidc/start?redirect=%2Fadmin" }
          : outcome.reason === "expired"
            ? { restart: true }
            : {};
      return withTx(
        NextResponse.json({ error: refusal.error, ...extra }, { status: refusal.status }),
        outcome.reason === "invalid_code" ? (outcome.tx ?? null) : null,
      );
    }
    case "unavailable": {
      // The no-lockout promise: a known local account still gets in while the
      // identity service is down — without an envelope, so services that
      // require a verified identity will refuse it until it is back.
      const known = !code ? findUserByCredentials(email, password) : null;
      if (known) {
        console.warn("[login] identity-context-svc unreachable; signing in with the local account list", { email });
        return withTx(localSession(known), null);
      }
      return withTx(
        NextResponse.json({ error: "The sign-in service isn't reachable right now. Try again shortly." }, { status: 503 }),
        null,
      );
    }
    case "failed":
      return withTx(
        NextResponse.json(
          {
            error:
              outcome.error === "context_unresolved"
                ? "You signed in, but your organisation context could not be established. Contact your administrator."
                : "Sign-in did not complete. Try again.",
          },
          { status: outcome.error === "context_unresolved" ? 403 : 502 },
        ),
        null,
      );
  }
}

/** Keep (or drop) the in-progress login between the password and the code. */
function withTx(response: NextResponse, tx: LoginTransaction | null): NextResponse {
  if (tx) {
    response.cookies.set(LOGIN_TX_COOKIE, encodeLoginTransaction(tx), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: LOGIN_TX_COOKIE_PATH,
      maxAge: LOGIN_TX_MAX_AGE_SECONDS,
    });
  } else {
    response.cookies.set(LOGIN_TX_COOKIE, "", { path: LOGIN_TX_COOKIE_PATH, maxAge: 0 });
  }
  return response;
}

function localSession(known: NonNullable<ReturnType<typeof findUserByCredentials>>): NextResponse {
  const session = createSessionForUser(known);
  const response = NextResponse.json({
    success: true,
    identityProvider: "local-credentials",
    user: { email: session.email, name: session.name, role: session.role, domain: known.domain },
  });
  response.cookies.set(SESSION_COOKIE, encodeSession(session), sessionCookieOptions(SESSION_MAX_AGE_SECONDS));
  return response;
}

// ─── Password exchange (no OIDC client configured) ──────────────────────────

async function passwordExchangeLogin(email: string, password: string): Promise<NextResponse> {
  const known = findUserByCredentials(email, password);
  const tenantId = known?.tenantId ?? process.env.ZOIKO_DEMO_TENANT_ID;

  let session: SessionPayload | null = null;
  let identityProvider: "identity-context-svc" | "local-credentials" = "local-credentials";

  if (tenantId) {
    // The console's confidential client (R-1), when configured. Server-only env.
    const clientId = process.env.IDENTITY_CONSOLE_CLIENT_ID;
    const clientSecret = process.env.IDENTITY_CONSOLE_CLIENT_SECRET;
    const auth = await authenticate({
      tenant_id: tenantId,
      email,
      password,
      ...(clientId && clientSecret ? { client_id: clientId, client_secret: clientSecret } : {}),
    });
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

  response.cookies.set(SESSION_COOKIE, encodeSession(session), sessionCookieOptions(SESSION_MAX_AGE_SECONDS));
  return response;
}
