// Shared contract between the obligations Server Actions and the forms that
// call them.

import type { FilingRequirement, Obligation } from "@/lib/api/obligations";

/**
 * Outcome of raising an obligation.
 *
 * `existing` is the one that matters and the reason this is not a boolean.
 * obligations-svc dedups globally on obligation_code and compares only four
 * attributes, so a 200 means "that code is already taken by a matching record,
 * here it is, unchanged" — and any severity, responsible function or source
 * reference you just typed was discarded. Reporting that as a save would tell the
 * reader they recorded something they did not. Verified live: posting CRITICAL
 * over a HIGH row returns HIGH.
 *
 * `unvalidated` is the fail-closed jurisdiction outage, kept apart from `error`
 * because nothing the reader typed was wrong and retrying later will work.
 */
export type RaiseObligationState = {
  status: "idle" | "raised" | "existing" | "conflict" | "unvalidated" | "error";
  message: string;
  obligation?: Obligation;
};

export const IDLE_RAISE_OBLIGATION: RaiseObligationState = { status: "idle", message: "" };

/**
 * Outcome of a status transition.
 *
 * `unchanged` covers the idempotent no-op: the service answers 200 whether it
 * moved the row or the row was already in that status, and the body carries no
 * `transitioned` flag to tell them apart. The form submits the status it last
 * read so the action can distinguish them — see describeTransition.
 *
 * `illegal` is separate from `error` because a refused transition is the state
 * machine working, not a fault.
 */
export type TransitionState = {
  status: "idle" | "transitioned" | "unchanged" | "illegal" | "error";
  message: string;
  obligation?: Obligation;
};

export const IDLE_TRANSITION: TransitionState = { status: "idle", message: "" };

/** Outcome of adding a filing requirement under an obligation. */
export type FilingWriteState = {
  status: "idle" | "created" | "no-obligation" | "error";
  message: string;
  filing?: FilingRequirement;
};

export const IDLE_FILING_WRITE: FilingWriteState = { status: "idle", message: "" };

/**
 * Submission channels the console offers.
 *
 * Free-form in the service — it stores whatever string arrives and never reads it
 * back for a decision. This list constrains our own form only, and is not a
 * backend guarantee.
 */
export const SUBMISSION_CHANNELS = ["API", "PORTAL", "SFTP", "EMAIL", "POST"] as const;

/** Filing types the console offers. Also data-only in the service. */
export const FILING_TYPES = [
  "VAT_RETURN",
  "CORPORATE_TAX_RETURN",
  "WITHHOLDING_TAX_RETURN",
  "ANNUAL_ACCOUNTS",
  "CONFIRMATION_STATEMENT",
  "PAYROLL_SUBMISSION",
  "REGULATORY_DISCLOSURE",
] as const;
