// Guard for the developer routes that forward a request to a service port
// (/api/backend/dispatch, /api/backend/ping, /api/admin/service-inputs/dispatch).
//
// They live outside the proxy's /admin matcher, so this is the only check in
// front of them. They used to need no session, accept any local port, and stamp
// the demo tenant, principal and legal entity onto every request (or take
// whichever ones the browser sent). Now: a session is required, the identity
// headers are the session's, and the port must belong to a registered service.

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { registeredServicePorts } from "@/lib/api/config";

export type DispatchIdentity = { principalId: string; tenantId: string; legalEntityId: string };

/** Identity headers a caller may not set; the session's are used instead. */
const IDENTITY_HEADERS = ["x-tenant-id", "x-principal-id", "x-legal-entity-id", "authorization"];

export function dispatchIdentity(req: NextRequest): DispatchIdentity | NextResponse {
  const session = decodeSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session?.principalId || !session.tenantId) {
    return NextResponse.json({ ok: false, status: 401, error: "Sign in to use this API." }, { status: 401 });
  }
  return { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId };
}

/** The port as a number, or a 400 when it is not a registered service's port. */
export function dispatchPort(port: unknown): number | NextResponse {
  const n = typeof port === "number" ? port : parseInt(String(port ?? ""), 10);
  if (!Number.isInteger(n) || !registeredServicePorts().has(n)) {
    return NextResponse.json(
      { ok: false, status: 400, error: `Port ${String(port)} is not a registered service port.` },
      { status: 400 },
    );
  }
  return n;
}

/** Caller headers without identity headers, plus the session's identity. */
export function dispatchHeaders(identity: DispatchIdentity, callerHeaders: unknown = {}): Record<string, string> {
  const headers: Record<string, string> = {};
  if (callerHeaders && typeof callerHeaders === "object") {
    for (const [k, v] of Object.entries(callerHeaders as Record<string, unknown>)) {
      if (typeof v === "string" && !IDENTITY_HEADERS.includes(k.toLowerCase())) headers[k] = v;
    }
  }
  headers["X-Tenant-Id"] = identity.tenantId;
  headers["X-Principal-Id"] = identity.principalId;
  if (identity.legalEntityId) headers["X-Legal-Entity-Id"] = identity.legalEntityId;
  return headers;
}
