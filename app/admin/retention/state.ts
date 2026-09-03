import type { LegalHold, RetentionPolicy, RetentionResolution } from "@/lib/api/retention";

/**
 * Action states for the retention register.
 *
 * `alreadyReleased` is kept apart from `error` because a 409 here is a fact
 * about the hold, not a fault in the request: somebody already released it. The
 * distinction matters for accountability — "the records are unfrozen and you did
 * it" and "the records were already unfrozen" are answers to different
 * questions, and an operator reading a generic failure would not know which
 * applies.
 *
 * `unauthorized` stays separate from `refused` for the reason the rest of this
 * console keeps them apart: "you may not do this" and "we could not determine
 * whether you may" are different facts, and collapsing them reports a
 * governance-plane outage as a permissions problem.
 *
 * The resolve state has no success/failure axis at all, only `answered`. Resolve
 * returns two independent findings and the caller applies them; there is no
 * outcome here for the console to approve of.
 */

export type CreatePolicyState =
  | { status: "idle" }
  | { status: "created"; policy: RetentionPolicy; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export type CreateHoldState =
  | { status: "idle" }
  | { status: "engaged"; hold: LegalHold; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export type ReleaseHoldState =
  | { status: "idle" }
  | { status: "released"; hold: LegalHold; message: string }
  /** 409 — already RELEASED, so there is nothing to undo. */
  | { status: "alreadyReleased"; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export type ResolveState =
  | { status: "idle" }
  | { status: "answered"; resolution: RetentionResolution; recordClass: string }
  | { status: "error"; message: string };

export const IDLE_CREATE_POLICY: CreatePolicyState = { status: "idle" };
export const IDLE_CREATE_HOLD: CreateHoldState = { status: "idle" };
export const IDLE_RELEASE_HOLD: ReleaseHoldState = { status: "idle" };
export const IDLE_RESOLVE: ResolveState = { status: "idle" };
