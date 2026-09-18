import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  authenticate,
  resolveIdentity,
  getSession,
  explainContextResolution,
  invalidateSession,
  getPrincipal,
  getPrincipalRoles,
  getPrincipalDelegations,
  updatePrincipalStatus,
  refreshTenantContextCache,
  invalidateTenantContext,
  attachSupportContext,
  getSupportContext,
  revokeSupportContext,
  getJWKS,
  getIdentityHealth,
  type AttachSupportContextRequest,
  type AuthenticateRequest,
  type InvalidateSessionRequest,
  type InvalidateTenantContextRequest,
  type PrincipalStatus,
  type RefreshCacheRequest,
  type ResolveRequest,
} from "@/lib/api/identity";
import type { ApiResult, ApiWriteResult } from "@/lib/api/client";

// Server-side gateway between the identity console and identity-context-svc.
//
// The console page is a "use client" component, and lib/api/identity.ts is a
// server-only module by design (backend hostnames never reach the browser). A
// client page therefore must NOT call those functions directly — in the browser
// process.env is not inlined, serviceUrl() falls back to the hardcoded :8080,
// and the fetch gets blocked by CORS before it can reach the service.
//
// This route is the read-through for the console, mirroring the pattern the
// other client pages use through app/api/v1/[...path]: the identity forwarded
// downstream comes from the VERIFIED SESSION and nowhere else. The one
// endpoint that must work pre-session — POST /v1/authenticate, which is
// contract-exempt for exactly this reason — is the only gated-op exception,
// and /health + /.well-known/jwks.json are public by contract. Every other
// operation answers 401 without a session.

const FALLBACK_ENTITY_ID = "22222222-2222-2222-2222-222222222222";

type SessionIdentity = {
  tenantId: string;
  principalId: string;
  legalEntityId: string;
};

async function sessionIdentity(): Promise<SessionIdentity | null> {
  try {
    const store = await cookies();
    const session = decodeSession(store.get(SESSION_COOKIE)?.value);
    if (!session?.tenantId || !session?.principalId) return null;
    return {
      tenantId: session.tenantId,
      principalId: session.principalId,
      legalEntityId: session.legalEntityId || FALLBACK_ENTITY_ID,
    };
  } catch {
    return null;
  }
}

function refuse(status: number, message: string) {
  return NextResponse.json(
    { ok: false, error: { kind: "http" as const, status, message } },
    { status },
  );
}

function notFound(message = "unknown identity-context endpoint") {
  return refuse(404, message);
}

/** Normalise a lib/api result into the { ok, data | error } wire shape. */
function respond<T>(res: ApiResult<T> | ApiWriteResult<T>, successStatus?: number) {
  if (!res.ok) {
    const status = res.error.status && res.error.status >= 400 ? res.error.status : 502;
    return NextResponse.json({ ok: false, error: res.error }, { status });
  }
  const data = (res as { data?: T }).data ?? null;
  const writeStatus = "status" in res ? res.status : undefined;
  const status = successStatus ?? writeStatus ?? 200;
  return NextResponse.json({ ok: true, data }, { status: status === 204 ? 200 : status });
}

async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  return (await req.json().catch(() => ({}))) as Record<string, unknown>;
}

// ─── Public + session-lite ────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const rest = path[0] === "v1" ? path.slice(1) : path;

  // Public endpoints — no session required.
  if (rest.length === 1 && rest[0] === "health") return respond(await getIdentityHealth());
  if (rest.length === 2 && rest[0] === ".well-known" && rest[1] === "jwks.json") {
    return respond(await getJWKS());
  }

  const identity = await sessionIdentity();
  if (!identity) return refuse(401, "A verified session is required to read the identity console.");

  // GET /v1/context/session/{id}
  if (rest.length === 3 && rest[0] === "context" && rest[1] === "session") {
    return respond(
      await getSession({
        sessionContextId: rest[2],
        callerTenantId: identity.tenantId,
        callerPrincipalId: identity.principalId,
      }),
    );
  }

  // GET /v1/context/session/{id}/explain?as_of=
  if (rest.length === 4 && rest[0] === "context" && rest[1] === "session" && rest[3] === "explain") {
    return respond(
      await explainContextResolution({
        sessionContextId: rest[2],
        asOf: req.nextUrl.searchParams.get("as_of") ?? undefined,
        callerTenantId: identity.tenantId,
        callerPrincipalId: identity.principalId,
      }),
    );
  }

  // GET /v1/context/support/{id}
  if (rest.length === 3 && rest[0] === "context" && rest[1] === "support") {
    return respond(
      await getSupportContext({
        supportContextId: rest[2],
        callerTenantId: identity.tenantId,
        callerPrincipalId: identity.principalId,
      }),
    );
  }

  // GET /v1/principals/{id} (+ roles, delegations)
  if (rest[0] === "principals" && rest.length === 2) {
    return respond(
      await getPrincipal({
        principalId: rest[1],
        callerTenantId: identity.tenantId,
        callerPrincipalId: identity.principalId,
      }),
    );
  }
  if (rest[0] === "principals" && rest.length === 3 && rest[2] === "roles") {
    return respond(
      await getPrincipalRoles({
        principalId: rest[1],
        callerTenantId: identity.tenantId,
        callerPrincipalId: identity.principalId,
      }),
    );
  }
  if (rest[0] === "principals" && rest.length === 3 && rest[2] === "delegations") {
    return respond(
      await getPrincipalDelegations({
        principalId: rest[1],
        callerTenantId: identity.tenantId,
        callerPrincipalId: identity.principalId,
      }),
    );
  }

  return notFound();
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const rest = path[0] === "v1" ? path.slice(1) : path;
  const body = await readBody(req);

  // POST /v1/authenticate — contract-exempt, pre-session by design.
  if (rest.length === 1 && rest[0] === "authenticate") {
    return respond(await authenticate(body as AuthenticateRequest), 201);
  }

  const identity = await sessionIdentity();
  if (!identity) return refuse(401, "A verified session is required to use the identity console.");

  // POST /v1/context/resolve
  if (rest.length === 2 && rest[0] === "context" && rest[1] === "resolve") {
    return respond(
      await resolveIdentity({
        request: body as ResolveRequest,
        callerIdentity: identity,
      }),
    );
  }

  // POST /v1/context/session/{id}/invalidate
  if (rest.length === 4 && rest[0] === "context" && rest[1] === "session" && rest[3] === "invalidate") {
    return respond(
      await invalidateSession({
        sessionContextId: rest[2],
        request: (body as InvalidateSessionRequest) ?? { reason: "ADMIN_REVOKE" },
        actorPrincipalId: identity.principalId,
        correlationId: String(body.correlation_id ?? crypto.randomUUID()),
        callerTenantId: identity.tenantId,
      }),
    );
  }

  // POST /v1/context/cache/refresh
  if (rest.length === 3 && rest[0] === "context" && rest[1] === "cache" && rest[2] === "refresh") {
    return respond(
      await refreshTenantContextCache({
        request: body as RefreshCacheRequest,
        callerTenantId: identity.tenantId,
        callerPrincipalId: identity.principalId,
      }),
    );
  }

  // POST /v1/context/tenant/invalidate
  if (rest.length === 3 && rest[0] === "context" && rest[1] === "tenant" && rest[2] === "invalidate") {
    return respond(
      await invalidateTenantContext({
        request: body as InvalidateTenantContextRequest,
        callerTenantId: identity.tenantId,
        callerPrincipalId: identity.principalId,
      }),
    );
  }

  // POST /v1/context/support — the support principal is the verified caller.
  if (rest.length === 2 && rest[0] === "context" && rest[1] === "support") {
    return respond(
      await attachSupportContext({
        request: body as AttachSupportContextRequest,
        supportPrincipalId: identity.principalId,
      }),
      201,
    );
  }

  return notFound();
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const rest = path[0] === "v1" ? path.slice(1) : path;
  const body = await readBody(req);
  const identity = await sessionIdentity();
  if (!identity) return refuse(401, "A verified session is required to use the identity console.");

  // PUT /v1/principals/{id}/status
  if (rest.length === 3 && rest[0] === "principals" && rest[2] === "status") {
    return respond(
      await updatePrincipalStatus({
        principalId: rest[1],
        status: (body.status ?? "") as PrincipalStatus,
        reason: body.reason ? String(body.reason) : undefined,
        actorPrincipalId: identity.principalId,
        correlationId: String(body.correlation_id ?? crypto.randomUUID()),
        callerTenantId: identity.tenantId,
      }),
    );
  }

  return notFound();
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const rest = path[0] === "v1" ? path.slice(1) : path;
  const body = await readBody(req);
  const identity = await sessionIdentity();
  if (!identity) return refuse(401, "A verified session is required to use the identity console.");

  // DELETE /v1/context/support/{id}
  if (rest.length === 3 && rest[0] === "context" && rest[1] === "support") {
    return respond(
      await revokeSupportContext({
        supportContextId: rest[2],
        reason: body.reason ? String(body.reason) : undefined,
        correlationId: body.correlation_id ? String(body.correlation_id) : crypto.randomUUID(),
        callerTenantId: identity.tenantId,
        callerPrincipalId: identity.principalId,
      }),
    );
  }

  return notFound();
}

export const runtime = "nodejs";