// Shared contract between the tenant-registry Server Actions and the forms
// that call them.

import type {
  DataResidencyPolicy,
  EntityJurisdictionAssignment,
  LegalEntity,
  Tenant,
} from "@/lib/api/tenants";

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
  status: "idle" | "provisioned" | "conflict" | "unauthenticated" | "unauthorized" | "error";
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
  status: "idle" | "transitioned" | "illegal" | "unauthenticated" | "unauthorized" | "error";
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
    | "error";
  message: string;
  assignment?: EntityJurisdictionAssignment;
};

export const IDLE_JURISDICTION_WRITE: JurisdictionWriteState = { status: "idle", message: "" };

/** Outcome of creating a data residency policy. */
export type ResidencyPolicyState = {
  status: "idle" | "created" | "conflict" | "unauthenticated" | "unauthorized" | "error";
  message: string;
  policy?: DataResidencyPolicy;
};

export const IDLE_RESIDENCY_POLICY: ResidencyPolicyState = { status: "idle", message: "" };

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
