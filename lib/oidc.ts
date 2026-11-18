// The console as an OpenID Connect relying party of identity-context-svc
// (AU-06 authorization code flow, AU-10 refresh rotation).
//
// WHY THIS EXISTS. identity-context-svc signs the identity envelope with a
// 300-second lifetime (ENVELOPE_JWT_TTL_SECONDS); the console's session cookie
// lives eight hours. The password login (POST /v1/authenticate) returns no
// refresh token, so nothing could renew the envelope: five minutes after sign-in
// every envelope-verified call answered 401 identity_assertion_invalid ("token
// is expired") and the console told the reader the service "no longer accepts
// this session".
//
// Signing in through /oauth2/authorize (PKCE S256, offline_access) yields a
// refresh token bound to the console's confidential client. proxy.ts trades it
// for a fresh access token and re-resolves the envelope shortly before the old
// one expires, so a session lasts as long as the login session behind it.
//
// SERVER-ONLY. This module reads the client secret. Never import it from a
// "use client" component.

import crypto from "crypto";
import { REQUEST_TIMEOUT_MS, serviceUrl } from "@/lib/api/config";
import { resolveIdentity } from "@/lib/api/identity";
import {
  DEMO_IDENTITY,
  encodeSession,
  findAccountByEmail,
  signSessionPayload,
  type SessionPayload,
} from "@/lib/auth";

// ─── Configuration ───────────────────────────────────────────────────────────

export type OidcConfig = {
  /** The issuer as the BROWSER reaches it — authorize and logout redirects, and the `iss` checks. */
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Pre-selects the organisation on the hosted login page. */
  tenantHint?: string;
};

export const OIDC_SCOPE = "openid profile email offline_access";

/**
 * The console's OIDC client, or null when sign-in should stay on the
 * password route. Enabled whenever the confidential client is configured —
 * the same IDENTITY_CONSOLE_CLIENT_ID/SECRET the password route already
 * presents; identity-context-svc registers "zoiko-console" in both registries.
 * ZOIKO_OIDC_LOGIN=off turns it off without removing the client.
 */
export function oidcConfig(): OidcConfig | null {
  if (process.env.ZOIKO_OIDC_LOGIN === "off") return null;
  const clientId = process.env.IDENTITY_CONSOLE_CLIENT_ID?.trim();
  const clientSecret = process.env.IDENTITY_CONSOLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const demoTenant = process.env.NODE_ENV === "production" ? undefined : DEMO_IDENTITY.tenantId;
  return {
    issuer: stripTrailingSlash(process.env.ZOIKO_OIDC_ISSUER ?? "http://localhost:8080"),
    clientId,
    clientSecret,
    tenantHint: process.env.ZOIKO_OIDC_TENANT_ID ?? process.env.ZOIKO_DEMO_TENANT_ID ?? demoTenant,
  };
}

/**
 * Where this server reaches the token, revocation and logout endpoints. The
 * same host as the issuer, but by the address the server uses (127.0.0.1
 * locally, the gateway prefix when ZOIKO_USE_GATEWAY is on), not the browser's.
 */
export function backchannel(path: string): string {
  return `${serviceUrl("identityContext")}${path}`;
}

/** The console's own origin as the browser sees it. ZOIKO_PUBLIC_URL wins behind a proxy. */
export function publicOrigin(request: { nextUrl: { origin: string } }): string {
  const configured = process.env.ZOIKO_PUBLIC_URL?.trim();
  return configured ? configured.replace(/\/+$/, "") : request.nextUrl.origin;
}

/** Whether identity-context-svc answers at all, so sign-in can fall back instead of stranding the reader. */
export async function identityReachable(): Promise<boolean> {
  try {
    const res = await fetch(backchannel("/.well-known/openid-configuration"), {
      signal: AbortSignal.timeout(Math.max(REQUEST_TIMEOUT_MS, 2000)),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── The login transaction (state, nonce, PKCE) ──────────────────────────────

/** Holds the login transaction between /api/auth/oidc/start and /api/auth/callback. */
export const LOGIN_TX_COOKIE = "zoiko_oidc_tx";
export const LOGIN_TX_MAX_AGE_SECONDS = 600;
export const LOGIN_TX_COOKIE_PATH = "/api/auth";

export type LoginTransaction = {
  state: string;
  nonce: string;
  /** PKCE code_verifier (RFC 7636). Never leaves this server except to the token endpoint. */
  verifier: string;
  /** Console path to land on after sign-in. Always under /admin. */
  redirect: string;
  /** The exact redirect_uri sent to /oauth2/authorize; the token request must repeat it. */
  redirectUri: string;
  createdAt: number;
  /**
   * The hosted login's pending-authorization id and form CSRF token, held
   * between the password and the two-step code when the console form drives
   * the login (lib/oidc-password.ts).
   */
  pending?: string;
  csrf?: string;
};

function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** RFC 7636 §4.2, S256. */
export function codeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

/** Only console paths, so the callback cannot be turned into an open redirect. */
export function safeRedirect(target: string | null | undefined): string {
  if (!target || !target.startsWith("/admin") || target.startsWith("//") || target.includes("\\")) return "/admin";
  return target;
}

export function newLoginTransaction(redirect: string, redirectUri: string): LoginTransaction {
  return {
    state: randomToken(),
    nonce: randomToken(),
    verifier: randomToken(48),
    redirect: safeRedirect(redirect),
    redirectUri,
    createdAt: Date.now(),
  };
}

/** Signed with the session secret: the browser holds it, so it must not be editable. */
export function encodeLoginTransaction(tx: LoginTransaction): string {
  const body = Buffer.from(JSON.stringify(tx), "utf-8").toString("base64url");
  return `${body}.${signSessionPayload(`oidc-tx:${body}`)}`;
}

export function decodeLoginTransaction(value: string | undefined | null, now: number = Date.now()): LoginTransaction | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  if (!timingSafeEqualString(value.slice(dot + 1), signSessionPayload(`oidc-tx:${body}`))) return null;
  try {
    const tx = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as LoginTransaction;
    if (!tx.state || !tx.nonce || !tx.verifier || !tx.redirectUri) return null;
    if (now - tx.createdAt > LOGIN_TX_MAX_AGE_SECONDS * 1000 || tx.createdAt > now + 60_000) return null;
    return { ...tx, redirect: safeRedirect(tx.redirect) };
  } catch {
    return null;
  }
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function authorizeUrl(cfg: OidcConfig, tx: LoginTransaction, loginHint?: string): string {
  return `${cfg.issuer}/oauth2/authorize?${authorizeParams(cfg, tx, loginHint).toString()}`;
}

export function authorizeParams(cfg: OidcConfig, tx: LoginTransaction, loginHint?: string): URLSearchParams {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: tx.redirectUri,
    scope: OIDC_SCOPE,
    state: tx.state,
    nonce: tx.nonce,
    code_challenge: codeChallenge(tx.verifier),
    code_challenge_method: "S256",
  });
  if (cfg.tenantHint) params.set("tenant", cfg.tenantHint);
  if (loginHint) params.set("login_hint", loginHint);
  return params;
}

// ─── Token endpoint ──────────────────────────────────────────────────────────

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
};

/**
 * `rejected` — the provider answered and said no (invalid_grant: the code or
 * refresh token is spent, expired, or its login session ended). Retrying with
 * the same input cannot succeed. `unavailable` — no answer, or a 5xx/429.
 */
export type TokenResult =
  | { ok: true; data: TokenResponse }
  | { ok: false; kind: "rejected" | "unavailable"; error: string };

/** client_secret_basic (RFC 6749 §2.3.1): both halves form-urlencoded first. */
function basicAuth(cfg: OidcConfig): string {
  const encode = (s: string) => encodeURIComponent(s).replace(/%20/g, "+");
  return `Basic ${Buffer.from(`${encode(cfg.clientId)}:${encode(cfg.clientSecret)}`).toString("base64")}`;
}

async function formPost(cfg: OidcConfig, path: string, form: Record<string, string>): Promise<Response> {
  return fetch(backchannel(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: basicAuth(cfg),
      "X-Correlation-ID": crypto.randomUUID(),
    },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(Math.max(REQUEST_TIMEOUT_MS, 5000)),
  });
}

async function tokenRequest(cfg: OidcConfig, form: Record<string, string>): Promise<TokenResult> {
  let res: Response;
  try {
    res = await formPost(cfg, "/oauth2/token", form);
  } catch (cause) {
    return { ok: false, kind: "unavailable", error: cause instanceof Error ? cause.message : "unreachable" };
  }
  const body = (await res.json().catch(() => null)) as (TokenResponse & { error?: string; error_description?: string }) | null;
  if (res.ok && body?.access_token) return { ok: true, data: body };
  const error = [body?.error, body?.error_description].filter(Boolean).join(": ") || `status ${res.status}`;
  const kind = res.status >= 500 || res.status === 429 || (res.ok && !body?.access_token) ? "unavailable" : "rejected";
  return { ok: false, kind, error };
}

export function exchangeCode(cfg: OidcConfig, code: string, tx: LoginTransaction): Promise<TokenResult> {
  return tokenRequest(cfg, {
    grant_type: "authorization_code",
    code,
    code_verifier: tx.verifier,
    redirect_uri: tx.redirectUri,
  });
}

function refreshGrant(cfg: OidcConfig, refreshToken: string): Promise<TokenResult> {
  return tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken });
}

// ─── ID token ────────────────────────────────────────────────────────────────

export type IdTokenClaims = {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  nonce?: string;
  sid?: string;
  tenant_id: string;
  email?: string;
  name?: string;
};

export function jwtPayload<T>(jwt: string | undefined): T | null {
  try {
    const part = jwt?.split(".")[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part, "base64url").toString("utf-8")) as T;
  } catch {
    return null;
  }
}

/**
 * Check the ID token's claims (OIDC Core §3.1.3.7): issuer, audience, nonce,
 * expiry, and that it names a principal and tenant.
 *
 * The signature is not checked, and §3.1.3.7 item 6 permits that here: the
 * token came straight from the token endpoint over a back channel this server
 * authenticated to with the client secret, not through the browser. Nothing
 * downstream trusts it either — the envelope the services verify comes from
 * /v1/context/resolve, which verifies the access token itself.
 */
export function readIdToken(
  idToken: string | undefined,
  cfg: OidcConfig,
  nonce: string,
  nowSeconds: number = Date.now() / 1000,
): IdTokenClaims | null {
  const claims = jwtPayload<IdTokenClaims>(idToken);
  if (!claims) return null;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== cfg.issuer) return null;
  if (!audiences.includes(cfg.clientId)) return null;
  if (!claims.nonce || !timingSafeEqualString(claims.nonce, nonce)) return null;
  if (typeof claims.exp !== "number" || claims.exp < nowSeconds - 60) return null;
  if (!claims.sub || !claims.tenant_id) return null;
  return claims;
}

// ─── Envelope ────────────────────────────────────────────────────────────────

export type EnvelopeResult =
  | { ok: true; envelopeJwt: string; sessionContextId?: string; expiresAt?: number }
  | { ok: false; kind: "rejected" | "unavailable"; message: string };

/** Trade an access token for the signed identity envelope every service verifies. */
export async function resolveEnvelope(
  accessToken: string,
  who: { principalId: string; tenantId: string; legalEntityId: string },
): Promise<EnvelopeResult> {
  const resolved = await resolveIdentity({
    request: { bearer_token: accessToken, legal_entity_id: who.legalEntityId, correlation_id: crypto.randomUUID() },
    callerIdentity: { principalId: who.principalId, tenantId: who.tenantId },
  });
  if (!resolved.ok) {
    const status = resolved.error.status;
    const rejected = status !== undefined && status >= 400 && status < 500 && status !== 429;
    return { ok: false, kind: rejected ? "rejected" : "unavailable", message: resolved.error.message };
  }
  const claims = jwtPayload<{ exp?: number; session_trust_posture?: { session_context_id?: string } }>(
    resolved.data.envelope_jwt,
  );
  return {
    ok: true,
    envelopeJwt: resolved.data.envelope_jwt,
    sessionContextId: resolved.data.session_context_id ?? claims?.session_trust_posture?.session_context_id,
    expiresAt: resolved.data.expires_at ?? claims?.exp,
  };
}

// ─── Sign-in completion ──────────────────────────────────────────────────────

export type SignInResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; error: "signin_failed" | "identity_unavailable" | "context_unresolved" };

/**
 * Turn a token response from a code exchange into the console session: check
 * the ID token, resolve the envelope, and keep the refresh token proxy.ts
 * renews it with. Shared by the browser callback and the console form.
 */
export async function sessionFromTokens(cfg: OidcConfig, tokens: TokenResponse, nonce: string): Promise<SignInResult> {
  const claims = readIdToken(tokens.id_token, cfg, nonce);
  if (!claims) {
    console.warn("[login] ID token failed its checks (issuer, audience, nonce or expiry)");
    return { ok: false, error: "signin_failed" };
  }
  if (!tokens.refresh_token) {
    // Without one the envelope cannot be renewed, and the session ends when
    // the envelope does (five minutes). Usually means the client lost the
    // refresh_token grant or offline_access in oidc-clients.local.json.
    console.warn("[login] no refresh token issued; this session cannot be renewed", { sub: claims.sub });
  }

  const known = findAccountByEmail(claims.email);
  const legalEntityId = known?.legalEntityId ?? process.env.ZOIKO_DEFAULT_LEGAL_ENTITY_ID ?? "";
  const envelope = await resolveEnvelope(tokens.access_token, {
    principalId: claims.sub,
    tenantId: claims.tenant_id,
    legalEntityId,
  });
  if (!envelope.ok) {
    console.warn("[login] signed in, but the identity context could not be resolved", {
      sub: claims.sub,
      error: envelope.message,
    });
    return { ok: false, error: envelope.kind === "unavailable" ? "identity_unavailable" : "context_unresolved" };
  }

  return {
    ok: true,
    session: {
      email: claims.email ?? known?.email ?? claims.sub,
      name: known?.name ?? claims.name ?? claims.email ?? "Signed-in user",
      role: known?.role ?? "Principal",
      principalId: claims.sub,
      tenantId: claims.tenant_id,
      legalEntityId,
      iat: Date.now(),
      envelopeJwt: envelope.envelopeJwt,
      sessionContextId: envelope.sessionContextId,
      envelopeExpiresAt: envelope.expiresAt,
      refreshToken: tokens.refresh_token,
    },
  };
}

// ─── Renewal ─────────────────────────────────────────────────────────────────

/** Renew this long before the envelope expires, so a request never sets out with one about to lapse. */
export const RENEW_MARGIN_SECONDS = 60;

/** Unix seconds at which the session's envelope expires, if it has one. */
export function envelopeExpiry(session: SessionPayload): number | undefined {
  if (!session.envelopeJwt) return undefined;
  return session.envelopeExpiresAt ?? jwtPayload<{ exp?: number }>(session.envelopeJwt)?.exp;
}

/** True when the session carries an envelope that has expired or is about to. */
export function envelopeNeedsRenewal(session: SessionPayload, nowSeconds: number = Date.now() / 1000): boolean {
  if (!session.envelopeJwt) return false;
  const exp = envelopeExpiry(session);
  return exp === undefined || exp - nowSeconds <= RENEW_MARGIN_SECONDS;
}

export function envelopeExpired(session: SessionPayload, nowSeconds: number = Date.now() / 1000): boolean {
  if (!session.envelopeJwt) return false;
  const exp = envelopeExpiry(session);
  return exp === undefined || exp <= nowSeconds;
}

/**
 * `ended` — the login session is over (logged out elsewhere, revoked, idle
 * past OIDC_REFRESH_IDLE_SECONDS, or past its absolute lifetime); the reader
 * has to sign in again. `unavailable` — identity-context-svc did not answer;
 * nothing is known either way.
 */
export type RenewalOutcome =
  | { ok: true; session: SessionPayload; cookie: string }
  | { ok: false; reason: "ended" | "unavailable" };

type RenewalState = {
  inflight: Map<string, Promise<RenewalOutcome>>;
  settled: Map<string, { outcome: RenewalOutcome; until: number }>;
};

// On globalThis so a dev-server module reload does not forget a rotation that
// already happened.
const renewalState: RenewalState = ((globalThis as { __zoikoEnvelopeRenewal?: RenewalState }).__zoikoEnvelopeRenewal ??= {
  inflight: new Map(),
  settled: new Map(),
});

/** How long a settled renewal is replayed to requests still carrying the old cookie. */
const SETTLED_TTL_MS = { ok: 5 * 60_000, ended: 5 * 60_000, unavailable: 5_000 } as const;

/**
 * Renew the session's envelope with its refresh token — once.
 *
 * Refresh tokens rotate, and identity-context-svc treats a second use of the
 * same one as theft: it revokes the family and ENDS the login session
 * (RotateRefreshToken, RFC 9700 §4.14.2). A page load sends many requests
 * through proxy.ts at once, all carrying the same cookie, and requests already
 * in flight keep carrying it after the browser has the new one. So every caller
 * presenting the same refresh token shares one renewal, and its result is
 * replayed to latecomers for a few minutes instead of the token being sent
 * again.
 *
 * The dedupe is per process. Behind more than one console instance the same
 * cookie must reach the same instance (sticky sessions), or this needs a
 * shared store.
 */
export function renewSession(session: SessionPayload, now: number = Date.now()): Promise<RenewalOutcome> {
  const refreshToken = session.refreshToken;
  if (!refreshToken) return Promise.resolve({ ok: false, reason: "ended" });
  const key = crypto.createHash("sha256").update(refreshToken).digest("hex");

  for (const [k, v] of renewalState.settled) if (v.until <= now) renewalState.settled.delete(k);
  const settled = renewalState.settled.get(key);
  if (settled) return Promise.resolve(settled.outcome);
  const pending = renewalState.inflight.get(key);
  if (pending) return pending;

  const run = performRenewal(session, refreshToken)
    .catch((): RenewalOutcome => ({ ok: false, reason: "unavailable" }))
    .then((outcome) => {
      renewalState.inflight.delete(key);
      const ttl = outcome.ok ? SETTLED_TTL_MS.ok : SETTLED_TTL_MS[outcome.reason];
      renewalState.settled.set(key, { outcome, until: Date.now() + ttl });
      return outcome;
    });
  renewalState.inflight.set(key, run);
  return run;
}

async function performRenewal(session: SessionPayload, refreshToken: string): Promise<RenewalOutcome> {
  const cfg = oidcConfig();
  if (!cfg) return { ok: false, reason: "ended" };

  const tokens = await refreshGrant(cfg, refreshToken);
  if (!tokens.ok) {
    if (tokens.kind === "rejected") {
      console.warn("[session] refresh token refused; the session has ended", { email: session.email, error: tokens.error });
    }
    return { ok: false, reason: tokens.kind === "rejected" ? "ended" : "unavailable" };
  }
  // The old token is spent from here on. Keep the rotated one even if the
  // envelope cannot be resolved below, or the next attempt would replay the
  // spent token and end the session.
  const rotated: SessionPayload = { ...session, refreshToken: tokens.data.refresh_token ?? refreshToken };

  const envelope = await resolveEnvelope(tokens.data.access_token, {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  });
  if (!envelope.ok) {
    if (envelope.kind === "rejected") {
      console.warn("[session] envelope could not be re-resolved; the session has ended", {
        email: session.email,
        error: envelope.message,
      });
      return { ok: false, reason: "ended" };
    }
    return { ok: true, session: rotated, cookie: encodeSession(rotated) };
  }

  const next: SessionPayload = {
    ...rotated,
    envelopeJwt: envelope.envelopeJwt,
    envelopeExpiresAt: envelope.expiresAt,
    sessionContextId: envelope.sessionContextId ?? session.sessionContextId,
  };
  return { ok: true, session: next, cookie: encodeSession(next) };
}

// ─── Logout ──────────────────────────────────────────────────────────────────

/**
 * End the session at identity-context-svc from the server side.
 *
 * POST /v1/logout ends the login session (sid) itself — its refresh tokens,
 * every envelope resolved under it, and the SSO session the hosted page would
 * otherwise reuse — but it needs a live envelope, so a lapsed one is renewed
 * first. The refresh family is then revoked (RFC 7009) as a second line, in
 * case the logout call did not get through. Best effort throughout: the cookie
 * is dropped either way.
 */
export async function endOidcSession(cfg: OidcConfig, session: SessionPayload): Promise<void> {
  let current = session;
  if (current.refreshToken && envelopeNeedsRenewal(current)) {
    const renewed = await renewSession(current).catch(() => null);
    if (renewed?.ok) current = renewed.session;
  }
  if (current.envelopeJwt && !envelopeExpired(current)) {
    await fetch(backchannel("/v1/logout"), {
      method: "POST",
      headers: { Authorization: `Bearer ${current.envelopeJwt}`, "X-Correlation-ID": crypto.randomUUID() },
      signal: AbortSignal.timeout(Math.max(REQUEST_TIMEOUT_MS, 3000)),
    }).catch(() => undefined);
  }
  if (current.refreshToken) {
    await formPost(cfg, "/oauth2/revoke", { token: current.refreshToken, token_type_hint: "refresh_token" }).catch(
      () => undefined,
    );
  }
}

/** Test hook: forget every remembered renewal. */
export function resetRenewalStateForTests(): void {
  renewalState.inflight.clear();
  renewalState.settled.clear();
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
