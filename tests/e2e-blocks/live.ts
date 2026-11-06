// Identity, session cookies and gateway seeding for the live Blocks 6-10 suite.
// See playwright.blocks.config.ts: everything here targets a verification
// stack under a tenant generated for this run.

import crypto from "node:crypto";
import { test, type APIRequestContext, type BrowserContext } from "@playwright/test";

export const LIVE = process.env.ZOIKO_LIVE_E2E === "1";
/** Skips the file unless the live suite was asked for. */
export function liveOnly() {
  test.skip(!LIVE, "set ZOIKO_LIVE_E2E=1 (and point ZOIKO_E2E_GATEWAY at a verification stack) to run");
}

const env = (k: string) => process.env[k] ?? "";
export const ID = {
  tenant: env("ZOIKO_E2E_TENANT"),
  entity: env("ZOIKO_E2E_ENTITY"),
  principal: env("ZOIKO_E2E_PRINCIPAL"),
  principal2: env("ZOIKO_E2E_PRINCIPAL_2"),
  otherTenant: env("ZOIKO_E2E_OTHER_TENANT"),
  otherEntity: env("ZOIKO_E2E_OTHER_ENTITY"),
};
export const GATEWAY = env("ZOIKO_E2E_GATEWAY");
export const TAG = crypto.randomUUID().slice(0, 8);
export const TODAY = new Date().toISOString().slice(0, 10);

/** A session cookie value, signed the way lib/auth.ts verifies it. */
export function sessionValue(principalId = ID.principal, tenantId = ID.tenant, legalEntityId = ID.entity): string {
  const payload = Buffer.from(
    JSON.stringify({
      email: "zv-e2e@zoikosuite.test",
      name: "zv e2e",
      role: "Platform Administrator",
      principalId,
      tenantId,
      legalEntityId,
      iat: Date.now(),
    }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", env("ZOIKO_E2E_SESSION_SECRET")).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export const cookieHeader = (value = sessionValue()) => ({ Cookie: `zoiko_session=${value}` });

export async function signIn(context: BrowserContext, value = sessionValue()) {
  await context.addCookies([{ name: "zoiko_session", value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
}

/** JSON from the console's /api/v1 proxy, as a given session. */
export async function consoleApi(
  request: APIRequestContext,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  session: string | null = sessionValue(),
) {
  const res = await request.fetch(`/api/v1/${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(session ? cookieHeader(session) : {}) },
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status(), json: json as Record<string, unknown> | null };
}

/**
 * Write a record straight to a service through the gateway, for the services
 * whose console panels only read (Blocks 8-10). It is how the panel gets a
 * record to show; the console reads it back through its own proxy.
 */
export async function seed(
  request: APIRequestContext,
  service: string,
  path: string,
  body: Record<string, unknown>,
  purpose = "verification",
) {
  const res = await request.post(`${GATEWAY}/${service}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-Id": ID.tenant,
      "X-Principal-Id": ID.principal,
      "X-Legal-Entity-Id": ID.entity,
      "X-Request-Id": crypto.randomUUID(),
      "X-Correlation-ID": crypto.randomUUID(),
      "X-Source-Channel": "web",
      "X-Purpose-Context": purpose,
      "Idempotency-Key": crypto.randomUUID(),
    },
    data: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status(), json: json as Record<string, unknown> | null };
}

/** The array under `key` in a proxy list response. */
export function list(json: Record<string, unknown> | null, key: string): Record<string, unknown>[] {
  const v = json?.[key];
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}
