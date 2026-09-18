// identity-context-svc (:8080, /identity-context-svc through the gateway) — the
// identity resolution engine. Verifies IdP tokens, assembles the six-dimension
// IdentityContextEnvelope (signed JWT), and manages session lifecycle.
//
// Every downstream service trusts the envelope; this is the only place a
// principal becomes a verified identity with tenant, legal entity, role profile,
// delegations, and trust posture baked in.
//
// This module implements the ENTIRE service surface — the GOV-01 contract
// commands (explain, cache refresh, tenant invalidate, support contexts) sit
// alongside the original V1 read/write surface. Every route registered by
// internal/context/handler.go is covered:
//
//   POST   /v1/authenticate
//   GET    /.well-known/jwks.json
//   POST   /v1/context/resolve
//   GET    /v1/context/session/{id}
//   GET    /v1/context/session/{id}/explain
//   POST   /v1/context/session/{id}/invalidate
//   POST   /v1/context/cache/refresh
//   POST   /v1/context/tenant/invalidate
//   POST   /v1/context/support
//   GET    /v1/context/support/{id}
//   DELETE /v1/context/support/{id}
//   GET    /v1/principals/{id}
//   GET    /v1/principals/{id}/roles
//   GET    /v1/principals/{id}/delegations
//   PUT    /v1/principals/{id}/status
//   GET    /health

import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  type ApiResult,
  type ApiWriteResult,
  type Identity,
} from "./client";

type CallerIdentity = Identity & { principalId: string; tenantId: string };

// ─── Wire shapes (match Go json tags) ────────────────────────────────────────

export type VerifiedClaims = {
  subject: string;
  tenant_id: string;
  mfa_done: boolean;
};

export type ResolveRequest = {
  bearer_token?: string;
  saml_assertion?: string;
  legal_entity_id: string;
  correlation_id: string;
};

/**
 * The success body of POST /v1/context/resolve and
 * GET /v1/context/session/{id}.
 *
 * The handler returns ResolveResponseV2 — `envelope_jwt` plus the evidence id and
 * session id an auditor actually cares about. Older code reading only
 * `envelope_jwt` is unaffected; the new fields are additive.
 */
export type ResolveResponse = {
  envelope_jwt: string;
  /** The evidence object for this decision, so a caller can cite what granted it. */
  evidence_id?: string;
  session_context_id?: string;
  /** Unix seconds at which the envelope expires. */
  expires_at?: number;
};

export type GetSessionResponse = {
  envelope_jwt: string;
};

export type InvalidationReason = "LOGOUT" | "ADMIN_REVOKE" | "RISK_ESCALATION" | "DELEGATION_REVOKED";

export type InvalidateSessionRequest = {
  reason: InvalidationReason;
};

export type PrincipalStatus = "ACTIVE" | "SUSPENDED" | "DISABLED";

export type Principal = {
  principal_id: string;
  tenant_id: string;
  principal_type: "HUMAN" | "SERVICE_ACCOUNT" | "API_CLIENT";
  identity_provider_subject: string;
  email: string;
  display_name: string;
  status: PrincipalStatus;
  created_at: string;
  data_classification: string;
};

export type PrincipalRoleAssignment = {
  assignment_id: string;
  principal_id: string;
  role_id: string;
  legal_entity_id: string | null;
  effective_from: string;
  effective_to: string;
  assigned_by: string;
};

export type DelegatedAuthority = {
  delegated_authority_id: string;
  delegator_principal_id: string;
  delegate_principal_id: string;
  scope_type: "ENTITY_SCOPED" | "ACTION_SCOPED" | "GLOBAL";
  legal_entity_id: string | null;
  authority_limit_type: string | null;
  authority_limit_value: number | null;
  effective_from: string;
  effective_to: string;
  revocation_status: "ACTIVE" | "REVOKED" | "EXPIRED";
};

// ─── GOV-01 completion shapes ─────────────────────────────────────────────────

/** One of the six resolution dimensions, as frozen on the session_contexts row. */
export type DimensionOutcome = {
  dimension: number;
  name: string;
  result: string;
  /** Where the value came from — the token, this store, an upstream, or risk cache. */
  source: string;
  detail?: string;
};

/** The recorded account of one resolution, reconstructed from the frozen row. */
export type ContextExplanation = {
  session_context_id: string;
  decision_id: string;
  evidence_id: string;
  outcome: "RESOLVED" | "INVALIDATED" | "EXPIRED" | "RESOLVED_EVIDENCE_DISPOSED";
  principal_id: string;
  tenant_id: string;
  legal_entity_id: string;
  environment: "local" | "development" | "staging" | "production";
  ingress_source: string;
  dimensions: DimensionOutcome[];
  issued_at: string;
  expires_at: string;
  invalidated_at?: string;
  invalidation_reason?: string;
  support_context_id?: string;
  as_of: string;
  reconstructed_from: string;
  correlation_id: string;
  schema_version: string;
};

export type RefreshCacheRequest = {
  /** Narrows the refresh. Empty refreshes every binding for the caller's tenant. */
  ingress_identifiers?: string[];
  reason: string;
  correlation_id?: string;
};

export type RefreshCacheResponse = {
  bindings_refreshed: number;
  evidence_id: string;
};

export type InvalidateTenantContextRequest = {
  reason?: InvalidationReason;
  /** MANDATORY — the blast radius is every user of the tenant. */
  justification: string;
  correlation_id?: string;
};

export type InvalidateTenantContextResponse = {
  sessions_revoked: number;
  evidence_id: string;
};

export type SupportReasonCode = "INCIDENT_RESPONSE" | "CUSTOMER_TICKET" | "DATA_CORRECTION" | "AUDIT_REQUEST";

export type AttachSupportContextRequest = {
  tenant_id: string;
  support_principal_id: string;
  /** Narrows the grant to one principal's data. Omitted means tenant-wide. */
  subject_principal_id?: string;
  reason_code: SupportReasonCode;
  justification: string;
  ticket_ref: string;
  approver_principal_id: string;
  ttl_seconds?: number;
  correlation_id?: string;
};

export type AttachSupportContextResponse = {
  support_context_id: string;
  expires_at: string;
  evidence_id: string;
};

export type RevokeSupportContextRequest = {
  reason?: string;
  correlation_id?: string;
};

export type SupportContext = {
  support_context_id: string;
  tenant_id: string;
  support_principal_id: string;
  subject_principal_id?: string | null;
  reason_code: SupportReasonCode;
  justification: string;
  ticket_ref: string;
  approver_principal_id: string;
  granted_at: string;
  expires_at: string;
  revoked_at?: string | null;
  revocation_reason?: string | null;
  /** The reconciliation half of the break-glass invariant. */
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  evidence_id: string;
  correlation_id: string;
};

export type JWKSResponse = {
  keys: Array<{
    kty: string;
    use: string;
    kid: string;
    alg: string;
    n: string;
    e: string;
  }>;
};

export type HealthStatus = {
  status: "healthy" | "degraded";
  checks?: Record<string, string>;
  checked_at?: string;
};

// ─── POST /v1/authenticate ────────────────────────────────────────────────────

export type AuthenticateRequest = {
  tenant_id: string;
  email: string;
  password: string;
  correlation_id?: string;
};

/**
 * What a successful password exchange returns. `access_token` is NOT the
 * identity envelope and grants nothing on its own — it is a short-lived
 * (IDP_TOKEN_TTL_SECONDS, 300s) intermediate credential whose only use is to be
 * handed straight to `resolveIdentity`.
 */
export type AuthenticateResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  principal_id: string;
  tenant_id: string;
  /** Advisory. authorization-svc, not this service, decides if a posture suffices. */
  mfa_required: boolean;
};

/**
 * Exchange a human's password for the bearer token `resolveIdentity` accepts.
 *
 * This is the entry point to the whole platform and the ONE endpoint reachable
 * without an identity — it is exempt from the canonical input contract, because
 * that contract's mandatory X-Tenant-Id and X-Principal-Id are set by
 * gateway-auth-svc only after verifying a signed envelope, which is exactly what
 * this call exists to make obtainable. Demanding them here would be circular and
 * satisfiable only by a caller asserting the identity it has not yet proven.
 *
 * The tenant therefore travels in the BODY, not a header. That is not a
 * weakening: naming a tenant selects which tenant's principals to search and
 * confers nothing, and a caller naming a tenant it has no credential in gets the
 * same rejection as any other wrong password.
 *
 * Every rejection — wrong password, unknown email, disabled principal, locked
 * account — is the same 401 "invalid credentials". Do not surface anything more
 * specific to the user; the reason is in the service's decision log, deliberately
 * not on the wire, so this response cannot be used to enumerate accounts.
 */
export async function authenticate(
  request: AuthenticateRequest,
): Promise<ApiWriteResult<AuthenticateResponse>> {
  return apiPost<AuthenticateResponse>(
    "identityContext",
    "/v1/authenticate",
    request,
    { correlationId: request.correlation_id },
  );
}

// ─── POST /v1/context/resolve ────────────────────────────────────────────────

/**
 * Resolve a bearer token (or SAML assertion) into a signed IdentityContextEnvelope.
 *
 * The envelope is a short-lived RS256 JWT containing all six identity dimensions.
 * Call this on login, token refresh, or when the legal entity changes.
 *
 * Requires exactly one of bearer_token or saml_assertion.
 * Fails closed on any verification failure (invalid token, inactive principal/tenant/entity,
 * unauthorized entity, blocked trust posture, upstream unavailable).
 *
 * The legal entity is sent as X-Legal-Entity-Id as well as in the body:
 * identity-context-svc declares LegalEntityID RequiredOnWrite in its §4 policy,
 * so a resolve without that header is refused 401 envelope_incomplete before the
 * handler runs. The body field is what the resolver scopes the session to; the
 * header is what the contract checks.
 */
export async function resolveIdentity(input: {
  request: ResolveRequest;
  callerIdentity: CallerIdentity;
}): Promise<ApiWriteResult<ResolveResponse>> {
  return apiPost<ResolveResponse>(
    "identityContext",
    "/v1/context/resolve",
    input.request,
    {
      correlationId: input.request.correlation_id,
      identity: {
        principalId: input.callerIdentity.principalId,
        tenantId: input.callerIdentity.tenantId,
        legalEntityId: input.request.legal_entity_id,
      },
    },
  );
}

// ─── GET /v1/context/session/{sessionContextID} ─────────────────────────────

/**
 * Re-validate a previously-issued session context.
 *
 * Returns the same envelope_jwt if the session is still valid (not invalidated,
 * not expired). Use for silent re-auth without re-verifying the IdP token.
 *
 * The handler requires both X-Tenant-Id and X-Principal-Id (self-exemption for
 * reading your own session), so both are sent.
 */
export async function getSession(input: {
  sessionContextId: string;
  callerTenantId: string;
  callerPrincipalId: string;
}): Promise<ApiResult<GetSessionResponse>> {
  return apiGet<GetSessionResponse>(
    "identityContext",
    `/v1/context/session/${encodeURIComponent(input.sessionContextId)}`,
    {
      identity: {
        tenantId: input.callerTenantId,
        principalId: input.callerPrincipalId,
      },
    },
  );
}

// ─── GET /v1/context/session/{sessionContextID}/explain ───────────────────────

/**
 * Explain a context resolution (GOV-01 ExplainContextResolution).
 *
 * Returns the recorded account of one resolution: what each of the six
 * dimensions resolved to, from which source, and what the decision's standing
 * was at a given instant. Reconstructed from the frozen session_contexts row —
 * never re-derived.
 *
 * Reading your OWN resolution needs no grant; reading anyone else's requires
 * IDENTITY_CONTEXT_EXPLAIN. A session in another tenant answers 404, never 403.
 *
 * `asOf` is an RFC3339 instant; omitted means now. An as_of earlier than the
 * session's invalidation reports the decision as it stood then.
 */
export async function explainContextResolution(input: {
  sessionContextId: string;
  asOf?: string;
  callerTenantId: string;
  callerPrincipalId: string;
}): Promise<ApiResult<ContextExplanation>> {
  return apiGet<ContextExplanation>(
    "identityContext",
    `/v1/context/session/${encodeURIComponent(input.sessionContextId)}/explain`,
    {
      query: { as_of: input.asOf },
      identity: {
        tenantId: input.callerTenantId,
        principalId: input.callerPrincipalId,
      },
    },
  );
}

// ─── POST /v1/context/session/{sessionContextID}/invalidate ─────────────────

/**
 * Invalidate a session context (logout, admin revoke, risk escalation, delegation revoked).
 *
 * Appends invalidated_at to the session record and evicts the JWT from Redis cache.
 * Idempotent — re-invalidating an already-invalidated session is a no-op.
 */
export async function invalidateSession(input: {
  sessionContextId: string;
  request: InvalidateSessionRequest;
  actorPrincipalId: string;
  correlationId: string;
  callerTenantId: string;
}): Promise<ApiWriteResult<null>> {
  return apiPost<null>(
    "identityContext",
    `/v1/context/session/${encodeURIComponent(input.sessionContextId)}/invalidate`,
    input.request,
    {
      correlationId: input.correlationId,
      identity: {
        principalId: input.actorPrincipalId,
        tenantId: input.callerTenantId,
      },
    },
  );
}

// ─── GET /v1/principals/{principalID} ───────────────────────────────────────

/**
 * Look up a principal by ID, scoped to the caller's tenant.
 *
 * Returns 404 if not found or belongs to another tenant (no enumeration).
 * Requires X-Tenant-Id and X-Principal-Id headers (self-exemption read).
 */
export async function getPrincipal(input: {
  principalId: string;
  callerTenantId: string;
  callerPrincipalId: string;
}): Promise<ApiResult<Principal>> {
  return apiGet<Principal>(
    "identityContext",
    `/v1/principals/${encodeURIComponent(input.principalId)}`,
    {
      identity: {
        tenantId: input.callerTenantId,
        principalId: input.callerPrincipalId,
      },
    },
  );
}

// ─── GET /v1/principals/{principalID}/roles ─────────────────────────────────

/**
 * List active role assignments for a principal, optionally scoped to a legal entity.
 *
 * Returns tenant-wide assignments (legal_entity_id = null) plus entity-scoped ones
 * matching the filter. Filters by effective date window.
 */
export async function getPrincipalRoles(input: {
  principalId: string;
  legalEntityId?: string;
  callerTenantId: string;
  callerPrincipalId: string;
}): Promise<ApiResult<PrincipalRoleAssignment[]>> {
  const result = await apiGet<PrincipalRoleAssignment[]>(
    "identityContext",
    `/v1/principals/${encodeURIComponent(input.principalId)}/roles`,
    {
      query: { legal_entity_id: input.legalEntityId },
      identity: {
        tenantId: input.callerTenantId,
        principalId: input.callerPrincipalId,
      },
    },
  );

  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "identity-context-svc returned a non-array role assignment list",
      },
    };
  }
  return { ok: true, data: result.data };
}

// ─── GET /v1/principals/{principalID}/delegations ───────────────────────────

/**
 * List active delegations where the principal is the delegate.
 *
 * Filters by effective date window and revocation_status = ACTIVE.
 */
export async function getPrincipalDelegations(input: {
  principalId: string;
  callerTenantId: string;
  callerPrincipalId: string;
}): Promise<ApiResult<DelegatedAuthority[]>> {
  const result = await apiGet<DelegatedAuthority[]>(
    "identityContext",
    `/v1/principals/${encodeURIComponent(input.principalId)}/delegations`,
    {
      identity: {
        tenantId: input.callerTenantId,
        principalId: input.callerPrincipalId,
      },
    },
  );

  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "identity-context-svc returned a non-array delegation list",
      },
    };
  }
  return { ok: true, data: result.data };
}

// ─── PUT /v1/principals/{principalID}/status ────────────────────────────────

/**
 * Transition a principal's status (ACTIVE ↔ SUSPENDED ↔ DISABLED).
 *
 * Route is PUT — matching the Go handler registration — and requires
 * X-Principal-Id + X-Tenant-Id headers.
 * Authorization: caller must hold PRINCIPAL_STATUS_MANAGE at platform scope.
 * Status is validated against PrincipalStatus enum.
 * Idempotent — re-applying the same status is a no-op at DB level.
 * Writes an access_decision_log evidence record with actor_principal_id.
 */
export async function updatePrincipalStatus(input: {
  principalId: string;
  status: PrincipalStatus;
  reason?: string;
  actorPrincipalId: string;
  correlationId: string;
  callerTenantId: string;
}): Promise<ApiWriteResult<null>> {
  return apiPut<null>(
    "identityContext",
    `/v1/principals/${encodeURIComponent(input.principalId)}/status`,
    { status: input.status, ...(input.reason ? { reason: input.reason } : {}) },
    {
      correlationId: input.correlationId,
      identity: {
        principalId: input.actorPrincipalId,
        tenantId: input.callerTenantId,
      },
    },
  );
}

// ─── POST /v1/context/cache/refresh (GOV-01) ──────────────────────────────────

/**
 * Refresh tenant context cache (GOV-01 RefreshTenantContextCache).
 *
 * Marks the caller's tenant routing hints stale so the next resolution re-reads
 * them from the registry. Does NOT delete the bindings. Scoped to the caller's
 * own verified tenant — there is no all-tenants form. Requires
 * IDENTITY_CONTEXT_CACHE_REFRESH and an Idempotency-Key.
 */
export async function refreshTenantContextCache(input: {
  request: RefreshCacheRequest;
  callerTenantId: string;
  callerPrincipalId: string;
}): Promise<ApiWriteResult<RefreshCacheResponse>> {
  return apiPost<RefreshCacheResponse>(
    "identityContext",
    "/v1/context/cache/refresh",
    input.request,
    {
      correlationId: input.request.correlation_id,
      identity: {
        tenantId: input.callerTenantId,
        principalId: input.callerPrincipalId,
      },
    },
  );
}

// ─── POST /v1/context/tenant/invalidate (GOV-01) ──────────────────────────────

/**
 * Invalidate all tenant sessions (GOV-01 InvalidateTenantContext).
 *
 * Revokes every live session in the caller's tenant. A separate route and a
 * separate authorization action from the per-session invalidate, deliberately.
 * `justification` is MANDATORY — the blast radius is every user of the tenant —
 * and travels on the event into SIEM at CRITICAL. Requires
 * IDENTITY_CONTEXT_TENANT_INVALIDATE. No self-exemption.
 */
export async function invalidateTenantContext(input: {
  request: InvalidateTenantContextRequest;
  callerTenantId: string;
  callerPrincipalId: string;
}): Promise<ApiWriteResult<InvalidateTenantContextResponse>> {
  return apiPost<InvalidateTenantContextResponse>(
    "identityContext",
    "/v1/context/tenant/invalidate",
    input.request,
    {
      correlationId: input.request.correlation_id,
      identity: {
        tenantId: input.callerTenantId,
        principalId: input.callerPrincipalId,
      },
    },
  );
}

// ─── POST /v1/context/support (GOV-01, privileged) ────────────────────────────

/**
 * Attach a support context (GOV-01 AttachSupportContext, privileged).
 *
 * Grants a scoped, time-limited, independently-approved elevation letting a
 * support principal operate inside a customer tenant. This is NOT a role and
 * grants no permissions — it makes the support principal's session resolvable in
 * a tenant they do not belong to.
 *
 * Authorization is checked against the TARGET tenant, not the caller's own.
 * Requires IDENTITY_SUPPORT_CONTEXT_ATTACH in the target tenant. X-Principal-Id
 * is the support principal requesting the elevation; X-Tenant-Id is deliberately
 * NOT sent (the support principal does not belong to the target tenant).
 */
export async function attachSupportContext(input: {
  request: AttachSupportContextRequest;
  /** The support principal requesting the elevation (X-Principal-Id). */
  supportPrincipalId: string;
}): Promise<ApiWriteResult<AttachSupportContextResponse>> {
  return apiPost<AttachSupportContextResponse>(
    "identityContext",
    "/v1/context/support",
    input.request,
    {
      correlationId: input.request.correlation_id,
      identity: { principalId: input.supportPrincipalId },
    },
  );
}

// ─── GET /v1/context/support/{supportContextID} ──────────────────────────────

/**
 * Read a support context (GOV-01 AttachSupportContext surface).
 *
 * The consumer's own view of a grant. Tenant + principal must be supplied; a
 * grant in another tenant answers 404, never 403.
 */
export async function getSupportContext(input: {
  supportContextId: string;
  callerTenantId: string;
  callerPrincipalId: string;
}): Promise<ApiResult<SupportContext>> {
  return apiGet<SupportContext>(
    "identityContext",
    `/v1/context/support/${encodeURIComponent(input.supportContextId)}`,
    {
      identity: {
        tenantId: input.callerTenantId,
        principalId: input.callerPrincipalId,
      },
    },
  );
}

// ─── DELETE /v1/context/support/{supportContextID} ───────────────────────────

/**
 * Revoke a support context early (GOV-01 revokeSupportContext).
 *
 * Ends an elevation immediately. Idempotent — re-revoking reports success
 * without a second event, and the FIRST reason stands. Guarded by
 * IDENTITY_SUPPORT_CONTEXT_REVOKE, deliberately weaker than attach: revoking is
 * de-escalation. The body is best-effort on the wire; submitting one carries a
 * reason onto the record, omitting it defaults to MANUAL_REVOCATION.
 */
export async function revokeSupportContext(input: {
  supportContextId: string;
  reason?: string;
  correlationId?: string;
  callerTenantId: string;
  callerPrincipalId: string;
}): Promise<ApiWriteResult<null>> {
  return apiDelete<null>(
    "identityContext",
    `/v1/context/support/${encodeURIComponent(input.supportContextId)}`,
    {
      data: { reason: input.reason, correlation_id: input.correlationId },
      correlationId: input.correlationId,
      identity: {
        tenantId: input.callerTenantId,
        principalId: input.callerPrincipalId,
      },
    },
  );
}

// ─── GET /.well-known/jwks.json ──────────────────────────────────────────────

/**
 * The RSA public key downstream services use to verify the
 * IdentityContextEnvelope. Envelopes are signed RS256 so verifiers hold no
 * secret. Public — no identity headers.
 */
export async function getJWKS(): Promise<ApiResult<JWKSResponse>> {
  return apiGet<JWKSResponse>("identityContext", "/.well-known/jwks.json");
}

// ─── GET /health ─────────────────────────────────────────────────────────────

/** Liveness/readiness. Public — no identity headers. */
export async function getIdentityHealth(): Promise<ApiResult<HealthStatus>> {
  return apiGet<HealthStatus>("identityContext", "/health");
}

// ─── Error helpers ───────────────────────────────────────────────────────────

/**
 * Turn an unreasonably terse service message into one a human can act on.
 *
 * Prefers the stable error_code when the service sent one (the half of the error
 * body that "must not change with a refactor"), falling back to string matching
 * for the plain writeError refusals that carry no code.
 */
export function explainIdentityError(message: string, errorCode?: string): string {
  const code = (errorCode ?? "").toUpperCase();
  if (code === "RESIDENCY_DENIED" || message.includes("residency denied"))
    return "The legal entity or jurisdiction is outside the allowed residency scope. This decision is evidence-denied, not fixable by retrying.";
  if (code === "SOD_CONFLICT" || message.includes("segregation of duties"))
    return "Segregation of duties conflict — the action is refused because it would combine duties that must be separated. Use a different approver or route.";
  if (code === "BREAK_GLASS_REQUIRED" || message.includes("break glass"))
    return "Break-glass elevation is required — the request is outside the caller's standing grant. Attach an approved support context or escalate.";
  if (code === "BREAK_GLASS_EXPIRED")
    return "The break-glass elevation that would have covered this expired or was revoked. Re-attach a support context.";
  if (code === "LEGAL_HOLD_ACTIVE")
    return "A legal hold is active — disposition is blocked. See the retention registry for the hold details.";
  if (code === "IDEMPOTENCY_MISMATCH")
    return "The idempotency key was reused with a different request body. Never reuse a key across distinct actions.";
  if (code === "TRUST_POSTURE_BLOCKED" || message.includes("posture policy"))
    return "Trust posture evaluated to BLOCKED (risk score ≥ 80). Requires MFA step-up or risk remediation.";
  if (code === "UPSTREAM_UNAVAILABLE" || message.includes("upstream dependency unavailable"))
    return "A required upstream service (tenant registry, entity registry, authorization) is unreachable. Nothing was written.";
  if (code === "AUTHORIZATION_DENIED" || message.includes("authorization denied"))
    return "Caller is not authorized for this action. Check the required permission grant at the acting scope.";
  if (code === "UNSUPPORTED" || message.includes("unsupported"))
    return "The request used a mode this deployment does not support (e.g. SAML assertions are inactive).";
  if (code === "CONTEXT_UNRESOLVED" || message.includes("token invalid or unverifiable"))
    return "The bearer token or SAML assertion could not be verified. Check the token format, signature, and expiry.";
  if (message.includes("principal inactive or not found"))
    return "The principal does not exist in this tenant or is not ACTIVE. Check the identity provider subject mapping.";
  if (message.includes("tenant inactive"))
    return "The tenant's lifecycle state is not ACTIVE. Contact platform operations.";
  if (message.includes("principal not authorized for the requested legal entity"))
    return "The principal is not authorized for the requested legal entity. Check the entity registry assignment.";
  if (message.includes("exactly one of bearer_token or saml_assertion must be provided"))
    return "Provide either bearer_token or saml_assertion, not both and not neither.";
  if (message.includes("invalid status"))
    return "Status must be ACTIVE, SUSPENDED, or DISABLED.";
  if (message.includes("missing X-Principal-Id header") || message.includes("caller identity missing"))
    return "Request missing X-Principal-Id header. The gateway should set this from a verified identity envelope.";
  if (message.includes("missing X-Tenant-Id header") || message.includes("caller tenant scope missing"))
    return "Request missing X-Tenant-Id header. The gateway should set this from a verified identity envelope.";
  if (message.includes("store unavailable"))
    return "identity-context-svc could not reach its database. Nothing was written.";
  return message;
}