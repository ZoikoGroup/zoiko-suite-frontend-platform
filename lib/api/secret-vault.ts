// secret-vault-integration-svc (:8087, /secret-vault-integration-svc through the
// gateway) — the policy-gated broker in front of secret material.
//
// WHAT THIS SERVICE NEVER HOLDS: a secret value. Postgres holds policy metadata
// (who may read what), lease metadata (who was granted access, until when), and
// an append-only audit log. The material itself lives behind a vault backend and
// is reachable only as a short-lived lease token. Nothing in the types below is
// a credential — except `lease_token`, which is, and which is why it is never
// stored, never logged, and never rendered by this console.
//
// The access path, in order, because each step is separately observable:
//
//   1. A secret policy names a path and a class. Immutable once created.
//   2. A policy version says which workloads may broker it, and for how long a
//      lease may live. Created DRAFT; must be activated to have any effect.
//   3. Material is seeded into the vault backend for that path. Without this,
//      every broker attempt fails at the vault even when policy would allow it.
//   4. A broker request resolves the active version for the path and scope,
//      checks the caller against allowed_workload_ids, and either grants a lease
//      or denies.
//   5. Rotation revokes every live lease for the path.
//
// DENY BY ABSENCE. If no policy is active for a path and scope, the broker
// refuses — it does not pass the question back to the caller the way policy-svc's
// evaluate does. An unconfigured secret is an inaccessible secret. That posture
// makes step 3 easy to skip and hard to diagnose, so the console surfaces the
// distinction between "policy said no" (403) and "no policy at all" (404).

import { apiGet, apiPost, type ApiResult, type ApiWriteResult } from "./client";

/** Secret classes the console offers. Data-driven in the service; new classes
 *  need no code change there, so this list constrains only our own forms. */
export const SECRET_CLASSES = [
  "DATABASE_CREDENTIAL",
  "INTEGRATION_TOKEN",
  "BANK_CREDENTIAL",
  "ESIGNATURE_CREDENTIAL",
  "PRIVATE_KEY",
  "ENCRYPTION_MATERIAL_REFERENCE",
  "API_SIGNING_SECRET",
  "SERVICE_TO_SERVICE_TRUST_MATERIAL",
] as const;

/** The four the service validates against when data_classification is supplied.
 *  Anything else is a 400 — unlike secret_class, this one IS a closed set. */
export const DATA_CLASSIFICATIONS = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
] as const;

export const AUDIT_EVENT_TYPES = [
  "REQUESTED",
  "GRANTED",
  "DENIED",
  "REVOKED",
  "ROTATED",
] as const;

export type LeaseStatus = "GRANTED" | "EXPIRED" | "REVOKED";

/** Wire shape. Field names match the Go json tags exactly. */
export type SecretPolicy = {
  secret_policy_id: string;
  secret_class: string;
  /** An opaque reference into the vault backend. Never the value. Unique on its
   *  own — the natural key for this table. */
  secret_path: string;
  created_at: string;
  created_by_principal_id: string;
  data_classification: string;
};

export type SecretPolicyVersion = {
  secret_policy_version_id: string;
  secret_policy_id: string;
  tenant_id: string | null;
  legal_entity_id: string | null;
  /** JSON array of workload/principal ids permitted to broker this secret. */
  allowed_workload_ids: unknown;
  max_lease_duration_seconds: number;
  effective_from: string;
  effective_to: string | null;
  version_status: "DRAFT" | "ACTIVE" | "SUPERSEDED" | "RETIRED" | string;
  created_at: string;
  created_by_principal_id: string;
};

export type ApplicableSecretPolicyVersion = SecretPolicyVersion & {
  secret_class: string;
  secret_path: string;
};

export type SecretLease = {
  lease_id: string;
  request_id: string;
  secret_policy_version_id: string;
  secret_class: string;
  secret_path: string;
  requested_by_principal_id: string;
  tenant_id: string | null;
  legal_entity_id: string | null;
  status: LeaseStatus | string;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  correlation_id: string;
  created_at: string;
};

export type SecretAuditEntry = {
  audit_log_id: string;
  event_type: string;
  secret_class: string;
  secret_path: string;
  requested_by_principal_id: string;
  tenant_id: string | null;
  legal_entity_id: string | null;
  /** null for REQUESTED and DENIED — nothing was granted to reference. */
  lease_id: string | null;
  /** null for a DENIED where no policy existed at all for the path. */
  secret_policy_version_id: string | null;
  request_id: string | null;
  outcome_detail: string;
  correlation_id: string;
  recorded_at: string;
};

// ─── Policies ────────────────────────────────────────────────────────────────

export type CreateSecretPolicyInput = {
  secretClass: string;
  /** The idempotency key. Reusing a path with a different class is a 409. */
  secretPath: string;
  principalId: string;
  dataClassification?: string;
  secretPolicyID?: string;
};

/** Register a secret path. Immutable — grants come from its versions, not from it. */
export async function createSecretPolicy(
  input: CreateSecretPolicyInput,
): Promise<ApiWriteResult<SecretPolicy>> {
  return apiPost<SecretPolicy>("secretVault", "/v1/secret-policies", {
    ...(input.secretPolicyID ? { secret_policy_id: input.secretPolicyID } : {}),
    secret_class: input.secretClass,
    secret_path: input.secretPath,
    created_by_principal_id: input.principalId,
    ...(input.dataClassification ? { data_classification: input.dataClassification } : {}),
  });
}

/**
 * The ACTIVE versions of a secret class applying to a scope, most-specific first.
 *
 * `secret_class` is required — like policy-svc, this service answers "what
 * applies here", not "what exists". There is no endpoint that lists every secret
 * policy, so the console reads the applicable set per class.
 */
export async function listApplicableSecretPolicyVersions(scope: {
  secretClass: string;
  tenantId?: string;
  legalEntityId?: string;
}): Promise<ApiResult<ApplicableSecretPolicyVersion[]>> {
  const result = await apiGet<ApplicableSecretPolicyVersion[]>(
    "secretVault",
    "/v1/secret-policies",
    {
      query: {
        secret_class: scope.secretClass,
        tenant_id: scope.tenantId,
        legal_entity_id: scope.legalEntityId,
      },
    },
  );

  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "secret-vault-integration-svc returned a non-array policy list",
      },
    };
  }
  return { ok: true, data: result.data };
}

/** Every version of one secret policy, whatever its status. */
export async function listSecretPolicyVersions(
  secretPolicyId: string,
): Promise<ApiResult<SecretPolicyVersion[]>> {
  const result = await apiGet<SecretPolicyVersion[]>(
    "secretVault",
    `/v1/secret-policies/${encodeURIComponent(secretPolicyId)}/versions`,
  );

  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "secret-vault-integration-svc returned a non-array version list",
      },
    };
  }

  const sorted = [...result.data].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return { ok: true, data: sorted };
}

export type CreateSecretPolicyVersionInput = {
  secretPolicyId: string;
  /** Principals permitted to broker this secret. An empty list is accepted and
   *  denies everyone — a valid lockdown, and worth stating rather than guessing. */
  allowedWorkloadIds: string[];
  /** Must be greater than zero; the service rejects 0 and negatives. */
  maxLeaseDurationSeconds: number;
  effectiveFrom: string;
  effectiveTo?: string;
  tenantId?: string;
  legalEntityId?: string;
  principalId: string;
};

/** Add a DRAFT access rule to a secret policy. Has no effect until activated. */
export async function createSecretPolicyVersion(
  input: CreateSecretPolicyVersionInput,
): Promise<ApiWriteResult<SecretPolicyVersion>> {
  return apiPost<SecretPolicyVersion>(
    "secretVault",
    `/v1/secret-policies/${encodeURIComponent(input.secretPolicyId)}/versions`,
    {
      ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
      ...(input.legalEntityId ? { legal_entity_id: input.legalEntityId } : {}),
      allowed_workload_ids: input.allowedWorkloadIds,
      max_lease_duration_seconds: input.maxLeaseDurationSeconds,
      effective_from: input.effectiveFrom,
      ...(input.effectiveTo ? { effective_to: input.effectiveTo } : {}),
      created_by_principal_id: input.principalId,
    },
  );
}

/** Activate a DRAFT version. Legal only from DRAFT — otherwise 409. */
export async function activateSecretPolicyVersion(input: {
  secretPolicyId: string;
  versionId: string;
  principalId: string;
}): Promise<ApiWriteResult<SecretPolicyVersion>> {
  return apiPost<SecretPolicyVersion>(
    "secretVault",
    `/v1/secret-policies/${encodeURIComponent(
      input.secretPolicyId,
    )}/versions/${encodeURIComponent(input.versionId)}/activate`,
    { activated_by_principal_id: input.principalId },
  );
}

export type PutMaterialResult = {
  secret_policy_id: string;
  secret_path: string;
  status: string;
};

/**
 * Seed the actual secret material into the vault backend for a policy's path.
 *
 * The step that makes the grant path reachable at all: without it, a broker
 * request passes every policy check and then fails at the vault, which reads as
 * an outage rather than as unprovisioned configuration.
 *
 * The material is sent base64-encoded and is never stored by this console, never
 * echoed back by the service, and never logged. It goes straight to the backend.
 */
export async function putSecretMaterial(input: {
  secretPolicyId: string;
  materialBase64: string;
}): Promise<ApiWriteResult<PutMaterialResult>> {
  return apiPost<PutMaterialResult>(
    "secretVault",
    `/v1/secret-policies/${encodeURIComponent(input.secretPolicyId)}/material`,
    { material_base64: input.materialBase64 },
  );
}

export type RotateResult = {
  secret_policy_id: string;
  secret_path: string;
  revoked_lease_count: number;
  rotated_at: string;
};

/**
 * Rotate a secret, revoking every currently-GRANTED lease on its path.
 *
 * Idempotent on request_id: a retry returns the original rotation and revokes
 * nothing further. Note that a replayed response reports `revoked_lease_count`
 * as 0 — that is the replay, not a rotation that revoked nothing, and the console
 * does not present the two the same way.
 *
 * The service flags its own limitation here: the revoke step and the audit write
 * are separate store calls rather than one transaction, so a crash between them
 * can leave leases revoked with no ROTATED record.
 */
export async function rotateSecret(input: {
  secretPolicyId: string;
  requestId: string;
  principalId: string;
}): Promise<ApiWriteResult<RotateResult>> {
  return apiPost<RotateResult>(
    "secretVault",
    `/v1/secret-policies/${encodeURIComponent(input.secretPolicyId)}/rotate`,
    { request_id: input.requestId, rotated_by_principal_id: input.principalId },
    { correlationId: input.requestId },
  );
}

// ─── Broker and leases ───────────────────────────────────────────────────────

export type BrokerResult = {
  lease_id: string;
  secret_path: string;
  /** A live credential-adjacent token. Never rendered, never persisted by this
   *  console — only its presence is reported. */
  lease_token: string;
  expires_at: string;
};

/**
 * Request access to a secret.
 *
 * Idempotent on request_id for everything durable — the lease row, the audit
 * trail, the emitted events. The lease token itself is re-minted on every call
 * including retries, by design: it is a short-lived pointer, not the lease's
 * identity.
 */
export async function brokerSecret(input: {
  secretPath: string;
  requestId: string;
  principalId: string;
  tenantId?: string;
  legalEntityId?: string;
  correlationId?: string;
}): Promise<ApiWriteResult<BrokerResult>> {
  return apiPost<BrokerResult>(
    "secretVault",
    "/v1/secrets/broker",
    {
      secret_path: input.secretPath,
      request_id: input.requestId,
      requested_by_principal_id: input.principalId,
      ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
      ...(input.legalEntityId ? { legal_entity_id: input.legalEntityId } : {}),
      correlation_id: input.correlationId ?? input.requestId,
    },
    { correlationId: input.correlationId ?? input.requestId },
  );
}

export type LeaseFilters = {
  principal?: string;
  secretClass?: string;
  tenantId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

/** Lease records matching the filters. */
export async function listLeases(
  filters: LeaseFilters = {},
): Promise<ApiResult<SecretLease[]>> {
  const result = await apiGet<SecretLease[]>("secretVault", "/v1/secrets/leases", {
    query: {
      principal: filters.principal,
      secret_class: filters.secretClass,
      tenant_id: filters.tenantId,
      from: filters.from,
      to: filters.to,
      limit: filters.limit,
      offset: filters.offset,
    },
  });

  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "secret-vault-integration-svc returned a non-array lease list",
      },
    };
  }
  return { ok: true, data: result.data };
}

export async function getLease(leaseId: string): Promise<ApiResult<SecretLease>> {
  return apiGet<SecretLease>(
    "secretVault",
    `/v1/secrets/leases/${encodeURIComponent(leaseId)}`,
  );
}

/**
 * Revoke a lease.
 *
 * 409 `invalid_transition` means the lease was already REVOKED or EXPIRED. The
 * service returns 200 with the unchanged lease when nothing transitioned, so a
 * successful response does not by itself prove a revocation happened — the
 * lease's `revoked_at` does.
 */
export async function revokeLease(leaseId: string): Promise<ApiWriteResult<SecretLease>> {
  return apiPost<SecretLease>(
    "secretVault",
    `/v1/secrets/leases/${encodeURIComponent(leaseId)}/revoke`,
    {},
  );
}

export type AuditFilters = {
  principal?: string;
  secretPath?: string;
  eventType?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

/** The append-only access audit log. Every request, grant, denial, revocation,
 *  and rotation — denials included, which is what makes it evidence. */
export async function listSecretAudit(
  filters: AuditFilters = {},
): Promise<ApiResult<SecretAuditEntry[]>> {
  const result = await apiGet<SecretAuditEntry[]>("secretVault", "/v1/secrets/audit", {
    query: {
      principal: filters.principal,
      secret_path: filters.secretPath,
      event_type: filters.eventType,
      from: filters.from,
      to: filters.to,
      limit: filters.limit,
      offset: filters.offset,
    },
  });

  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "secret-vault-integration-svc returned a non-array audit list",
      },
    };
  }
  return { ok: true, data: result.data };
}

// ─── Derived views ───────────────────────────────────────────────────────────

export type LeaseStats = {
  live: number;
  revoked: number;
  expired: number;
  /** Leases whose status is still GRANTED but whose expires_at has passed. The
   *  service has no expiry sweep, so these sit as GRANTED indefinitely. */
  staleGranted: number;
};

/**
 * Roll up leases, separating "GRANTED and still valid" from "GRANTED but past
 * its expiry".
 *
 * That separation matters: nothing in this service transitions a lease to
 * EXPIRED. `status` stays GRANTED forever, and only `expires_at` says otherwise,
 * so counting raw statuses would report expired access as live.
 */
export function summariseLeases(leases: SecretLease[], now = Date.now()): LeaseStats {
  let live = 0;
  let revoked = 0;
  let expired = 0;
  let staleGranted = 0;

  for (const lease of leases) {
    if (lease.status === "REVOKED") {
      revoked += 1;
      continue;
    }
    if (lease.status === "EXPIRED") {
      expired += 1;
      continue;
    }
    if (new Date(lease.expires_at).getTime() <= now) staleGranted += 1;
    else live += 1;
  }

  return { live, revoked, expired, staleGranted };
}

/** Whether a lease still grants access right now, by expiry rather than status. */
export function isLeaseLive(lease: SecretLease, now = Date.now()): boolean {
  return lease.status === "GRANTED" && new Date(lease.expires_at).getTime() > now;
}

/** allowed_workload_ids as a string array, whatever the service stored. */
export function allowedWorkloads(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === "string");
}

/** Turn a backend failure into something an operator can act on. */
export function explainSecretVaultError(message: string): string {
  if (message.includes("no_applicable_secret_policy")) {
    return "No ACTIVE secret policy covers that path and scope, so access was refused. This service denies by absence — an unconfigured secret is an inaccessible one. Check that a version exists AND has been activated.";
  }
  if (message.includes("access_denied")) {
    return "A policy was found and it does not list this principal in allowed_workload_ids. This is a genuine denial, and it is recorded in the audit log as one.";
  }
  if (message.includes("vault_backend_unavailable")) {
    return "The vault backend could not be reached, so no material was stored and no token could be minted.";
  }
  if (message.includes("secret_policy_version_conflict")) {
    return "A version with this scope and effective date already exists with different allowed workloads. Create a new version rather than restating this one.";
  }
  if (message.includes("secret_policy_conflict")) {
    return "That secret path is already registered with a different class. Paths are unique — this is a redefinition, not a retry.";
  }
  if (message.includes("secret_policy_not_found")) {
    return "That secret policy does not exist.";
  }
  if (message.includes("lease_not_found")) {
    return "That lease does not exist.";
  }
  if (message.includes("invalid_transition")) {
    return "That lease is already REVOKED or EXPIRED and cannot be revoked again.";
  }
  if (message.includes("invalid_classification")) {
    return "Data classification must be PUBLIC, INTERNAL, CONFIDENTIAL, or RESTRICTED.";
  }
  if (message.includes("max_lease_duration_seconds")) {
    return "Maximum lease duration must be greater than zero seconds.";
  }
  if (message.includes("material_base64")) {
    return "The secret material must be valid base64.";
  }
  if (message.includes("invalid_policy_payload")) {
    return "The matched policy version has an unreadable allowed_workload_ids list, so authorization could not be determined and access was refused.";
  }
  if (message.includes("missing_field")) {
    return `A required field was empty: ${message.split("missing_field").pop()?.trim() || "check the form"}.`;
  }
  if (message.includes("store_unavailable")) {
    return "secret-vault-integration-svc could not reach its database. Nothing was written.";
  }
  return message;
}
