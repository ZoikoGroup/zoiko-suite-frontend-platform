// Shared contract between the ORG-02 / ORG-03 Server Actions and their forms.
//
// Every state below carries a `version-conflict` case, and it is not the same
// thing as `conflict`.
//
// `conflict` means the operation collides with something durable — a hostname
// already bound, a registry identity already claimed. The operator has to
// decide what to do about the other thing.
//
// `version-conflict` means somebody else changed this record between the page
// rendering and the button being pressed. Nothing is wrong with what was typed;
// the fix is to reload and look at what changed. Folding the two together would
// tell an operator to resolve a conflict that does not exist.

import type { TenantContextState } from "./state";
import type {
  EntityAsOf,
  EntityRegistryConflict,
  LegalEntityProfileVersion,
  TenantCommandResult,
  TenantHostBinding,
} from "@/lib/api/tenants-org";
import type { Tenant } from "@/lib/api/tenants";

/** Statuses every ORG form can produce. */
type BaseStatus =
  | "idle"
  | "unauthenticated"
  | "unauthorized"
  | TenantContextState
  | "error";

/**
 * Outcome of an ORG-02 named lifecycle command.
 *
 * `not-transactable` is deliberately absent: a lifecycle command is the one
 * write a non-transacting tenant must still accept, or a suspended tenant could
 * never be resumed.
 *
 * `approval-required` is its own state because the remedy is specific and
 * nothing else in this file needs it — find a second person, and it cannot be
 * you.
 */
export type TenantCommandState = {
  status:
    | BaseStatus
    | "applied"
    | "illegal"
    | "version-conflict"
    | "approval-required";
  message: string;
  result?: TenantCommandResult;
};

export const IDLE_TENANT_COMMAND: TenantCommandState = { status: "idle", message: "" };

/** Outcome of ChangeDefaultLocale. */
export type TenantDefaultsState = {
  status: BaseStatus | "changed" | "version-conflict" | "not-transactable";
  message: string;
  tenant?: Tenant;
};

export const IDLE_TENANT_DEFAULTS: TenantDefaultsState = { status: "idle", message: "" };

/** Outcome of binding a hostname. */
export type HostBindingState = {
  status: BaseStatus | "bound" | "conflict" | "not-transactable";
  message: string;
  binding?: TenantHostBinding;
};

export const IDLE_HOST_BINDING: HostBindingState = { status: "idle", message: "" };

/**
 * Outcome of an ORG-03 profile amendment.
 *
 * `registry-conflict` is split out from `conflict` because it is the one
 * failure that produced a NEW THING to go and look at: a quarantine record.
 * The message carries the id of the entity already holding the number, so the
 * operator can go straight to it instead of searching.
 */
export type ProfileAmendmentState = {
  status:
    | BaseStatus
    | "amended"
    | "version-conflict"
    | "approval-required"
    | "registry-conflict"
    | "not-transactable";
  message: string;
  version?: LegalEntityProfileVersion;
};

export const IDLE_PROFILE_AMENDMENT: ProfileAmendmentState = { status: "idle", message: "" };

/** Outcome of resolving a quarantined registry conflict. */
export type ConflictResolutionState = {
  status: BaseStatus | "resolved" | "already-resolved";
  message: string;
};

export const IDLE_CONFLICT_RESOLUTION: ConflictResolutionState = { status: "idle", message: "" };

/**
 * Outcome of an as-of lookup.
 *
 * `no-profile-then` is a SUCCESS, not a failure: the entity existed and had no
 * recorded profile at that instant, which is a true answer to a question about
 * a date before incorporation. Rendering it as an error would send an operator
 * looking for a bug.
 */
export type AsOfLookupState = {
  status: BaseStatus | "found" | "no-profile-then";
  message: string;
  result?: EntityAsOf;
};

export const IDLE_AS_OF_LOOKUP: AsOfLookupState = { status: "idle", message: "" };

/** Outcome of a registry-number search. */
export type RegistrySearchState = {
  status: BaseStatus | "found" | "none";
  message: string;
  matches?: { legal_entity_id: string; entity_code: string; legal_name: string; entity_status: string }[];
};

export const IDLE_REGISTRY_SEARCH: RegistrySearchState = { status: "idle", message: "" };

/** Re-exported so forms import one module. */
export type { EntityRegistryConflict };
