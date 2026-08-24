// identity-context-svc (:8080, /identity-context-svc through the gateway) — the
// identity resolution engine. Verifies IdP tokens, assembles the six-dimension
// IdentityContextEnvelope (signed JWT), and manages session lifecycle.
//
// Every downstream service trusts the envelope; this is the only place a
// principal becomes a verified identity with tenant, legal entity, role profile,
// delegations, and trust posture baked in.

import {
  apiGet,
  apiPost,
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

export type ResolveResponse = {
  envelope_jwt: string;
};

export type GetSessionResponse = {
  envelope_jwt: string;
};

export type InvalidateSessionRequest = {
  reason: "LOGOUT" | "ADMIN_REVOKE" | "RISK_ESCALATION" | "DELEGATION_REVOKED";
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
 */
export async function getSession(input: {
  sessionContextId: string;
  callerTenantId: string;
}): Promise<ApiResult<GetSessionResponse>> {
  return apiGet<GetSessionResponse>(
    "identityContext",
    `/v1/context/session/${encodeURIComponent(input.sessionContextId)}`,
    { identity: { tenantId: input.callerTenantId } },
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
 */
export async function getPrincipal(input: {
  principalId: string;
  callerTenantId: string;
}): Promise<ApiResult<Principal>> {
  return apiGet<Principal>(
    "identityContext",
    `/v1/principals/${encodeURIComponent(input.principalId)}`,
    { identity: { tenantId: input.callerTenantId } },
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
}): Promise<ApiResult<PrincipalRoleAssignment[]>> {
  const result = await apiGet<PrincipalRoleAssignment[]>(
    "identityContext",
    `/v1/principals/${encodeURIComponent(input.principalId)}/roles`,
    {
      query: { legal_entity_id: input.legalEntityId },
      identity: { tenantId: input.callerTenantId },
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
}): Promise<ApiResult<DelegatedAuthority[]>> {
  const result = await apiGet<DelegatedAuthority[]>(
    "identityContext",
    `/v1/principals/${encodeURIComponent(input.principalId)}/delegations`,
    { identity: { tenantId: input.callerTenantId } },
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
 * Requires X-Principal-Id + X-Tenant-Id headers.
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
  return apiPost<null>(
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

// ─── Error helpers ───────────────────────────────────────────────────────────

export function explainIdentityError(message: string): string {
  if (message.includes("token invalid or unverifiable")) {
    return "The bearer token or SAML assertion could not be verified. Check the token format, signature, and expiry.";
  }
  if (message.includes("principal inactive or not found")) {
    return "The principal does not exist in this tenant or is not ACTIVE. Check the identity provider subject mapping.";
  }
  if (message.includes("tenant inactive")) {
    return "The tenant's lifecycle state is not ACTIVE. Contact platform operations.";
  }
  if (message.includes("principal not authorized for the requested legal entity")) {
    return "The principal is not authorized for the requested legal entity. Check the entity registry assignment.";
  }
  if (message.includes("session blocked by trust posture policy")) {
    return "Trust posture evaluated to BLOCKED (risk score ≥ 80). Requires MFA step-up or risk remediation.";
  }
  if (message.includes("upstream dependency unavailable")) {
    return "A required upstream service (tenant registry, entity registry, etc.) is unreachable. Nothing was written.";
  }
  if (message.includes("exactly one of bearer_token or saml_assertion must be provided")) {
    return "Provide either bearer_token or saml_assertion, not both and not neither.";
  }
  if (message.includes("invalid status")) {
    return "Status must be ACTIVE, SUSPENDED, or DISABLED.";
  }
  if (message.includes("missing X-Principal-Id header") || message.includes("caller identity missing")) {
    return "Request missing X-Principal-Id header. The gateway should set this from a verified identity envelope.";
  }
  if (message.includes("missing X-Tenant-Id header") || message.includes("caller tenant scope missing")) {
    return "Request missing X-Tenant-Id header. The gateway should set this from a verified identity envelope.";
  }
  if (message.includes("authorization denied")) {
    return "Caller is not authorized for this action. Requires PRINCIPAL_STATUS_MANAGE at platform scope.";
  }
  if (message.includes("store unavailable")) {
    return "identity-context-svc could not reach its database. Nothing was written.";
  }
  return message;
}