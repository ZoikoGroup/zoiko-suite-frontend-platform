// retention-registry-svc (:8148) — the register that answers "is it safe to
// delete, export or migrate this record yet".
//
// THE ONE THING A READER OF THIS REGISTER MUST NOT MISUNDERSTAND. The service
// returns TWO independent findings and never collapses them into one boolean:
//
//   - an ACTIVE legal hold blocks, regardless of what any retention policy
//     permits. A hold is a freeze ordered by an authority.
//   - the applicable retention policy separately says how long the record must
//     be kept.
//
// A record past its minimum retention with no hold is still a decision the
// CALLER applies. This service deletes nothing, ever, and a console that showed
// a single green tick would be inventing a permission the service did not give.
//
// Both registers deliberately include rows whose tenant_id is null. Null means
// platform-wide, not "unscoped, hide it" — a platform-wide hold freezes this
// tenant's records too, and a tenant that could not see it would read an empty
// register and conclude deletion was safe.

import {
  apiGet,
  apiPost,
  type ApiResult,
  type ApiWriteResult,
  type Identity,
} from "./client";

const SERVICE = "retentionRegistry" as const;

export type PolicyStatus = "ACTIVE" | "SUPERSEDED" | "RETIRED";
export type HoldStatus = "ACTIVE" | "RELEASED";

export type RetentionPolicy = {
  retention_policy_id: string;
  record_class: string;
  jurisdiction_code?: string | null;
  /** null = platform-wide, applying to every tenant. */
  tenant_id?: string | null;
  min_retention_days: number;
  max_retention_days?: number | null;
  legal_regulatory_basis: string;
  source_rights_basis?: string | null;
  privacy_basis?: string | null;
  policy_status: PolicyStatus;
  effective_from: string;
  effective_to?: string | null;
  created_at: string;
  created_by_principal_id: string;
};

export type LegalHold = {
  legal_hold_id: string;
  scope_description: string;
  custodians_objects: string[];
  /** The court, regulator or internal authority that ordered the freeze. */
  authority: string;
  record_class?: string | null;
  /** null = platform-wide. */
  tenant_id?: string | null;
  entity_ref?: string | null;
  hold_status: HoldStatus;
  started_at: string;
  released_at?: string | null;
  released_by_principal_id?: string | null;
  release_approved_by_principal_id?: string | null;
  created_at: string;
  created_by_principal_id: string;
};

export type RetentionResolution = {
  blocked: boolean;
  matched_hold?: LegalHold | null;
  applicable_policy?: RetentionPolicy | null;
};

// ── reads ────────────────────────────────────────────────────────────────────
//
// Both list endpoints are new. Before them this service could create a policy
// and resolve one record class at a time, so the only way to reach a hold was to
// already know its id — there was no register to render.
//
// Trailing slashes are deliberate: the service mounts these collections with
// chi's Route(...) and registers "/" inside, so the unslashed form redirects
// rather than hits.

export async function listRetentionPolicies(
  identity?: Identity,
  options?: { recordClass?: string; policyStatus?: PolicyStatus; limit?: number },
): Promise<ApiResult<RetentionPolicy[]>> {
  return apiGet<RetentionPolicy[]>(SERVICE, "/v1/retention-policies/", {
    identity,
    query: {
      record_class: options?.recordClass,
      policy_status: options?.policyStatus,
      limit: options?.limit,
    },
  });
}

export async function listLegalHolds(
  identity?: Identity,
  options?: { holdStatus?: HoldStatus; recordClass?: string; limit?: number },
): Promise<ApiResult<LegalHold[]>> {
  return apiGet<LegalHold[]>(SERVICE, "/v1/legal-holds/", {
    identity,
    query: {
      hold_status: options?.holdStatus,
      record_class: options?.recordClass,
      limit: options?.limit,
    },
  });
}

export async function getLegalHold(
  legalHoldId: string,
  identity?: Identity,
): Promise<ApiResult<LegalHold>> {
  return apiGet<LegalHold>(SERVICE, `/v1/legal-holds/${encodeURIComponent(legalHoldId)}`, {
    identity,
  });
}

/**
 * The pre-deletion check itself.
 *
 * Unauthenticated on the service by design — it is called constantly by every
 * service that owns deletable data — and it takes the tenant as a QUERY
 * PARAMETER rather than reading the header, because service X legitimately asks
 * about tenant T. The identity is still sent so the call is traceable, but it is
 * not what scopes the answer here.
 */
export async function resolveRetention(
  params: { recordClass: string; jurisdictionCode?: string; tenantId?: string; entityRef?: string },
  identity?: Identity,
): Promise<ApiResult<RetentionResolution>> {
  return apiGet<RetentionResolution>(SERVICE, "/v1/retention/resolve", {
    identity,
    query: {
      record_class: params.recordClass,
      jurisdiction_code: params.jurisdictionCode,
      tenant_id: params.tenantId,
      entity_ref: params.entityRef,
    },
  });
}

// ── writes ───────────────────────────────────────────────────────────────────

export type CreateRetentionPolicyInput = {
  identity: Identity & { principalId: string; tenantId: string };
  recordClass: string;
  minRetentionDays: number;
  legalRegulatoryBasis: string;
  /** RFC3339. The service rejects anything else, and datetime-local does not
   *  produce it — see the action for the conversion. */
  effectiveFrom: string;
  jurisdictionCode?: string;
  /** Omit for a platform-wide policy. Present means this tenant only. */
  tenantId?: string;
  maxRetentionDays?: number;
  sourceRightsBasis?: string;
  privacyBasis?: string;
  correlationId: string;
};

/**
 * Record a retention rule. Immutable once created — a changed rule is a new row,
 * never an update, so the register is a history and not a current-state table.
 */
export async function createRetentionPolicy(
  input: CreateRetentionPolicyInput,
): Promise<ApiWriteResult<RetentionPolicy>> {
  return apiPost<RetentionPolicy>(
    SERVICE,
    "/v1/retention-policies/",
    {
      record_class: input.recordClass,
      jurisdiction_code: input.jurisdictionCode ?? "",
      tenant_id: input.tenantId ?? "",
      min_retention_days: input.minRetentionDays,
      max_retention_days: input.maxRetentionDays,
      legal_regulatory_basis: input.legalRegulatoryBasis,
      source_rights_basis: input.sourceRightsBasis ?? "",
      privacy_basis: input.privacyBasis ?? "",
      effective_from: input.effectiveFrom,
      correlation_id: input.correlationId,
    },
    { identity: input.identity },
  );
}

export type CreateLegalHoldInput = {
  identity: Identity & { principalId: string; tenantId: string };
  scopeDescription: string;
  /** The court, regulator or internal authority ordering the freeze. */
  authority: string;
  custodiansObjects?: string[];
  recordClass?: string;
  /** Omit for a platform-wide freeze. */
  tenantId?: string;
  entityRef?: string;
  correlationId: string;
};

/**
 * Engage a legal hold. Created ACTIVE, and an active hold blocks deletion for
 * its scope immediately — overriding every retention policy that would otherwise
 * permit it.
 */
export async function createLegalHold(
  input: CreateLegalHoldInput,
): Promise<ApiWriteResult<LegalHold>> {
  return apiPost<LegalHold>(
    SERVICE,
    "/v1/legal-holds/",
    {
      scope_description: input.scopeDescription,
      authority: input.authority,
      custodians_objects: input.custodiansObjects ?? [],
      record_class: input.recordClass ?? "",
      tenant_id: input.tenantId ?? "",
      entity_ref: input.entityRef ?? "",
      correlation_id: input.correlationId,
    },
    { identity: input.identity },
  );
}

/**
 * Release a hold. Legal only from ACTIVE — releasing an already-released hold is
 * a 409, not a silent success, because "it is already unfrozen" and "you just
 * unfroze it" are different facts about who is accountable.
 *
 * This is the privileged operation on this service: it unblocks deletion of
 * records an authority ordered frozen. Authorized as LEGAL_HOLD_RELEASE against
 * the hold's own tenant.
 */
export async function releaseLegalHold(input: {
  identity: Identity & { principalId: string; tenantId: string };
  legalHoldId: string;
  releaseApprovedByPrincipalId: string;
  correlationId: string;
}): Promise<ApiWriteResult<LegalHold>> {
  return apiPost<LegalHold>(
    SERVICE,
    `/v1/legal-holds/${encodeURIComponent(input.legalHoldId)}/release`,
    {
      release_approved_by_principal_id: input.releaseApprovedByPrincipalId,
      correlation_id: input.correlationId,
    },
    { identity: input.identity },
  );
}

// ── derived views ────────────────────────────────────────────────────────────

export type HoldStats = { total: number; active: number; released: number };

export function summariseHolds(holds: LegalHold[]): HoldStats {
  return holds.reduce<HoldStats>(
    (acc, h) => {
      acc.total += 1;
      if (h.hold_status === "ACTIVE") acc.active += 1;
      else acc.released += 1;
      return acc;
    },
    { total: 0, active: 0, released: 0 },
  );
}

/** Renders a nullable scope dimension the way the service means it. */
export function scopeLabel(value: string | null | undefined, dimension: string): string {
  return value ? value : `any ${dimension}`;
}

/**
 * min/max retention days as something a human reads.
 *
 * Days are what the service stores and what is legally cited, so they stay in
 * the label rather than being replaced by an approximation.
 */
export function retentionWindow(p: RetentionPolicy): string {
  const min = `${p.min_retention_days.toLocaleString("en-US")} days`;
  if (p.max_retention_days == null) return `at least ${min}`;
  return `${min} to ${p.max_retention_days.toLocaleString("en-US")} days`;
}

/** Comma/newline separated custodians into the array the service expects. */
export function parseCustodians(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Turn a service refusal into something an operator can act on.
 *
 * Taken from the strings the handler actually writes, not guessed.
 */
export function explainRetentionError(message: string): string {
  if (message.includes("not authorized")) {
    return "You hold no grant for this action on this scope. Engaging a hold needs LEGAL_HOLD_CREATE and releasing one needs LEGAL_HOLD_RELEASE, both against the hold's own tenant — not platform-wide.";
  }
  if (message.includes("authorization service unavailable")) {
    return "authorization-svc could not be reached, so your permission could not be determined. Nothing was written — this service fails closed rather than assuming you are allowed.";
  }
  if (message.includes("legal hold is not currently active")) {
    return "This hold has already been released, so there is nothing to release. That is a conflict rather than a failure — and it is reported rather than accepted silently, because 'already unfrozen' and 'you just unfroze it' are different facts about who is accountable.";
  }
  if (message.includes("legal hold not found")) {
    return "No legal hold with that id in your tenant. Holds are scoped: another tenant's hold reads as absent rather than forbidden, so this does not tell you whether the id exists elsewhere.";
  }
  if (message.includes("X-Tenant-Id header is required")) {
    return "The request carried no tenant scope. Sign in again — this register refuses rather than defaulting, because a default would turn a dropped header into a read of every tenant's holds.";
  }
  if (message.includes("hold_status must be") || message.includes("policy_status must be")) {
    return `${message}. A misspelled filter is refused rather than ignored, so it cannot read as "nothing here".`;
  }
  if (message.includes("limit must be") || message.includes("offset must")) {
    return `${message}. Out-of-range paging is refused rather than clamped, so a truncated register cannot be mistaken for a complete one.`;
  }
  if (message.includes("min_retention_days must be positive")) {
    return "Minimum retention must be at least one day. A zero-day policy would permit immediate deletion, which is a decision to state explicitly rather than express as an empty rule.";
  }
  if (message.includes("effective_from must be RFC3339")) {
    return "The effective date could not be parsed. This is converted for you from the date picker, so seeing this means the value never reached the form.";
  }
  if (message.includes("are required")) {
    return `A required field was empty: ${message}`;
  }
  return message;
}
