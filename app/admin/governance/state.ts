// Shared contract between the governance Server Actions and the forms that call
// them. Outside actions.ts because a "use server" file may only export async
// functions.

import type { GovernanceDecision } from "@/lib/api/governance";

/**
 * `recorded` and `replayed` are separate states on purpose.
 *
 * POST /v1/decisions answers 201 for a new record and 200 for a decision_id it
 * has already seen. On an append-only evidence log those are different facts, and
 * a form that reported both as "saved" would let a retry look like a second
 * decision.
 */
export type RecordDecisionState = {
  status: "idle" | "recorded" | "replayed" | "error";
  message: string;
  decision?: GovernanceDecision;
};

export const IDLE_RECORD_STATE: RecordDecisionState = { status: "idle", message: "" };
