// Shared contract between the tenant-registry Server Actions and the forms
// that call them.

import type {
  DataResidencyPolicy,
  EntityHierarchy,
  EntityJurisdictionAssignment,
  LegalEntity,
  Tenant,
  Workspace,
} from "@/lib/api/tenants";

/**
 * A refusal from the gateway's GOV-01 tenant-context resolution, kept apart
 * from `unauthorized`.
 *
 * gateway-auth-svc resolves the tenant against the registry before Traefik
 * forwards anything, and answers 403 when the tenant may not transact or when
 * the session's legal entity belongs to someone else. That reuses the same
 * status authorization-svc uses for a missing grant, but the fix is completely
 * different — no RBAC assignment will activate a suspended tenant — so every
 * form on this page models it as its own state rather than folding it in.
 */
export type TenantContextState = "tenant-context";

/**
 * Outcome of provisioning a tenant.
 *
 * `unauthorized` and `unauthenticated` are separate states, not one "denied".
 * The backend now distinguishes them — 401 means the gateway forwarded no
 * verified principal at all, 403 means this principal has no TENANT_PROVISION
 * grant against the platform scope. They have different fixes (wiring vs an
 * RBAC assignment) and collapsing them sends the reader to the wrong one.
 */
export type ProvisionTenantState = {
  status:
    | "idle"
    | "provisioned"
    | "conflict"
    | "unauthenticated"
    | "unauthorized"
    | TenantContextState
    | "error";
  message: string;
  tenant?: Tenant;
};

export const IDLE_PROVISION_TENANT: ProvisionTenantState = { status: "idle", message: "" };

/**
 * Outcome of a lifecycle or status transition.
 *
 * The service answers 204 with no body, so there is nothing to read back and
 * nothing that says whether the row moved. Unlike obligations-svc there is no
 * idempotent no-op here: requesting a state the row is already in is not a
 * legal transition and comes back 422. So `illegal` covers both "wrong
 * direction" and "already there", and the message says which.
 */
export type TransitionState = {
  status:
    | "idle"
    | "transitioned"
    | "illegal"
    | "unauthenticated"
    | "unauthorized"
    | TenantContextState
    | "error";
  message: string;
};

export const IDLE_TRANSITION: TransitionState = { status: "idle", message: "" };

/**
 * Outcome of creating a legal entity.
 *
 * `unvalidated` is the fail-closed jurisdiction outage kept apart from `error`:
 * nothing the reader typed was wrong, and retrying later will work.
 * `invalid-jurisdiction` is the opposite — the id genuinely does not exist.
 */
export type CreateEntityState = {
  status:
    | "idle"
    | "created"
    | "invalid-jurisdiction"
    | "unvalidated"
    | "conflict"
    | "unauthenticated"
    | "unauthorized"
    | TenantContextState
    | "error";
  message: string;
  entity?: LegalEntity;
};

export const IDLE_CREATE_ENTITY: CreateEntityState = { status: "idle", message: "" };

/** Outcome of assigning or end-dating a jurisdiction on an entity. */
export type JurisdictionWriteState = {
  status:
    | "idle"
    | "assigned"
    | "end-dated"
    | "invalid-jurisdiction"
    | "unvalidated"
    | "unauthenticated"
    | "unauthorized"
    | TenantContextState
    | "error";
  message: string;
  assignment?: EntityJurisdictionAssignment;
};

export const IDLE_JURISDICTION_WRITE: JurisdictionWriteState = { status: "idle", message: "" };

/** Outcome of creating a data residency policy. */
export type ResidencyPolicyState = {
  status:
    | "idle"
    | "created"
    | "conflict"
    | "unauthenticated"
    | "unauthorized"
    | TenantContextState
    | "error";
  message: string;
  policy?: DataResidencyPolicy;
};

export const IDLE_RESIDENCY_POLICY: ResidencyPolicyState = { status: "idle", message: "" };

/**
 * Outcome of updating a legal entity's descriptive fields.
 *
 * There is no `invalid-jurisdiction` here and there cannot be: the registry's
 * PATCH accepts only legal_name, trading_name and default_currency_code. An
 * entity's jurisdiction, type, fiscal calendar and residency policy are fixed
 * at creation because transactions reference them, and status moves through its
 * own transition endpoint.
 */
export type UpdateEntityState = {
  status:
    | "idle"
    | "updated"
    | "unchanged"
    | "unauthenticated"
    | "unauthorized"
    | TenantContextState
    | "error";
  message: string;
  entity?: LegalEntity;
};

export const IDLE_UPDATE_ENTITY: UpdateEntityState = { status: "idle", message: "" };

/**
 * Outcome of creating a workspace.
 *
 * `invalid-classification` is its own state rather than a generic 400: the
 * backend fails closed on an unrecognised billing_classification instead of
 * defaulting one in, and telling the reader which value was refused is the
 * difference between a fixable form error and an unexplained rejection.
 */
export type WorkspaceState = {
  status:
    | "idle"
    | "created"
    | "invalid-classification"
    | "conflict"
    | "unauthenticated"
    | "unauthorized"
    | TenantContextState
    | "error";
  message: string;
  workspace?: Workspace;
};

export const IDLE_WORKSPACE: WorkspaceState = { status: "idle", message: "" };

/**
 * Outcome of creating or end-dating an entity hierarchy relationship.
 *
 * `cycle` is separate from `conflict` because it is the one failure the reader
 * cannot fix by choosing a different date — making A a child of B when B is
 * already below A has no valid form, and saying "conflict" would invite a retry
 * that cannot succeed.
 */
export type HierarchyWriteState = {
  status:
    | "idle"
    | "created"
    | "end-dated"
    | "cycle"
    | "conflict"
    | "unauthenticated"
    | "unauthorized"
    | TenantContextState
    | "error";
  message: string;
  hierarchy?: EntityHierarchy;
};

export const IDLE_HIERARCHY_WRITE: HierarchyWriteState = { status: "idle", message: "" };

/**
 * Currency codes and locales the forms offer.
 *
 * The backend validates neither — they are free-text columns — so these
 * constrain the console's own forms only, and a value outside this list is not
 * rejected by the service.
 */
export const CURRENCY_CODES = ["GBP", "EUR", "USD", "INR", "AED", "SGD"] as const;

export const TIMEZONES = [
  "Europe/London",
  "Europe/Dublin",
  "Europe/Berlin",
  "America/New_York",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
] as const;

export const LOCALES = ["en-GB", "en-US", "en-IE", "de-DE", "fr-FR", "en-IN", "en-SG"] as const;
