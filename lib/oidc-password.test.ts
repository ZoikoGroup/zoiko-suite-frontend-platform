// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beginPasswordSignIn, continueWithCode } from "@/lib/oidc-password";
import { oidcConfig } from "@/lib/oidc";

const ISSUER = "http://localhost:8080";
const ORIGIN = "http://localhost:3000";
const PRINCIPAL = "33333333-3333-3333-3333-333333333333";
const TENANT = "11111111-1111-1111-1111-111111111111";

function jwt(payload: Record<string, unknown>): string {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${b64({ alg: "RS256" })}.${b64(payload)}.c2ln`;
}

const loginPage = (pending: string, csrf: string, error = "") =>
  `<form method="post" action="/oauth2/login"><input type="hidden" name="pending" value="${pending}">` +
  `<input type="hidden" name="csrf" value="${csrf}"></form>${error ? `<p class="err" role="alert">${error}</p>` : ""}`;
const mfaPage = (pending: string, csrf: string, error = "") =>
  `<form method="post" action="/oauth2/login/mfa" autocomplete="off"><input type="hidden" name="pending" value="${pending}">` +
  `<input type="hidden" name="csrf" value="${csrf}"></form>${error ? `<p class="err" role="alert">${error}</p>` : ""}`;

/** A fake identity-context-svc hosted login, token endpoint and resolve. */
function fakeIdentity(opts: { password?: string; totp?: string } = {}) {
  const password = opts.password ?? "right";
  let authorize: URLSearchParams | null = null;
  const seen: { path: string; cookie: string | null; form: URLSearchParams }[] = [];

  const redirectWithCode = () => {
    const target = new URL(authorize!.get("redirect_uri")!);
    target.searchParams.set("code", "code-1");
    target.searchParams.set("iss", ISSUER);
    target.searchParams.set("state", authorize!.get("state")!);
    return new Response(null, { status: 302, headers: { Location: target.toString() } });
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const form = new URLSearchParams(String(init?.body ?? ""));
      const cookie = new Headers(init?.headers).get("cookie");
      seen.push({ path: url.pathname, cookie, form });
      switch (url.pathname) {
        case "/oauth2/authorize":
          authorize = url.searchParams;
          return new Response(loginPage("p-1", "c-1"), { status: 200 });
        case "/oauth2/login":
          if (form.get("password") !== password) {
            return new Response(loginPage("p-1", "c-1", "Sign-in failed. Check your details and try again."), { status: 401 });
          }
          return opts.totp ? new Response(mfaPage("p-1", "c-1"), { status: 200 }) : redirectWithCode();
        case "/oauth2/login/mfa":
          if (form.get("code") !== opts.totp) {
            return new Response(mfaPage("p-1", "c-1", "That code was not accepted. Try the current code."), { status: 200 });
          }
          return redirectWithCode();
        case "/oauth2/token":
          return Response.json({
            access_token: "access-1",
            token_type: "Bearer",
            expires_in: 300,
            refresh_token: "refresh-1",
            id_token: jwt({
              iss: ISSUER,
              aud: "zoiko-console",
              sub: PRINCIPAL,
              tenant_id: TENANT,
              email: "admin@zoikosuite.com",
              nonce: authorize!.get("nonce"),
              exp: Math.floor(Date.now() / 1000) + 300,
            }),
          });
        case "/v1/context/resolve":
          return Response.json({ envelope_jwt: jwt({ exp: Math.floor(Date.now() / 1000) + 300 }), session_context_id: "ctx-1" });
        default:
          throw new Error(`unexpected ${url.pathname}`);
      }
    }),
  );
  return seen;
}

beforeEach(() => {
  vi.stubEnv("IDENTITY_CONSOLE_CLIENT_ID", "zoiko-console");
  vi.stubEnv("IDENTITY_CONSOLE_CLIENT_SECRET", "local-dev-console-client-secret");
  vi.stubEnv("ZOIKO_OIDC_ISSUER", ISSUER);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("console-form sign-in through the identity service", () => {
  it("signs in with email and password and keeps a refresh token", async () => {
    const seen = fakeIdentity();

    const outcome = await beginPasswordSignIn(oidcConfig()!, ORIGIN, "admin@zoikosuite.com", "right");

    expect(outcome.kind).toBe("signed_in");
    if (outcome.kind !== "signed_in") return;
    expect(outcome.session.refreshToken).toBe("refresh-1");
    expect(outcome.session.principalId).toBe(PRINCIPAL);
    expect(outcome.session.role).toBe("Platform Administrator");
    // The hosted form's CSRF cookie and token were presented, and the code
    // was exchanged with the PKCE verifier for the registered callback.
    const login = seen.find((s) => s.path === "/oauth2/login")!;
    expect(login.cookie).toBe("zoiko_login_csrf=c-1");
    expect(login.form.get("pending")).toBe("p-1");
    const token = seen.find((s) => s.path === "/oauth2/token")!;
    expect(token.form.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/callback`);
    expect(token.form.get("code_verifier")).toBeTruthy();
  });

  it("reports a wrong password as invalid credentials", async () => {
    fakeIdentity();

    const outcome = await beginPasswordSignIn(oidcConfig()!, ORIGIN, "admin@zoikosuite.com", "wrong");

    expect(outcome).toEqual({ kind: "refused", reason: "invalid_credentials" });
  });

  it("asks for the two-step code, refuses a wrong one, and signs in with the right one", async () => {
    fakeIdentity({ totp: "123456" });

    const first = await beginPasswordSignIn(oidcConfig()!, ORIGIN, "admin@zoikosuite.com", "right");
    expect(first.kind).toBe("second_factor");
    if (first.kind !== "second_factor") return;
    expect(first.tx.pending).toBe("p-1");

    const wrong = await continueWithCode(oidcConfig()!, first.tx, "000000");
    expect(wrong.kind).toBe("refused");
    if (wrong.kind !== "refused") return;
    expect(wrong.reason).toBe("invalid_code");

    const right = await continueWithCode(oidcConfig()!, wrong.tx!, "123456");
    expect(right.kind).toBe("signed_in");
  });

  it("is unavailable when the identity service does not answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));

    expect(await beginPasswordSignIn(oidcConfig()!, ORIGIN, "a@b.c", "x")).toEqual({ kind: "unavailable" });
  });
});
