// Shared contract between the schema-registry Server Actions and the forms
// that call them.

import type { EventSchema } from "@/lib/api/schemas";

/**
 * Outcome of registering a schema version.
 *
 * `incompatible` and `raced` are separate states even though the service
 * answers 409 for both, because they need opposite responses from the reader:
 * one means the proposed schema is wrong and must be changed, the other means
 * the schema may well be fine but was checked against a version that is no
 * longer latest, so it has to be re-checked and resubmitted unchanged.
 * Collapsing them into "conflict" would send half the readers to edit a
 * schema that did not need editing.
 *
 * `unauthenticated` is kept apart from `unauthorized` for the same reason it
 * is elsewhere in the console: one is a wiring fault, the other a missing
 * grant, and they have different fixes.
 */
export type RegisterSchemaState = {
  status:
    | "idle"
    | "registered"
    | "incompatible"
    | "raced"
    | "unauthenticated"
    | "unauthorized"
    | "unavailable"
    | "error";
  message: string;
  schema?: EventSchema;
  /** Field-level breakages from the compatibility checker, when status is `incompatible`. */
  violations?: string[];
};

export const IDLE_REGISTER_SCHEMA: RegisterSchemaState = { status: "idle", message: "" };

/**
 * Everything the console shows when someone looks up one event's contract.
 *
 * Two reads composed into one answer, because "what does this event have to
 * contain" and "how did it get that way" are the same question asked twice and
 * the registry has no endpoint that answers both. `latest` is read separately
 * rather than taken as the last element of `versions`: the versions list is
 * paged, so on a long history the page that comes back need not contain the
 * current version at all.
 */
export type ContractReport = {
  latest: EventSchema;
  /** The most recent page of versions, oldest first, as the service returns them. */
  versions: EventSchema[];
  /** Versions older than the ones listed exist. Nothing is ever deleted here. */
  truncated: boolean;
};
