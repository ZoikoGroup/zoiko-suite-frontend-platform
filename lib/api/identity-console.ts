// Client-side transport for the identity-context console.
//
// Client-only by construction. This module does NOT import lib/api/client.ts or
// read process.env — the browser has neither the service URL environment nor the
// need for it. Every call here is a same-origin fetch to the session-gated
// server route app/api/backend/identity-context/[...path], which resolves the
// backend URL server-side and forwards the verified session identity. That keeps
// backend hostnames off the wire and stops the backend's lack of CORS from
// blocking the console (the bug this module exists to prevent: a client page
// calling lib/api/identity.ts directly dials the hardcoded :8080 from the
// browser and fails with "is unreachable").
//
// Signatures mirror lib/api/identity.ts so the page reads identically; the error
// union matches ApiError, so callers keep using res.error.message / res.error.status.
// Caller identity fields are accepted for source compatibility but deliberately
// ignored: the route derives the actual identity from the verified session and
// nowhere else.

import type {
  AttachSupportContextRequest,
  AttachSupportContextResponse,
  AuthenticateRequest,
  AuthenticateResponse,
  ContextExplanation,
  DelegatedAuthority,
  GetSessionResponse,
  HealthStatus,
  InvalidateSessionRequest,
  InvalidateTenantContextRequest,
  InvalidateTenantContextResponse,
  JWKSResponse,
  Principal,
  PrincipalRoleAssignment,
  PrincipalStatus,
  RefreshCacheRequest,
  RefreshCacheResponse,
  ResolveRequest,
  ResolveResponse,
  SupportContext,
} from "./identity";
export { explainIdentityError } from "./identity";

export type ConsoleApiError = {
  kind: string;
  status?: number;
  message: string;
  body?: unknown;
};

export type ConsoleResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ConsoleApiError };

/** The acting identity the console displays; ignored by the transport. */
export type CallerIdentity = {
  principalId: string;
  tenantId: string;
  legalEntityId?: string;
};

const BASE = "/api/backend/identity-context";

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<ConsoleResult<T>> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let payload: { ok?: boolean; data?: T; error?: ConsoleApiError } | null = null;
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === "object") {
      payload = parsed as { ok?: boolean; data?: T; error?: ConsoleApiError };
    }
  } catch {
    payload = null;
  }

  if (payload?.ok) {
    return { ok: true, data: payload.data as T };
  }

  return {
    ok: false,
    error: payload?.error ?? {
      kind: "http",
      status: response.status,
      message: `identity-context-svc gateway returned ${response.status}`,
    },
  };
}

// ─── POST /v1/authenticate (contract-exempt, pre-session) ────────────────────

export function authenticate(credentials: AuthenticateRequest): Promise<ConsoleResult<AuthenticateResponse>> {
  return request<AuthenticateResponse>("POST", "/v1/authenticate", credentials);
}

// ─── POST /v1/context/resolve ────────────────────────────────────────────────

export function resolveIdentity(input: {
  request: ResolveRequest;
  callerIdentity: CallerIdentity;
}): Promise<ConsoleResult<ResolveResponse>> {
  return request<ResolveResponse>("POST", "/v1/context/resolve", input.request);
}

// ─── GET /v1/context/session/{id} (+ explain) ────────────────────────────────

export function getSession(input: {
  sessionContextId: string;
  callerTenantId: string;
  callerPrincipalId: string;
}): Promise<ConsoleResult<GetSessionResponse>> {
  return request<GetSessionResponse>("GET", `/v1/context/session/${encodeURIComponent(input.sessionContextId)}`);
}

export function explainContextResolution(input: {
  sessionContextId: string;
  asOf?: string;
  callerTenantId: string;
  callerPrincipalId: string;
}): Promise<ConsoleResult<ContextExplanation>> {
  const query = input.asOf ? `?as_of=${encodeURIComponent(input.asOf)}` : "";
  return request<ContextExplanation>(
    "GET",
    `/v1/context/session/${encodeURIComponent(input.sessionContextId)}/explain${query}`,
  );
}

// ─── POST /v1/context/session/{id}/invalidate ────────────────────────────────

export function invalidateSession(input: {
  sessionContextId: string;
  request: InvalidateSessionRequest;
  actorPrincipalId: string;
  correlationId: string;
  callerTenantId: string;
}): Promise<ConsoleResult<null>> {
  return request<null>(
    "POST",
    `/v1/context/session/${encodeURIComponent(input.sessionContextId)}/invalidate`,
    { ...input.request, correlation_id: input.correlationId },
  );
}

// ─── GET /v1/principals/{id} (+ roles, delegations) ──────────────────────────

export function getPrincipal(input: {
  principalId: string;
  callerTenantId: string;
  callerPrincipalId: string;
}): Promise<ConsoleResult<Principal>> {
  return request<Principal>("GET", `/v1/principals/${encodeURIComponent(input.principalId)}`);
}

export function getPrincipalRoles(input: {
  principalId: string;
  legalEntityId?: string;
  callerTenantId: string;
  callerPrincipalId: string;
}): Promise<ConsoleResult<PrincipalRoleAssignment[]>> {
  const query = input.legalEntityId ? `?legal_entity_id=${encodeURIComponent(input.legalEntityId)}` : "";
  return request<PrincipalRoleAssignment[]>(
    "GET",
    `/v1/principals/${encodeURIComponent(input.principalId)}/roles${query}`,
  );
}

export function getPrincipalDelegations(input: {
  principalId: string;
  callerTenantId: string;
  callerPrincipalId: string;
}): Promise<ConsoleResult<DelegatedAuthority[]>> {
  return request<DelegatedAuthority[]>(
    "GET",
    `/v1/principals/${encodeURIComponent(input.principalId)}/delegations`,
  );
}

// ─── PUT /v1/principals/{id}/status ───────────────────────────────────────────

export function updatePrincipalStatus(input: {
  principalId: string;
  status: PrincipalStatus;
  reason?: string;
  actorPrincipalId: string;
  correlationId: string;
  callerTenantId: string;
}): Promise<ConsoleResult<null>> {
  return request<null>("PUT", `/v1/principals/${encodeURIComponent(input.principalId)}/status`, {
    status: input.status,
    ...(input.reason ? { reason: input.reason } : {}),
    correlation_id: input.correlationId,
  });
}

// ─── POST /v1/context/cache/refresh ───────────────────────────────────────────

export function refreshTenantContextCache(input: {
  request: RefreshCacheRequest;
  callerTenantId: string;
  callerPrincipalId: string;
}): Promise<ConsoleResult<RefreshCacheResponse>> {
  return request<RefreshCacheResponse>("POST", "/v1/context/cache/refresh", input.request);
}

// ─── POST /v1/context/tenant/invalidate ───────────────────────────────────────

export function invalidateTenantContext(input: {
  request: InvalidateTenantContextRequest;
  callerTenantId: string;
  callerPrincipalId: string;
}): Promise<ConsoleResult<InvalidateTenantContextResponse>> {
  return request<InvalidateTenantContextResponse>("POST", "/v1/context/tenant/invalidate", input.request);
}

// ─── POST /v1/context/support ─────────────────────────────────────────────────

export function attachSupportContext(input: {
  request: AttachSupportContextRequest;
  /** Accepted for compatibility; the route uses the verified session caller. */
  supportPrincipalId: string;
}): Promise<ConsoleResult<AttachSupportContextResponse>> {
  return request<AttachSupportContextResponse>("POST", "/v1/context/support", input.request);
}

// ─── GET /v1/context/support/{id} ─────────────────────────────────────────────

export function getSupportContext(input: {
  supportContextId: string;
  callerTenantId: string;
  callerPrincipalId: string;
}): Promise<ConsoleResult<SupportContext>> {
  return request<SupportContext>("GET", `/v1/context/support/${encodeURIComponent(input.supportContextId)}`);
}

// ─── DELETE /v1/context/support/{id} ──────────────────────────────────────────

export function revokeSupportContext(input: {
  supportContextId: string;
  reason?: string;
  correlationId?: string;
  callerTenantId: string;
  callerPrincipalId: string;
}): Promise<ConsoleResult<null>> {
  return request<null>("DELETE", `/v1/context/support/${encodeURIComponent(input.supportContextId)}`, {
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.correlationId ? { correlation_id: input.correlationId } : {}),
  });
}

// ─── Public: /.well-known/jwks.json + /health ────────────────────────────────

export function getJWKS(): Promise<ConsoleResult<JWKSResponse>> {
  return request<JWKSResponse>("GET", "/.well-known/jwks.json");
}

export function getIdentityHealth(): Promise<ConsoleResult<HealthStatus>> {
  return request<HealthStatus>("GET", "/health");
}