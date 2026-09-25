import type { NormalizedFact, SourceAuthorityMap } from "@/lib/api/source-authority";

/**
 * Action states for the source authority register.
 *
 * `replayed` is kept apart from the success states because the service is
 * idempotent on correlation_id: a resubmitted form resolves to the original row
 * and writes nothing. That is the correct outcome, and reporting it as either a
 * new record or an error would be a lie in opposite directions.
 *
 * `refused` is kept apart from `error` because these refusals are governance
 * answers rather than faults — you may not end a rule in the past, you may not
 * restate an immutable rule, your principal holds no grant. Those need to read
 * as decisions, not as something that went wrong.
 */

export type CreateMapState =
  | { status: "idle" }
  | { status: "created"; map: SourceAuthorityMap; message: string }
  | { status: "replayed"; map: SourceAuthorityMap; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export type SupersedeMapState =
  | { status: "idle" }
  | { status: "superseded"; map: SourceAuthorityMap; message: string }
  /** Already ended. A 409, and not a failure of this request. */
  | { status: "terminal"; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export type RecordFactState =
  | { status: "idle" }
  | { status: "recorded"; fact: NormalizedFact; message: string }
  | { status: "replayed"; fact: NormalizedFact; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export const IDLE_CREATE_MAP: CreateMapState = { status: "idle" };
export const IDLE_SUPERSEDE_MAP: SupersedeMapState = { status: "idle" };
export const IDLE_RECORD_FACT: RecordFactState = { status: "idle" };
