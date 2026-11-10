// Sign-in from the console's own /login form, through identity-context-svc's
// authorization-code login — one page for the reader.
//
// The reader types email and password (and a two-step code when the account
// has one) into the console form. This server then walks the identity
// service's hosted login on their behalf — GET /oauth2/authorize, POST
// /oauth2/login, POST /oauth2/login/mfa — and exchanges the resulting code
// exactly as the browser callback would. The session is the same as the
// hosted page produces: an envelope plus a refresh token that proxy.ts renews
// it with, so it lasts its full eight hours.
//
// TRADE-OFF, CHOSEN DELIBERATELY (10 Nov 2026): the console server handles the
// password, which IAM §18 discourages for clients. What it costs:
//   - Passkey-only accounts and enterprise SSO cannot sign in on this form;
//     they are pointed at /api/auth/oidc/start (the identity service's page).
//   - identity-context-svc's per-IP login throttle (AUTH_RATE_IP_PER_MINUTE,
//     AUTH_FAIL_IP_LIMIT) sees every console sign-in as this server's address,
//     so failures by different people count against one budget.
//
// SERVER-ONLY.

import crypto from "crypto";
import type { SessionPayload } from "@/lib/auth";
import { REQUEST_TIMEOUT_MS } from "@/lib/api/config";
import {
  authorizeParams,
  backchannel,
  exchangeCode,
  newLoginTransaction,
  sessionFromTokens,
  type LoginTransaction,
  type OidcConfig,
} from "@/lib/oidc";

/** The hosted login's CSRF cookie (identity-context-svc internal/oidc/authorize.go). */
const CSRF_COOKIE = "zoiko_login_csrf";

export type RefusalReason =
  | "invalid_credentials"
  | "invalid_code"
  | "throttled"
  | "passkey_required"
  | "mfa_not_enrolled"
  | "not_interactive"
  | "expired";

export type PasswordSignInOutcome =
  | { kind: "signed_in"; session: SessionPayload }
  /** The account has two-step: ask for the code. `tx` must be kept for the next step. */
  | { kind: "second_factor"; tx: LoginTransaction }
  | { kind: "refused"; reason: RefusalReason; tx?: LoginTransaction }
  | { kind: "unavailable" }
  | { kind: "failed"; error: "signin_failed" | "context_unresolved" };

const timeout = () => AbortSignal.timeout(Math.max(REQUEST_TIMEOUT_MS, 8000));

/** Step one: open an authorization at the identity service and submit the password to it. */
export async function beginPasswordSignIn(
  cfg: OidcConfig,
  origin: string,
  email: string,
  password: string,
): Promise<PasswordSignInOutcome> {
  const tx = newLoginTransaction("/admin", `${origin}/api/auth/callback`);

  let res: Response;
  try {
    res = await fetch(backchannel(`/oauth2/authorize?${authorizeParams(cfg, tx, email).toString()}`), {
      redirect: "manual",
      headers: { "X-Correlation-ID": crypto.randomUUID() },
      signal: timeout(),
    });
  } catch {
    return { kind: "unavailable" };
  }
  const html = await res.text().catch(() => "");
  const pending = formValue(html, "pending");
  const csrf = formValue(html, "csrf");
  if (res.status !== 200 || !pending || !csrf) {
    console.warn("[login] identity service did not open a sign-in", { status: res.status, text: errorText(html) });
    return res.status >= 500 || res.status === 200 ? { kind: "unavailable" } : { kind: "failed", error: "signin_failed" };
  }

  return submit(cfg, { ...tx, pending, csrf }, "/oauth2/login", { email, password });
}

/** Step two, for an account with two-step: submit the authenticator code. */
export async function continueWithCode(
  cfg: OidcConfig,
  tx: LoginTransaction,
  code: string,
): Promise<PasswordSignInOutcome> {
  if (!tx.pending || !tx.csrf) return { kind: "refused", reason: "expired" };
  return submit(cfg, tx, "/oauth2/login/mfa", { code });
}

async function submit(
  cfg: OidcConfig,
  tx: LoginTransaction,
  path: "/oauth2/login" | "/oauth2/login/mfa",
  fields: Record<string, string>,
): Promise<PasswordSignInOutcome> {
  let res: Response;
  try {
    res = await fetch(backchannel(path), {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `${CSRF_COOKIE}=${tx.csrf}`,
        "X-Correlation-ID": crypto.randomUUID(),
      },
      body: new URLSearchParams({ pending: tx.pending ?? "", csrf: tx.csrf ?? "", ...fields }).toString(),
      signal: timeout(),
    });
  } catch {
    return { kind: "unavailable" };
  }

  // Login complete: the identity service redirects to the callback with a code.
  if (res.status >= 300 && res.status < 400) {
    return finish(cfg, tx, res.headers.get("location"));
  }

  const html = await res.text().catch(() => "");
  const error = errorText(html);

  // The page asked for a second factor (or re-asked after a wrong code).
  if (html.includes('action="/oauth2/login/mfa"')) {
    const next: LoginTransaction = {
      ...tx,
      pending: formValue(html, "pending") ?? tx.pending,
      csrf: formValue(html, "csrf") ?? tx.csrf,
    };
    if (path === "/oauth2/login/mfa" && error) return { kind: "refused", reason: "invalid_code", tx: next };
    return { kind: "second_factor", tx: next };
  }
  if (html.includes('id="pk"')) return { kind: "refused", reason: "passkey_required" };
  if (res.status === 429) return { kind: "refused", reason: "throttled" };
  if (res.status >= 500) return { kind: "unavailable" };

  const text = error ?? "";
  if (/none is enrolled/i.test(text)) return { kind: "refused", reason: "mfa_not_enrolled" };
  if (/cannot sign in interactively/i.test(text)) return { kind: "refused", reason: "not_interactive" };
  if (/start again|expired/i.test(text)) return { kind: "refused", reason: "expired" };
  if (res.status === 401 || /sign-in failed/i.test(text)) return { kind: "refused", reason: "invalid_credentials" };

  console.warn("[login] identity service answered the sign-in unexpectedly", { status: res.status, text });
  return { kind: "failed", error: "signin_failed" };
}

/** Read the redirect the identity service sent the "browser" to, and exchange its code. */
async function finish(cfg: OidcConfig, tx: LoginTransaction, location: string | null): Promise<PasswordSignInOutcome> {
  let params: URLSearchParams;
  try {
    params = new URL(location ?? "").searchParams;
  } catch {
    return { kind: "failed", error: "signin_failed" };
  }
  const iss = params.get("iss");
  if (params.get("state") !== tx.state || (iss && iss !== cfg.issuer) || params.get("error")) {
    console.warn("[login] identity service redirect was refused", { error: params.get("error"), iss });
    return { kind: "failed", error: "signin_failed" };
  }
  const code = params.get("code");
  if (!code) return { kind: "failed", error: "signin_failed" };

  const tokens = await exchangeCode(cfg, code, tx);
  if (!tokens.ok) {
    console.warn("[login] authorization code exchange failed", { error: tokens.error });
    return tokens.kind === "unavailable" ? { kind: "unavailable" } : { kind: "failed", error: "signin_failed" };
  }
  const signed = await sessionFromTokens(cfg, tokens.data, tx.nonce);
  if (signed.ok) return { kind: "signed_in", session: signed.session };
  return signed.error === "identity_unavailable" ? { kind: "unavailable" } : { kind: "failed", error: signed.error };
}

/** A hidden input's value on the hosted login page. Its tokens are base64url, so no entity decoding is needed. */
function formValue(html: string, name: string): string | undefined {
  return html.match(new RegExp(`name="${name}" value="([^"]+)"`))?.[1];
}

/** The hosted page's error line, if it shows one. */
function errorText(html: string): string | undefined {
  const raw = html.match(/<p class="err" role="alert">([\s\S]*?)<\/p>/)?.[1] ?? html.match(/<p>([\s\S]*?)<\/p>/)?.[1];
  return raw
    ?.replace(/&#39;/g, "'")
    .replace(/&#34;|&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .trim();
}
